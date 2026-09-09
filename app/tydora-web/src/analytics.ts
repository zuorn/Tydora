import { invoke } from "@tauri-apps/api/core";

/**
 * 匿名使用统计（Umami）
 *
 * 上报直接走前端 fetch，与官方网站 tracker 脚本使用完全相同的链路：
 * - 端点：https://gateway.umami.is/api/send（Umami 新网关，官方脚本默认端点）
 * - 与文档站共用同一个 Website ID，靠 hostname (app.tydora.local) 区分数据来源
 * - payload 格式与官方 tracker 一致（网关按此 schema 校验）：
 *   - 页面浏览 = 不带 name 字段的 event 类型请求
 *   - 自定义事件 = 带顶层 name 字段的 event 类型请求
 *   - 网关下发的会话 token（响应 cache 字段）通过 x-umami-cache 头回传，维持同一会话
 *
 * 合规设计：
 * - 首次启动弹窗征得用户同意后才会上报数据
 * - 设置页提供开关，可随时关闭，关闭后不再发送任何数据
 * - 只上报行为事件（事件名 + 少量属性），绝不收集文件路径、文件名、文档内容
 * - 事件名走白名单，防止意外上报敏感字符串
 * - 发送失败静默，不影响用户体验
 */

const UMAMI_WEBSITE_ID = "56c781b4-8ab7-4813-a503-b78da5b843d8";
const UMAMI_ENDPOINT = "https://gateway.umami.is/api/send";
const HOSTNAME = "app.tydora.local";

const CONSENT_KEY = "tydora.analytics.consent";
const INSTANCE_ID_KEY = "tydora.analytics.instance-id";
const SESSION_CACHE_KEY = "tydora.analytics.session-cache";

/** 会话 token 有效时长：与 Umami 默认 30 分钟会话超时一致，超过后丢弃、由网关开启新会话 */
const SESSION_TTL_MS = 30 * 60 * 1000;

/** 事件白名单：只有这里列出的事件才会被上报 */
export const ANALYTICS_EVENTS = {
  LAUNCH: "app.launch",
  EXIT: "app.exit",
  SETTINGS_OPEN: "settings.open",
  THEME_SWITCH: "theme.switch",
  EDITOR_MODE: "editor.mode",
  MINDMAP_OPEN: "mindmap.open",
  GRAPH_OPEN: "graph.open",
  CANVAS_OPEN: "canvas.open",
  BOOKMARK_ADD: "bookmark.add",
  TAGS_FILTER: "tags.filter",
  FILE_CREATE: "file.create",
  FILE_OPEN: "file.open",
  VAULT_OPEN: "vault.open",
  VAULT_MANAGER_OPEN: "vault.manager.open",
  EXPORT_OPEN: "export.open",
  EXPORT_WECHAT: "export.wechat",
  EXPORT_PDF: "export.pdf",
  EXPORT_DOCX: "export.docx",
  EXPORT_HTML: "export.html",
  EXPORT_MARKDOWN: "export.markdown",
  EXPORT_PNG: "export.png",
  EXPORT_XHS: "export.xiaohongshu",
  PUBLISH_BUILD: "publish.build",
  PUBLISH_PREVIEW: "publish.preview",
  IMAGE_PASTE: "image.paste",
  UPDATE_CHECK: "update.check",
  UPDATE_DOWNLOAD: "update.download",
  UPDATE_INSTALL: "update.install",
} as const;

const EVENT_WHITELIST: ReadonlySet<string> = new Set<string>(
  Object.values(ANALYTICS_EVENTS),
);

/** 用户是否已做过同意/拒绝选择 */
export function hasConsentChoice(): boolean {
  const value = localStorage.getItem(CONSENT_KEY);
  return value === "granted" || value === "denied";
}

/** 当前统计是否开启（用户已同意且未关闭） */
export function isAnalyticsEnabled(): boolean {
  return localStorage.getItem(CONSENT_KEY) === "granted";
}

/** 设置统计开关（granted 同意 / denied 拒绝） */
export function setAnalyticsEnabled(enabled: boolean): void {
  localStorage.setItem(CONSENT_KEY, enabled ? "granted" : "denied");
}

/** 读取或生成安装实例 ID（持久化到 localStorage，用于近似独立访客统计） */
function getInstanceId(): string {
  try {
    let id = localStorage.getItem(INSTANCE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(INSTANCE_ID_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

function detectOS(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Windows")) return "windows";
  if (ua.includes("Mac OS")) return "macos";
  if (ua.includes("Linux")) return "linux";
  return "unknown";
}

/** 应用版本号：懒加载一次后缓存（与统计项无关的失败静默） */
let versionPromise: Promise<string> | null = null;
function getVersion(): Promise<string> {
  if (!versionPromise) {
    versionPromise = invoke<string>("get_app_version").catch(() => "");
  }
  return versionPromise;
}

/** 读取网关下发的会话 token。存储在 localStorage 中跨窗口共享，
 *  使一次应用运行内的所有窗口计入同一个会话（访问）；
 *  超过 TTL 后丢弃，下次请求由网关开启新会话。 */
function readSessionToken(): string | undefined {
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as { token: string; ts: number };
    if (Date.now() - entry.ts > SESSION_TTL_MS) {
      localStorage.removeItem(SESSION_CACHE_KEY);
      return undefined;
    }
    return entry.token;
  } catch {
    return undefined;
  }
}

function storeSessionToken(token: string): void {
  try {
    localStorage.setItem(
      SESSION_CACHE_KEY,
      JSON.stringify({ token, ts: Date.now() }),
    );
  } catch {
    // 忽略存储错误
  }
}

/** 窗口内串行发送：保证先发出的请求拿到会话 token 后，紧随其后的请求能复用，
 *  避免同一时刻的多个请求被网关拆成多个会话 */
let sendQueue: Promise<void> = Promise.resolve();

/** 构造与官方 tracker 一致的公共 payload 字段 */
function buildBasePayload(): Record<string, unknown> {
  return {
    website: UMAMI_WEBSITE_ID,
    hostname: HOSTNAME,
    language: navigator.language,
    title: "Tydora",
    screen: `${screen.width}x${screen.height}`,
  };
}

/** 发送到 Umami 网关。成功时缓存网关下发的会话 token，供后续请求回传 */
function sendToUmami(payload: Record<string, unknown>): Promise<void> {
  sendQueue = sendQueue
    .then(async () => {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const token = readSessionToken();
        if (token) headers["x-umami-cache"] = token;
        const response = await fetch(UMAMI_ENDPOINT, {
          method: "POST",
          headers,
          body: JSON.stringify({ type: "event", payload }),
          keepalive: true,
        });
        if (response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { cache?: string }
            | null;
          if (body && typeof body.cache === "string") storeSessionToken(body.cache);
        }
      } catch {
        // 静默失败
      }
    })
    .catch(() => {});
  return sendQueue;
}

/**
 * 上报事件。fire-and-forget：
 * - 未同意统计时不发送任何数据
 * - 不在白名单内的事件直接忽略
 * - 发送失败静默，不影响用户体验
 */
export function track(event: string, data?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return;
  if (!EVENT_WHITELIST.has(event)) return;
  void (async () => {
    await sendToUmami({
      ...buildBasePayload(),
      url: "/app/event",
      name: event,
      data: {
        version: await getVersion(),
        os: detectOS(),
        visitor: getInstanceId(),
        ...(data ?? {}),
      },
    });
  })();
}

/**
 * 上报页面浏览（pageview）。Umami 新网关中页面浏览是「不带 name 的 event」，
 * 与官方 tracker 的自动页面浏览格式完全一致，会累计到「浏览数 Views」。
 * url 只传类型化路径（如 "/app/launch"、"/file"），绝不携带文件名等隐私信息。
 * 未同意统计时不发送任何数据；失败静默。
 */
export function trackPageview(url: string): void {
  if (!isAnalyticsEnabled()) return;
  void sendToUmami({
    ...buildBasePayload(),
    url,
  });
}
