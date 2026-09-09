// 导出功能统一入口（构建与保存分离，便于预览）
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import {
  collectDocumentCSS,
  inlineImages,
  prepareExportElement,
  rasterizeMermaidSvgsForDocx,
  replaceTaskCheckboxesWithSvg,
} from "./dom";

export type ExportFormat = "pdf" | "html" | "docx" | "png" | "wechat";

interface FormatMeta {
  ext: string;
  label: string;
  filters: { name: string; extensions: string[] }[];
}

export const EXPORT_FORMATS: Record<ExportFormat, FormatMeta> = {
  pdf: { ext: "pdf", label: "PDF", filters: [{ name: "PDF 文档", extensions: ["pdf"] }] },
  png: { ext: "png", label: "图片", filters: [{ name: "PNG 图片", extensions: ["png"] }] },
  html: { ext: "html", label: "HTML", filters: [{ name: "HTML 文档", extensions: ["html", "htm"] }] },
  docx: { ext: "docx", label: "Word", filters: [{ name: "Word 文档", extensions: ["docx"] }] },
  wechat: { ext: "html", label: "公众号", filters: [] },
};

export interface ExportContext {
  /** 从编辑器克隆当前渲染内容（源码模式下返回 null） */
  getContentElement: () => HTMLElement | null;
  themeName: string;
  /** 用作文件名的标题（不含扩展名） */
  title: string;
}

/** 构建后的产物：content 为最终写入内容，preview* 为预览用数据 */
export interface BuiltArtifact {
  content: string | Uint8Array;
  previewHtml?: string;
  previewPng?: string;
}

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
 * 构建导出产物（不写文件）。返回最终内容与预览数据。
 * 抛出 Error 表示构建失败（如源码模式）。
 */
export async function buildExportArtifact(format: ExportFormat, ctx: ExportContext): Promise<BuiltArtifact> {
  const raw = ctx.getContentElement();
  if (!raw) {
    throw new Error("请切换到预览模式（WYSIWYG）后再导出");
  }

  // 导出相关重库（html2canvas / jspdf / docx 等）按需加载，避免拖慢应用启动
  const { buildHtmlDoc, buildWechatHtml, exportPdfBytes, renderToPng } = await import("./exporters");

  // Word 导出固定使用浅色主题，避免暗色主题下文字/背景异常
  const { container, cleanup } = prepareExportElement(raw, ctx.themeName, format === "docx");
  try {
    // 内联本地/远程图片，使产物自包含
    await inlineImages(raw);

    const css = collectDocumentCSS();
    const bg = getComputedStyle(container).backgroundColor || "#ffffff";
    // docx 导出时 forceLightTheme 已确保底层 DOM 为浅色背景，预览 HTML 可沿用用户所选主题
    const htmlDoc = buildHtmlDoc(raw, css, ctx.themeName, ctx.title);

    switch (format) {
      case "html":
        return {
          content: buildHtmlDoc(raw, css, ctx.themeName, ctx.title, { exportShadow: true }),
          previewHtml: htmlDoc,
        };
      case "docx": {
        const { exportDocxBytes } = await import("./docx");
        // 先把 mermaid SVG 栅格化为图片，再生成真正的 .docx 二进制
        await rasterizeMermaidSvgsForDocx(raw);
        // 移除导出 header（icon + 名称），Word 文档不需要应用标识
        raw.querySelector(".export-app-header")?.remove();
        const bytes = await exportDocxBytes(raw);
        return { content: bytes, previewHtml: htmlDoc };
      }
      case "pdf": {
        replaceTaskCheckboxesWithSvg(container);
        const bytes = await exportPdfBytes(container, bg);
        const previewPng = await renderToPng(container, bg);
        return { content: bytes, previewHtml: htmlDoc, previewPng };
      }
      case "png": {
        replaceTaskCheckboxesWithSvg(container);
        const dataUrl = await renderToPng(container, bg);
        return { content: dataUrlToUint8(dataUrl), previewPng: dataUrl };
      }
      case "wechat": {
        const wechatHtml = buildWechatHtml(raw, css, ctx.themeName, ctx.title);
        return { content: wechatHtml, previewHtml: wechatHtml };
      }
    }
  } finally {
    cleanup();
  }
}

/** 弹出保存对话框并写入文件；用户取消则返回 null。公众号格式不写入文件。 */
export async function saveExportArtifact(
  format: ExportFormat,
  content: string | Uint8Array,
  title: string,
): Promise<string | null> {
  if (format === "wechat") {
    // 公众号格式不写入文件，由 ExportPreviewDialog 处理复制到剪贴板
    return null;
  }
  const meta = EXPORT_FORMATS[format];
  const defaultPath = `${sanitizeFileName(title)}.${meta.ext}`;
  const filePath = await save({ defaultPath, filters: meta.filters });
  if (!filePath) return null;

  if (typeof content === "string") {
    // 分块写入，避免大字符串通过 Tauri IPC 触发 STATUS_HEAP_CORRUPTION
    const CHUNK_SIZE = 512 * 1024; // 512KB per chunk
    await invoke("create_export_file", { path: filePath });
    for (let i = 0; i < content.length; i += CHUNK_SIZE) {
      const chunk = content.slice(i, i + CHUNK_SIZE);
      await invoke("append_export_file", { path: filePath, data: chunk });
    }
  } else {
    await writeFile(filePath, content);
  }
  return filePath;
}
