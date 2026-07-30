## 1. Contract and storage boundary

- [ ] 1.1 Add a dedicated global Media Library connection root to the shared storage layout
- [ ] 1.2 Replace Home Management v4 mixed asset facets with v5 independent Media Library and Asset Library contracts
- [ ] 1.3 Add exact parser tests that reject v4 copy/trash payloads and absolute target projection

## 2. Media Library connection runtime

- [ ] 2.1 Replace the directory-copy helper with managed symlink/junction create, list, unlink and reveal operations
- [ ] 2.2 Project connected roots and their directory/file hierarchy without creating Asset Library items
- [ ] 2.3 Update Resource Browser runtime, AppHost, IPC, preload and Electron composition to use connection-only mutations
- [ ] 2.4 Add path-level tests proving add does not copy and remove does not trash or modify target contents

## 3. Independent Asset Library

- [ ] 3.1 Restrict global Asset Library search to its owned asset root
- [ ] 3.2 Split Home UI state, actions, labels and empty states between Media Library and Asset Library
- [ ] 3.3 Add UI regression tests proving connected files never appear as assets

## 4. Cleanup and validation

- [ ] 4.1 Delete the copy staging prefix, import helper and physical-library trash path
- [ ] 4.2 Run strict OpenSpec validation, focused tests, Desktop typecheck/build and affected quality checks
- [ ] 4.3 Review the packaged Electron flow without using VS Code Debugger and document residual provider/file-operation limits
