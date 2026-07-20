## Context

`@neko-engine/host-napi` is a CommonJS package whose loader assigns the native binding object to `module.exports`. The Engine extension is bundled as CommonJS, but three lazy call sites use native `import()` against the externalized package. Node 24 exposes this package as an ESM namespace with the binding object under `default`; it does not synthesize a `NativeEngine` named export from the dynamic `module.exports` assignment. The current type assertion hides that runtime mismatch.

The Engine must remain lazily loadable so a missing or invalid native dependency can produce an explicit Engine-unavailable diagnostic without preventing the whole extension from activating. The three consumers must not maintain separate interop logic.

Separately, `packages.tsExtensions` currently includes `neko-engine` even though CI and Release already provide a dedicated platform matrix for its N-API and FFmpeg closure. VSCE therefore runs the Engine native prepublish script again in the Ubuntu TypeScript-only job, where no Engine FFmpeg development environment exists.

## Goals / Non-Goals

**Goals:**

- Resolve the exact CommonJS namespace shape produced by Node 24.
- Validate the module boundary before invoking `NativeEngine.create`.
- Give all Engine extension consumers one canonical creation function.
- Package the Engine VSIX only through its supported-platform matrix.
- Preserve fail-visible Engine startup behavior and actionable diagnostics.

**Non-Goals:**

- Change N-API exports, Rust Engine lifecycle, or action contracts.
- Add an alternate media implementation or CPU/CLI fallback.
- Change Cut request timeout behavior to hide Engine startup failure.

## Decisions

### 1. Normalize the CommonJS namespace in one Engine-owned module

A package-local loader will own the dynamic import and resolve `namespace.default` as the CommonJS binding object. It will validate that `NativeEngine` is a constructor with a callable static `create` method before returning it. Consumers call one `createNativeEngineBinding()` function and never inspect module namespace shape.

This is preferred over changing all imports to static imports because eager native loading would turn a recoverable Engine capability failure into extension activation failure. It is preferred over accepting both named and default shapes because the supported Node 24 contract is known and one canonical path keeps invalid packaging visible.

### 2. Test the runtime namespace, not only a convenient ESM mock

The regression test will model `{ default: { NativeEngine } }`, the exact namespace observed from `import('@neko-engine/host-napi')` in Node 24. A separate invalid-namespace test will assert the diagnostic rather than allowing an undefined property error.

### 3. Keep downstream request behavior unchanged

Cut already reports Engine unavailability when Engine startup fails. Once loading succeeds, the existing MediaService response path handles waveform, probe, thumbnails, preview, and export. Timeout changes or Webview fallback behavior would mask the first failure and are outside this fix.

### 4. Exclude Engine from the TypeScript-only package group

`neko-engine` will remain in `buildRelease` and the stable release channel, but will be removed from `packages.tsExtensions`. CI and tag release workflows already package it through `package-engine-vsix` / `release-engine` for each supported target.

This is preferred over downloading FFmpeg development archives in the TypeScript-only job because that would preserve duplicate Engine artifacts, build only a Linux native binary under a supposedly host-neutral artifact name, and keep responsibilities ambiguous.

## Risks / Trade-offs

- [Future runtime changes CommonJS namespace details] → Package engines and CI pin Node 24; the boundary test fails visibly when that contract changes.
- [A malformed native package still reaches users] → Boundary validation reports a specific missing-export diagnostic before any media request is accepted.
- [Repeated Engine instances are created by helpers] → Existing Engine singleton ownership in host-napi remains unchanged; this change only centralizes construction access.
- [Release aggregation misses the Engine artifact] → Existing create-release/main-gate jobs already depend on and collect the platform Engine matrix; orchestration tests assert the exclusive package routing.

## Migration Plan

Replace the three dynamic-import call sites atomically, rebuild the Engine extension, and restart the Extension Development Host. Rollback is the source revert; no user data or persisted schema changes are involved.

## Open Questions

None.
