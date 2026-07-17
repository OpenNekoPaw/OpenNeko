//! Engine configuration loaded from a JSON config file or defaults.

use serde::{Deserialize, Serialize};
use std::path::Path;

/// Top-level engine configuration.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct EngineConfig {
    /// HTTP server settings.
    pub server: ServerConfig,
    /// Concurrency limits.
    pub concurrency: ConcurrencyConfig,
}

/// HTTP server configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ServerConfig {
    /// Port to listen on.
    pub port: u16,
}

/// Concurrency limits for engine resource pools.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ConcurrencyConfig {
    /// Max concurrent admission (request intake) tasks.
    pub admission: usize,
    /// Max concurrent codec (encode/decode) tasks.
    pub codec: usize,
    /// Max concurrent GPU tasks.
    pub gpu: usize,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self { port: 8765 }
    }
}

impl Default for ConcurrencyConfig {
    fn default() -> Self {
        Self {
            admission: 16,
            codec: 4,
            gpu: 2,
        }
    }
}

impl EngineConfig {
    /// Load configuration from an optional file path.
    ///
    /// Resolution order:
    /// 1. Explicit `path` argument (if provided and file exists)
    /// 2. `<project_root>/.neko/engine.json` (if `project_root` provided)
    /// 3. Fall back to defaults
    pub fn load(
        path: Option<&Path>,
        project_root: Option<&Path>,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        // Explicit path
        if let Some(p) = path {
            if p.exists() {
                let content = std::fs::read_to_string(p)?;
                let config: EngineConfig = serde_json::from_str(&content)?;
                return Ok(config);
            }
        }

        // Project-relative config
        if let Some(root) = project_root {
            let candidate = root.join(".neko").join("engine.json");
            if candidate.exists() {
                let content = std::fs::read_to_string(&candidate)?;
                let config: EngineConfig = serde_json::from_str(&content)?;
                return Ok(config);
            }
        }

        Ok(Self::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = EngineConfig::default();
        assert_eq!(config.server.port, 8765);
    }

    #[test]
    fn test_load_fallback_to_default() {
        let config = EngineConfig::load(None, None).unwrap();
        assert_eq!(config.server.port, 8765);
    }

    #[test]
    fn test_load_nonexistent_path() {
        let config = EngineConfig::load(Some(Path::new("/nonexistent/config.json")), None).unwrap();
        assert_eq!(config.server.port, 8765);
    }
}
