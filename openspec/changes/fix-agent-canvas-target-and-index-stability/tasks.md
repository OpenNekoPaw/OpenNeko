## Tasks

- [x] Implement explicit Board `AgentCanvasTurnIntent` projection in `ChatWorkspace.projectWorkspaceCanvasTurnTarget` and update focused unit tests.
- [x] Implement exact Draft-to-Tab Canvas selection handoff in `ConversationController` and add a focused out-of-order event test.
- [x] Stabilize Canvas catalog effects in `ChatWorkspace` and `ConversationController` around Workspace identity; add a streaming rerender no-reload test.
- [x] Add deterministic sorting with an exact tie-break to `CanvasWorkspaceIndexService.readCatalog` and update/add tests.
- [x] Bind selected Board/exact Canvas query schemas to the Turn's exact `document_path`, name the canonical query operation in the Turn prompt, and exclude `.nkc`/`.otio` from generic Read guidance.
- [x] Add path-level tests for Board/exact schema binding and the absence of stale binding when no Canvas context is selected.
- [x] Run focused Canvas target/index tests, typecheck, key-free Agent Evaluation, and OpenSpec strict validation.
