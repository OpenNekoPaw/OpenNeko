## 1. Canvas Action Contract

- [x] 1.1 Extend the canonical Canvas material-action descriptor with a validated JSON-safe execution payload and reject payloads that differ from the currently resolved descriptor.
- [x] 1.2 Add distinct `cut:open` and `cut:add-resource` descriptors with media-kind filtering, localized labels, and producer/contract tests.

## 2. Cut Handoff

- [x] 2.1 Add Desktop Cut target projection for the exact docked Cut View or exact new-draft Workbench and test that hidden/recent targets are not selected.
- [x] 2.2 Wire Canvas audio/video execution to Cut target revalidation, draft creation when required, and the existing Cut media append path.
- [x] 2.3 Add stale-target, unsupported-media, idempotency, and source-preservation tests proving no alternate Cut or OTIO mutation path is used.

## 3. Canvas Toolbar

- [x] 3.1 Replace fixed first-N action partitioning with canonical action-ID presentation tiers for creative, preview, and management actions.
- [x] 3.2 Group Media Library destinations in overflow, rename node duplication, and add Webview tests for video, OTIO, generated, and multi-selection layouts.

## 4. Verification

- [x] 4.1 Run focused Canvas domain/Webview, Cut node/Desktop, contract, typecheck, lint, OpenSpec strict validation, and `git diff --check` commands.
- [x] 4.2 Run the authoritative Desktop UI scenario and capture evidence that Add to Cut, Open Cut, inline playback, overflow grouping, new-draft creation, and stale-target failure match the specification.
- [x] 4.3 Apply the Neko quality review, record canonical-path evidence, and document any unexecuted checks or residual risks.
