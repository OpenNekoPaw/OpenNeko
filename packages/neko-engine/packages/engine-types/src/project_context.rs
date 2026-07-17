//! Project context for path resolution with variable expansion.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Resolved path — either a local filesystem path or a remote URL.
#[derive(Debug, Clone, PartialEq)]
pub enum ResolvedPath {
    /// Local filesystem path.
    Local(PathBuf),
    /// Remote URL (e.g. https://).
    Remote(String),
}

/// Project context providing variable-based path resolution.
///
/// Supports `${VAR}/path` syntax. Variable sources:
/// - `.neko/settings.json` (media library paths)
/// - `.neko/settings.local.json` (local overrides)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectContext {
    /// Project root directory.
    pub root: PathBuf,
    /// Variable definitions for path expansion.
    #[serde(default)]
    pub variables: HashMap<String, String>,
}

impl ProjectContext {
    /// Create a new context with a project root.
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            variables: HashMap::new(),
        }
    }

    /// Resolve a path string, expanding `${VAR}` variables and resolving relative paths.
    pub fn resolve(&self, input: &str) -> Result<ResolvedPath, String> {
        // Check for remote URLs
        if input.starts_with("http://") || input.starts_with("https://") {
            return Ok(ResolvedPath::Remote(input.to_string()));
        }

        // Expand variables
        let expanded = self.expand_variables(input)?;
        let path = Path::new(&expanded);

        // Resolve relative paths against project root
        let resolved = if path.is_relative() {
            self.root.join(path)
        } else {
            path.to_path_buf()
        };

        Ok(ResolvedPath::Local(resolved))
    }

    /// Expand `${VAR}` patterns in the input string.
    fn expand_variables(&self, input: &str) -> Result<String, String> {
        let mut result = String::with_capacity(input.len());
        let mut chars = input.chars().peekable();

        while let Some(ch) = chars.next() {
            if ch == '$' && chars.peek() == Some(&'{') {
                chars.next(); // consume '{'
                let mut var_name = String::new();
                let mut found_close = false;

                for c in chars.by_ref() {
                    if c == '}' {
                        found_close = true;
                        break;
                    }
                    var_name.push(c);
                }

                if !found_close {
                    return Err(format!("Unclosed variable reference: ${{{var_name}"));
                }

                match self.variables.get(&var_name) {
                    Some(value) => result.push_str(value),
                    None => {
                        return Err(format!("Unknown variable: {var_name}"));
                    }
                }
            } else {
                result.push(ch);
            }
        }

        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_absolute_path() {
        let ctx = ProjectContext::new(PathBuf::from("/project"));
        let result = ctx.resolve("/absolute/path").unwrap();
        assert_eq!(result, ResolvedPath::Local(PathBuf::from("/absolute/path")));
    }

    #[test]
    fn test_resolve_relative_path() {
        let ctx = ProjectContext::new(PathBuf::from("/project"));
        let result = ctx.resolve("relative/path").unwrap();
        assert_eq!(
            result,
            ResolvedPath::Local(PathBuf::from("/project/relative/path"))
        );
    }

    #[test]
    fn test_resolve_remote_url() {
        let ctx = ProjectContext::new(PathBuf::from("/project"));
        let result = ctx.resolve("https://example.com/file").unwrap();
        assert_eq!(
            result,
            ResolvedPath::Remote("https://example.com/file".to_string())
        );
    }

    #[test]
    fn test_resolve_variable() {
        let mut ctx = ProjectContext::new(PathBuf::from("/project"));
        ctx.variables
            .insert("MEDIA".to_string(), "/media/library".to_string());
        let result = ctx.resolve("${MEDIA}/video.mp4").unwrap();
        assert_eq!(
            result,
            ResolvedPath::Local(PathBuf::from("/media/library/video.mp4"))
        );
    }

    #[test]
    fn test_resolve_unknown_variable() {
        let ctx = ProjectContext::new(PathBuf::from("/project"));
        let result = ctx.resolve("${UNKNOWN}/file");
        assert!(result.is_err());
    }
}
