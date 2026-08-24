## 1. Contract And Producer

- [x] 1.1 Add `@neko/preview-node` and declare its package role and dependencies.
- [x] 1.2 Implement one canonical EPUB archive-to-resource-tree publisher with container validation and lease-owned disposal.
- [x] 1.3 Add producer tests for trailing-slash URL, entry media types, missing container failure, publication failure disposal and source release.

## 2. Consumer Cutover

- [x] 2.1 Replace Desktop Preview's private EPUB archive branch with `@neko/preview-node`.
- [x] 2.2 Add the Asset Center resource-tree port and Desktop trust-boundary wiring.
- [x] 2.3 Add consumer path tests proving EPUB cannot reach `registerFile` and ordinary files cannot reach the EPUB publisher.
- [x] 2.4 Delete the replaced private EPUB implementation and verify there is no parallel successful path.

## 3. Verification And Delivery

- [x] 3.1 Run focused Preview Node, Assets Node and Desktop tests/typechecks.
- [x] 3.2 Run package-role/boundary checks, strict OpenSpec validation and `git diff --check`.
- [x] 3.3 In visible Electron, select a valid Media Library EPUB and verify the EPUB Viewer renders through the trailing-slash resource tree; inspect an adjacent ordinary-file Preview path.
- [x] 3.4 Record quality review findings, UI evidence and remaining risks in `verification.md`.
