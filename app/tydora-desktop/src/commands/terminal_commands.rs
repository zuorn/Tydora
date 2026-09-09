//! 应用内嵌终端：基于 portable-pty 的真实交互式 PTY。
//!
//! 设计要点：
//! - 每个终端会话由前端生成的唯一 `id` 标识，存储在全局 `TerminalManager` 中。
//! - 输出经独立读线程读出自 PTY master，按 base64 编码后通过 Tauri 事件
//!   `terminal-output` 流式推送给前端；PTY 关闭（进程退出 / EOF）时推送 `terminal-closed`。
//! - 输入、resize、kill 分别由 `write_terminal` / `resize_terminal` / `kill_terminal` 处理。
//! - 输出采用 base64 字节流而非直接 UTF-8 字符串，避免终端半截多字节序列导致的前端解码错误。

use std::collections::HashMap;
use std::io::{Read, Write};
#[cfg(target_os = "windows")]
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::thread::JoinHandle;

use base64::engine::general_purpose::STANDARD as BASE64_STD;
use base64::Engine as _;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

/// 全局终端会话表：id -> 会话。
#[derive(Default)]
pub struct TerminalManager(Mutex<HashMap<String, TerminalSession>>);

/// 单个终端会话持有的资源。会话从表中移除（kill）时，所有字段被 drop，
/// 从而关闭 PTY master/slave 并向子进程发送 SIGHUP。
struct TerminalSession {
    /// PTY master：用于 resize。
    master: Box<dyn MasterPty + Send>,
    /// 写端：前端输入写入此处。
    writer: Box<dyn Write + Send>,
    /// 子进程（shell）：kill 时终止。
    child: Box<dyn portable_pty::Child + Send + Sync>,
    /// 读线程句柄：drop 后线程脱离（detached），读到 EOF 自行退出。
    _reader: Option<JoinHandle<()>>,
}

#[derive(Serialize, Clone)]
struct TerminalOutput {
    id: String,
    /// base64 编码的原始字节流
    data: String,
}

#[derive(Serialize, Clone)]
struct TerminalClosed {
    id: String,
}

/// 进程级缓存的默认 shell：首次确定后整个进程生命周期复用，
/// 避免每次开终端/分屏都重新探测。
static DEFAULT_SHELL: OnceLock<String> = OnceLock::new();

/// 根据平台挑选默认 shell：
/// - Windows：优先 `pwsh.exe`，回退 `cmd.exe`；
/// - 其他：使用 `$SHELL`，回退 `bash`。
///
/// Windows 上的判断方式是**在 PATH 中查找 `pwsh.exe` 文件是否存在**，
/// 而非 spawn 一个 pwsh 进程来探测。之前的写法 `pwsh.exe -NoProfile -Command exit`
/// 会从 release 的 GUI 进程（`windows_subsystem = "windows"`，无控制台）spawn
/// 控制台子系统的 pwsh：Windows 为其新分配一个 conhost 控制台窗口（用户看到的
/// "打开/分屏时弹出系统终端窗口"），叠加冷启动 + Defender 扫描导致安装版打开终端
/// 明显卡顿。dev 下因是 `console` 子系统、pwsh 又是热的，所以既不弹窗也不卡。
fn default_shell() -> String {
    DEFAULT_SHELL.get_or_init(detect_default_shell).clone()
}

/// 实际的 shell 探测逻辑（仅执行一次，结果由 `default_shell` 缓存）。
fn detect_default_shell() -> String {
    #[cfg(target_os = "windows")]
    {
        if find_in_path("pwsh.exe").is_some() {
            return "pwsh.exe".to_string();
        }
        "cmd.exe".to_string()
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(s) = std::env::var("SHELL") {
            if !s.is_empty() {
                return s;
            }
        }
        "bash".to_string()
    }
}

/// 在 PATH 环境变量中查找可执行文件，返回完整路径（仅判断文件存在，**不 spawn 进程**）。
/// 用于替代原先 spawn pwsh 探测存在性的写法，彻底消除 GUI 进程下的控制台窗口分配。
#[cfg(target_os = "windows")]
fn find_in_path(name: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// PowerShell 智能标题钩子脚本：重写 `prompt` 函数，把窗口标题设为上一条命令。
/// 在 ConPTY 下设置 `WindowTitle` 会被转换为 OSC 标题序列送达终端。
/// 该脚本通过 `pwsh -NoExit -Command <script>` **启动参数**注入（见 `spawn_terminal`），
/// 而非写入 PTY stdin——因为 ConPTY 的 stdin 输入会被行编辑器回显到屏幕，
/// 导致钩子代码本身显示出来（表现为 `> $Global:__tydora_prompt=...`）。
const PWSH_TITLE_INIT: &str = "$Global:__tydora_prompt=$function:prompt; function prompt { $l=(Get-History -Count 1).CommandLine; if($l){$Host.UI.RawUI.WindowTitle=$l}; & $Global:__tydora_prompt }";

/// 向终端写入“智能标题”初始化脚本，使工具栏标题能跟随当前运行的命令变化
/// （例如执行 `htop` 时标题变为 `htop`）。通过 OSC 0/2 转义序列 `\x1b]0;...\x07` 设置
/// xterm 标题，由前端 `term.onTitleChange` 捕获。不同 shell 注入方式不同；未知 shell 跳过。
/// 注意：PowerShell 不走此函数——它的钩子由 `spawn_terminal` 通过启动参数
/// `-NoExit -Command` 注入（见 `PWSH_TITLE_INIT`），因为 ConPTY 下 stdin 注入会被回显。
/// 任何失败都静默忽略——最坏情况是不显示智能标题，终端仍可正常使用。
fn write_title_init(writer: &mut Box<dyn Write + Send>, shell: &str) {
    // 注意：Rust 字符串里的 `\\033` / `\\007` 经行继续符拼接后为 `\033` / `\007` 字面量，
    // 由 shell 的 printf / print 解释为 ESC / BEL，构成合法的 OSC 标题序列。
    let init: &str = if shell.ends_with("bash") {
        // bash：DEBUG trap 在每条命令执行前把标题设为该命令；PROMPT_COMMAND 在提示符处重置为 cwd。
        // 用 stty -echo 包裹，避免初始化命令本身回显到屏幕。
        "stty -echo\n\
         trap 'printf \"\\033]0;%s\\007\" \"${BASH_COMMAND}\"' DEBUG\n\
         PROMPT_COMMAND='printf \"\\033]0;%s\\007\" \"bash:${PWD/#$HOME/~}\"'\n\
         stty echo\n"
    } else if shell.ends_with("zsh") {
        // zsh：preexec 在命令执行前设置标题；precmd 在提示符处重置为 cwd。
        "precmd() { print -Pn \"\\033]0;zsh:${PWD/#$HOME/~}\\007\" }\n\
         preexec() { print -Pn \"\\033]0;$1\\007\" }\n"
    } else {
        // pwsh/powershell 的钩子由启动参数注入（见 PWSH_TITLE_INIT 与 spawn_terminal），
        // cmd.exe 等不支持，保持默认（显示路径）。
        return;
    };
    let _ = writer.write_all(init.as_bytes());
    let _ = writer.flush();
}

/// 创建一个新终端会话并启动 shell。
#[tauri::command]
pub fn spawn_terminal(
    app: AppHandle,
    manager: State<TerminalManager>,
    id: String,
    cwd: String,
    shell: Option<String>,
) -> Result<(), String> {
    let shell = shell.unwrap_or_else(default_shell);

    // 幂等：会话已存在（如分屏导致 TerminalView 卸载后重挂）时直接返回，
    // 不重复创建 PTY / 不杀掉正在运行的进程。
    {
        let map = manager
            .0
            .lock()
            .map_err(|_| "terminal manager lock poisoned".to_string())?;
        if map.contains_key(&id) {
            return Ok(());
        }
    }

    let pty_system = native_pty_system();
    let size = PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    };
    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

    // 克隆 shell 供 CommandBuilder 使用，原 `shell` 保留给下方的智能标题注入做类型判断。
    let mut cmd = CommandBuilder::new(shell.clone());
    if shell.contains("pwsh") || shell.contains("powershell") {
        // PowerShell：通过启动参数注入标题钩子（-Command <PWSH_TITLE_INIT>）。
        // -NoLogo 隐藏启动横幅；-NoExit 让脚本执行完后保持交互式会话。
        // 注意：不用 -NoProfile——保留用户配置文件（别名/自定义 prompt 等），
        // 钩子脚本在执行时捕获的 `$function:prompt` 即用户自定义后的版本。
        // 相比往 PTY stdin 写脚本，启动参数不会被行编辑器回显到终端屏幕。
        cmd.arg("-NoLogo");
        cmd.arg("-NoExit");
        cmd.arg("-Command");
        cmd.arg(PWSH_TITLE_INIT);
    }
    cmd.cwd(cwd);

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    // pair.slave 在此作用域结束时 drop：子进程已 dup 出自己的控制终端 fd，
    // 关闭我们的 slave 副本不影响其运行（portable-pty 标准用法）。

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;
    let mut writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    // 注入“智能标题”初始化：让工具栏标题跟随当前运行的命令变化
    // （例如执行 `htop` 时标题变为 `htop`）。通过 OSC 0/2 转义序列设置 xterm 标题，
    // 由前端 `term.onTitleChange` 捕获。bash/zsh 在此通过 PTY stdin 写入初始化脚本
    // （脚本内部自带回显抑制）；PowerShell 已在上方通过 `-Command` 启动参数注入，
    // 此函数对 pwsh/powershell 自动跳过。失败（未知 shell 等）时静默忽略，不影响终端使用。
    write_title_init(&mut writer, &shell);

    let app_clone = app.clone();
    let id_clone = id.clone();
    let reader_thread = std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF：shell 退出
                Ok(n) => {
                    let data = BASE64_STD.encode(&buf[..n]);
                    let _ = app_clone.emit(
                        "terminal-output",
                        TerminalOutput {
                            id: id_clone.clone(),
                            data,
                        },
                    );
                }
                Err(_) => break,
            }
        }
        let _ = app_clone.emit(
            "terminal-closed",
            TerminalClosed {
                id: id_clone.clone(),
            },
        );
    });

    let session = TerminalSession {
        master: pair.master,
        writer,
        child,
        _reader: Some(reader_thread),
    };
    manager
        .0
        .lock()
        .map_err(|_| "terminal manager lock poisoned".to_string())?
        .insert(id, session);
    Ok(())
}

/// 向指定终端写入输入数据（原始字符串，由前端按按键字符传入）。
#[tauri::command]
pub fn write_terminal(
    manager: State<TerminalManager>,
    id: String,
    data: String,
) -> Result<(), String> {
    let mut map = manager
        .0
        .lock()
        .map_err(|_| "terminal manager lock poisoned".to_string())?;
    if let Some(sess) = map.get_mut(&id) {
        sess.writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        sess.writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("terminal not found: {}", id))
    }
}

/// 调整指定终端的窗口尺寸（列 / 行），前端容器缩放时调用。
#[tauri::command]
pub fn resize_terminal(
    manager: State<TerminalManager>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let map = manager
        .0
        .lock()
        .map_err(|_| "terminal manager lock poisoned".to_string())?;
    if let Some(sess) = map.get(&id) {
        sess.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("terminal not found: {}", id))
    }
}

/// 终止指定终端会话（杀掉 shell 子进程并清理会话）。
#[tauri::command]
pub fn kill_terminal(manager: State<TerminalManager>, id: String) -> Result<(), String> {
    let mut map = manager
        .0
        .lock()
        .map_err(|_| "terminal manager lock poisoned".to_string())?;
    if let Some(mut sess) = map.remove(&id) {
        let _ = sess.child.kill();
        Ok(())
    } else {
        Err(format!("terminal not found: {}", id))
    }
}
