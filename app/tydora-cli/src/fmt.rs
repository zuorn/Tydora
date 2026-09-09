//! 终端宽度感知工具（CJK 字符按 2 列计算）。
//!
//! 与 Flowix 的 `fmt.rs` 对齐。当前实现只导出 `display_width`，
//! 复杂的终端能力检测（颜色、链接、hyperlink）刻意留给未来——
//! 现版本严格保持"零 ANSI、零依赖、零意外"的输出。

/// 估算字符串在终端的显示宽度（CJK 字符算 2 列）。
///
/// 启发式：
/// - ASCII 可见字符（除制表符外）算 1
/// - CJK 统一汉字（CJK Unified Ideographs）、CJK 兼容、全角 ASCII、日韩表意算 2
/// - Tab 算 4
/// - 其他取 1
///
/// 不依赖 `unicode-width` crate（保持 CLI 二进制小）。Phase 3 如需更精确，
/// 再引入 `unicode-width` 替换。
pub fn display_width(s: &str) -> usize {
    let mut w = 0usize;
    for ch in s.chars() {
        w += char_width(ch);
    }
    w
}

pub fn char_width(ch: char) -> usize {
    let cp = ch as u32;
    // CJK Unified Ideographs
    if (0x4E00..=0x9FFF).contains(&cp) {
        return 2;
    }
    // CJK Unified Ideographs Extension A
    if (0x3400..=0x4DBF).contains(&cp) {
        return 2;
    }
    // CJK Unified Ideographs Extension B-G
    if (0x20000..=0x2A6DF).contains(&cp)
        || (0x2A700..=0x2B73F).contains(&cp)
        || (0x2B740..=0x2B81F).contains(&cp)
        || (0x2B820..=0x2CEAF).contains(&cp)
    {
        return 2;
    }
    // CJK Compatibility Ideographs
    if (0xF900..=0xFAFF).contains(&cp) {
        return 2;
    }
    // Hiragana / Katakana / Hangul
    if (0x3040..=0x30FF).contains(&cp) || (0xAC00..=0xD7AF).contains(&cp) {
        return 2;
    }
    // Fullwidth ASCII variants
    if (0xFF01..=0xFF5E).contains(&cp) || cp == 0x3000 {
        return 2;
    }
    // 制表符
    if ch == '\t' {
        return 4;
    }
    // 控制字符按 0
    if ch.is_control() {
        return 0;
    }
    1
}
