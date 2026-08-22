# W7 DSH Reasoning Profile Evidence

Date: 2026-08-22

## Scope And Canonical Path

- User-visible behavior: the retained Agent Webview renders its existing `思考过程` row only when the provider-backed DSH turn publishes real reasoning content.
- Canonical path: Host provider/model catalog -> `@neko/host/settings` capability projection -> Desktop DSH `llm-pi-ai` model profile -> DSH provider execution -> DSH reasoning block/delta -> `@neko/dsh-bridge` `agent_thought_chunk` -> `@neko/agent-runtime` thought projection -> existing Agent Webview presentation.
- Host `none` maps to DSH `off` with a `null` wire value. The remaining canonical effort names are preserved exactly.
- Models without explicit Host reasoning-effort support publish `reasoningEfforts: false`; this prevents the installed DSH catalog from becoming a second model-capability authority.
- Forbidden alternatives: no model-name, endpoint, provider-default or thinking-budget inference; no provider stream reader; no placeholder thought, hidden chain-of-thought synthesis or Webview replacement.

## Deterministic Evidence

- Official reasoning-capable Host models project the complete canonical effort catalog as `off`, `minimal`, `low`, `medium`, `high` and `xhigh`.
- A custom gateway projects only its explicit effort metadata and does not inherit additional DSH levels.
- A non-reasoning model explicitly strips inherited DSH reasoning metadata.
- Existing bridge tests prove DSH reasoning deltas become ACP thought chunks without mixing them into assistant text.
- Existing runtime tests prove transient/final reasoning reconciliation and stale-reasoning removal.
- Existing Webview tests prove streaming and final thought content use the retained `思考过程` presentation.

## Agent Evaluation Disposition

- Decision: `reuse` the existing `agent-runtime.stream-delivery` suite owner. This change supplies model-profile admission for the already-owned reasoning stream and does not create a second Evaluation suite or direct provider runner.
- Current real-provider blocker: a safe projection-only audit of the authoritative `~/.neko/config.toml` found zero configured models with explicit reasoning-effort support. The selected `nekoapi-chat/gpt-5.6-luna` model projects `supportsReasoningEffort: false`.
- The audit exposed only provider/model identities and capability projection; it did not read, print or rewrite credentials.
- No real reasoning pixel is claimed. OpenNeko must not infer support or modify user configuration merely to make this Evaluation pass.

## Verification

- `@neko/app-desktop` focused provider projection: 1 file / 7 tests passed.
- `@neko/host` capability projection: 1 file / 17 tests passed.
- `@neko/dsh-bridge` event adaptation: 1 file / 22 tests passed.
- `@neko/agent-runtime` DSH projection: 1 file / 23 tests passed.
- `@neko/agent-webview` retained presentation: 1 file / 28 tests passed.
- `@neko/dsh-bridge`, `@neko/agent-runtime` and `@neko/agent-webview` typechecks passed.
- Agent Evaluation key-free harness: 45 files / 314 tests passed; all-suite dry-run passed for 26 suites / 71 cases, including the two-case `agent-runtime.stream-delivery` owner. This proves Evaluation infrastructure and declared coverage only, not real-provider reasoning pixels.
- Strict OpenSpec validation, focused ESLint, Prettier and `git diff --check` passed.
- Desktop typecheck passed after confirming the canonical handler fixture exposes only `executeDocumentTool`.
- Desktop package build reached the authoritative Forge ownership guard and was not run because process `34497` already owns this checkout's Vite bundle. The running user Desktop process was preserved.

## Residual Risk

- The currently selected real model will continue to show no thought row unless its authoritative Host capability metadata explicitly declares reasoning efforts and the provider actually returns reasoning content.
- The product currently has no separate user-selected reasoning-effort control in the DSH composer path. This focused change advertises only truthful capability; adding such a control would require a separate contract and UX change.
- Real provider reasoning pixels remain unverified. Deterministic coverage proves the complete admission and presentation chain without fabricating provider behavior.
