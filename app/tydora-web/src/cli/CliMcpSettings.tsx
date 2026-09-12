// src/cli/CliMcpSettings.tsx
//
// 「设置 → CLI 与 MCP」页。
//
// 两张卡，让用户清楚两件事：
// 1. CLI 有哪些命令（命令 + 说明的清单）
// 2. MCP 怎么接入（生成客户端配置 + 一键复制，可选只读模式）
//
// CLI 探测走 Rust 命令 `cli_sidecar_info`，仅用于：未安装时显示警告、
// 探测失败时禁用 MCP 配置生成。不向用户展示版本号 / 路径等技术细节。

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import hljs from "highlight.js/lib/core";
import jsonLang from "highlight.js/lib/languages/json";
import iniLang from "highlight.js/lib/languages/ini";
import bashLang from "highlight.js/lib/languages/bash";
import "../Settings.css";

hljs.registerLanguage("json", jsonLang);
// 本版 highlight.js 无 toml 模块，ini 语法同构（[section] + key = "value"），效果一致
hljs.registerLanguage("ini", iniLang);
hljs.registerLanguage("bash", bashLang);

interface CliSidecarInfo {
  available: boolean;
  path: string | null;
  version: string | null;
}

interface VaultInfo {
  name: string;
  path: string;
}

function getActiveVaultPath(): string | null {
  try {
    const vaultsRaw = localStorage.getItem("zmd-vaults");
    const activeIndexRaw = localStorage.getItem("zmd-active-vault");
    if (!vaultsRaw || activeIndexRaw === null) return null;
    const vaults: VaultInfo[] = JSON.parse(vaultsRaw);
    const idx = parseInt(activeIndexRaw, 10);
    if (isNaN(idx) || idx < 0 || idx >= vaults.length) return null;
    return vaults[idx].path;
  } catch {
    return null;
  }
}

type ConfigFormat = "json" | "toml" | "cmd";

/** Windows 路径在 JSON/TOML 字符串里要双反斜杠转义 */
function escapeForDoubleQuoted(p: string): string {
  return p.replace(/\\/g, "\\\\");
}

function buildConfig(
  format: ConfigFormat,
  cliPath: string,
  vaultPath: string,
  readOnly: boolean
): string {
  const args = readOnly ? ["mcp", "--read-only"] : ["mcp"];
  if (format === "json") {
    return JSON.stringify(
      {
        mcpServers: {
          tydora: {
            command: cliPath,
            args,
            env: { TYDORA_VAULT: vaultPath },
          },
        },
      },
      null,
      2
    );
  }
  if (format === "toml") {
    return [
      "[mcp_servers.tydora]",
      `command = "${escapeForDoubleQuoted(cliPath)}"`,
      `args = [${args.map((a) => `"${a}"`).join(", ")}]`,
      "",
      "[mcp_servers.tydora.env]",
      `TYDORA_VAULT = "${escapeForDoubleQuoted(vaultPath)}"`,
      "",
    ].join("\n");
  }
  // Claude Code 命令行
  return [
    `claude mcp add tydora \\`,
    `  -e TYDORA_VAULT="${vaultPath}" \\`,
    `  -- "${cliPath}" ${args.join(" ")}`,
  ].join("\n");
}

export default function CliMcpSettings() {
  const { t } = useTranslation();
  const [cliAvailable, setCliAvailable] = useState<boolean | null>(null);
  const [cliPath, setCliPath] = useState<string | null>(null);
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [format, setFormat] = useState<ConfigFormat>("json");
  const [readOnly, setReadOnly] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setVaultPath(getActiveVaultPath());
    invoke<CliSidecarInfo>("cli_sidecar_info")
      .then((info) => {
        setCliAvailable(info.available);
        setCliPath(info.path);
      })
      .catch(() => setCliAvailable(false));
  }, []);

  const configText = useMemo(() => {
    // CLI 路径未知（未探测到）时用占位符生成，保证用户拿到的配置结构完整
    if (!vaultPath) return null;
    const path = cliPath ?? "<tydora-cli 可执行文件路径>";
    return buildConfig(format, path, vaultPath, readOnly);
  }, [cliPath, vaultPath, format, readOnly]);

  /** 按格式选高亮语言：json→json、toml→ini（语法同构）、cmd→bash */
  const highlightedHtml = useMemo(() => {
    if (!configText) return "";
    const language = format === "json" ? "json" : format === "toml" ? "ini" : "bash";
    try {
      return hljs.highlight(configText, { language }).value;
    } catch {
      return "";
    }
  }, [configText, format]);

  const handleCopy = useCallback(async () => {
    if (!configText) return;
    try {
      await navigator.clipboard.writeText(configText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板不可用时静默（用户可手动选中文本复制）
    }
  }, [configText]);

  const commands: [string, string][] = [
    ["notebooks", t("settings.cli.cmdNotebooks")],
    ["list <notebook>", t("settings.cli.cmdList")],
    ["show <id>", t("settings.cli.cmdShow")],
    ["search <关键词>", t("settings.cli.cmdSearch")],
    ["create <notebook>", t("settings.cli.cmdCreate")],
    ["edit <id>", t("settings.cli.cmdEdit")],
    ["write <id>", t("settings.cli.cmdWrite")],
    ["delete <id>", t("settings.cli.cmdDelete")],
  ];

  return (
    <div className="canvas-settings-page">
      {/* ── CLI 命令 ───────────────────────────────── */}
      <h3 className="settings-section-title">{t("settings.cli.cliTitle")}</h3>
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-desc">{t("settings.cli.cliDesc")}</span>
          </div>
        </div>
        {cliAvailable === false && (
          <div className="canvas-settings-row">
            <div className="canvas-settings-row-label">
              <span className="canvas-settings-row-desc cli-settings-warn">
                {t("settings.cli.notInstalled")}
              </span>
            </div>
          </div>
        )}
        <div className="cli-settings-cmdlist">
          {commands.map(([cmd, desc]) => (
            <div key={cmd} className="cli-settings-cmd-row">
              <code className="cli-settings-cmd">tydora {cmd}</code>
              <span className="cli-settings-cmd-desc">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── MCP 接入 ───────────────────────────────── */}
      <h3 className="settings-section-title">{t("settings.cli.mcpTitle")}</h3>
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-desc">{t("settings.cli.mcpDesc")}</span>
          </div>
        </div>

        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.cli.readOnly")}</span>
            <span className="canvas-settings-row-desc">{t("settings.cli.readOnlyDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={readOnly}
                onChange={(e) => setReadOnly(e.target.checked)}
              />
              <span className="settings-toggle-slider" />
            </label>
          </div>
        </div>

        {vaultPath ? (
          <>
            <div className="canvas-settings-row">
              <div className="canvas-settings-row-label">
                <span className="canvas-settings-row-title">{t("settings.cli.format")}</span>
              </div>
              <div className="canvas-settings-row-control cli-settings-format-group">
                {(
                  [
                    ["json", t("settings.cli.formatJson")],
                    ["toml", t("settings.cli.formatToml")],
                    ["cmd", t("settings.cli.formatCmd")],
                  ] as [ConfigFormat, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    className={`settings-button${format === id ? " primary" : ""}`}
                    onClick={() => setFormat(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="cli-settings-codeblock">
              <button
                className="cli-settings-copy-btn"
                onClick={handleCopy}
                title={copied ? t("settings.cli.copied") : t("settings.cli.copy")}
              >
                {copied ? t("settings.cli.copied") : t("settings.cli.copy")}
              </button>
              <pre className="cli-settings-code">
                {highlightedHtml ? (
                  <code dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
                ) : (
                  configText
                )}
              </pre>
            </div>
          </>
        ) : (
          <div className="canvas-settings-row">
            <div className="canvas-settings-row-label">
              <span className="canvas-settings-row-desc">{t("settings.cli.noVault")}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
