// 启动计时统一入口：
//  - console.time/timeEnd：用户明确要求的格式，输出到开发者工具 Console
//  - performance.mark + performance.measure：在 Performance 面板（DevTools → Performance）中可视化
//  - window.__TYDORA_BOOT__：时间点字典，最后汇总打印
//  - 监听 Rust 侧 `boot-timing` 事件，对齐 Rust / JS 两条时间轴
//
//  任何想测的阶段都用：
//     bootStart("阶段名") 开始
//     bootEnd("阶段名")   结束
//  如果阶段跨越异步边界，也可用 bootStamp("阶段名.key") 打一个绝对时间戳。

declare global {
  interface Window {
    __TYDORA_BOOT__: Record<string, number>;
    __TYDORA_BOOT_SUMMARY__?: () => void;
  }
}

window.__TYDORA_BOOT__ = window.__TYDORA_BOOT__ ?? {};

const stamps = window.__TYDORA_BOOT__;

export function bootStamp(label: string): number {
  const now = performance.now();
  stamps[label] = now;
  performance.mark?.(`boot:${label}`);
  return now;
}

export function bootStart(label: string): void {
  const mark = `boot:start:${label}`;
  performance.mark?.(mark);
  stamps[`start:${label}`] = performance.now();
  console.time(`BOOT:${label}`);
}

export function bootEnd(label: string): number {
  const startedAt = stamps[`start:${label}`];
  const endAt = performance.now();
  stamps[`end:${label}`] = endAt;
  if (startedAt != null) {
    performance.mark?.(`boot:end:${label}`);
    try {
      performance.measure?.(`boot:${label}`, `boot:start:${label}`, `boot:end:${label}`);
    } catch {
      /* ignore older browsers / restricted envs */
    }
  }
  console.timeEnd(`BOOT:${label}`);
  return endAt - (startedAt ?? endAt);
}

/** 输出所有 boot* 时间戳的汇总表，最后启动阶段调用。 */
export function bootSummary(): void {
  const sorted = Object.entries(stamps).sort(([, a], [, b]) => a - b);
  const t0 = sorted[0]?.[1] ?? 0;
  const lines = sorted.map(([k, v]) => {
    const rel = v - t0;
    return `  ${k.padEnd(42)}  +${rel.toFixed(1).padStart(8)} ms  (abs ${v.toFixed(1)} ms from navStart)`;
  });
  // console.table 更直观，但需要对象数组，保留两者
  const table = sorted.map(([k, v]) => ({ stage: k, abs_ms: +v.toFixed(1), rel_ms: +(v - t0).toFixed(1) }));
  // eslint-disable-next-line no-console
  console.groupCollapsed?.(`[BOOT-JS] summary (${sorted.length} timestamps, base=${t0.toFixed(1)}ms from navigationStart)`);
  try {
    // eslint-disable-next-line no-console
    console.table?.(table);
  } catch {
    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));
  }
  // eslint-disable-next-line no-console
  console.groupEnd?.();
}

window.__TYDORA_BOOT_SUMMARY__ = bootSummary;

/**
 * 接收 Rust 侧 emit 的 `boot-timing` 事件，
 * 把 Rust 时间轴（相对进程启动）写进 stamps 并输出成一条对齐日志，
 * 方便比较 "Rust 完成 setup" vs "JS 收到 boot-timing 事件" 之间的 WebView IPC 延迟。
 */
export async function connectRustBootTiming(): Promise<void> {
  try {
    const mod = await import("@tauri-apps/api/event");
    const unlisten = await mod.listen<{ stage: string; ms_since_process_start: number }>(
      "boot-timing",
      (event) => {
        const { stage, ms_since_process_start } = event.payload;
        const receivedAt = performance.now();
        stamps[`rust:${stage}`] = receivedAt;
        stamps[`rust:${stage}__rustClock`] = ms_since_process_start;
        performance.mark?.(`boot:rust:${stage}`);
        // Rust 侧的时钟和 JS 侧的 navigationStart 不在同一基准，
        // 打印两者便于人工对齐：收到事件的 JS 时间 - Rust 上报时间 ≈ IPC 延迟 + WebView排队
        const rustKey = `rust:${stage}`.padEnd(40);
        console.log(
          `[BOOT-RUST->JS] ${rustKey} rustClock=+${ms_since_process_start.toFixed(1)} ms  jsReceivedAt=+${receivedAt.toFixed(1)} ms  (drift≈${(
            receivedAt - ms_since_process_start
          ).toFixed(1)} ms — 越小越好)`
        );
      }
    );
    // 正常情况下永远不取消：启动过程中都需要监听
    // 如后续要卸载可调用 window.__TYDORA_UNLISTEN_BOOT__?.()
    (window as unknown as { __TYDORA_UNLISTEN_BOOT__?: () => void }).__TYDORA_UNLISTEN_BOOT__ = unlisten;
  } catch (err) {
    // 浏览器环境（非 Tauri）直接忽略
    if (!import.meta.env.DEV) {
      console.debug("[BOOT-JS] connectRustBootTiming skipped (non-tauri env)", err);
    }
  }
}
