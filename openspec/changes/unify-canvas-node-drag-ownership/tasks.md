## 1. Node Drag Contract

- [x] 1.1 Add a regression test proving ordinary node content starts the owning node gesture and native content drag is canceled
- [x] 1.2 Add focused policy coverage proving explicit controls and drag-block surfaces still reject node movement

## 2. Canonical Implementation

- [x] 2.1 Make `BaseNode` cancel browser-native drag initiation for all node descendants
- [x] 2.2 Remove broad ordinary-content drag blockers from composable and legacy node bodies while preserving explicit interaction surfaces

## 3. Verification

- [x] 3.1 Run focused Canvas drag and content tests
- [x] 3.2 Run the Canvas Webview build and applicable functional Webview acceptance, recording any environment blocker
