## Verification summary

- Risk classification: L3. The change affects Agent permission waiting, media-provider transport behavior and fresh provider defaults.
- Quality review: no blocking findings. The implementation keeps confirmation lifecycle in the Agent runtime, HTTP behavior in the NewAPI adapter and provider defaults in Host settings. No Desktop composition-root business logic or provider fallback path was added.

## Commands and results

- `openspec validate align-agent-auto-mode-and-media-http-timeout --strict` — passed.
- Affected package tests for Agent contracts/runtime/Webview, Host and AI SDK — 303 files and 2,526 tests passed.
- Focused confirmation tests — proved default `ask`, no elapsed-time settlement after ten simulated minutes, exact late approval, publication failure cancellation, AbortSignal cancellation and controller-owner cancellation.
- Affected package typechecks plus `@neko/agent-webview` build — passed.
- Focused ESLint over changed TypeScript files — 0 errors; 3 existing regular-expression warnings in unchanged NewAPI download validation code.
- `pnpm test:agent:eval` — 45 files and 307 assertions passed; all 25 suites and 74 cases passed dry-run validation. Existing `media-tool-terminal-result` and `tool-approval-visible` cases retain explicit confirmation on the canonical default profile.
- `pnpm check:agent-boundaries` — passed with no findings.
- `pnpm check:application-boundaries` — passed with no findings.
- `pnpm check:package-boundaries` — passed with no findings.
- `pnpm check:no-internal-versioning` — passed with no new occurrences.
- `pnpm check:openspec` — all 84 OpenSpec items passed strict validation.
- `git diff --check` — passed.

## Unexecuted evidence and residual risk

- A paid real-provider Agent image-generation evaluation was not executed because no explicit provider/model and cost authorization was supplied for this validation run. Key-free workflow coverage proves the canonical confirmation step remains present; it is not real Agent behavior acceptance.
- A visible Electron approval left open for more than five wall-clock minutes was not executed. The registry test advances ten simulated minutes and verifies that no timer settles the approval, while the existing visible approval scenario remains indexed for a real Desktop run.
- The image transport suite validates the exact ten-minute Undici dispatcher configuration and cleanup deterministically; it does not keep a real provider connection open for ten minutes.
- Approval does not survive a full Agent controller shutdown: disposal is an explicit owner cancellation and resolves pending approval as not approved. Renderer reload without controller disposal remains covered by the existing visible scenario contract.
- Existing persisted provider URLs remain authoritative and are not rewritten. The canonical `https://www.nekoapi.com` URL applies to fresh built-in gateway defaults; custom NewAPI endpoints remain unset until configured.
