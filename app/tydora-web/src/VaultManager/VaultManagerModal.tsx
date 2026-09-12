import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { mkdir, exists } from "@tauri-apps/plugin-fs";
import { emit } from "@tauri-apps/api/event";
import AppModal from "../components/AppModal";
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

interface VaultManagerModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 管理仓库 —— 模态弹框版。
 * 数据交互与原独立窗口完全一致：localStorage 持久化 + `vaults-changed` 事件广播，
 * 主窗口（App）监听该事件实时同步仓库列表与激活仓库。
 */
export default function VaultManagerModal({ open: isOpen, onClose }: VaultManagerModalProps) {
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

  // 打开时拉取版本号 + 埋点（替代原窗口的挂载埋点）
  useEffect(() => {
    if (!isOpen) return;
    invoke<string>("get_app_version").then(setVersion).catch(() => {});
    track(ANALYTICS_EVENTS.VAULT_MANAGER_OPEN);
    trackPageview("/app/vault-manager");
    // 每次打开重置临时视图状态（避免上次遗留的菜单/重命名/表单）
    setMenuOpenIndex(-1);
    setRenamingIndex(-1);
    setMovingIndex(-1);
    setViewMode("home");
  }, [isOpen]);

  // 关闭菜单：点击弹框外部区域
  useEffect(() => {
    if (!isOpen || menuOpenIndex < 0) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".vault-manager-more-btn") && !target.closest(".vault-manager-menu")) {
        setMenuOpenIndex(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, menuOpenIndex]);

  // 关闭守卫：重命名/菜单打开时先取消它们，本次不关闭弹框
  const guardClose = useCallback(() => {
    if (renamingIndex >= 0) {
      setRenamingIndex(-1);
      return false;
    }
    if (menuOpenIndex >= 0) {
      setMenuOpenIndex(-1);
      return false;
    }
    return true;
  }, []);

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

  // 选中仓库：持久化 + 广播事件（主窗口实时切换），随后关闭弹框
  const handleSelectVault = useCallback(async (index: number) => {
    setActiveIndex(index);
    await notifyChange(vaults, index);
    onClose();
  }, [vaults, notifyChange, onClose]);

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

  if (!isOpen) return null;

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
    <AppModal
      open={isOpen}
      onClose={onClose}
      shouldClose={guardClose}
      ariaLabel={t("sidebar.vault.manage")}
      closeTitle={t("vaultManager.close")}
      height="780px"
    >
      <div className="vault-manager">
          <div className="vault-manager-layout">
            {/* Left sidebar */}
            <div className="vault-manager-sidebar">
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

            {/* Right content area */}
            <div className="vault-manager-main">
              {renderContent()}
            </div>
          </div>
        </div>
      </AppModal>
  );
}
