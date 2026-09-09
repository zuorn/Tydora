import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";

/**
 * 解析 i18n 文案中的 [文本](url) 标记，渲染为可点击链接。
 * 点击链接通过系统默认方式打开（mailto: 唤起邮件客户端，https: 打开浏览器）。
 */
function renderWithLinks(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const label = match[1];
    const url = match[2];
    nodes.push(
      <a
        key={`${keyPrefix}-${key++}`}
        href={url}
        className="consent-dialog-inline-link"
        onClick={(e) => {
          e.preventDefault();
          invoke("open_url", { url });
        }}
      >
        {label}
      </a>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

/**
 * 首次启动的匿名统计同意弹窗。
 * 用户未做出选择前不显示，拒绝后完全不发送任何数据。
 * 点击「查看隐私策略」在应用内查看完整策略，无需跳转外部链接。
 */
export function ConsentDialog({ onDecide }: { onDecide: (granted: boolean) => void }) {
  const { t } = useTranslation();
  const [showPrivacy, setShowPrivacy] = useState(false);

  // 隐私策略全文（在应用内展示）
  if (showPrivacy) {
    const sections = [
      { title: t("settings.consent.privacyPolicy.collectTitle"), body: t("settings.consent.privacyPolicy.collectBody") },
      { title: t("settings.consent.privacyPolicy.notCollectTitle"), body: t("settings.consent.privacyPolicy.notCollectBody") },
      { title: t("settings.consent.privacyPolicy.whyTitle"), body: t("settings.consent.privacyPolicy.whyBody") },
      { title: t("settings.consent.privacyPolicy.storageTitle"), body: t("settings.consent.privacyPolicy.storageBody") },
      { title: t("settings.consent.privacyPolicy.controlTitle"), body: t("settings.consent.privacyPolicy.controlBody") },
      { title: t("settings.consent.privacyPolicy.contactTitle"), body: t("settings.consent.privacyPolicy.contactBody") },
    ];

    return (
      <div className="consent-dialog-overlay">
        <div className="consent-dialog consent-dialog--privacy">
          <h2 className="consent-dialog-title">{t("settings.consent.privacyPolicy.title")}</h2>
          <p className="consent-dialog-meta">{t("settings.consent.privacyPolicy.updated")}</p>
          <div className="privacy-policy-body">
            {t("settings.consent.privacyPolicy.intro")
              .split("\n")
              .map((para, i) => (
                <p key={`intro-${i}`}>{renderWithLinks(para, `intro-${i}`)}</p>
              ))}
            {sections.map((section, i) => (
              <div key={i}>
                <h3>{section.title}</h3>
                {section.body
                  .split("\n")
                  .filter((line) => line.trim().length > 0)
                  .map((para, j) => (
                    <p key={j}>{renderWithLinks(para, `sec-${i}-${j}`)}</p>
                  ))}
              </div>
            ))}
          </div>
          <div className="consent-dialog-actions">
            <button className="consent-dialog-btn consent-dialog-btn--secondary" onClick={() => setShowPrivacy(false)}>
              {t("settings.consent.privacyBack")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="consent-dialog-overlay">
      <div className="consent-dialog">
        <h2 className="consent-dialog-title">{t("settings.consent.title")}</h2>
        {t("settings.consent.description")
          .split("\n")
          .filter((line) => line.trim().length > 0)
          .map((para, i) => (
            <p key={`desc-${i}`} className="consent-dialog-desc">
              {renderWithLinks(para, `desc-${i}`)}
            </p>
          ))}
        <button className="consent-dialog-link" onClick={() => setShowPrivacy(true)}>
          {t("settings.consent.privacy")}
        </button>
        <div className="consent-dialog-actions">
          <button className="consent-dialog-btn consent-dialog-btn--secondary" onClick={() => onDecide(false)}>
            {t("settings.consent.decline")}
          </button>
          <button className="consent-dialog-btn consent-dialog-btn--primary" onClick={() => onDecide(true)}>
            {t("settings.consent.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
