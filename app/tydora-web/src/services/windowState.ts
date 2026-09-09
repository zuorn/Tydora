import type { Monitor } from "@tauri-apps/api/window";

interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const EDGE_MARGIN_X = 80;
const EDGE_MARGIN_TOP = 40;
const EDGE_MARGIN_BOTTOM = 40;

/**
 * 钳制窗口尺寸和位置，确保不超出显示器边界。
 * 找到窗口中心点所在的显示器，将宽高和坐标限制在该显示器内。
 */
export function clampWindowToMonitor(
  state: WindowRect,
  monitors: Monitor[]
): WindowRect {
  if (!monitors.length) return state;

  const centerX = state.x + state.width / 2;
  const centerY = state.y + state.height / 2;

  // 找到中心点所在的显示器
  let target: Monitor | undefined;
  for (const m of monitors) {
    const { x: mx, y: my } = m.position;
    const { width: mw, height: mh } = m.size;
    if (centerX >= mx && centerX <= mx + mw && centerY >= my && centerY <= my + mh) {
      target = m;
      break;
    }
  }

  // 如果中心点不在任何显示器上，使用第一个显示器
  if (!target) target = monitors[0];

  const { x: mx, y: my } = target.position;
  const { width: mw, height: mh } = target.size;

  // 钳制宽高：不超过显示器可用区域
  const maxWidth = mw - EDGE_MARGIN_X * 2;
  const maxHeight = mh - EDGE_MARGIN_TOP - EDGE_MARGIN_BOTTOM;
  const width = Math.max(400, Math.min(state.width, maxWidth));
  const height = Math.max(300, Math.min(state.height, maxHeight));

  // 钳制位置：确保窗口在显示器可见区域内
  const x = Math.max(mx + 20, Math.min(state.x, mx + mw - width - 20));
  const y = Math.max(my + 20, Math.min(state.y, my + mh - height - 20));

  return { x, y, width, height };
}
