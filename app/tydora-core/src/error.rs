//! tydora-core 错误类型。
//!
//! 设计原则：
//!
//! 1. **完全不感知退出码**：core 是 binary-agnostic 的纯逻辑层。
//!    退出码语义（2 = Usage, 3 = NotFound, 5 = IO …）由调用方（CLI
//!    的 `CliError` / Tauri 的 `Result<_, String>` IPC）决定。
//! 2. **`thiserror` 派生**：所有 variant 都是 #[error] 注解的，不依赖
//!    anyhow。调用方可以 `From<CoreError> for CliError` 桥接。
//! 3. **`#[from]` 修饰最常用 variant**：`Io(std::io::Error)` 自动从
//!    std::io::Error 转过来，省得到处 `.map_err(...)`。

use std::path::PathBuf;

/// tydora-core 的统一 Result 类型。
pub type CoreResult<T> = std::result::Result<T, CoreError>;

/// tydora-core 的统一错误。所有公开 API 都返回 `CoreResult<T>`。
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    /// 文件系统 IO 错误。  
    /// 用 `#[from]` 让 `?` 自动转换 `std::io::Error`。
    #[error("io: {0}")]
    Io(#[from] std::io::Error),

    /// 资源不存在（vault 目录、note id、notebook 等）。  
    /// 调用方语义上通常映射为 exit code 3 (NotFound)。
    #[error("not found: {0}")]
    NotFound(String),

    /// 用法错误（path traversal、参数非法、id 解析失败）。  
    /// 调用方语义上通常映射为 exit code 2 (Usage)。
    #[error("invalid usage: {0}")]
    Usage(String),

    /// frontmatter / YAML / path 解析错误。  
    /// 与 Usage 区分：这是"内容不符合格式"，不是"参数不符合语义"。
    #[error("parse: {0}")]
    Parse(String),

    /// 兜底。CLI 侧 `CliError::Other` 会接住。
    #[error("{0}")]
    Other(String),
}

impl CoreError {
    /// 便捷构造。
    pub fn usage<S: Into<String>>(s: S) -> Self {
        CoreError::Usage(s.into())
    }
    pub fn not_found<S: Into<String>>(s: S) -> Self {
        CoreError::NotFound(s.into())
    }
    pub fn parse<S: Into<String>>(s: S) -> Self {
        CoreError::Parse(s.into())
    }
    pub fn other<S: Into<String>>(s: S) -> Self {
        CoreError::Other(s.into())
    }

    /// 给调试用——`unwrap` 式的 panic 信息会包含调用路径，方便定位。
    /// 不要让生产路径依赖此方法。
    pub fn dbg_with_path(&self, path: &PathBuf) -> String {
        format!("{self} (path: {})", path.display())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_io_error() {
        let io = std::io::Error::new(std::io::ErrorKind::NotFound, "no such file");
        let err: CoreError = io.into();
        assert!(matches!(err, CoreError::Io(_)));
        assert!(err.to_string().contains("no such file"));
    }

    #[test]
    fn not_found_keeps_message() {
        let err = CoreError::not_found("vault '/tmp/x'");
        assert!(err.to_string().contains("not found"));
        assert!(err.to_string().contains("vault '/tmp/x'"));
    }
}
