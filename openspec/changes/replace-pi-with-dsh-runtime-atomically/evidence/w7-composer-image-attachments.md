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
- Therefore provider-backed visual perception, settled screenshots and a full application-restart replay remain unverified. Component, Host or key-free evidence is not promoted to visual/model-quality evidence.

### Residual risk

- A visible full Desktop run with an explicitly authorized real vision provider is still required to prove pixel understanding rather than transport alone.
- The Desktop scenario must pass its existing Entry Agent Root precondition before the paste assertions and screenshots can produce authoritative UI evidence.
- Task 7.14 remains unchecked until that visible provider lane and a real Session restart replay pass.
