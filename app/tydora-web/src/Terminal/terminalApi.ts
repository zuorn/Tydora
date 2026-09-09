/**
 * 终端与 Rust 后端的 IPC 封装层。
 * 集中管理事件名、命令调用与 base64 编解码，避免散落在组件里。
 *
 * 会话与视图解耦：
 * - 每个终端会话由唯一 `id` 标识，PTY 进程存活在前端 React 组件之外。
 * - TerminalView 因分屏等布局变化卸载/重挂时，进程与屏幕缓冲按 sessionId 保留，
 *   重挂后回放缓冲恢复屏幕，从而做到“分屏不中断正在运行的命令”。
 * - 真正销毁会话由 App 在关闭窗格时调用 killTerminal + unregisterTerminal。
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const TERMINAL_OUTPUT_EVENT = "terminal-output";
export const TERMINAL_CLOSED_EVENT = "terminal-closed";

export interface TerminalOutputPayload {
  id: string;
  /** base64 编码的原始字节流 */
  data: string;
}

export interface TerminalClosedPayload {
  id: string;
}

/** 每个会话的屏幕缓冲（累积输出字节），用于 TerminalView 重挂时回放恢复屏幕。 */
const sessionBuffers = new Map<string, number[]>();
/** 每个会话的输出多播监听器集合（同一会话可能同时存在 0~1 个视图订阅）。 */
const sessionListeners = new Map<string, Set<(bytes: Uint8Array) => void>>();
/** 全局输出事件监听是否已注册（仅注册一次，避免重复派发）。 */
let globalListenerStarted = false;

/** 注册一次性的全局 terminal-output 监听，分发到各会话的缓冲与监听器。 */
function ensureGlobalListener(): void {
  if (globalListenerStarted) return;
  globalListenerStarted = true;
  listen<TerminalOutputPayload>(TERMINAL_OUTPUT_EVENT, (event) => {
    const { id, data } = event.payload;
    let buf = sessionBuffers.get(id);
    if (!buf) {
      buf = [];
      sessionBuffers.set(id, buf);
    }
    const bytes = base64ToBytes(data);
    for (let i = 0; i < bytes.length; i++) buf.push(bytes[i]);
    // 限制缓冲上限（最近 1MB），避免长会话内存膨胀。
    if (buf.length > 1_048_576) buf.splice(0, buf.length - 1_048_576);
    const listeners = sessionListeners.get(id);
    if (listeners && listeners.size > 0) {
      const incremental = Uint8Array.from(buf.slice(-bytes.length));
      listeners.forEach((fn) => fn(incremental));
    }
  }).catch(() => {
    globalListenerStarted = false;
  });
}

/** 创建并启动一个终端会话（PTY）。重复调用同一 id 为幂等 no-op。 */
export function spawnTerminal(id: string, cwd: string, shell?: string): Promise<void> {
  ensureGlobalListener();
  return invoke("spawn_terminal", { id, cwd, shell: shell ?? null });
}

/** 向终端写入输入。 */
export function writeTerminal(id: string, data: string): Promise<void> {
  return invoke("write_terminal", { id, data });
}

/** 调整终端尺寸。 */
export function resizeTerminal(id: string, cols: number, rows: number): Promise<void> {
  return invoke("resize_terminal", { id, cols, rows });
}

/** 终止终端会话（杀掉 shell 子进程并清理会话）。 */
export function killTerminal(id: string): Promise<void> {
  return invoke("kill_terminal", { id });
}

/** 注销一个终端会话的前端状态（kill 后调用，释放缓冲与监听器）。 */
export function unregisterTerminal(id: string): void {
  sessionBuffers.delete(id);
  sessionListeners.delete(id);
}

/** 订阅某终端的输出（按 id 过滤）：注册监听并立即回放已有缓冲，返回取消订阅函数。 */
export function listenTerminalOutput(
  id: string,
  onData: (bytes: Uint8Array) => void,
): Promise<UnlistenFn> {
  ensureGlobalListener();
  let set = sessionListeners.get(id);
  if (!set) {
    set = new Set();
    sessionListeners.set(id, set);
  }
  set.add(onData);
  const buf = sessionBuffers.get(id);
  if (buf && buf.length > 0) onData(Uint8Array.from(buf));
  return Promise.resolve(() => {
    const s = sessionListeners.get(id);
    if (s) s.delete(onData);
  });
}

/** 订阅某终端的关闭事件（按 id 过滤）。 */
export function listenTerminalClosed(
  id: string,
  onClosed: () => void,
): Promise<UnlistenFn> {
  return listen<TerminalClosedPayload>(TERMINAL_CLOSED_EVENT, (event) => {
    if (event.payload.id === id) onClosed();
  });
}

/** base64 -> 字节数组（终端输出为原始字节，可能含半截多字节序列，不能直接当字符串）。 */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── 字号逻辑已迁移至 terminal-settings.ts ─────────────────────────
// 终端配色方案、字体、字号统一在 terminal-settings.ts 管理（全局 store +
// 跨窗口同步）。此处仅做向后兼容的再导出，避免外部引用断裂。
export {
  getTerminalFontSize,
  setTerminalFontSize,
  subscribeTerminalFontSize,
  TERMINAL_MIN_FONT_SIZE,
  TERMINAL_MAX_FONT_SIZE,
} from "./terminal-settings";
