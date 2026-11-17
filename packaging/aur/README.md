# Tydora on Arch Linux (AUR)

两个包的源码就在本目录，各自对应一个 AUR 仓库（同名）：

| 目录 | AUR 包名 | 说明 |
| --- | --- | --- |
| `tydora/` | `tydora` | **源码构建**。npm 拉前端依赖 + cargo 编译，产物在本机生成。首次构建约 15–30 分钟（其中 `npm ci` 与 Rust LTO 编译是主要耗时），装完占用约 60 MB。 |
| `tydora-bin/` | `tydora-bin` | **官方预编译产物重打包**。直接拆上游 GitHub Release 的 `.deb` 重装，秒级安装，下载约 10 MB、安装后约 20 MB。不想等编译就用它。 |

两个包**安装后的文件布局完全一致**，可以随时互换（`tydora-bin` 声明了 `provides=tydora`，`conflicts` 互相排斥）。

---

## 1. 用户安装

```bash
# AUR 助手（推荐）
yay  -S tydora        # 源码构建
yay  -S tydora-bin    # 预编译

paru -S tydora        # 同理

# 或者纯 makepkg
git clone https://aur.archlinux.org/tydora-bin.git
cd tydora-bin && makepkg -si
```

## 2. 安装后得到什么

```
/usr/bin/tydora                                    主程序（GUI 也走这个命令启动）
/usr/bin/tydora-cli                                命令行 / MCP 工具（Tauri sidecar）
/usr/share/applications/tydora.desktop              桌面入口（含 .md 的 MimeType）
/usr/share/icons/hicolor/32x32/apps/tydora.png
                        /64x64/apps/tydora.png
                        /128x128/apps/tydora.png
                        /256x256/apps/tydora.png     （来自上游 128x128@2x.png）
                        /512x512/apps/tydora.png     （来自上游 icon.png）
```

几个容易踩的点，本包都按下面的方式处理：

- **`tydora-cli` 必须和 `tydora` 同目录。** 桌面端「设置 → CLI 与 MCP」是用
  `current_exe().parent()/tydora-cli` 探测的（`app/tydora-desktop/src/lib.rs`
  的 `cli_sidecar_info`），所以两个二进制都装在 `/usr/bin`，不能把 CLI 丢进
  `/usr/lib/tydora/`。
- **可执行文件名必须是 `tydora`。** `tauri.conf.json` 没开
  `app.enable_gtk_app_id`，GTK 会拿 `argv[0]` 当 `WM_CLASS`，而 `.desktop` 里的
  `StartupWMClass` 也只有和它一致，GNOME / KDE 才不会出现「一个图标 + 一个孤立窗口」。
- **`.desktop` 是自己写的，不是复用上游的。** 上游 `.deb` 里那份是
  `tauri-bundler` 生成的，`Categories=` 为空（`desktop-file-validate` 直接报错），
  而且完全没有 `MimeType` —— 双击 `.md` 关联不上。
- **`Exec=tydora %F`，不是 `%U`。** 应用按**文件系统路径**过滤启动参数
  （`filter_markdown_paths`），`%U` 传的是 `file://` URI，会被直接忽略。
- **图标目录名修正。** 上游 `.deb` 把 256px 图标塞进了 `hicolor/256x256@2/`
  （不是合法的 hicolor 尺寸目录），本包归位到 `256x256/`。

前端资源（HTML/JS/CSS）和「Tydora 介绍」仓库文档都由 `include_str!` /
`generate_context!` 在编译期内嵌进二进制，所以**不需要任何 `/usr/share/tydora` 资源目录**。

## 3. 运行时依赖

```bash
# depends（装包时自动装）
gtk3  libsoup3  openssl  webkit2gtk-4.1  xdg-utils
#                                        ^^^^^^^^^ 打开外部链接 / 「在文件管理器中显示」
#                                                   全靠它提供的 xdg-open

# optdepends：只在用「发布成静态网站」功能时才需要
sudo pacman -S nodejs
npm install -g @abstractwebunit/markdown-publish
```

## 4. 已知限制

- **应用内自动更新在包安装版上不可用**，请用 `pacman -Syu` / `yay -Syu` 升级。
  上游 `latest.json` 的 `linux-x86_64` 指向 AppImage，而
  `tauri-plugin-updater` 在 Linux 上只支持「原地替换当前可执行文件」
  （`extract_path = current_exe()`），从 `/usr/bin/tydora` 启动时必然 `EACCES`
  失败（而且整个安装包已经白下了一遍）。
  **含「包管理器安装识别」的版本起**，应用会通过查 pacman/dpkg/rpm 的文件归属
  判断自己由包管理器安装：检查更新仍会提示有新版本，但按钮从「下载」变成
  「复制更新命令」，直接给出 `yay -Syu tydora`（官方仓库包则是 `sudo pacman -Syu`），
  不再做注定失败的下载；同时更新失败也会有可见提示，不再只写控制台。
  0.2.9 及更早版本没有这个识别，点更新只会失败且界面无任何反馈。
  （**不能**把 `tauri.conf.json` 的 `updater.endpoints` 改成空数组来关掉它：
  插件的 `Builder::build()` 遇到空列表会返回 `Error::EmptyEndpoints`，应用直接起不来。）
- **源码包的 `npm ci` 会连带装一整套 Angular 工具链。** `package.json` 用
  `file:./vendor/markdown-publish` 挂了 markdown-publish，而它的 `dependencies`
  就是 Angular 全家桶。前端源码并不 import 它（运行时靠 PATH 上的全局
  markdown-publish），但删掉这个依赖会让 `npm ci` 与 `package-lock.json`
  不一致而报错，所以只能照装。
- **`app/Cargo.toml` 的 license 写错了。** `[workspace.package] license = "MIT"`，
  但仓库 `LICENSE` 和两份 README 都声明 Apache-2.0。PKGBUILD 依 `LICENSE` 取
  `license=('Apache')`。建议顺手把 `app/Cargo.toml` 改成 `"Apache-2.0"`。
- **`license=('Apache')` 是 Arch 的「common license」**，license 文件由
  `licenses` 包提供，按打包规范不重复安装 `/usr/share/licenses/` 下的副本。

## 5. 发新版本时怎么更新

先把上游 release 发出去（tag `v<版本>` + 两个 `.deb` 资产），然后在 Arch 上跑一条命令：

```bash
bash packaging/aur/bump.sh          # 版本取自仓库根的 VERSION
bash packaging/aur/bump.sh 0.3.4    # 或显式指定
```

`bump.sh` 做三件事：

- `pkgver` 改成新版本，`pkgrel` 归 1；
- 重新下载源码 tarball 与两个 `.deb`（用 `curl -f`，404 直接失败，不会把错误页当源码写进去），
  把新的 sha256 写进三个校验和字段；
- 机器上有 `makepkg` 时，顺带重新生成两份 `.SRCINFO`。

`source` 行里用的是 `$pkgver` 变量，所以源地址不用手改。
`.SRCINFO` 永远以 `makepkg --printsrcinfo` 为准 —— `publish.sh` 推送前会再生成一次；
AUR 服务端收到推送后也会自己生成一份比对，手写那份字段顺序不对会被直接拒绝。
仓库里那份只是方便离线查看元数据。

然后：

```bash
bash packaging/aur/publish.sh --dry-run    # 先看 diff
bash packaging/aur/publish.sh              # 推送
```

## 6. 提交前自查（在 Arch 上跑）

`makepkg` 依赖 `base-devel`，`namcap` 要单独装：

```bash
sudo pacman -S --needed base-devel namcap
```

### 6.1 快速自查（当前系统直接构建）

```bash
cd packaging/aur/tydora        # 或 tydora-bin

makepkg --printsrcinfo > /dev/null        # PKGBUILD 语法与元数据
namcap PKGBUILD                           # 依赖漏了/多了、源地址问题
makepkg -si                               # 真机构建 + 安装
namcap tydora-*.pkg.tar.zst               # 产物检查

# 安装结果验证
pacman -Ql tydora          # 文件清单
which tydora tydora-cli    # 两个都应在 /usr/bin
tydora-cli --version       # 应与 PKGBUILD 的 pkgver 一致（0.3.3）
desktop-file-validate /usr/share/applications/tydora.desktop
gtk-launch tydora          # 或直接在应用菜单里点开
```

本机装了各种 `-dev` 包时，漏掉的依赖会被悄悄满足，所以下面的干净 chroot 更可信。

### 6.2 干净 chroot（推荐，devtools）

```bash
sudo pacman -S --needed devtools
cd packaging/aur/tydora
extra-x86_64-build            # 首次会自动初始化 chroot
extra-x86_64-build -- -c      # 之后想复用 chroot 并保留缓存就跑这个
```

`tydora` 是源码包，在 2 核机器上这次完整构建（`npm ci` + Rust LTO）大约 20–40 分钟；
只想快速验证包结构可以先跑 `tydora-bin`（几秒）。

## 7. 发布到 AUR

### 7.1 账号与 SSH（只做一次）

1. 在 <https://aur.archlinux.org/register/> 注册（用户名确定后不能改；邮箱要能收确认信）。
2. 在**用来发布的那台 Arch 机器**上生成专用密钥，不要复用 GitHub 那一把：

```bash
ssh-keygen -t ed25519 -f ~/.ssh/aur -C "aur:$(whoami)"
```

3. `~/.ssh/config` 里加一段（避免和 GitHub 的 key 抢）：

```
Host aur.archlinux.org
  User aur
  IdentityFile ~/.ssh/aur
  IdentitiesOnly yes
```

4. 把 `~/.ssh/aur.pub` 的整行内容粘到 AUR → My Account → **SSH Public Key**。
5. 验证：

```bash
ssh -T aur@aur.archlinux.org      # 应输出 "Welcome to AUR, <用户名>!"
```

AUR 只接受 SSH 写入（HTTPS 只读），一个账号可以挂多把密钥。

### 7.2 首次推送

```bash
bash packaging/aur/publish.sh --dry-run   # 只 clone + 生成 .SRCINFO + 打印 diff，不提交
bash packaging/aur/publish.sh             # 两个包一起推；也可只推一个
```

首次推送时远端仓库还不存在，AUR 会返回一个空仓库（`warning: You appear to have cloned
an empty repository`），这是预期行为 —— push 成功后才真正创建包。两个包是**两个独立的
AUR 仓库**，脚本会分别推送：

- `ssh://aur@aur.archlinux.org/tydora.git`
- `ssh://aur@aur.archlinux.org/tydora-bin.git`

### 7.3 上线之后

- <https://aur.archlinux.org/packages/tydora>
- <https://aur.archlinux.org/packages/tydora-bin>

AUR 的索引是定时刷新（通常几分钟内），之后 `yay -S tydora-bin` 就能装到。
用户装完后请用 `pacman -Syu` / `yay -Syu` 升级，不要用应用内更新（见第 4 节）。
