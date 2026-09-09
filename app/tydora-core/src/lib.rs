//! tydora-core — pure-logic crate for Tydora.
//!
//! Modules:
//!   - [`error`]: [`CoreError`] — typed errors, no exit-code semantics.
//!   - [`frontmatter`]: parse YAML frontmatter (`---\n...\n---\n`) into a
//!     JSON-like `serde_json::Value`. **Sub‑set of YAML only**, by design
//!     (see crate‑level docs).
//!   - [`note`]: note id / title / slug helpers. Pure, no IO besides reading
//!     a single path.
//!   - [`vault`]: vault scanner — aligns with `src/services/vault-file-scanner.ts`
//!     semantics (skipping `.`-prefixed entries, swallowing per‑dir IO errors).
//!
//! Future modules (deferred):
//!   - `fs::list_dir_with_meta` (cargo‑cultured from `src/commands/file_commands.rs`
//!     when we actually consume it from tydora‑cli).
//!   - `path::find_on_path` (CLI only needs it after `mcp` lands).
//!   - `version::parse_version` / `compare_versions` (CLI n/a, GUI only).

#![forbid(unsafe_code)]
#![warn(rust_2018_idioms)]
#![warn(missing_debug_implementations)]

pub mod error;
pub mod frontmatter;
pub mod note;
pub mod vault;

// 重新导出顶级错误，避免消费方写 `tydora_core::error::CoreError`。
pub use error::{CoreError, CoreResult};
