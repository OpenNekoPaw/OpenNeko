# W7 Conversation Title And Title Bar Evidence

Date: 2026-08-22

## Scope And Canonical Path

- A native Composer Draft sends its already strict-decoded first input through the sender-bound
  create request.
- `@neko/agent-runtime/application` derives one normalized, bounded title before durable
  Conversation publication. Text, reference-only messages, Commands and Skills use the same
  projector and do not call a model.
- The DSH Conversation catalog remains the only title authority. The exact Session projection
  reads that catalog record, while Agent Home independently projects the same record for
  PrimarySidebar.
- The retained Agent Webview renders the exact published Conversation title in a fixed, centered
  top title bar. The unbound Entry Draft renders no Conversation title or placeholder bar. The bar
  has no bottom border, remains above the transcript and truncates long titles locally without
  creating another title source.
- Existing Character and Room domain-owned explicit titles retain their current publication path.
  Existing records are not rewritten or migrated.

## Agent Evaluation Disposition

Provider-backed Agent evaluation is excluded for this slice. The change does not alter prompts,
Skills, Tools, provider/model routing, turn execution, queueing or transcript projection; title
derivation is a deterministic metadata operation completed before DSH Session creation. Contract,
persistence, Desktop composition and UI tests are the authoritative implementation evidence. The
existing isolated `desktop-conversation-navigation` scenario was extended to assert the visible
canonical path instead of adding a direct runtime runner or a second test-only path.

## Deterministic Evidence

- Contract tests cover strict create-input decoding and required Session title projection.
- Runtime tests cover normalized Chinese text, reference-only messages, Commands, Skills,
  truncation, exact catalog lookup and persistence/reopen.
- Desktop Main/preload/Renderer tests cover forwarding the same first input, publishing its title,
  and returning that title through the exact Session projection.
- Webview tests cover the title bar before the transcript, projected title rendering and the
  absence of a title bar or fixed “新会话” heading on the unbound Entry Draft.
- Existing Agent Home and Desktop sidebar tests continue to render `conversation.title` from the
  catalog-backed Home projection.
- The isolated Desktop scenario now asserts that the first input, Session title bar and
  PrimarySidebar row use the identical title; it also checks a centered title, zero bottom-border
  width, at least 40px title-bar height and transcript ordering.

## UI Validation

Status: `blocked`.

- The live development Electron window was inspected directly with Computer Use. Accessibility
  exposed both the Session title heading and the matching PrimarySidebar row. After a temporary
  hot-reload blank state recovered, direct image review confirmed that the final title is centered,
  has no visible divider and keeps the transcript below it.
- On 2026-08-22 the same live window again exposed a centered long title for an existing published
  Conversation after hot reload. A later acceptance pass navigated to the Entry Draft and confirmed
  that the Entry experience begins directly with its content and renders no Conversation title bar.
  The pass then selected the `Blame` Workspace and confirmed the published Conversation title bar
  returned when the prior Conversation was reopened.
- That historical Session and its sidebar row both display their existing catalog title “新会话”.
  This proves the shared visible projection for an existing record, but it does not replace the
  isolated first-submit check for a newly derived title.
- The authoritative isolated visible scenario could not start because process `78510` already
  owned this checkout's Vite bundle. The failure occurred before CDP connection and before any
  scenario action. The existing development process was left untouched.
- Failed-run report:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-21T00-13-41.266Z-desktop-conversation-navigation-development/report.json`.

## Verification

- `pnpm exec openspec validate replace-pi-with-dsh-runtime-atomically --strict`: passed.
- `pnpm --filter @neko/agent-webview test`: passed (4 files / 47 tests).
- `pnpm --filter @neko/agent-webview typecheck`: passed.
- An isolated worktree built from the staged snapshot passed full package tests for
  `@neko/agent-contracts` (32 files / 177 tests), `@neko/agent-runtime` (51 files / 383 tests) and
  `@neko/agent-webview` (3 files / 34 tests), plus the focused Desktop Host/preload/Renderer suite
  (3 files / 44 tests).
- Typecheck passed for contracts, runtime, Webview and Desktop.
- Agent, application, package and storage-authority boundaries passed.
- Focused ESLint and `git diff --check` passed.
- The repository-wide internal-versioning audit remains blocked by existing dirty-worktree
  allowance drift and unrelated findings; this slice adds no internal version or dispatch path.

## Residual Risk

- Final visible acceptance of first-submit title derivation/synchronization, long-title ellipsis and
  narrow width remains pending until the existing development owner releases the Vite bundle and
  the isolated scenario can run. Entry-Draft no-title behavior, centered alignment, divider removal
  and transcript spacing passed direct review in the live development window.
- Historical records that were already published as “新会话” / “New conversation” remain unchanged
  by design; newly published native Composer Conversations use the first-input title path.
