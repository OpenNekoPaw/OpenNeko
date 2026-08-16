## 1. Correct the architecture contract

- [x] 1.1 Keep the global Media Library, target-free project binding and managed Workspace link as mount-management owners while collapsing content identity to one workspace-file path.
- [x] 1.2 Specify deterministic `.neko` initialization/recovery, exact-link adoption, conflict diagnostics and no silent authorization.
- [x] 1.3 Correct architecture/domain documents that describe either the Workspace link or a second Media Library locator as the content authority.

## 2. Collapse content identity to one workspace-file path

- [x] 2.1 Remove `MediaLibraryContentLocator` and media-library dispatch/handlers/serializers across Content, Canvas, Cut, Entity, Search, Resource Browser, Text Editor, packaging and Agent.
- [x] 2.2 Convert resource/search/portable/reference producers to emit normalized `neko/assets/<libraryName>/<relativePath>` workspace-file paths.
- [x] 2.3 Keep the binding-backed workspace path authorizer as the only mount-aware boundary, preserving symlink escape protection and fail-local diagnostics.

## 3. Restore user-facing resource operations

- [x] 3.1 Restore separate “associate global Media Library” and “add directory to global Media Library” operations.
- [x] 3.2 Make new-directory registration plus project association atomic and keep project removal separate from global removal.
- [x] 3.3 Repair Media Library root/child identity, flatten search results and reject malformed hierarchy at the Resource Browser contract boundary.

## 4. Restore consumer boundaries

- [x] 4.1 Convert Canvas, Cut, Entity, Search, Preview, document-entry and portable package consumers to the single workspace-file path.
- [x] 4.2 Add the single binding-backed workspace path authorizer and delete direct physical-target and media-library bypasses.
- [x] 4.3 Keep Agent attachment/mention/tool inputs on sender-bound workspace-file locators and verify unmanaged/nested escapes remain denied.

## 5. Initialization, sync and packaging

- [x] 5.1 Reinitialize missing `.neko` binding storage without modifying project facts; adopt an existing link only when it matches one exact global connection.
- [x] 5.2 Ensure sync, hashing and normal packaging exclude `.neko`, link entries and external target bytes.
- [x] 5.3 Restore explicit portable snapshot behavior using workspace-relative references and atomic staged rewriting.

## 6. Verification

- [x] 6.1 Add path-level tests for both user operations, binding/link reconciliation, hierarchy closure, Agent access and fail-local diagnostics.
- [x] 6.2 Run focused package/type/boundary/OpenSpec gates and the applicable key-free Agent Evaluation suite.
- [ ] 6.3 Run visible Electron validation for global selection, directory registration, project reopen after `.neko` deletion, Resource Browser browsing and Agent reading; record platform/provider blockers.
