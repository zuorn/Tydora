import { useCallback } from "react";
import { useTranslation } from "react-i18next";

interface OpenFilesPanelProps {
  openFiles: string[];
  activeFilePath: string | null;
  modifiedPaths: Set<string>;
  onSelectFile: (path: string) => void;
  onCloseFile: (path: string) => void;
}

function fileBaseName(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

export function OpenFilesPanel({
  openFiles,
  activeFilePath,
  modifiedPaths,
  onSelectFile,
  onCloseFile,
}: OpenFilesPanelProps) {
  const { t } = useTranslation();

  const handleClose = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      onCloseFile(path);
    },
    [onCloseFile],
  );

  if (openFiles.length === 0) {
    return (
      <div className="sidebar-tree">
        <div className="tree-empty">{t("openFiles.empty")}</div>
        <div className="tree-empty-hint">{t("openFiles.emptyHint")}</div>
      </div>
    );
  }

  return (
    <div className="sidebar-tree open-files-panel">
      {openFiles.map((path) => {
        const name = fileBaseName(path);
        const isActive = path === activeFilePath;
        const isModified = modifiedPaths.has(path);
        return (
          <div key={path} className="tree-branch">
            <div
              className={`tree-node${isActive ? " active" : ""}`}
              title={path}
              onClick={() => onSelectFile(path)}
            >
              <span className="tree-icon-spacer" />
              {isModified && <span className="open-file-modified-dot" aria-hidden="true" />}
              <span className="tree-name">{name}</span>
              <button
                type="button"
                className="open-file-close-btn"
                title={t("openFiles.close")}
                aria-label={t("openFiles.close")}
                onClick={(e) => handleClose(e, path)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
