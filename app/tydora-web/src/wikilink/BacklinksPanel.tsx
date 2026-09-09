// src/BacklinksPanel.tsx

import { useState, useEffect } from "react";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { LinkIndexService } from "./LinkIndexService";
import "./BacklinksPanel.css";

interface BacklinksPanelProps {
  currentFilePath: string | null;
  vaultPath: string | null;
  onSelectFile: (path: string) => void;
}

interface BacklinkItem {
  filePath: string;
  fileName: string;
  context: string;
}

export function BacklinksPanel({ currentFilePath, vaultPath, onSelectFile }: BacklinksPanelProps) {
  const [backlinks, setBacklinks] = useState<BacklinkItem[]>([]);
  const [outlinks, setOutlinks] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!currentFilePath || !vaultPath) {
      setBacklinks([]);
      setOutlinks([]);
      return;
    }

    // 获取当前笔记名
    const noteName = currentFilePath.slice(vaultPath.length)
      .replace(/^[/\\]/, '')
      .replace(/\.[^.]+$/, '');

    // 获取反向链接
    const linkedFiles = LinkIndexService.getBacklinks(noteName);

    // 获取出链
    const currentOutlinks = LinkIndexService.getOutlinks(currentFilePath);
    setOutlinks(currentOutlinks);

    // 提取上下文（读取引用文件，找到包含 [[笔记名]] 的段落）
    const loadBacklinks = async () => {
      const results: BacklinkItem[] = [];

      for (const filePath of linkedFiles) {
        try {
          const content = await readTextFile(filePath);
          const context = extractContext(content, noteName);
          results.push({
            filePath,
            fileName: filePath.split(/[/\\]/).pop() || filePath,
            context,
          });
        } catch {
          // 文件可能已被删除
        }
      }

      setBacklinks(results);
    };

    loadBacklinks();
  }, [currentFilePath, vaultPath]);

  // 提取包含 [[笔记名]] 的完整段落作为上下文
  const extractContext = (content: string, noteName: string): string => {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`[[${noteName}]]`) || lines[i].includes(`[[${noteName}#`)) {
        // 向前找到段落开头（空行或文件头）
        let start = i;
        while (start > 0 && lines[start - 1].trim() !== '') start--;
        // 向后找到段落结尾（空行或文件尾）
        let end = i;
        while (end < lines.length - 1 && lines[end + 1].trim() !== '') end++;
        // 提取并截断
        const paragraph = lines.slice(start, end + 1).join('\n').trim();
        return paragraph.length > 200 ? paragraph.slice(0, 200) + '...' : paragraph;
      }
    }
    return '';
  };

  if (backlinks.length === 0 && outlinks.length === 0) return null;

  return (
    <div className={`backlinks-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="backlinks-header" onClick={() => setCollapsed(!collapsed)}>
        <svg
          className={`backlinks-toggle ${collapsed ? '' : 'expanded'}`}
          width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className="backlinks-title">链接</span>
        <span className="backlinks-count">{backlinks.length + outlinks.length}</span>
      </div>

      {!collapsed && (
        <>
          {backlinks.length > 0 && (
            <div className="backlinks-section">
              <div className="backlinks-section-title">反向链接 ({backlinks.length})</div>
              <div className="backlinks-list">
                {backlinks.map((bl, i) => (
                  <div
                    key={i}
                    className="backlinks-item"
                    onClick={() => onSelectFile(bl.filePath)}
                  >
                    <div className="backlinks-filename">{bl.fileName}</div>
                    <div className="backlinks-context">{bl.context}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {outlinks.length > 0 && (
            <div className="backlinks-section">
              <div className="backlinks-section-title">出链 ({outlinks.length})</div>
              <div className="backlinks-list">
                {outlinks.map((target, i) => {
                  const targetPath = LinkIndexService.findFileByNoteName(target);
                  return (
                    <div
                      key={i}
                      className="backlinks-item"
                      onClick={() => targetPath && onSelectFile(targetPath)}
                    >
                      <div className="backlinks-filename">{target}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
