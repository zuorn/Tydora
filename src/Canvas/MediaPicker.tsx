import { useState, useEffect, useCallback } from "react";
import { readDir } from "@tauri-apps/plugin-fs";
import QuickOpen from "../components/QuickOpen";

interface MediaPickerProps {
  vaultPath: string | null;
  onSelect: (path: string) => void;
  onClose: () => void;
}

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
}

// 媒体文件扩展名
const MEDIA_EXTENSIONS = new Set([
  // 图片
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico',
  // 视频
  'mp4', 'webm', 'ogg', 'mov', 'avi',
  // 音频
  'mp3', 'wav', 'aac', 'flac', 'm4a',
  // PDF
  'pdf',
  // 白板文件
  'canvas',
]);

// 递归获取仓库中所有媒体文件
async function getAllMediaFiles(dirPath: string): Promise<FileItem[]> {
  const files: FileItem[] = [];

  async function walk(dir: string) {
    try {
      const entries = await readDir(dir);
      for (const entry of entries) {
        if (entry.name?.startsWith(".")) continue;
        const sep = navigator.platform?.toLowerCase().includes("win") ? "\\" : "/";
        const fullPath = dir.endsWith(sep) ? dir + entry.name : dir + sep + entry.name;
        if (entry.isDirectory) {
          await walk(fullPath);
        } else if (entry.isFile) {
          const name = entry.name || "";
          const ext = name.split('.').pop()?.toLowerCase() || '';
          // Only include media files (not markdown)
          if (MEDIA_EXTENSIONS.has(ext)) {
            files.push({
              name: name,
              path: fullPath,
              isDirectory: false,
            });
          }
        }
      }
    } catch {
      // 忽略访问错误
    }
  }

  await walk(dirPath);
  return files;
}

export default function MediaPicker({ vaultPath, onSelect, onClose }: MediaPickerProps) {
  const [files, setFiles] = useState<FileItem[]>([]);

  // Load media files from vault
  useEffect(() => {
    if (!vaultPath) return;

    getAllMediaFiles(vaultPath)
      .then((loadedFiles) => {
        loadedFiles.sort((a, b) => a.name.localeCompare(b.name));
        setFiles(loadedFiles);
      })
      .catch(() => {});
  }, [vaultPath]);

  // Handle file selection
  const handleSelect = useCallback((path: string) => {
    onSelect(path);
  }, [onSelect]);

  return (
    <QuickOpen
      vault={vaultPath ? { path: vaultPath, name: '' } : null}
      recentFiles={[]}
      currentFilePath={null}
      files={files}
      onSelect={handleSelect}
      onClose={onClose}
    />
  );
}
