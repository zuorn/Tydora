import { useState, useEffect, useCallback } from "react";
import { readDir } from "@tauri-apps/plugin-fs";
import QuickOpen from "../components/QuickOpen";

interface NotePickerProps {
  vaultPath: string | null;
  onSelect: (path: string, name: string) => void;
  onClose: () => void;
}

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
}

// 递归获取仓库中所有 Markdown 文件
async function getAllMarkdownFiles(dirPath: string): Promise<FileItem[]> {
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
          // Only include markdown files
          if (name.endsWith('.md') || name.endsWith('.markdown')) {
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

export default function NotePicker({ vaultPath, onSelect, onClose }: NotePickerProps) {
  const [files, setFiles] = useState<FileItem[]>([]);

  // Load markdown files from vault
  useEffect(() => {
    if (!vaultPath) return;

    getAllMarkdownFiles(vaultPath)
      .then((loadedFiles) => {
        loadedFiles.sort((a, b) => a.name.localeCompare(b.name));
        setFiles(loadedFiles);
      })
      .catch(() => {});
  }, [vaultPath]);

  // Handle file selection
  const handleSelect = useCallback((path: string) => {
    const name = path.split(/[/\\]/).pop() || path;
    onSelect(path, name);
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
