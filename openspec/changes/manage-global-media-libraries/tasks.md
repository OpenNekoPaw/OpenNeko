## 1. Contract and host composition

- [x] 1.1 Upgrade Desktop Home Management to v4 with strict add, remove, and reveal request/result contracts
- [x] 1.2 Wire mutation channels through preload, IPC, AppHost, and sender/endpoint validation
- [x] 1.3 Add Electron composition-root adapters for native directory selection, staged directory copy, and system trash

## 2. Global media-library domain path

- [x] 2.1 Implement validated direct-child library identity and path resolution
- [x] 2.2 Implement staged import with conflict and symbolic-link rejection
- [x] 2.3 Implement trash and reveal operations with fail-visible stale-target handling
- [x] 2.4 Exclude reserved staging directories from global library and asset projections

## 3. Asset-center interaction

- [x] 3.1 Add localized add and refresh controls to the media-library facet
- [x] 3.2 Add per-library reveal and confirmed remove actions with serialized pending state
- [x] 3.3 Refresh the current query projection after successful add or remove and show mutation diagnostics

## 4. Verification

- [x] 4.1 Add strict contract and legacy-version rejection tests
- [x] 4.2 Add runtime tests for cancel, atomic import, conflict, symlink, trash, reveal, and path escape
- [x] 4.3 Add IPC/preload/AppHost and Renderer interaction regression tests
- [x] 4.4 Run affected package tests, typecheck/build, diff checks, and applicable Electron Webview runtime validation
- [x] 4.5 Perform Neko quality review and record any blocked full-repository gates or residual risks
