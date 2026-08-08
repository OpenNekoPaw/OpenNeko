## Why

Desktop development can repeatedly open a blank window after a workspace package changes its public export surface because Vite serves a symlink-resolved source module under an immutable dependency URL whose browser hash does not represent that source change. The resulting ESM linking failure happens before React mounts, so existing Surface and Root error boundaries cannot render a diagnostic.

## What Changes

- Establish one canonical catalog for Renderer-consumed workspace public entries and require Vite to resolve every catalog entry to its real workspace source identity before dependency optimization or browser caching.
- Prevent workspace source modules from being emitted as immutable dependency URLs, while keeping third-party dependency optimization unchanged.
- Load the Canvas Webview Root at its existing panel boundary so a Canvas module failure is contained by the owning Surface error boundary while the Shell, Agent, and sibling panels remain available.
- Replace the direct React entry module script with a minimal Renderer bootstrap that dynamically imports the application module and renders a localized, retryable startup diagnostic when import or initialization fails.
- Keep module contract violations fail-visible: retry re-attempts the same canonical application entry and does not clear user data, select another source, or report success.
- Add configuration, bootstrap, and real Electron regression evidence for stale-export recovery, visible startup failure, and ordinary Desktop startup.

## Capabilities

### New Capabilities

- `desktop-renderer-bootstrap-reliability`: Defines canonical workspace source resolution and fail-visible Renderer startup behavior before React mounts.

### Modified Capabilities

## Impact

- `apps/neko-desktop` owns the affected responsibilities because Vite/Forge configuration, Electron Renderer entry loading, CSP-compatible HTML bootstrap, and product Shell presentation are application-boundary concerns rather than Canvas or Agent domain behavior.
- Affected producer: Desktop Vite configuration and `index.html` module entry. Affected consumers: Chromium's Renderer module loader and the React application entry.
- No package-owned domain contract, user project, conversation, workspace file, setting, or durable local record changes. No migration or compatibility path is introduced.
- Development Renderer module URLs and startup diagnostics change; packaged application behavior is limited to the same minimal bootstrap import boundary and visible fatal-startup state.
