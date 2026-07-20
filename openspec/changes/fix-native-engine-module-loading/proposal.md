## Why

The Engine extension dynamically imports the CommonJS `@neko-engine/host-napi` package but reads `NativeEngine` as a named ESM export. Under the Node 24 Extension Host, the package is exposed through the namespace `default`, leaving `module.NativeEngine` undefined and making all Cut media operations unavailable.

## What Changes

- Define one Engine-owned loader for resolving and validating the CommonJS N-API module namespace.
- Route NativeMediaEngine, ExportService, and VideoFrameProvider through that canonical loader.
- Add regression coverage for the exact Node 24 CommonJS dynamic-import shape and fail-visible invalid module diagnostics.
- Remove the native Engine extension from the TypeScript-only VSIX package group so it is packaged exclusively by the platform matrix.
- Verify the Engine starts in the Extension Development Host and Cut no longer reports Engine unavailable.

## Capabilities

### New Capabilities

- `native-engine-module-loading`: Defines reliable, validated loading of the packaged N-API Engine module in the VS Code Extension Host.
- `native-engine-package-routing`: Defines exclusive routing of the native Engine extension through platform-specific VSIX packaging.

### Modified Capabilities

None.

## Impact

- Affects `packages/neko-engine/packages/extension/src/mediaEngine/`, its export helpers, and release package grouping.
- Does not change the N-API binary API, Proto contracts, Engine action registry, or Webview message schema.
- Restores the existing Engine-backed media path used by Cut preview, waveform, thumbnails, probe, and export.
