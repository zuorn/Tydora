// src/publish/PublishConfigFields.tsx
// 发布配置表单字段（站点信息 + 构建选项），供设置页与发布配置弹窗复用

import { useTranslation } from "react-i18next";
import type { PublishConfig } from "./PublishService";
import { SettingsSelect } from "../components/SettingsSelect";

interface PublishConfigFieldsProps {
  config: PublishConfig;
  onChange: (key: keyof PublishConfig, value: string) => void;
  onBrowseOutput: () => void;
}

export default function PublishConfigFields({ config, onChange, onBrowseOutput }: PublishConfigFieldsProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* 站点信息 */}
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.publish.siteName")}</span>
            <span className="canvas-settings-row-desc">{t("settings.publish.siteNameDesc")}</span>
          </div>
          <input
            className="settings-input"
            type="text"
            value={config.siteName}
            onChange={(e) => onChange("siteName", e.target.value)}
            placeholder={t("settings.publish.siteNamePlaceholder")}
          />
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.publish.siteDescription")}</span>
            <span className="canvas-settings-row-desc">{t("settings.publish.siteDescriptionDesc")}</span>
          </div>
          <input
            className="settings-input"
            type="text"
            value={config.siteDescription || ""}
            onChange={(e) => onChange("siteDescription", e.target.value)}
            placeholder={t("settings.publish.siteDescriptionPlaceholder")}
          />
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.publish.siteLang")}</span>
            <span className="canvas-settings-row-desc">{t("settings.publish.siteLangDesc")}</span>
          </div>
          <SettingsSelect
            value={config.siteLang}
            onChange={(v) => onChange("siteLang", v)}
            options={[
              { value: "zh", label: "中文" },
              { value: "en", label: "English" },
              { value: "ja", label: "日本語" },
              { value: "ko", label: "한국어" },
            ]}
          />
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.publish.siteUrl")}</span>
            <span className="canvas-settings-row-desc">{t("settings.publish.siteUrlDesc")}</span>
          </div>
          <input
            className="settings-input"
            type="url"
            value={config.siteUrl || ""}
            onChange={(e) => onChange("siteUrl", e.target.value)}
            placeholder={t("settings.publish.siteUrlPlaceholder")}
          />
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.publish.siteFooter")}</span>
            <span className="canvas-settings-row-desc">{t("settings.publish.siteFooterDesc")}</span>
          </div>
          <input
            className="settings-input"
            type="text"
            value={config.siteFooter || ""}
            onChange={(e) => onChange("siteFooter", e.target.value)}
            placeholder={t("settings.publish.footerPlaceholder")}
          />
        </div>
      </div>

      {/* 构建选项 */}
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.publish.vaultDir")}</span>
            <span className="canvas-settings-row-desc">{t("settings.publish.vaultDirDesc")}</span>
          </div>
          <input
            className="settings-input"
            type="text"
            value={config.vaultDir}
            onChange={(e) => onChange("vaultDir", e.target.value)}
            placeholder="."
          />
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.publish.buildMode")}</span>
            <span className="canvas-settings-row-desc">
              {config.buildMode === "public"
                ? t("settings.publish.buildModePublicDesc")
                : t("settings.publish.buildModeFullDesc")}
            </span>
          </div>
          <div className="canvas-settings-row-control">
            <label className="settings-radio-card">
              <input
                type="radio"
                name="buildMode"
                value="full"
                checked={config.buildMode === "full"}
                onChange={() => onChange("buildMode", "full")}
              />
              <span>{t("settings.publish.buildModeFull")}</span>
            </label>
            <label className="settings-radio-card">
              <input
                type="radio"
                name="buildMode"
                value="public"
                checked={config.buildMode === "public"}
                onChange={() => onChange("buildMode", "public")}
              />
              <span>{t("settings.publish.buildModePublic")}</span>
            </label>
          </div>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.publish.baseHref")}</span>
            <span className="canvas-settings-row-desc">{t("settings.publish.baseHrefDesc")}</span>
          </div>
          <input
            className="settings-input"
            type="text"
            value={config.baseHref}
            onChange={(e) => onChange("baseHref", e.target.value)}
            placeholder="/"
          />
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.publish.outDir")}</span>
            <span className="canvas-settings-row-desc">{t("settings.publish.outDirDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              className="settings-input"
              type="text"
              value={config.out}
              onChange={(e) => onChange("out", e.target.value)}
              placeholder="dist"
            />
            <button className="settings-button" onClick={onBrowseOutput}>
              {t("settings.publish.browse")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
