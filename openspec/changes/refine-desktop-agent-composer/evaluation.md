## Evaluation Scope

- Change/feature: Desktop Agent composer presentation, exact model-purpose selection UI, execution-mode descriptions, and catalog-derived Skill suggestions.
- Decision and owning suite: `excluded`; deterministic Webview and Desktop component suites own this projection-only behavior.
- Why real Evaluation is or is not required: the change does not modify provider/model resolution, effective runtime configuration, prompt/Skill injection, Tool registration, permission policy, AgentSession composition, or event projection. Existing callbacks and send payload contracts remain the runtime boundary.
- Canonical path and forbidden fallback: `AgentWebviewRoot` → `ConversationController` → `InputArea` → existing exact model/understanding/generation callbacks. Tests reject model-pool multi-selection, select-all, fabricated Skills, automatic send, and a full-access execution mode.

## Cases

- Reused, updated, created, or excluded: excluded from provider-backed Evaluation; updated deterministic `InputArea`, `EmptyState`, `ConversationController`, `ModeSelector`, and Desktop surface coverage.
- Evidence and coverage: exact `agent.main`, media understanding, media generation, `auto`, and `none` identities are asserted independently; busy state locks model configuration; Skill selection produces an unsent `$<skill-name>` entry.
- Missing observability: none for the changed UI contract. Effective provider/model runtime evidence is unchanged and therefore outside this change's coverage delta.

## Verification

- Key-free validation: full `@neko-agent/webview` suite (95 files, 736 tests), production build, affected Desktop surface test/typecheck, Agent boundary check, strict OpenSpec validation, targeted ESLint, and diff check.
- Host validation: the packaged Electron Desktop verified the compact empty state, four catalog-derived Skills, unsent Skill prefill, and unified model trigger. An Extension Development Host opened the isolated `neko-test` workspace and verified the shared narrow Webview, exact Chat/Image model radios, automatic understanding, optional generation, execution descriptions, and preserved direct-image model/ratio/resolution rail.
- Real cases and reports: no provider-backed case run because no Agent runtime behavior changed.
- Blocked or unexecuted cases: provider credentials, network access, model execution, and output quality are intentionally unexercised.

## Interpretation

- Result and quality comparison: deterministic tests prove the new projection preserves the existing exact-selection and send contracts.
- Confirmed failures vs attribution hypotheses: no Agent behavior failure was observed; Desktop and VS Code host acceptance passed for the scoped presentation paths.

## Residual Risk

- Host-level validation covered the default theme and current narrow Dock/sidebar widths. Keyboard-only focus cycling, alternate VS Code themes, and extremely narrow resized layouts remain unexercised; they are presentation risks, not provider/model-routing risks.
