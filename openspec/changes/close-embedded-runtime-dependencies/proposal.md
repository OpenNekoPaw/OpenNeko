## Why

The unified OpenNeko VSIX embeds feature payloads but excludes `node_modules`, while several compiled features still resolve runtime packages by bare specifier. Engine therefore fails during activation, and Agent/Assets fail later when loading Sharp or document parsers even though their JavaScript bundles were produced successfully.

## What Changes

- Load the packaged Engine N-API module from the Engine feature's scoped absolute path instead of the unresolved `@neko-engine/host-napi` package name.
- Materialize the complete macOS Engine Mach-O dependency closure and reject Homebrew or other host-local load paths in packaged artifacts.
- Make `@neko/content` own a literal, statically bundled loader map for every parser/archive/network module used by its document runtime and route Agent/Assets through it.
- Stage exactly the current platform's Sharp binding and libvips packages inside the Agent feature payload.
- Add a feature-owned runtime closure manifest and a generic application assembler check that rejects missing, cross-target, workspace-resolved, or internal bare runtime dependencies.
- Add final payload and Extension Development Host acceptance so an installable VSIX, rather than source tests alone, proves closure completeness.
- Remove stale Sharp externals/dependencies from Cut and Tools where no production caller exists.

## Capabilities

### New Capabilities

- `embedded-runtime-dependency-closure`: Defines feature-owned packaged runtime dependencies, scoped module loading, deterministic closure validation, and offline activation requirements for the unified VSIX.

### Modified Capabilities

None.

## Impact

- Affects Engine extension loading, shared Content document-module ownership, Agent packaging, OpenNeko platform assembly, and release orchestration tests.
- Does not change Engine N-API exports, document contracts, Agent tool schemas, project formats, or Webview protocols.
- Release/install risk is L4 because missing runtime files can prevent activation or break core image/document workflows only after installation.
