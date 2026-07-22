## Context

OpenNeko's application root copies seven build-only feature VSIX payloads beneath `dist/features/<feature>`. Each feature bundle is loaded from that scoped directory, but the final product intentionally contains no general workspace `node_modules` tree. This contract is currently incomplete:

- Engine externalizes `@neko-engine/host-napi` although the loader and native binary live at `packages/host-napi/` inside the Engine feature.
- Engine's macOS packager copies only the seven FFmpeg libraries while the native binary and copied dylibs retain Homebrew load paths and transitive codec dependencies.
- Content and Agent call `import(packageName)` for document parsers, which esbuild cannot discover or bundle.
- Agent bundles Sharp's JavaScript but Sharp dynamically requires `@img/sharp-<platform>` and libvips packages that are absent from the payload.
- Final assembly validates only that at least one Engine runtime library exists; it does not validate Node runtime resolution from each embedded bundle.

The product is an offline local VS Code client. Runtime dependencies must therefore be closed inside each feature payload without relying on the monorepo checkout, a global package installation, or a separately installed feature extension.

## Goals / Non-Goals

**Goals:**

- Make Engine activation resolve its packaged CommonJS N-API loader from the feature-scoped context.
- Make the macOS Engine payload recursively own every non-system Mach-O dependency and use only feature-relative load paths.
- Make document parser dependencies statically discoverable and owned by `@neko/content`.
- Package only the Sharp native binding and libvips pair for the current supported target.
- Let features declare runtime packages in a machine-readable payload manifest and let the application validate them generically.
- Reject internal bare package imports, variable document package imports, target mismatches, missing files, and dependencies that resolve outside the feature payload.
- Verify the installed macOS package in an isolated Extension Development Host; leave Linux runtime acceptance to its canonical runner.

**Non-Goals:**

- Copying the monorepo `node_modules` tree or using VSCE dependency traversal as the product contract.
- Adding remote dependency installation, runtime downloads, fallback image processors, or alternate document readers.
- Changing Agent prompts, tools, provider routing, Engine APIs, or document output schemas.

## Decisions

### Engine receives one scoped CommonJS loader path

Engine activation configures the existing native binding boundary with `context.asAbsolutePath('packages/host-napi/loader.js')`. The boundary uses `createRequire` to load that absolute CommonJS file and validates `NativeEngine.create`. All Engine consumers keep calling the same lazy creation function.

Alternative considered: synthesize `node_modules/@neko-engine/host-napi`. Rejected because the package already has one canonical feature-relative location and a duplicate package tree would create two runtime identities. Alternative considered: bundle the loader. Rejected because its `__dirname` must remain the native binary directory.

### Engine materializes one complete macOS Mach-O closure

The platform packager owns native compilation, FFmpeg staging, load-command rewriting, signing, and VSIX creation in that order. Engine's generic `vscode:prepublish` therefore compiles only the TypeScript bundle and cannot rebuild the native binary after its load commands are patched.

For macOS, the bundler starts from the packaged N-API binary and configured FFmpeg libraries, recursively follows every non-system Mach-O dependency, copies the real dylib into `packages/host-napi`, rewrites each load command to `@loader_path/<basename>`, assigns feature-relative install names, and ad-hoc signs every modified file. `/System/Library` and `/usr/lib` dependencies remain host-provided. Missing dependencies, unsupported load-path forms, or two different source libraries with the same basename fail packaging visibly.

Alternative considered: retain Homebrew load paths. Rejected because end users are not required to install the build machine's FFmpeg and codec formulae. Alternative considered: copy only the seven FFmpeg libraries. Rejected because Homebrew's shared FFmpeg build links additional codec and crypto dylibs, so that set is not an offline closure.

### Content owns literal document module loaders

`@neko/content/document/node` defines an exhaustive map from every package requested by `DocumentReaderRuntimeDeps` to literal dynamic imports: `adm-zip`, `pdf-parse`, `mammoth`, `officeparser`, `epub2`, `node-unrar-js`, `node-fetch`, `cheerio`, `xlsx`, and `fast-xml-parser`. Assets uses this loader through `createNodeDocumentAccessService`; Agent delegates its diagnostic wrapper to the same loader. These packages move into Content's dependency manifest, while duplicate declarations leave Agent Extension.

Alternative considered: retain arbitrary `import(packageName)` and copy parser packages. Rejected because the supported set is closed, literal imports let esbuild create one portable bundle, and arbitrary runtime package loading cannot be validated statically.

### Agent stages a target-specific Sharp native closure

Agent's prepublish path copies exactly two already-installed optional packages into `dist/node_modules/@img`: `sharp-<target>` and `sharp-libvips-<target>`. It resolves their package export roots, copies real files rather than pnpm symlinks, removes any prior generated closure, and emits `dist/runtime-closure.json` with exact module specifiers and target identity.

The Sharp JavaScript remains bundled. Its existing dynamic native require then resolves from `dist/node_modules` beside `dist/extension.js`. The WASM package remains a development fallback dependency but is not the release runtime path.

Alternative considered: package Sharp and all transitive JavaScript under `node_modules`. Rejected because the JS is already bundled and only the platform native pair is unresolved. Alternative considered: force WASM in all releases. Rejected because both supported targets have canonical native packages and image processing is a repeated local workflow.

### The assembler validates feature-owned manifests

The application assembler scans every embedded feature bundle for internal bare runtime imports and prohibited variable package imports. For each optional `dist/runtime-closure.json`, it validates schema, target, unique specifiers, and resolves every specifier from that feature's `dist/extension.js`. A resolution is accepted only when the resulting real path remains within the feature root; resolving through the repository's own `node_modules` is a packaging failure.

This keeps package-specific staging in the owner while giving Release one generic offline-closure gate.

### Unused Sharp declarations are removed

Cut and Tools have no production Sharp caller in source or compiled output. Their stale `--external:sharp` options and manifest dependencies are removed instead of packaging an unused native closure.

## Five-Layer Analysis

- **Responsibility:** Engine owns N-API location and the platform-native Mach-O/ELF closure; Content owns parser modules; Agent owns Sharp files; the application owns final offline closure validation.
- **Dependency:** feature packages do not import the application, Content remains host-neutral except its explicit Node entry, and Webviews receive no Node/native dependency.
- **Interface:** scoped Engine path, exhaustive document module name union, and versioned runtime closure manifest are the only new contracts.
- **Extension:** a future native feature adds a manifest through its own prepublish step; the assembler does not gain package-specific copy logic.
- **Testing:** pure loaders, native dependency graph materialization, and staging get focused tests; orchestration tests inspect final staged payloads; VS Code Extension Host proves installed activation and Engine readiness.

## Risks / Trade-offs

- **[pnpm optional native package is absent on a runner]** -> Staging fails before VSIX creation with the exact target/package name.
- **[Assembler accidentally resolves through repository dependencies]** -> Real paths must remain under the staged feature root.
- **[Document parser increases bundle size]** -> The four supported parser capabilities are product dependencies already declared; bundle size is reported, but missing runtime modules are not accepted as an optimization.
- **[Engine path is configured after a consumer starts]** -> Activation configures the boundary before registering Engine services or commands; unconfigured access throws a specific diagnostic.
- **[Homebrew changes transitive dependencies]** -> The macOS closure is discovered from actual Mach-O load commands and rejects unresolved or colliding dependencies before VSIX creation.
- **[Sharp native ABI does not load inside VS Code]** -> Isolated host acceptance invokes an Agent image-processing path in addition to checking activation logs.
- **[Concurrent worktree changes overlap Agent runtime files]** -> Read and preserve current hunks, keep the modification to the loader call/import, and do not rewrite unrelated Agent work.

## Migration Plan

1. Add red-capable source/payload contract tests for all confirmed missing modules.
2. Implement Engine scoped loading and Content's literal parser loader.
3. Implement Agent Sharp staging plus manifest and generic assembler validation.
4. Build and inspect a macOS OpenNeko VSIX, install it into an isolated Extension Development Host, and exercise Engine plus Agent image/document paths.
5. Require the Linux Merge Gate artifact to pass the same closure manifest and activation contract before release.

Rollback restores the previous source but must not be released because `0.0.2` is already proven incomplete. No user data migration is involved.

## Open Questions

None.
