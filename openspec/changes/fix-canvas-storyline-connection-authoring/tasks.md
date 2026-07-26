## 1. Regression contracts

- [x] 1.1 Add failing shared tests proving playable nodes expose incoming/outgoing authoring endpoints and explicit sequence edges are the only default Storyline transitions
- [x] 1.2 Add failing Store tests for valid Media sequence creation, duplicate/self/cycle rejection, branch/merge support and validated connection type updates
- [x] 1.3 Add failing Webview tests for input-handle/card drop resolution, cancellation and target feedback

## 2. Canonical connection mutation

- [x] 2.1 Introduce a package-local connection draft validator with stable rejection reasons and shared create/update use
- [x] 2.2 Remove duplicated Store pending-connection state/actions and submit complete drafts from the pointer session
- [x] 2.3 Make invalid InlineConnectionEditor type changes visible while preserving the original connection

## 3. Canvas connection interaction

- [x] 3.1 Add stable incoming and outgoing default authoring endpoints for playable nodes without rewriting existing Media `out` endpoints
- [x] 3.2 Extend the connection drag hook to resolve compatible input handles and snap target cards to node-scoped sequence endpoints
- [x] 3.3 Project active valid/invalid connection targets through InfiniteCanvas and BaseNode with accessible labels

## 4. Storyline topology

- [x] 4.1 Project only enabled sequence connections and explicit sequence-Group adjacency as playback transitions
- [x] 4.2 Derive deterministic connected route candidates, isolated units, branches and merges without selection-dependent synthetic edges
- [x] 4.3 Update Storyline graph/layout and controller fixtures for independent components and authored topology

## 5. Verification and delivery

- [x] 5.1 Run focused shared, Store, hook/component and Storyline tests plus affected typecheck/build
- [x] 5.2 Run OpenSpec strict validation, diff checks and applicable legacy/unused quality gates
- [x] 5.3 Validate Media-to-Media sequence authoring and Storyline update in an isolated Extension Development Host with the VS Code debugger
- [x] 5.4 Record verification evidence, residual risks and staged commit boundaries
