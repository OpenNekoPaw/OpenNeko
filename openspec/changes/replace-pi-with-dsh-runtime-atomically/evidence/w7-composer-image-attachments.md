# W7 Composer Image Attachments

Date: 2026-08-22

## Planned canonical path

```text
user paste/file selection
  -> @neko/agent-webview typed inline image input
  -> sender-bound DSH Session Host submit
  -> Desktop image admission + normalization
  -> ACP Prompt or exact live inbox
  -> DSH AttachmentStore native ImageBlock
  -> current model + durable Session replay token
```

The replaced failure path is the retained Composer accepting a pasted `MessageAttachment` while the DSH adapter silently omitted `attachments` and submitted only text. The fix must reject malformed, unsupported, oversized or non-vision input before Prompt publication and restore the draft; it must not call the retired Pi attachment projector or fabricate text.

## Evaluation scope

- Disposition: `update` `agent-runtime.perception-routing` because the suite already owns native image delivery and no-perception fallback.
- Positive behavior: a visible Composer paste reaches one native DSH attachment under the effective vision model, and replay retains a visible image token.
- Boundary behavior: invalid or unsupported pasted image rejects the current submit, preserves the draft, and emits no text-only Prompt.
- Canonical evidence: exact Conversation/DSH Session identity, effective model receipt, native image attachment path, terminal Turn state and no retired attachment projector.
- Required runtime: visible full Desktop with a real provider. Key-free tests and deterministic bridge/Host tests are necessary but do not prove model perception.

## Verification

### Deterministic contract and runtime evidence

- `@neko/agent-webview` projects pasted PNG/JPEG/WebP/GIF Data URLs into the required `DshComposerSubmitInput.images` field. The Composer attachment control is enabled, and a rejected async submit restores both the text and the pasted image token.
- `@neko/agent-contracts` strictly decodes canonical base64, exact supported MIME, four-image count, per-image source bytes and total inline bytes before accepting the sender-bound request.
- Desktop Main admits inline bytes without fabricating a Workspace path, applies the effective model modality gate, normalizes the image, and publishes the ordered native ACP image block for both a normal Prompt and the exact running-Session inbox.
- `@neko/dsh-bridge` persists the admitted bytes in the DSH AttachmentStore, stores only the attachment identity plus display name in the user-message source, and replays that identity as an opaque `openneko-dsh-attachment:` resource block. Desktop projects it back to a canonical image token without exposing bytes or a Host path.
- The previous silent path is removed: the retained Composer no longer accepts an image while submitting only `text`, `references` and `contextPayloads`.

Commands and results:

- `pnpm --filter @neko/agent-contracts exec vitest run src/dsh-session-host.test.ts src/dsh-acp.test.ts` — 32 passed.
- `pnpm --filter @neko/agent-webview exec vitest run src/dsh-session/root.test.tsx` — 23 passed.
- `pnpm --filter @neko/dsh-bridge exec vitest run src/image-prompt.test.ts src/index.test.ts` — 28 passed after the final count-boundary case.
- `pnpm --filter @neko/app-desktop exec vitest run src/main/desktop-dsh-prompt-image-admission.test.ts src/main/desktop-dsh-session-host.test.ts src/preload/dsh-session-bridge.test.ts src/renderer/DesktopAgentSurface.test.tsx` — 55 passed.
- `pnpm --filter @neko/agent-runtime exec vitest run src/application/conversation-dsh-session-publication.test.ts src/acp/dsh-acp-projection.test.ts` — 30 passed.
- Package typechecks for `@neko/agent-contracts`, `@neko/agent-webview`, `@neko/dsh-bridge` and `@neko/app-desktop` passed.
- `pnpm check:agent-boundaries`, `pnpm check:webview-boundaries`, `pnpm check:openspec` and the Desktop functional runner contract passed.

### Agent Evaluation

- `pnpm test:agent:eval` passed 314 deterministic runner/schema tests; the all-suite dry-run accepted 26 suites and 69 cases, including all six current `agent-runtime.perception-routing` cases.
- The current declarative Evaluation Scenario input exposes text submit but no clipboard/file attachment operation, so it cannot honestly express this exact user behavior. No prompt-only case was added as a substitute. The new visible Desktop functional step dispatches the public Composer paste event and asserts one native provider image part; a future public Evaluation attachment operation can move that same acceptance into `agent-runtime.perception-routing` without a direct runtime runner.

### Visible Desktop validation

- Added a visible isolated Electron step to `desktop-agent-linked-media-mention`: it pastes a real PNG `File` into the active Composer, checks the preview token, submits through the UI, requires exactly one native provider image part, and checks the completed transcript image token.
- The first development run was `infrastructure-blocked` before CDP became available. A cached rerun reached the Renderer but failed an existing precondition before the new paste step: `Entry Agent Root identity could not be captured for Draft verification.` This is an adjacent baseline/startup blocker, not passing evidence for the image behavior.
- Those script-driven runs therefore did not prove provider-backed visual perception, settled screenshots or a full application-restart replay. Component, Host or key-free evidence is not promoted to visual/model-quality evidence.
- Subsequent manual acceptance on 2026-08-22: the user confirmed image input, processing and conversation replay after restart through the real product UI. This supplies the positive human product-path evidence needed by task 7.14, while the missing exact provider/model receipts, screenshots and machine-readable report remain explicit W7 Evaluation gaps. See `w7-manual-foundational-acceptance.md`.

### Residual risk

- A script-driven visible full Desktop run with an explicitly recorded real vision provider remains required for machine-verifiable pixel-understanding evidence rather than transport alone.
- The Desktop scenario must pass its existing Entry Agent Root precondition before the paste assertions and screenshots can produce authoritative UI evidence.
- Task 7.14 is complete from deterministic plus user-confirmed manual product acceptance; tasks 10.4 and 10.7 remain open until the visible provider lane emits exact receipts and a report.

## Authorized replay thumbnail slice

### Canonical path and ownership

The replay token now carries the native DSH attachment identity plus verified MIME/byte/dimension metadata, never image bytes, a Data URL, a local path or a durable preview URL. The only successful preview path is:

```text
exact DSH user/message native ImageBlock
  -> bridge verifies the attachment is displayed by the same Session
  -> Conversation-bound ACP image read
  -> sender-bound Desktop Session Host
  -> DesktopResourceRegistry short-lived openneko://resource
  -> Webview lazy thumbnail and explicit full-preview dialog
```

Desktop rejects an attachment identity that is not present in the exact Conversation projection. The resource-tree reader rechecks returned attachment metadata before serving bytes. Conversation Surface unmount releases the exact preview view; Window teardown remains the final resource safety boundary. A failed attachment read changes only that image card to an explicit unavailable token while preserving its label and sibling transcript content.

The user-message presentation separates primary text/resource content from the attachment grid. Text remains in the first row; one image receives a bounded large preview card with an ellipsized filename, while multiple images occupy a responsive two-column grid. The same authorized URL is used only after a user gesture for the full-preview dialog. This avoids the reference screenshot's text/thumbnail horizontal competition in narrow Agent docks.

### Deterministic verification

- `pnpm exec vitest run ...` across the affected ACP contract/client, Conversation binding, DSH bridge, Desktop Host/resource registry/preload/Renderer and Agent Webview files — 193 passed in 13 files.
- Focused post-layout Webview/Desktop Surface regression — 41 passed in 2 files.
- Package typechecks passed for `@neko/agent-contracts`, `@neko/dsh-bridge`, `@neko/agent-runtime`, `@neko/agent-webview` and `@neko/app-desktop`.
- `pnpm check:agent-boundaries`, `pnpm check:webview-boundaries`, `pnpm check:content-access-boundaries`, `pnpm check:application-boundaries` and `pnpm check:openspec` passed.
- `pnpm test:agent:eval` passed 314 tests; the dry-run accepted 26 suites and 69 cases, including the six existing `agent-runtime.perception-routing` cases. The declarative Evaluation driver still has no attachment gesture and therefore is not claimed as replay-thumbnail UI evidence.

### UI validation disposition

- Applicability: applicable; this changes transcript attachment layout, loading/unavailable feedback, click interaction and a modal preview.
- Authoritative runtime: isolated Electron Desktop, because attachment reads cross DSH ACP, sender authorization, the `openneko://resource` protocol, CSP and resource lifecycle.
- Inventory: text plus one image, image-only, multiple images, loading, unavailable, click/open, Escape/close, narrow layout, and adjacent resource-token rendering.
- Deterministic component evidence covers separation of text and attachment rows, lazy thumbnail metadata, explicit full preview, local unavailable state, resource tokens and Surface release.
- The isolated `desktop-agent-linked-media-mention` run was blocked before CDP because an existing development process owned this checkout's Vite bundle (`Desktop process 95309 already owns the Vite bundle`). No current screenshot or visual pass is claimed. The report is `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-21T21-22-45.936Z-desktop-agent-linked-media-mention-development/report.json`.

### Repository-level blocked checks

- `pnpm check:no-internal-versioning` passed its 13 self-tests but the repository audit failed on the already-dirty worktree with 79 baseline-external occurrences and stale allowances across unrelated Canvas, Character, Content, project and existing DSH files. This slice adds no internal version field or version dispatch path.
- `pnpm smoke:webview` built `@neko/assets-webview`, then stopped because the existing `@neko/canvas-webview` build script produced no `dist` directory. The Agent Webview has no standalone build script; its typecheck and owning Desktop integration tests passed.
