## 1. Contract and owner

- [x] 1.1 Replace the Home builtin capability DTO/channel with a versioned extension catalog contract, safe discovery diagnostics and rejection coverage for the removed capability payload.
- [x] 1.2 Add a Desktop Main Codex extension catalog reader that projects only enabled, uniquely cached, valid plugin manifests and safe MCP Server/Skill/App contribution summaries.

## 2. Main and preload composition

- [x] 2.1 Inject the extension reader into Desktop AppHost, preserve global personal/builtin Skill discovery, remove Shell domain projection and return the new extension result.
- [x] 2.2 Migrate Main IPC and preload to the extensions channel/bridge, with no fallback to the removed capabilities path.

## 3. Extension catalog experience

- [x] 3.1 Rename the Home navigation and management Surface to Extensions, replace Built-in capabilities with Extensions, and render manifest metadata plus contribution labels.
- [x] 3.2 Preserve Skill source filtering, personal-first deterministic sorting, builtin `en`/`zh-cn` presentation and author-owned personal metadata.
- [x] 3.3 Add complete English and Simplified Chinese extension-shell copy while preserving extension manifest metadata verbatim.

## 4. Tests and validation

- [x] 4.1 Add reader, producer/consumer and Renderer regressions proving disabled/unverified plugins and Desktop modules are excluded, Computer Use/MCP contributions are projected, paths and execution fields are absent, and both locales render correctly.
- [x] 4.2 Run focused Desktop tests, Desktop typecheck/build, strict OpenSpec validation, `git diff --check`, and applicable boundary/debt checks.
- [x] 4.3 Restart and validate the Extensions Surface in a real Electron Desktop host for both locales, Skill filtering, Computer Use/MCP contribution presentation and absence of builtin capability claims.
- [x] 4.4 Perform the Neko quality review across responsibility, dependency, interface, extension and testing layers; record residual risk.
