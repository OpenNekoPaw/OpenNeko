## Evaluation Scope

- Change/feature: remove Engine-owned ML/perception tools and retain provider-owned Agent perception.
- Decision and owning suite: `reuse` `agent-runtime.perception-routing` for provider routing; deterministic Engine provider tests own the VS Code extension tool catalogue boundary.
- Why real Evaluation is required: generic perception routing can change Agent behavior, but the exact removed surface is registered by a VS Code extension that the canonical TUI runner does not load.
- Canonical path: provider-backed Agent perception or native model vision; Engine capability provider exposes only effects, loudness analysis, and video frame extraction.
- Forbidden fallback: local `EngineClient.perception`, `models:transcribe`, or a successful removed-tool no-op.

## Cases

- Reused: `external-perception-when-chat-differs` and `native-vision-without-perception-tool` from `agent-runtime.perception-routing`.
- Deterministic boundary coverage: Engine capability provider exact tool list and retained dispatch groups; Agent runtime assembly absence of local Engine perception clients; media-closure source assertion rejects removed client groups.
- Missing observability: TUI facts cannot identify a VS Code Engine extension provider catalogue because that host is outside the TUI process.

## Verification

- Key-free validation: `pnpm test:agent:eval` passed 274 tests and all-suite dry-run for 23 suites / 43 cases.
- Focused dry-run: both indexed `agent-runtime.perception-routing` cases validated successfully.
- Deterministic tests: focused Engine/Agent provider tests passed as part of the 92-test pruning regression set.
- Real provider-backed case: not executed; it would validate generic provider behavior but cannot prove the VS Code Engine extension catalogue boundary.

## Interpretation

- Confirmed: removed Engine ML routes are absent from the TypeScript client and Engine provider registration; retained Agent perception remains provider-owned.
- Blocked attribution: no real TUI claim is made for VS Code extension registration because the runner cannot observe that host catalogue.

## Residual Risk

- A future VS Code Agent functional scenario should expose the registered capability catalogue as neutral host evidence and assert that removed Engine ML tools are absent.
