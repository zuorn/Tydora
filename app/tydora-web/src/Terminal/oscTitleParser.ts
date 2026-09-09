/**
 * 轻量 OSC 标题序列解析器。
 *
 * 直接从终端原始字节流中解析 OSC 0/1/2 标题序列，解析到完整标题立即回调，
 * 不依赖 xterm.js 的 onTitleChange。
 *
 * 背景：xterm.js 的 term.write() 内部使用异步分片解析器（WriteBuffer），对
 * htop / top / vim 这类高频全屏刷新程序，解析队列会积压，导致标题序列
 * （程序启动时发出的 \x1b]0;htop\x07）被压在队列里迟迟不触发 onTitleChange，
 * 表现为"工具栏标题慢一拍"（程序退出后标题才更新）。
 *
 * 本解析器在数据到达时同步扫描字节流，遇到完整 OSC 标题立即回调，绕过
 * xterm 的解析延迟。状态机支持跨数据包的半截 OSC 序列（state 与 oscBuf
 * 保留在实例中，下一包继续）。
 *
 * 支持的序列格式：
 *   \x1b]0;title\x07      (BEL 结束)
 *   \x1b]0;title\x1b\\    (ST 结束，ESC + '\')
 *   参数 0 / 1 / 2 均视为标题（0=图标+窗口标题，1=图标名，2=窗口标题）。
 */
export type OscTitleHandler = (title: string) => void;

export interface OscTitleParser {
  /** 喂入一批终端输出字节，解析到完整标题时同步触发回调。 */
  feed(bytes: Uint8Array): void;
  /** 重置状态（会话重挂/清理时调用）。 */
  reset(): void;
}

type State = "ground" | "esc" | "osc" | "oscEsc";

export function createOscTitleParser(onTitle: OscTitleHandler): OscTitleParser {
  let state: State = "ground";
  let oscBuf: number[] = [];
  const decoder = new TextDecoder("utf-8", { fatal: false });

  /** 一个 OSC 序列结束，处理 oscBuf 中的 "Ps;Pt"。 */
  const finishOsc = () => {
    if (oscBuf.length > 0) {
      const text = decoder.decode(Uint8Array.from(oscBuf));
      const semi = text.indexOf(";");
      if (semi >= 0) {
        const ps = text.slice(0, semi);
        const pt = text.slice(semi + 1);
        // 0 / 1 / 2 均作为标题；过滤空标题避免清空闪回
        if ((ps === "0" || ps === "1" || ps === "2") && pt.length > 0) {
          onTitle(pt);
        }
      }
    }
    oscBuf = [];
  };

  const feed = (bytes: Uint8Array) => {
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      switch (state) {
        case "ground":
          if (b === 0x1b) state = "esc";
          break;
        case "esc":
          if (b === 0x5d) {
            // ESC ] → 进入 OSC
            state = "osc";
            oscBuf = [];
          } else {
            // 其它 ESC 序列与本解析器无关，回 ground
            state = "ground";
          }
          break;
        case "osc":
          if (b === 0x07) {
            // BEL → OSC 结束
            finishOsc();
            state = "ground";
          } else if (b === 0x1b) {
            // 可能是 ST（ESC \）结束
            state = "oscEsc";
          } else {
            oscBuf.push(b);
          }
          break;
        case "oscEsc":
          if (b === 0x5c) {
            // \ → ST 结束
            finishOsc();
            state = "ground";
          } else if (b === 0x1b) {
            // 连续 ESC：把当前 OSC 作废，新 ESC 作为序列开头
            oscBuf = [];
            state = "esc";
          } else {
            // ESC 后非 \，OSC 无效作废
            oscBuf = [];
            state = "ground";
          }
          break;
      }
    }
  };

  const reset = () => {
    state = "ground";
    oscBuf = [];
  };

  return { feed, reset };
}
