/**
 * 图片加载兜底：asset 协议（convertFileSrc）对某些本地路径可能服务失败
 * （例如固定图片目录在仓库外、含非 ASCII 字符的路径等）。
 * 此时通过 fs 插件直接读取文件内容，转为 blob URL 显示，保证图片总能正常加载。
 */

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  avif: "image/avif",
  ico: "image/x-icon",
};

function isAbsoluteLocalPath(p: string): boolean {
  // Windows 盘符路径（C:\ 或 C:/）或以 / 开头的类 Unix 绝对路径
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("/");
}

/** 通过 fs 插件读取本地图片并转为 blob URL；失败返回 null */
export async function readImageAsBlobUrl(absPath: string): Promise<string | null> {
  try {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const data = await readFile(absPath);
    const ext = (absPath.split(".").pop() || "").toLowerCase();
    const blob = new Blob([data], { type: MIME_BY_EXT[ext] || "application/octet-stream" });
    return URL.createObjectURL(blob);
  } catch (err) {
    console.warn("[ImageFallback] fs read failed:", absPath, err);
    return null;
  }
}

/**
 * 给 <img> 附加「asset 协议失败 → fs 读取兜底」逻辑（命令式 DOM 场景，如 TipTap 节点视图）。
 * @param img 目标图片元素
 * @param getAbsPath 返回图片的本地绝对路径；返回空值时跳过兜底
 * @returns 清理函数（移除监听并释放 blob URL），供调用方在销毁时执行
 */
export function attachLocalImageFsFallback(
  img: HTMLImageElement,
  getAbsPath: () => string | null | undefined,
): () => void {
  let tried = false;
  let objectUrl: string | null = null;

  const onError = () => {
    const abs = getAbsPath();
    if (tried || !abs || !isAbsoluteLocalPath(abs)) return;
    tried = true;
    void readImageAsBlobUrl(abs).then((url) => {
      if (url) {
        objectUrl = url;
        img.src = url;
      }
    });
  };

  img.addEventListener("error", onError);
  return () => {
    img.removeEventListener("error", onError);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  };
}
