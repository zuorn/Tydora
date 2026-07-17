import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { mkdir, exists } from "@tauri-apps/plugin-fs";
import { emit } from "@tauri-apps/api/event";
import "./VaultManager.css";

interface VaultInfo {
  name: string;
  path: string;
}

const VAULTS_KEY = "zmd-vaults";
const ACTIVE_VAULT_KEY = "zmd-active-vault";

function loadVaults(): VaultInfo[] {
  try {
    const saved = localStorage.getItem(VAULTS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function loadActiveIndex(): number {
  try {
    const saved = localStorage.getItem(ACTIVE_VAULT_KEY);
    return saved ? parseInt(saved) : -1;
  } catch {
    return -1;
  }
}

function saveVaults(vaults: VaultInfo[], activeIndex: number) {
  localStorage.setItem(VAULTS_KEY, JSON.stringify(vaults));
  localStorage.setItem(ACTIVE_VAULT_KEY, String(activeIndex));
}

type ViewMode = "home" | "create";

export default function VaultManagerWindow() {
  const [vaults, setVaults] = useState<VaultInfo[]>(loadVaults);
  const [activeIndex, setActiveIndex] = useState<number>(loadActiveIndex);
  const [version, setVersion] = useState("");
  const [menuOpenIndex, setMenuOpenIndex] = useState<number>(-1);
  const [renamingIndex, setRenamingIndex] = useState<number>(-1);
  const [renameValue, setRenameValue] = useState("");
  const [movingIndex, setMovingIndex] = useState<number>(-1);

  // Create vault form state
  const [viewMode, setViewMode] = useState<ViewMode>("home");
  const [newVaultName, setNewVaultName] = useState("");
  const [newVaultLocation, setNewVaultLocation] = useState("");

  useEffect(() => {
    invoke<string>("get_app_version").then(setVersion).catch(() => {});
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (menuOpenIndex < 0) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".vault-manager-more-btn") && !target.closest(".vault-manager-menu")) {
        setMenuOpenIndex(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpenIndex]);

  const notifyChange = useCallback(async (newVaults: VaultInfo[], newIndex: number) => {
    saveVaults(newVaults, newIndex);
    await emit("vaults-changed", { vaults: newVaults, activeIndex: newIndex });
  }, []);

  // Create vault handlers
  const handleBrowseLocation = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择仓库存放位置",
      });
      if (selected) {
        setNewVaultLocation(selected);
      }
    } catch (err) {
      console.error("选择位置失败:", err);
    }
  }, []);

  const handleCreateVault = useCallback(async () => {
    if (!newVaultName.trim() || !newVaultLocation) return;

    const vaultPath = newVaultLocation.replace(/[/\\]$/, "") + "\\" + newVaultName.trim();

    try {
      // Check if directory already exists
      const dirExists = await exists(vaultPath);
      if (dirExists) {
        alert("该位置已存在同名文件夹");
        return;
      }

      // Create the directory
      await mkdir(vaultPath, { recursive: true });

      // Add to vaults
      const newVaults = [...vaults, { name: newVaultName.trim(), path: vaultPath }];
      const newIndex = newVaults.length - 1;
      setVaults(newVaults);
      setActiveIndex(newIndex);
      await notifyChange(newVaults, newIndex);

      // Reset form and go back to home
      setNewVaultName("");
      setNewVaultLocation("");
      setViewMode("home");
    } catch (err) {
      console.error("创建仓库失败:", err);
      alert("创建仓库失败: " + err);
    }
  }, [newVaultName, newVaultLocation, vaults, notifyChange]);

  const handleOpenVault = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择本地文件夹作为仓库",
      });
      if (selected) {
        const name = selected.split(/[/\\]/).pop() || selected;
        const exists_vault = vaults.some(v => v.path === selected);
        if (exists_vault) return;
        const newVaults = [...vaults, { name, path: selected }];
        const newIndex = newVaults.length - 1;
        setVaults(newVaults);
        setActiveIndex(newIndex);
        await notifyChange(newVaults, newIndex);
      }
    } catch (err) {
      console.error("打开仓库失败:", err);
    }
  }, [vaults, notifyChange]);

  const handleSelectVault = useCallback(async (index: number) => {
    setActiveIndex(index);
    await invoke("open_vault_in_new_window", { vaultPath: vaults[index].path });
  }, [vaults]);

  const handleRename = useCallback((index: number) => {
    setRenamingIndex(index);
    setRenameValue(vaults[index].name);
    setMenuOpenIndex(-1);
  }, [vaults]);

  const handleRenameConfirm = useCallback(async () => {
    if (renamingIndex < 0 || !renameValue.trim()) return;
    const newVaults = [...vaults];
    newVaults[renamingIndex] = { ...newVaults[renamingIndex], name: renameValue.trim() };
    setVaults(newVaults);
    setRenamingIndex(-1);
    await notifyChange(newVaults, activeIndex);
  }, [vaults, renamingIndex, renameValue, activeIndex, notifyChange]);

  const handleMove = useCallback(async (index: number) => {
    setMovingIndex(index);
    setMenuOpenIndex(-1);
    try {
      const dest = await open({
        directory: true,
        multiple: false,
        title: "选择目标文件夹（将创建新文件夹）",
      });
      if (!dest) {
        setMovingIndex(-1);
        return;
      }

      const source = vaults[index].path;
      const sourceName = source.split(/[/\\]/).pop() || "vault";
      const destination = dest.replace(/[/\\]$/, "") + "\\" + sourceName;

      await invoke("move_vault", { source, destination });

      const newVaults = [...vaults];
      newVaults[index] = { name: newVaults[index].name, path: destination };
      setVaults(newVaults);
      setMovingIndex(-1);
      await notifyChange(newVaults, activeIndex);
    } catch (err) {
      console.error("移动仓库失败:", err);
      setMovingIndex(-1);
    }
  }, [vaults, activeIndex, notifyChange]);

  const handleShowInExplorer = useCallback(async (path: string) => {
    setMenuOpenIndex(-1);
    try {
      await invoke("open_directory", { dirPath: path });
    } catch (err) {
      console.error("打开文件夹失败:", err);
    }
  }, []);

  const handleRemove = useCallback(async (index: number) => {
    setMenuOpenIndex(-1);
    const vaultName = vaults[index]?.name || "";
    const confirmed = confirm(`确定要从列表中移除仓库 "${vaultName}" 吗？\n此操作不会删除本地文件。`);
    if (!confirmed) return;

    const newVaults = vaults.filter((_, i) => i !== index);
    let newIndex = activeIndex;
    if (activeIndex === index) {
      newIndex = -1;
    } else if (activeIndex > index) {
      newIndex = activeIndex - 1;
    }
    setVaults(newVaults);
    setActiveIndex(newIndex);
    await notifyChange(newVaults, newIndex);
  }, [vaults, activeIndex, notifyChange]);

  // Window controls
  const handleMinimize = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().minimize();
    } catch {}
  }, []);

  const handleClose = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch {}
  }, []);

  // Render right content based on view mode
  const renderContent = () => {
    if (viewMode === "create") {
      return (
        <div className="vault-manager-create">
          <button className="vault-manager-back-btn" onClick={() => setViewMode("home")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            返回
          </button>

          <div className="vault-manager-form">
            <div className="vault-manager-form-group">
              <label className="vault-manager-form-label">仓库名称</label>
              <div className="vault-manager-form-row">
                <span className="vault-manager-form-hint">给新仓库起一个名字</span>
                <input
                  className="vault-manager-form-input"
                  value={newVaultName}
                  onChange={(e) => setNewVaultName(e.target.value)}
                  placeholder="仓库名称"
                />
              </div>
            </div>

            <div className="vault-manager-form-group">
              <label className="vault-manager-form-label">仓库位置</label>
              <div className="vault-manager-form-row">
                <span className="vault-manager-form-hint">
                  {newVaultLocation || "指定新仓库的存放位置。"}
                </span>
                <button className="vault-manager-form-btn" onClick={handleBrowseLocation}>
                  浏览
                </button>
              </div>
            </div>
          </div>

          <button
            className="vault-manager-create-btn"
            onClick={handleCreateVault}
            disabled={!newVaultName.trim() || !newVaultLocation}
          >
            创建
          </button>
        </div>
      );
    }

    // Home view
    return (
      <div className="vault-manager-content">
        <img src="/icon.png" alt="Tydora" className="vault-manager-icon" />
        <h1 className="vault-manager-title">Tydora</h1>
        <p className="vault-manager-version">{version ? `版本 ${version}` : ""}</p>

        <div className="vault-manager-actions">
          <div className="vault-manager-action">
            <div className="vault-manager-action-info">
              <div className="vault-manager-action-title">新建仓库</div>
              <div className="vault-manager-action-desc">在指定位置创建一个新的仓库。</div>
            </div>
            <button className="vault-manager-btn vault-manager-btn-primary" onClick={() => setViewMode("create")}>
              创建
            </button>
          </div>

          <div className="vault-manager-action">
            <div className="vault-manager-action-info">
              <div className="vault-manager-action-title">打开本地仓库</div>
              <div className="vault-manager-action-desc">将一个本地文件夹作为仓库打开。</div>
            </div>
            <button className="vault-manager-btn" onClick={handleOpenVault}>
              打开
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="vault-manager">
      <div className="vault-manager-layout">
        {/* Left sidebar with its own titlebar */}
        <div className="vault-manager-sidebar">
          <div data-tauri-drag-region className="vault-manager-titlebar vault-manager-titlebar-sidebar">
            <div className="vault-manager-titlebar-drag" data-tauri-drag-region />
          </div>
          <div className="vault-manager-list">
            {vaults.map((vault, i) => (
              <div
                key={vault.path}
                className={`vault-manager-item${i === activeIndex ? " active" : ""}`}
              >
                {renamingIndex === i ? (
                  <div className="vault-manager-rename">
                    <input
                      className="vault-manager-rename-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameConfirm();
                        if (e.key === "Escape") setRenamingIndex(-1);
                      }}
                      onBlur={handleRenameConfirm}
                      autoFocus
                    />
                  </div>
                ) : (
                  <div
                    className="vault-manager-item-content"
                    onClick={() => handleSelectVault(i)}
                  >
                    <div className="vault-manager-item-info">
                      <div className="vault-manager-item-name">{vault.name}</div>
                      <div className="vault-manager-item-path">{vault.path}</div>
                    </div>
                    {movingIndex === i && <span className="vault-manager-moving">移动中...</span>}
                  </div>
                )}
                {renamingIndex !== i && (
                  <div className="vault-manager-item-actions">
                    <button
                      className="vault-manager-more-btn"
                      title="更多操作"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenIndex(menuOpenIndex === i ? -1 : i);
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>
                    {menuOpenIndex === i && (
                      <div className="vault-manager-menu">
                        <div className="vault-manager-menu-item" onClick={() => handleRename(i)}>
                          重命名
                        </div>
                        <div className="vault-manager-menu-item" onClick={() => handleMove(i)}>
                          移动
                        </div>
                        <div className="vault-manager-menu-item" onClick={() => handleShowInExplorer(vault.path)}>
                          在资源管理器中显示
                        </div>
                        <div className="vault-manager-menu-divider" />
                        <div className="vault-manager-menu-item vault-manager-menu-danger" onClick={() => handleRemove(i)}>
                          移除
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right content area with its own titlebar */}
        <div className="vault-manager-main">
          <div data-tauri-drag-region className="vault-manager-titlebar vault-manager-titlebar-main">
            <div className="vault-manager-titlebar-drag" data-tauri-drag-region />
            <div className="vault-manager-window-controls">
              <button className="vault-manager-window-btn" onClick={handleMinimize} title="最小化">
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
              <button className="vault-manager-window-btn vault-manager-window-close" onClick={handleClose} title="关闭">
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
            </div>
          </div>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
