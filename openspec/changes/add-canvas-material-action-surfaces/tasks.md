## 1. Shared contracts and projection

- [x] 1.1 Add the optional portable Media `generationContext` contract and strict shape validation helpers.
- [x] 1.2 Project GeneratedAsset prompt/model/source metadata into Workspace Board Media nodes without runtime identities.
- [x] 1.3 Add shared projection and validation regression tests for new and legacy generated nodes.

## 2. Webview material capabilities

- [x] 2.1 Implement a pure source-aware material presentation resolver for Media and generated Shot nodes.
- [x] 2.2 Replace generic no-op edit with capability-backed edit, preview, duplicate, AssetLibrary promotion, and fullscreen toolbar actions.
- [x] 2.3 Add the lower generated-material context surface and route valid quick actions to the existing GenerationPromptPanel target.
- [x] 2.4 Add localized labels and deterministic resolver, toolbar, dispatch, and context-surface tests.

## 3. Extension Host material operations

- [x] 3.1 Add typed Webview action messages for AssetLibrary promotion and image editing.
- [x] 3.2 Resolve ResourceRef, DocumentArchiveResourceRef, or persistent asset path through the existing authorized content boundary.
- [x] 3.3 Invoke existing AssetLibrary and Sketch capabilities with visible failure diagnostics and add path-level protocol tests.

## 4. Validation and delivery

- [x] 4.1 Run focused shared, Webview, and Extension tests plus affected package typecheck/build.
- [x] 4.2 Validate the selected-node actions and generated-context layout in the running Extension Development Host with the VS Code debugger skill.
- [x] 4.3 Run OpenSpec validation, `git diff --check`, and the Neko quality review; record Agent Evaluation exclusion and residual risks.
