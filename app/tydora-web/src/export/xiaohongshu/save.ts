// 小红书卡片导出：批量保存 / 单张保存 / 打开文件夹
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import type { XhsCard } from "./types";

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "document";
}

function dataUrlToUint8(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] || "";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * 弹出文件夹选择器并把所有卡片写入 `标题_01.png` … `标题_0N.png`。
 * 返回保存目录，用户取消则返回 null。
 */
export async function saveXhsCards(cards: XhsCard[], title: string): Promise<string | null> {
  if (cards.length === 0) return null;

  const dir = await open({ directory: true, title: "选择保存文件夹" });
  if (!dir || typeof dir !== "string") return null;

  const base = sanitizeFileName(title);
  const width = Math.max(2, String(cards.length).length);
  for (let i = 0; i < cards.length; i++) {
    const name = `${base}_${String(i + 1).padStart(width, "0")}.png`;
    const bytes = dataUrlToUint8(cards[i].pngDataUrl);
    await writeFile(`${dir}\\${name}`, bytes);
  }
  return dir;
}

/** 单张保存：弹保存对话框写入一张卡片 PNG，返回保存路径（用户取消则 null） */
export async function saveCardImage(card: XhsCard, title: string): Promise<string | null> {
  const name = `${sanitizeFileName(title)}_${String(card.index + 1).padStart(2, "0")}.png`;
  const filePath = await save({
    defaultPath: name,
    filters: [{ name: "PNG 图片", extensions: ["png"] }],
  });
  if (!filePath) return null;
  await writeFile(filePath, dataUrlToUint8(card.pngDataUrl));
  return filePath;
}

/** 在系统文件管理器中打开目录 */
export async function openDirectory(dirPath: string): Promise<void> {
  await invoke("open_directory", { dirPath });
}
