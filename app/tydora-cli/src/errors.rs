//! CLI 错误类型与退出码映射。
//!
//! 设计参考：见 docs/cli-implementation-plan.md
//!
//! ## 4 档退出码（严格 Unix 惯例）
//!
//! | 退出码 | 含义 | 触发场景 |
//! |---|---|---|
//! | 0 | 成功 | 命令完成 |
//! | 1 | 未分类错误（Other） | 内部错误、未覆盖的失败 |
//! | 2 | 用法错误（Usage） | 缺参、参数值非法、--help / --version 已无参数意味 |
//! | 3 | 资源未找到（NotFound）| vault 不存在、笔记 id 未命中 |
//! | 5 | IO 错误（Io） | 读/写文件失败、磁盘错误 |
//!
//! > 暂不占用 4 与 6+：4 是 shell 内部错误；6+ 留作未来扩展
//! > （如 PermissionDenied=6 / CorruptData=7 等，可视需求拆细）。

use std::process::ExitCode;

#[derive(Debug, thiserror::Error)]
pub enum CliError {
    /// 用法错误：参数缺失、非法、未识别。
    /// 退出码 2。
    #[error("usage: {0}")]
    Usage(String),

    /// 资源未找到：vault 或笔记 id 在指定位置不存在。
    /// 退出码 3。
    #[error("not found: {0}")]
    NotFound(String),

    /// IO 错误：文件系统读写失败。
    /// 退出码 5。
    #[error("io: {0}")]
    Io(#[from] std::io::Error),

    /// 未分类错误。
    /// 退出码 1。
    #[error("{0}")]
    Other(String),
}

impl CliError {
    pub fn exit_code(&self) -> u8 {
        match self {
            Self::Usage(_) => 2,
            Self::NotFound(_) => 3,
            Self::Io(_) => 5,
            Self::Other(_) => 1,
        }
    }
}

impl From<ExitCode> for CliError {
    /// `ExitCode -> CliError` 反向桥接，方便 `main()` 调用方对错误做处理
    fn from(_: ExitCode) -> Self {
        Self::Other("exit code converted back to error".into())
    }
}

/// `tydora_core::CoreError -> CliError` 的桥接。
///
/// 把 core 的 5 档错误归并到 CLI 的 4 档退出码：
/// - CoreError::Usage → CliError::Usage（exit 2）
/// - CoreError::NotFound → CliError::NotFound（exit 3）
/// - CoreError::Io → CliError::Io（exit 5，自动 #[from]）
/// - CoreError::Parse → CliError::Usage（exit 2；用户面对"解析失败"应先检查输入）
/// - CoreError::Other → CliError::Other（exit 1）
impl From<tydora_core::CoreError> for CliError {
    fn from(e: tydora_core::CoreError) -> Self {
        use tydora_core::CoreError as CE;
        match e {
            CE::Usage(s) => Self::Usage(s),
            CE::NotFound(s) => Self::NotFound(s),
            CE::Parse(s) => Self::Usage(s),
            CE::Other(s) => Self::Other(s),
            CE::Io(io) => Self::Io(io),
        }
    }
}

pub type CliResult<T> = Result<T, CliError>;
