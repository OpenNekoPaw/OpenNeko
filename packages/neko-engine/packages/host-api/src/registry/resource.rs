//! ResourceRegistry - Deterministic ID + Self-healing resource management
//!
//! Manages resources with:
//! - Deterministic IDs based on file path (xxHash64)
//! - Self-healing: same path always gets same ID
//! - Proxy binding: link proxy files to original resources
//! - LRU eviction: automatic cleanup when capacity exceeded

use neko_engine_kernel::contracts::domain::{infer_resource_type, ResourceHandle};
use neko_engine_types::{ResourceId, ResourceType};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Configuration for resource registry
#[derive(Debug, Clone)]
pub struct ResourceRegistryConfig {
    /// Maximum number of resources before LRU eviction kicks in.
    /// Set to 0 for unlimited (no eviction).
    pub max_entries: usize,
}

impl Default for ResourceRegistryConfig {
    fn default() -> Self {
        Self {
            max_entries: 10_000, // Reasonable default for a video editing session
        }
    }
}

/// Resource registry for managing media resources
///
/// Features:
/// - Deterministic IDs: same path always produces same ID
/// - Self-healing: re-register same path returns existing ID
/// - Proxy binding: associate proxy files with originals (bidirectional)
/// - LRU eviction: evicts least-recently-accessed resources when capacity exceeded
pub struct ResourceRegistry {
    /// Resources by ID
    resources: Arc<RwLock<HashMap<String, ResourceHandle>>>,
    /// Path to ID mapping for quick lookup
    path_to_id: Arc<RwLock<HashMap<PathBuf, String>>>,
    /// Proxy → Original mapping (proxy_id → original_id)
    proxy_to_original: Arc<RwLock<HashMap<String, String>>>,
    /// Original → Proxy mapping (original_id → proxy_id)
    original_to_proxy: Arc<RwLock<HashMap<String, String>>>,
    /// Configuration
    config: ResourceRegistryConfig,
}

impl ResourceRegistry {
    /// Create a new resource registry with default config
    pub fn new() -> Self {
        Self::with_config(ResourceRegistryConfig::default())
    }

    /// Create a new resource registry with custom config
    pub fn with_config(config: ResourceRegistryConfig) -> Self {
        Self {
            resources: Arc::new(RwLock::new(HashMap::new())),
            path_to_id: Arc::new(RwLock::new(HashMap::new())),
            proxy_to_original: Arc::new(RwLock::new(HashMap::new())),
            original_to_proxy: Arc::new(RwLock::new(HashMap::new())),
            config,
        }
    }

    /// Register a resource by path
    ///
    /// Returns the deterministic ResourceId. If the same path is registered
    /// again, returns the same ID (self-healing).
    pub async fn register(&self, path: &Path) -> ResourceId {
        let canonical = Self::canonicalize_path(path);

        // Check if already registered
        {
            let path_map = self.path_to_id.read().await;
            if let Some(id) = path_map.get(&canonical) {
                // Touch the resource to update LRU
                let mut resources = self.resources.write().await;
                if let Some(handle) = resources.get_mut(id) {
                    handle.touch();
                }
                return ResourceId::from_string(id.clone());
            }
        }

        // Evict if at capacity
        self.evict_if_needed().await;

        // Infer resource type and create handle
        let resource_type = infer_resource_type(path);
        let handle = ResourceHandle::new(path, resource_type);
        let id = handle.id.clone();
        let id_str = id.as_str().to_string();

        // Store in registry
        {
            let mut resources = self.resources.write().await;
            let mut path_map = self.path_to_id.write().await;

            // Check for ID collision (different path, same hash)
            if resources.contains_key(&id_str) {
                // Collision detected - append suffix
                let new_id = format!("{}_2", id_str);
                tracing::warn!(
                    "ResourceId collision detected for path {:?}, using {}",
                    path,
                    new_id
                );
                let handle = ResourceHandle::from_id(
                    ResourceId::from_string(new_id.clone()),
                    resource_type,
                    path.to_path_buf(),
                );
                resources.insert(new_id.clone(), handle);
                path_map.insert(canonical, new_id.clone());
                return ResourceId::from_string(new_id);
            }

            resources.insert(id_str.clone(), handle);
            path_map.insert(canonical, id_str);
        }

        id
    }

    /// Register with explicit resource type
    pub async fn register_with_type(&self, path: &Path, resource_type: ResourceType) -> ResourceId {
        let canonical = Self::canonicalize_path(path);

        // Check if already registered
        {
            let path_map = self.path_to_id.read().await;
            if let Some(id) = path_map.get(&canonical) {
                let mut resources = self.resources.write().await;
                if let Some(handle) = resources.get_mut(id) {
                    handle.touch();
                }
                return ResourceId::from_string(id.clone());
            }
        }

        // Evict if at capacity
        self.evict_if_needed().await;

        let handle = ResourceHandle::new(path, resource_type);
        let id = handle.id.clone();
        let id_str = id.as_str().to_string();

        {
            let mut resources = self.resources.write().await;
            let mut path_map = self.path_to_id.write().await;
            resources.insert(id_str.clone(), handle);
            path_map.insert(canonical, id_str);
        }

        id
    }

    /// Resolve a resource by ID
    ///
    /// Updates last_accessed for LRU tracking.
    pub async fn resolve(&self, id: &ResourceId) -> Option<ResourceHandle> {
        let mut resources = self.resources.write().await;
        if let Some(handle) = resources.get_mut(id.as_str()) {
            handle.touch();
            Some(handle.clone())
        } else {
            None
        }
    }

    /// Resolve a resource for preview — prefers proxy if available
    ///
    /// If the resource has a bound proxy, returns the proxy handle.
    /// Falls back to the original resource if proxy is not available.
    pub async fn resolve_for_preview(&self, id: &ResourceId) -> Option<ResourceHandle> {
        // Check if there's a proxy for this resource
        let proxy_id = {
            let o2p = self.original_to_proxy.read().await;
            o2p.get(id.as_str()).cloned()
        };

        if let Some(proxy_id_str) = proxy_id {
            // Try to resolve the proxy
            let mut resources = self.resources.write().await;
            if let Some(proxy_handle) = resources.get_mut(&proxy_id_str) {
                proxy_handle.touch();
                return Some(proxy_handle.clone());
            }
        }

        // Fall back to original
        self.resolve(id).await
    }

    /// Resolve a resource for export — always returns original (bypasses proxy)
    ///
    /// Even if a proxy is bound, this returns the original resource handle.
    /// Use this for final export/render where full quality is needed.
    pub async fn resolve_for_export(&self, id: &ResourceId) -> Option<ResourceHandle> {
        // If this is a proxy ID, resolve to the original
        let original_id = {
            let p2o = self.proxy_to_original.read().await;
            p2o.get(id.as_str()).cloned()
        };

        if let Some(original_id_str) = original_id {
            let mut resources = self.resources.write().await;
            if let Some(handle) = resources.get_mut(&original_id_str) {
                handle.touch();
                return Some(handle.clone());
            }
        }

        // Already an original, or no proxy binding
        self.resolve(id).await
    }

    /// Resolve a resource by path (self-healing)
    ///
    /// If the resource is not registered, registers it first.
    pub async fn resolve_or_register(&self, path: &Path) -> ResourceHandle {
        let id = self.register(path).await;
        self.resolve(&id).await.expect("Just registered")
    }

    /// Get resource path by ID
    pub async fn get_path(&self, id: &ResourceId) -> Option<PathBuf> {
        let resources = self.resources.read().await;
        resources.get(id.as_str()).map(|h| h.source_path.clone())
    }

    /// Bind a proxy to an original resource (bidirectional)
    ///
    /// Creates both proxy→original and original→proxy mappings.
    /// Preview operations will prefer the proxy; export operations will use the original.
    pub async fn bind_proxy(&self, proxy_id: &ResourceId, original_id: &ResourceId) {
        let proxy_str = proxy_id.as_str().to_string();
        let original_str = original_id.as_str().to_string();

        let mut p2o = self.proxy_to_original.write().await;
        let mut o2p = self.original_to_proxy.write().await;

        p2o.insert(proxy_str.clone(), original_str.clone());
        o2p.insert(original_str, proxy_str);
    }

    /// Unbind a proxy from its original resource
    pub async fn unbind_proxy(&self, proxy_id: &ResourceId) {
        let mut p2o = self.proxy_to_original.write().await;
        let mut o2p = self.original_to_proxy.write().await;

        if let Some(original_str) = p2o.remove(proxy_id.as_str()) {
            o2p.remove(&original_str);
        }
    }

    /// Get the original resource for a proxy
    pub async fn get_original(&self, proxy_id: &ResourceId) -> Option<ResourceId> {
        let bindings = self.proxy_to_original.read().await;
        bindings
            .get(proxy_id.as_str())
            .map(|id| ResourceId::from_string(id.clone()))
    }

    /// Get the proxy resource for an original
    pub async fn get_proxy(&self, original_id: &ResourceId) -> Option<ResourceId> {
        let bindings = self.original_to_proxy.read().await;
        bindings
            .get(original_id.as_str())
            .map(|id| ResourceId::from_string(id.clone()))
    }

    /// Unregister a resource
    ///
    /// Also removes any proxy bindings associated with this resource.
    pub async fn unregister(&self, id: &ResourceId) {
        let mut resources = self.resources.write().await;
        let mut path_map = self.path_to_id.write().await;
        let mut p2o = self.proxy_to_original.write().await;
        let mut o2p = self.original_to_proxy.write().await;

        if let Some(handle) = resources.remove(id.as_str()) {
            let canonical = Self::canonicalize_path(&handle.source_path);
            path_map.remove(&canonical);
        }

        // Remove proxy → original binding
        if let Some(original_str) = p2o.remove(id.as_str()) {
            o2p.remove(&original_str);
        }

        // Remove original → proxy binding
        if let Some(proxy_str) = o2p.remove(id.as_str()) {
            p2o.remove(&proxy_str);
        }
    }

    /// List all registered resources
    pub async fn list(&self) -> Vec<ResourceHandle> {
        let resources = self.resources.read().await;
        resources.values().cloned().collect()
    }

    /// Get count of registered resources
    pub async fn count(&self) -> usize {
        let resources = self.resources.read().await;
        resources.len()
    }

    /// Evict least-recently-accessed resources if at capacity
    ///
    /// Evicts resources that:
    /// 1. Are not bound as proxy or original in any proxy binding
    /// 2. Have the oldest last_accessed timestamp
    async fn evict_if_needed(&self) {
        if self.config.max_entries == 0 {
            return; // Unlimited
        }

        let resources = self.resources.read().await;
        if resources.len() < self.config.max_entries {
            return; // Under capacity
        }
        drop(resources);

        // Collect protected IDs (involved in proxy bindings)
        let protected: std::collections::HashSet<String> = {
            let p2o = self.proxy_to_original.read().await;
            let o2p = self.original_to_proxy.read().await;
            let mut set = std::collections::HashSet::new();
            for (k, v) in p2o.iter() {
                set.insert(k.clone());
                set.insert(v.clone());
            }
            for (k, v) in o2p.iter() {
                set.insert(k.clone());
                set.insert(v.clone());
            }
            set
        };

        // Find the LRU candidate (oldest last_accessed, not protected)
        let evict_id = {
            let resources = self.resources.read().await;
            resources
                .iter()
                .filter(|(id, _)| !protected.contains(*id))
                .min_by_key(|(_, handle)| handle.last_accessed)
                .map(|(id, _)| id.clone())
        };

        if let Some(id_str) = evict_id {
            let id = ResourceId::from_string(id_str.clone());
            tracing::debug!("LRU evicting resource: {}", id_str);
            // Use internal eviction (not full unregister to avoid deadlock)
            let mut resources = self.resources.write().await;
            let mut path_map = self.path_to_id.write().await;
            if let Some(handle) = resources.remove(&id_str) {
                let canonical = Self::canonicalize_path(&handle.source_path);
                path_map.remove(&canonical);
            }
            drop(resources);
            drop(path_map);

            // Clean up proxy bindings if any (shouldn't happen due to protection, but be safe)
            let mut p2o = self.proxy_to_original.write().await;
            let mut o2p = self.original_to_proxy.write().await;
            if let Some(original_str) = p2o.remove(id.as_str()) {
                o2p.remove(&original_str);
            }
            if let Some(proxy_str) = o2p.remove(id.as_str()) {
                p2o.remove(&proxy_str);
            }
        }
    }

    /// Manually evict resources to reach target count
    ///
    /// Useful for explicit memory management. Evicts LRU resources
    /// until the registry has at most `target_count` entries.
    pub async fn evict_to(&self, target_count: usize) {
        loop {
            let current = self.count().await;
            if current <= target_count {
                break;
            }

            // Collect protected IDs
            let protected: std::collections::HashSet<String> = {
                let p2o = self.proxy_to_original.read().await;
                let o2p = self.original_to_proxy.read().await;
                let mut set = std::collections::HashSet::new();
                for (k, v) in p2o.iter() {
                    set.insert(k.clone());
                    set.insert(v.clone());
                }
                for (k, v) in o2p.iter() {
                    set.insert(k.clone());
                    set.insert(v.clone());
                }
                set
            };

            let evict_id = {
                let resources = self.resources.read().await;
                resources
                    .iter()
                    .filter(|(id, _)| !protected.contains(*id))
                    .min_by_key(|(_, handle)| handle.last_accessed)
                    .map(|(id, _)| ResourceId::from_string(id.clone()))
            };

            match evict_id {
                Some(id) => self.unregister(&id).await,
                None => break, // All remaining resources are protected
            }
        }
    }

    /// Canonicalize path for consistent hashing
    fn canonicalize_path(path: &Path) -> PathBuf {
        // Try to canonicalize, fall back to the original path
        path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
    }
}

impl Default for ResourceRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_register_same_path_returns_same_id() {
        let registry = ResourceRegistry::new();

        let path = Path::new("/tmp/test.mp4");
        let id1 = registry.register(path).await;
        let id2 = registry.register(path).await;

        assert_eq!(id1.as_str(), id2.as_str());
    }

    #[tokio::test]
    async fn test_different_paths_different_ids() {
        let registry = ResourceRegistry::new();

        let id1 = registry.register(Path::new("/tmp/video1.mp4")).await;
        let id2 = registry.register(Path::new("/tmp/video2.mp4")).await;

        assert_ne!(id1.as_str(), id2.as_str());
    }

    #[tokio::test]
    async fn test_resolve_or_register() {
        let registry = ResourceRegistry::new();

        let path = Path::new("/tmp/test.mp4");
        let handle = registry.resolve_or_register(path).await;

        assert_eq!(handle.source_path, path);
    }

    #[tokio::test]
    async fn test_proxy_binding_bidirectional() {
        let registry = ResourceRegistry::new();

        let original_id = registry.register(Path::new("/tmp/original.mp4")).await;
        let proxy_id = registry.register(Path::new("/tmp/proxy.mp4")).await;

        registry.bind_proxy(&proxy_id, &original_id).await;

        // proxy → original
        let resolved_original = registry.get_original(&proxy_id).await;
        assert_eq!(resolved_original.unwrap().as_str(), original_id.as_str());

        // original → proxy
        let resolved_proxy = registry.get_proxy(&original_id).await;
        assert_eq!(resolved_proxy.unwrap().as_str(), proxy_id.as_str());
    }

    #[tokio::test]
    async fn test_resolve_for_preview_uses_proxy() {
        let registry = ResourceRegistry::new();

        let original_id = registry.register(Path::new("/tmp/original_4k.mp4")).await;
        let proxy_id = registry.register(Path::new("/tmp/proxy_720p.mp4")).await;

        registry.bind_proxy(&proxy_id, &original_id).await;

        // Preview should return proxy
        let preview_handle = registry.resolve_for_preview(&original_id).await.unwrap();
        assert_eq!(preview_handle.id.as_str(), proxy_id.as_str());
    }

    #[tokio::test]
    async fn test_resolve_for_preview_fallback_to_original() {
        let registry = ResourceRegistry::new();

        let original_id = registry.register(Path::new("/tmp/original.mp4")).await;

        // No proxy bound — should return original
        let preview_handle = registry.resolve_for_preview(&original_id).await.unwrap();
        assert_eq!(preview_handle.id.as_str(), original_id.as_str());
    }

    #[tokio::test]
    async fn test_resolve_for_export_bypasses_proxy() {
        let registry = ResourceRegistry::new();

        let original_id = registry.register(Path::new("/tmp/original_4k.mp4")).await;
        let proxy_id = registry.register(Path::new("/tmp/proxy_720p.mp4")).await;

        registry.bind_proxy(&proxy_id, &original_id).await;

        // Export with original ID should return original
        let export_handle = registry.resolve_for_export(&original_id).await.unwrap();
        assert_eq!(export_handle.id.as_str(), original_id.as_str());

        // Export with proxy ID should also return original
        let export_handle = registry.resolve_for_export(&proxy_id).await.unwrap();
        assert_eq!(export_handle.id.as_str(), original_id.as_str());
    }

    #[tokio::test]
    async fn test_unbind_proxy() {
        let registry = ResourceRegistry::new();

        let original_id = registry.register(Path::new("/tmp/original.mp4")).await;
        let proxy_id = registry.register(Path::new("/tmp/proxy.mp4")).await;

        registry.bind_proxy(&proxy_id, &original_id).await;
        assert!(registry.get_proxy(&original_id).await.is_some());

        registry.unbind_proxy(&proxy_id).await;
        assert!(registry.get_proxy(&original_id).await.is_none());
        assert!(registry.get_original(&proxy_id).await.is_none());
    }

    #[tokio::test]
    async fn test_lru_eviction() {
        let config = ResourceRegistryConfig { max_entries: 3 };
        let registry = ResourceRegistry::with_config(config);

        // Register 3 resources (at capacity)
        let id1 = registry.register(Path::new("/tmp/a.mp4")).await;
        let _id2 = registry.register(Path::new("/tmp/b.mp4")).await;
        let id3 = registry.register(Path::new("/tmp/c.mp4")).await;
        assert_eq!(registry.count().await, 3);

        // Touch id1 to make it recently accessed
        registry.resolve(&id1).await;

        // Register a 4th — should evict id2 (oldest non-touched)
        let _id4 = registry.register(Path::new("/tmp/d.mp4")).await;

        assert_eq!(registry.count().await, 3);
        // id1 was touched, id3 was registered after id2, so id2 should be evicted
        assert!(registry.resolve(&id1).await.is_some());
        assert!(registry.resolve(&id3).await.is_some());
    }

    #[tokio::test]
    async fn test_lru_eviction_protects_proxy_bindings() {
        let config = ResourceRegistryConfig { max_entries: 3 };
        let registry = ResourceRegistry::with_config(config);

        let original_id = registry.register(Path::new("/tmp/original.mp4")).await;
        let proxy_id = registry.register(Path::new("/tmp/proxy.mp4")).await;
        registry.bind_proxy(&proxy_id, &original_id).await;

        let _id3 = registry.register(Path::new("/tmp/other.mp4")).await;
        assert_eq!(registry.count().await, 3);

        // Register a 4th — should evict id3 (not original or proxy)
        let _id4 = registry.register(Path::new("/tmp/another.mp4")).await;

        assert_eq!(registry.count().await, 3);
        // Original and proxy should be protected
        assert!(registry.resolve(&original_id).await.is_some());
        assert!(registry.resolve(&proxy_id).await.is_some());
    }

    #[tokio::test]
    async fn test_evict_to() {
        let registry = ResourceRegistry::new();

        registry.register(Path::new("/tmp/a.mp4")).await;
        registry.register(Path::new("/tmp/b.mp4")).await;
        registry.register(Path::new("/tmp/c.mp4")).await;
        registry.register(Path::new("/tmp/d.mp4")).await;
        assert_eq!(registry.count().await, 4);

        registry.evict_to(2).await;
        assert_eq!(registry.count().await, 2);
    }

    #[tokio::test]
    async fn test_unlimited_capacity() {
        let config = ResourceRegistryConfig { max_entries: 0 };
        let registry = ResourceRegistry::with_config(config);

        for i in 0..100 {
            registry
                .register(Path::new(&format!("/tmp/file_{}.mp4", i)))
                .await;
        }

        assert_eq!(registry.count().await, 100);
    }

    #[tokio::test]
    async fn test_unregister_cleans_proxy_bindings() {
        let registry = ResourceRegistry::new();

        let original_id = registry.register(Path::new("/tmp/original.mp4")).await;
        let proxy_id = registry.register(Path::new("/tmp/proxy.mp4")).await;

        registry.bind_proxy(&proxy_id, &original_id).await;

        // Unregister proxy should clean up bindings
        registry.unregister(&proxy_id).await;
        assert!(registry.get_original(&proxy_id).await.is_none());
        assert!(registry.get_proxy(&original_id).await.is_none());
    }
}
