/**
 * 全局自定义 tooltip：拦截原生 title，使用与应用菜单一致的主题样式。
 * 已有 data-tooltip（CSS 伪元素）的元素不在此处理。
 */

const SHOW_DELAY_MS = 450;

let tooltipEl: HTMLDivElement | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let activeEl: HTMLElement | null = null;
let pendingText = "";

function ensureTooltip(): HTMLDivElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.id = "app-tooltip";
    tooltipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

/** 从事件目标向上查找带 title 的元素（支持 SVG 等子节点） */
function findTitleElement(target: EventTarget | null): HTMLElement | null {
  let node = target instanceof Element ? target : null;
  while (node) {
    if (node instanceof HTMLElement) {
      if (node.hasAttribute("data-tooltip") || node.hasAttribute("data-native-tooltip")) {
        return null;
      }
      const title = node.getAttribute("title");
      if (title) return node;
    }
    node = node.parentElement;
  }
  return null;
}

function isInsideActiveSubtree(target: EventTarget | null): boolean {
  if (!activeEl || !(target instanceof Node)) return false;
  return activeEl === target || activeEl.contains(target);
}

function positionTooltip(target: HTMLElement, text: string) {
  const tip = ensureTooltip();
  tip.textContent = text;
  tip.style.display = "block";

  const rect = target.getBoundingClientRect();
  const margin = 8;
  const gap = 6;

  let left = rect.left + rect.width / 2 - tip.offsetWidth / 2;
  let top = rect.top - tip.offsetHeight - gap;

  if (top < margin) {
    top = rect.bottom + gap;
  }

  left = Math.max(margin, Math.min(left, window.innerWidth - tip.offsetWidth - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - tip.offsetHeight - margin));

  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function restoreTitle(el: HTMLElement) {
  if (pendingText) {
    el.setAttribute("title", pendingText);
  }
}

function hideTooltip() {
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  if (tooltipEl) {
    tooltipEl.style.display = "none";
  }
  if (activeEl) {
    restoreTitle(activeEl);
    activeEl = null;
  }
  pendingText = "";
}

function scheduleShow(el: HTMLElement, text: string) {
  pendingText = text;
  showTimer = setTimeout(() => {
    if (activeEl !== el || !pendingText) return;
    // 显示前再移除 title，避免与系统原生 tooltip 重叠
    el.removeAttribute("title");
    positionTooltip(el, pendingText);
  }, SHOW_DELAY_MS);
}

function onMouseOver(e: MouseEvent) {
  const el = findTitleElement(e.target);
  if (!el) {
    // 仍在当前 tooltip 目标内部（如 SVG 子节点）时不关闭
    if (isInsideActiveSubtree(e.target)) return;
    if (activeEl) hideTooltip();
    return;
  }
  if (el === activeEl) return;

  hideTooltip();
  activeEl = el;
  const text = el.getAttribute("title");
  if (!text) return;
  scheduleShow(el, text);
}

function onMouseOut(e: MouseEvent) {
  if (!activeEl) return;
  const related = e.relatedTarget;
  if (related instanceof Node && (related === activeEl || activeEl.contains(related))) {
    return;
  }
  hideTooltip();
}

export function initGlobalTooltip() {
  document.addEventListener("mouseover", onMouseOver, true);
  document.addEventListener("mouseout", onMouseOut, true);
  document.addEventListener("scroll", hideTooltip, true);
  window.addEventListener("blur", hideTooltip);
}
