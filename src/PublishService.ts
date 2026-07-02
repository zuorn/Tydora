// src/PublishService.ts
// 封装 @abstractwebunit/markdown-publish CLI 调用

import { readTextFile, writeTextFile, exists } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";

// ── Types ────────────────────────────────────────────────────────────

export interface PublishConfig {
  siteName: string;
  siteDescription?: string;
  siteLang: string;
  siteUrl?: string;
  siteFooter?: string;
  vaultDir: string;
  buildMode: "full" | "public";
  baseHref: string;
  out: string;
  home?: string;
}

export interface PublishProgress {
  total: number;
  current: number;
  currentFile: string;
  phase: "reading" | "converting" | "writing" | "done";
}

// ── Config Management ────────────────────────────────────────────────

export const CONFIG_FILE = "markdown-publish.config.json";

const DEFAULT_CONFIG: PublishConfig = {
  siteName: "My Notes",
  siteLang: "en",
  vaultDir: ".",
  buildMode: "full",
  baseHref: "/",
  out: "dist",
};

export async function loadPublishConfig(vaultPath: string): Promise<PublishConfig> {
  try {
    const configPath = `${vaultPath}/${CONFIG_FILE}`;
    if (await exists(configPath)) {
      const raw = await readTextFile(configPath);
      const saved = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...saved };
    }
  } catch (e) {
    console.error("读取发布配置失败:", e);
  }
  return getDefaultConfig(vaultPath);
}

export async function savePublishConfig(vaultPath: string, config: PublishConfig): Promise<void> {
  const configPath = `${vaultPath}/${CONFIG_FILE}`;
  await writeTextFile(configPath, JSON.stringify(config, null, 2));
}

export function getDefaultConfig(vaultPath: string): PublishConfig {
  const folderName = vaultPath.split(/[/\\]/).pop() || "My Notes";
  return {
    ...DEFAULT_CONFIG,
    siteName: folderName,
  };
}

// ── Main Publish Function ────────────────────────────────────────────

function resolvePath(base: string, relative: string): string {
  if (/^[A-Za-z]:/.test(relative) || relative.startsWith("/")) {
    return relative;
  }
  return `${base}/${relative}`;
}

export async function publishVault(
  vaultPath: string,
  config: PublishConfig,
  onProgress?: (progress: PublishProgress) => void
): Promise<void> {
  const vaultDir = config.vaultDir === "." ? vaultPath : resolvePath(vaultPath, config.vaultDir);
  const outDir = resolvePath(vaultPath, config.out);

  onProgress?.({ total: 0, current: 0, currentFile: "", phase: "reading" });

  // 调用 Rust 后端执行 markdown-publish CLI
  try {
    const result = await invoke<string>("run_markdown_publish", {
      vaultDir,
      outDir,
      config: JSON.stringify(config),
    });
    console.log("发布完成:", result);
    onProgress?.({ total: 1, current: 1, currentFile: "", phase: "done" });
  } catch (e: any) {
    console.error("发布失败:", e);
    throw new Error(e?.message || String(e) || "发布失败");
  }
}
