//! Frontmatter 解析（**简化 YAML 子集**）。
//!
//! 实现 `src/Editor/frontmatter.ts` 行为子集：
//!
//! - 输入形如 `---\nkey: value\n---\n\nbody...` 的 markdown 字符串
//! - 顶层 `---` 围栏，配 `\n` 或 `\r\n` 行末
//! - 每行识别为 `key: value`（或"键:"空值）
//! - 引号（`"..."` 或 `'...'`）自动剥离
//! - value 一律存为 `serde_json::Value::String`（**这是 by-design**：不引
//!   `serde_yaml` 就不识别列表/数字/嵌套；原始字符串保留可读性）
//!
//! 复杂 YAML（嵌套 map / 多行 scalar / flow style）会**保持原始字符串**而不
//! 是解析为 `Value::Null`——这样 `{ "my list": "[a, b, c]" }` 输出稳定，
//! 未来升级 `serde_yaml` 时只需要替换 `parse_simple_yaml` 一个函数。
//!
//! 路线图：未来升级到 `serde_yaml::Mapping` 时，对外接口不变，只动 internal。

use crate::error::{CoreError, CoreResult};

/// 解析后的 frontmatter 三段。
///
/// - `raw`：原始 `---\n...\n---` 内部 YAML 文本（无 fence）。无 frontmatter 时 `None`。
/// - `data`：解析后的对象。保证为 `Value::Object(...)`，空 frontmatter 返回
///   `Value::Object(空 map)`。
/// - `body`：fence 之后的 markdown body。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Frontmatter {
    pub raw: Option<String>,
    pub data: serde_json::Value,
    pub body: String,
}

impl Frontmatter {
    /// 提取 title：顺序 `frontmatter.title → 首 H1 → None`，与 GUI 端
    /// `LocalGraph.tsx` 行为一致。
    pub fn extract_title(&self) -> Option<String> {
        // 1. frontmatter.title
        if let Some(t) = self.data.get("title").and_then(|v| v.as_str()) {
            let trimmed = t.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
        // 2. body 首 H1（`# ...`）
        for line in self.body.lines() {
            if let Some(rest) = line.strip_prefix("# ") {
                let t = rest.trim();
                if !t.is_empty() {
                    return Some(t.to_string());
                }
            }
        }
        None
    }
}

/// Split markdown into (raw_fm, fm_data, body).
///
/// 接受 `\n` 或 `\r\n` 分隔。fence 内的 `\r` 会被 `lines()` 自然吸收。
pub fn split(md: &str) -> Frontmatter {
    if let Some(rest) = md.strip_prefix("---\n").or_else(|| md.strip_prefix("---\r\n")) {
        if let Some(end) = find_closing_fence(rest) {
            let yaml = &rest[..end];
            let body = &rest[end..];
            let body = body
                .strip_prefix("---")
                .unwrap_or(body)
                .trim_start_matches('\n')
                .trim_start_matches("\r\n");
            return Frontmatter {
                raw: Some(yaml.to_string()),
                data: parse_simple_yaml(yaml),
                body: body.to_string(),
            };
        }
    }
    Frontmatter {
        raw: None,
        data: serde_json::Value::Object(serde_json::Map::new()),
        body: md.to_string(),
    }
}

fn find_closing_fence(s: &str) -> Option<usize> {
    // 寻找下一行起始的 `---` 或 `---<space>...`
    let mut offset = 0;
    for line in s.split_inclusive('\n') {
        let trimmed = line.trim_end_matches(['\n', '\r']);
        if trimmed == "---" || trimmed.starts_with("--- ") {
            return Some(offset);
        }
        offset += line.len();
    }
    None
}

/// 简化版 YAML 解析：仅 `key: value` 标量键值对。  
/// 对齐 `src/Editor/frontmatter.ts::parseFrontmatter` 的子集。
fn parse_simple_yaml(yaml: &str) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    for line in yaml.lines() {
        let (key, raw_value) = match parse_simple_kv(line) {
            Some(kv) => kv,
            None => continue,
        };
        let value = strip_quotes(raw_value.trim());
        map.insert(key.to_string(), serde_json::Value::String(value));
    }
    serde_json::Value::Object(map)
}

/// `^(\w[\w-]*):\s*(.+)$` —— 手写以避免引入 regex 依赖。  
/// 返回 (key, raw_value)。
fn parse_simple_kv(line: &str) -> Option<(&str, &str)> {
    let line = line.trim_end();
    let colon = line.find(':')?;
    let key = &line[..colon];
    if key.is_empty() {
        return None;
    }
    let mut chars = key.chars();
    let first = chars.next()?;
    if !(first.is_ascii_alphanumeric() || first == '_') {
        return None;
    }
    for c in chars {
        if !(c.is_ascii_alphanumeric() || c == '_' || c == '-') {
            return None;
        }
    }
    let rest = line[colon + 1..].trim_start();
    if rest.is_empty() {
        return None;
    }
    Some((key, rest))
}

fn strip_quotes(s: &str) -> String {
    let bytes = s.as_bytes();
    if bytes.len() >= 2 {
        let first = bytes[0];
        let last = bytes[bytes.len() - 1];
        if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
            return s[1..s.len() - 1].to_string();
        }
    }
    s.to_string()
}

/// 从 markdown 文本一次性提取 title（frontmatter.title → 首 H1 → None）。  
/// CLI 常用：避免构造完整 Frontmatter 结构。
pub fn extract_title(md: &str) -> Option<String> {
    split(md).extract_title()
}

/// 便捷包装：返回 `Err(Parse(...))` 当 markdown 不能解析（目前总能解析，
/// 保留接口以与未来的 strict mode 接接——例如 fence 不匹配时报错）。
pub fn split_required(md: &str) -> CoreResult<Frontmatter> {
    let fm = split(md);
    // 当前实现宽松：任何 markdown 都能解析。即使 fence 不闭合，body 退回
    // 完整 md。未来升级到完整 YAML 时此函数用于明示"应当有 frontmatter
    // 但解析失败"的语义。
    if fm.data.is_object() {
        Ok(fm)
    } else {
        Err(CoreError::parse(format!(
            "frontmatter is not an object: {:?}",
            fm.data
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_handles_no_frontmatter() {
        let fm = split("# Heading\n\nbody");
        assert_eq!(fm.raw, None);
        assert_eq!(fm.body, "# Heading\n\nbody");
        assert_eq!(fm.data, serde_json::json!({}));
    }

    #[test]
    fn split_handles_basic_frontmatter() {
        let md = "---\ntitle: Hello\n---\n\nbody here\n";
        let fm = split(md);
        assert_eq!(fm.raw.as_deref(), Some("title: Hello\n"));
        assert_eq!(
            fm.data,
            serde_json::json!({"title": "Hello"})
        );
        assert_eq!(fm.body, "body here\n");
    }

    #[test]
    fn split_handles_crlf() {
        let md = "---\r\ntitle: X\r\n---\r\n\r\nbody\r\n";
        let fm = split(md);
        assert_eq!(fm.data, serde_json::json!({"title": "X"}));
        assert!(fm.body.starts_with("body"));
    }

    #[test]
    fn split_handles_unclosed_fence_as_no_fm() {
        // 没找到结束 fence 时，split 应 fall back 到 "无 frontmatter"。
        let md = "---\ntitle: X\nbody without close";
        let fm = split(md);
        assert_eq!(fm.raw, None);
        assert!(fm.body.contains("title: X"));
    }

    #[test]
    fn split_strips_double_and_single_quotes() {
        let md = "---\ntitle: \"Quoted\"\nsubtitle: 'Single'\n---\n\nbody";
        let fm = split(md);
        assert_eq!(fm.data["title"], serde_json::json!("Quoted"));
        assert_eq!(fm.data["subtitle"], serde_json::json!("Single"));
    }

    #[test]
    fn keys_must_be_word_then_dash_or_word() {
        // 对齐 TS regex `^(\w[\w-]*):\s*(.+)$`：`\w` 含数字，所以 `9foo` 合法
        assert!(parse_simple_kv("9foo: bar").is_some());
        assert!(parse_simple_kv("foo bar: baz").is_none()); // 含空格
        assert!(parse_simple_kv("good-key: value").is_some());
        assert!(parse_simple_kv("under_score: value").is_some());
        assert!(parse_simple_kv("no_value").is_none()); // 无冒号
    }

    #[test]
    fn extract_title_falls_back_to_h1() {
        let fm = split("---\n---\n\n# My Heading\n\nbody");
        assert_eq!(fm.extract_title(), Some("My Heading".into()));
    }

    #[test]
    fn extract_title_prefers_frontmatter_over_h1() {
        let md = "---\ntitle: From FM\n---\n\n# Heading Text\n";
        assert_eq!(extract_title(md), Some("From FM".into()));
    }

    #[test]
    fn extract_title_none_when_neither() {
        let md = "---\ntitle: \n---\n\nplain body without h1";
        // 空 title 走 H1 fallback，body 又无 H1 → None
        assert_eq!(extract_title(md), None);
    }

    #[test]
    fn chinese_keys_and_values() {
        let md = "---\n标题: 中文标题\n日期: 2024-01-01\n---\n\nbody";
        let fm = split(md);
        // 中文 key 在 parse_simple_kv 里因为 `is_ascii_alphanumeric` 会失败
        // → 这是简化 YAML 子集的 by-design 边界。
        assert_eq!(
            fm.data,
            serde_json::json!({})
        );
    }
}
