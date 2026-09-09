import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, availableMonitors } from "@tauri-apps/api/window";
import { PhysicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { open } from "@tauri-apps/plugin-dialog";
import { mkdir, exists } from "@tauri-apps/plugin-fs";
import { emit } from "@tauri-apps/api/event";
import { clampWindowToMonitor } from "../services/windowState";
import { track, trackPageview, ANALYTICS_EVENTS } from "../analytics";
import { useLanguage } from "../i18n/LanguageContext";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "../i18n";
import { SettingsSelect } from "../components/SettingsSelect";
import appIcon from "../assets/icon.png";
import "./VaultManager.css";

interface VaultInfo {
  name: string;
  path: string;
}

const VAULTS_KEY = "zmd-vaults";
const ACTIVE_VAULT_KEY = "zmd-active-vault";
const VAULT_MANAGER_WINDOW_STATE_KEY = "zmd-vault-manager-window-state";

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
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
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

  // 统计：仓库管理窗口打开（含启动时无仓库自动打开、侧栏和命令面板入口）
  useEffect(() => {
    track(ANALYTICS_EVENTS.VAULT_MANAGER_OPEN);
    trackPageview("/app/vault-manager");
  }, []);

  // ── 窗口位置/大小记忆 ──
  const saveWindowStateRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const win = getCurrentWindow();

    const saveWindowState = async () => {
      try {
        const maximized = await win.isMaximized();
        const state: Record<string, unknown> = { maximized };
        if (!maximized) {
          const pos = await win.outerPosition();
          const size = await win.outerSize();
          state.x = pos.x;
          state.y = pos.y;
          state.width = size.width;
          state.height = size.height;
        }
        localStorage.setItem(VAULT_MANAGER_WINDOW_STATE_KEY, JSON.stringify(state));
      } catch {}
    };
    saveWindowStateRef.current = saveWindowState;

    (async () => {
      try {
        const monitors = await availableMonitors();
        if (monitors && monitors.length > 0) {
          let saved: { x: number; y: number; width: number; height: number; maximized: boolean } | null = null;
          const savedStr = localStorage.getItem(VAULT_MANAGER_WINDOW_STATE_KEY);
          if (savedStr) {
            try { saved = JSON.parse(savedStr); } catch {}
          }

          if (saved && saved.width && saved.height) {
            const clamped = clampWindowToMonitor(
              { x: saved.x ?? 0, y: saved.y ?? 0, width: saved.width, height: saved.height },
              monitors
            );
            await win.setSize(new PhysicalSize(clamped.width, clamped.height));
            await win.setPosition(new PhysicalPosition(clamped.x, clamped.y));
            if (saved.maximized) {
              await win.maximize();
            }
          } else {
            // 无保存状态：将当前（Rust center 定位）位置钳制到屏幕内
            const pos = await win.outerPosition();
            const size = await win.outerSize();
            if (size.width && size.height) {
              const clamped = clampWindowToMonitor(
                { x: pos.x, y: pos.y, width: size.width, height: size.height },
                monitors
              );
              await win.setPosition(new PhysicalPosition(clamped.x, clamped.y));
            }
          }
        }
      } catch {}
      await win.show();
      await win.setFocus().catch(() => {});
    })();

    let moveTimer: ReturnType<typeof setTimeout>;
    let resizeTimer: ReturnType<typeof setTimeout>;

    const unlistenMove = win.onMoved(() => {
      clearTimeout(moveTimer);
      moveTimer = setTimeout(saveWindowState, 300);
    });

    const unlistenResize = win.onResized(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(saveWindowState, 300);
    });

    return () => {
      clearTimeout(moveTimer);
      clearTimeout(resizeTimer);
      unlistenMove.then((fn) => fn()).catch(() => {});
      unlistenResize.then((fn) => fn()).catch(() => {});
    };
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
        title: t("vaultManager.selectLocation"),
      });
      if (selected) {
        setNewVaultLocation(selected);
      }
    } catch (err) {
      console.error(t("vaultManager.selectLocationFailed"), err);
    }
  }, []);

  const handleCreateVault = useCallback(async () => {
    if (!newVaultName.trim() || !newVaultLocation) return;

    const vaultPath = newVaultLocation.replace(/[/\\]$/, "") + "\\" + newVaultName.trim();

    try {
      // Check if directory already exists
      const dirExists = await exists(vaultPath);
      if (dirExists) {
        alert(t("vaultManager.directoryExists"));
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
      alert(t("vaultManager.createFailed") + err);
    }
  }, [newVaultName, newVaultLocation, vaults, notifyChange]);

  const handleOpenVault = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("vaultManager.openLocal.dialogTitle"),
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
      console.error(t("vaultManager.openFailed"), err);
    }
  }, [vaults, notifyChange]);

  const handleSelectVault = useCallback(async (index: number) => {
    setActiveIndex(index);
    const win = getCurrentWindow();
    const [size, scale] = await Promise.all([win.innerSize(), win.scaleFactor()]);
    await invoke("open_vault_in_new_window", { vaultPath: vaults[index].path, width: size.width / scale, height: size.height / scale });
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
        title: t("vaultManager.moveTargetTitle"),
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
      console.error(t("vaultManager.moveFailed"), err);
      setMovingIndex(-1);
    }
  }, [vaults, activeIndex, notifyChange]);

  const handleShowInExplorer = useCallback(async (path: string) => {
    setMenuOpenIndex(-1);
    try {
      await invoke("open_directory", { dirPath: path });
    } catch (err) {
      console.error(t("vaultManager.openFolderFailed"), err);
    }
  }, []);

  const handleRemove = useCallback(async (index: number) => {
    setMenuOpenIndex(-1);
    const vaultName = vaults[index]?.name || "";
    const confirmed = confirm(t("vaultManager.removeConfirm", { name: vaultName }));
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
            {t("vaultManager.back")}
          </button>

          <div className="vault-manager-form">
            <div className="vault-manager-form-group">
              <label className="vault-manager-form-label">{t("vaultManager.form.nameLabel")}</label>
              <div className="vault-manager-form-row">
                <span className="vault-manager-form-hint">{t("vaultManager.form.nameHint")}</span>
                <input
                  className="vault-manager-form-input"
                  value={newVaultName}
                  onChange={(e) => setNewVaultName(e.target.value)}
                  placeholder={t("vaultManager.form.namePlaceholder")}
                />
              </div>
            </div>

            <div className="vault-manager-form-group">
              <label className="vault-manager-form-label">{t("vaultManager.form.locationLabel")}</label>
              <div className="vault-manager-form-row">
                <span className="vault-manager-form-hint">
                  {newVaultLocation || t("vaultManager.form.locationHint")}
                </span>
                <button className="vault-manager-form-btn" onClick={handleBrowseLocation}>
                  {t("vaultManager.form.browse")}
                </button>
              </div>
            </div>
          </div>

          <button
            className="vault-manager-create-btn"
            onClick={handleCreateVault}
            disabled={!newVaultName.trim() || !newVaultLocation}
          >
            {t("vaultManager.create")}
          </button>
        </div>
      );
    }

    // Home view
    return (
      <div className="vault-manager-content">
        <div className="vault-manager-icon-wrapper">
          <img src={appIcon} alt="Tydora" className="vault-manager-icon" />
        </div>
        <h1 className="vault-manager-title">Tydora</h1>
        <p className="vault-manager-version">{version ? t("vaultManager.version", { version }) : ""}</p>
        <p className="vault-manager-subtitle">
          {t("vaultManager.subtitle").split("\n").map((line, i) => (
            <span key={i}>{i > 0 && <br />}{line}</span>
          ))}
        </p>

        <div className="vault-manager-actions">
          <div className="vault-manager-action">
            <div className="vault-manager-action-info">
              <div className="vault-manager-action-title">{t("vaultManager.createNew.title")}</div>
              <div className="vault-manager-action-desc">{t("vaultManager.createNew.desc")}</div>
            </div>
            <button className="vault-manager-btn vault-manager-btn-primary" onClick={() => setViewMode("create")}>
              {t("vaultManager.create")}
            </button>
          </div>

          <div className="vault-manager-action">
            <div className="vault-manager-action-info">
              <div className="vault-manager-action-title">{t("vaultManager.openLocal.title")}</div>
              <div className="vault-manager-action-desc">{t("vaultManager.openLocal.desc")}</div>
            </div>
            <button className="vault-manager-btn" onClick={handleOpenVault}>
              {t("vaultManager.open")}
            </button>
          </div>

          <div className="vault-manager-action vault-manager-language">
            <div className="vault-manager-action-info">
              <div className="vault-manager-action-title">{t("vaultManager.language")}</div>
              <div className="vault-manager-action-desc">{t("vaultManager.languageDesc")}</div>
            </div>
            <SettingsSelect
              value={language}
              onChange={(v) => setLanguage(v as SupportedLanguage)}
              options={SUPPORTED_LANGUAGES.map((lang) => ({
                value: lang.code,
                label: lang.label,
              }))}
            />
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
                    {movingIndex === i && <span className="vault-manager-moving">{t("vaultManager.moving")}</span>}
                  </div>
                )}
                {renamingIndex !== i && (
                  <div className="vault-manager-item-actions">
                    <button
                      className="vault-manager-more-btn"
                      title={t("vaultManager.moreActions")}
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
                          {t("vaultManager.rename")}
                        </div>
                        <div className="vault-manager-menu-item" onClick={() => handleMove(i)}>
                          {t("vaultManager.move")}
                        </div>
                        <div className="vault-manager-menu-item" onClick={() => handleShowInExplorer(vault.path)}>
                          {t("vaultManager.showInExplorer")}
                        </div>
                        <div className="vault-manager-menu-divider" />
                        <div className="vault-manager-menu-item vault-manager-menu-danger" onClick={() => handleRemove(i)}>
                          {t("vaultManager.remove")}
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
              <button className="vault-manager-window-btn" onClick={handleMinimize} title={t("vaultManager.minimize")}>
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
              <button className="vault-manager-window-btn vault-manager-window-close" onClick={handleClose} title={t("vaultManager.close")}>
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
