## 1. Regression Contract

- [x] 1.1 Change the NativeMediaEngine test double to the Node 24 CommonJS dynamic-import namespace shape
- [x] 1.2 Run the focused test and capture the existing named-export failure

## 2. Canonical Native Module Boundary

- [x] 2.1 Add one validated lazy NativeEngine creation boundary
- [x] 2.2 Route NativeMediaEngine, ExportService, and VideoFrameProvider through the boundary
- [x] 2.3 Add invalid-module diagnostic coverage and remove duplicate namespace assertions

## 3. CI Packaging Prerequisite

- [x] 3.1 Add a release grouping regression assertion that TS VSIX packaging excludes the native Engine
- [x] 3.2 Remove Engine from the TypeScript-only package group while retaining platform-specific release ownership

## 4. Validation

- [x] 4.1 Run focused Engine extension and workflow orchestration tests
- [x] 4.2 Run Engine build, OpenSpec validation, and applicable repository quality gates
- [x] 4.3 Restart the Extension Development Host and verify Engine ready plus Cut media responses
