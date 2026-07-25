# Evaluation Evidence

## Evaluation Scope

- Change/feature: restore Character Dialogue/Embody model configuration after the Chara ownership
  refactor by establishing explicit `character.dialogue` and `character.profile` bindings through a
  user-confirmed VS Code Host flow.
- Decision and owning suite: `create`; the future target-scoped `character.role-session` suite recorded
  by `extract-neko-chara-domain-package` remains the correct owner. No indexed suite currently drives
  VS Code Character role-session input.
- Why real Evaluation is required: the change affects provider/model selection and the model-readiness
  boundary before Character session execution.
- Canonical path: VS Code Character entry/message -> Chara controller readiness port -> Agent Host
  Character purpose configurator -> validated Platform purpose persistence -> Chara semantic responder
  -> exact Pi `character.dialogue` model.
- Forbidden fallback: active Agent conversation model, `agent.main`, `default_models.llm`, first
  compatible catalog model without confirmation, legacy Platform chat, direct Evaluation session
  injection or mock responder acceptance.

## Cases

- Reused, updated, created, or excluded: `create` remains blocked pending a canonical Character
  role-session TUI operation and neutral Chara session/purpose-model runtime facts.
- Canonical positive: start a stable Character identity without existing Character purpose bindings,
  explicitly select a compatible model, observe both independent persisted keys, send one roleplay
  message and observe the exact effective `character.dialogue` model plus Chara session identity.
- Boundary/failure: cancel the model selector and assert no purpose write, role session/tab, responder,
  ordinary Agent turn or fallback model.
- Deterministic evidence: ConfigManager persistence/rejection tests, Host configurator selection and
  poisoned-fallback tests, Chara launch/route readiness tests, and ChatProvider composition/typecheck.
- Missing observability: the external Evaluation TUI cannot originate VS Code Quick Pick or Character
  role-session input and exposes no Chara session/effective Character purpose facts.

## Verification

- Key-free validation: `pnpm test:agent:eval` passed with 39 files / 280 tests and 24 suites /
  53 cases in dry-run. This validates the harness and manifests, not provider-backed Character
  behavior.
- Deterministic package validation:
  - Platform: 40 files / 314 tests.
  - Extension: 62 files / 457 tests.
  - Chara: 10 files / 81 tests.
  - Chara and Extension strict TypeScript passed.
  - `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:unused`, strict OpenSpec validation and
    `git diff --check` passed.
- Extension Development Host black-box validation:
  - Host/configuration: VS Code `Debug Dev (All)` with the synthetic `neko-test` workspace and a
    temporary isolated `HOME`; the isolated config exposed only local Ollama `gemma4:latest` and no
    Character purpose binding.
  - Cancellation: selecting confirmed Character `小橘` opened `Select a Character roleplay model`;
    Escape produced `Character model selection was cancelled.`, created no Character tab and wrote
    no purpose binding.
  - Persistence: selecting `Ollama Local / gemma4:latest` created the Character tab and wrote exact,
    independent `character_dialogue` and `character_profile` entries only in the isolated config.
    The real `~/.neko/config.toml` modification timestamp remained unchanged.
  - Runtime: after supplying the local Pi model metadata and local Ollama-compatible `/v1` fixture,
    one Character Dialogue turn completed with the visible response `你好，我叫小橘。`; no Agent/default
    model fallback participated.
  - Cleanup: the Extension Development Host was stopped, the temporary launch override was reverted
    and the isolated generated data was moved to Trash.
- Real cases and reports: blocked by the missing canonical TUI Character entry and runtime facts. Direct
  Chara construction or mock completion is not substituted.

## Interpretation

- Deterministic tests can prove explicit selection, atomic persistence, Chara gating and absence of
  reachable Agent/default-model fallbacks.
- They cannot prove provider-backed roleplay output quality or the full VS Code Quick Pick to real model
  response path; Extension Development Host evidence is required separately for the current VS Code-only
  workflow.

## Residual Risk

- Real external Evaluation remains unavailable until the TUI owns a canonical Character role-session
  operation and neutral runtime observability.
- Provider credentials are validated by the existing Pi runtime after binding setup; a missing credential
  remains a visible external-provider failure and does not select another model.
- The current Webview showed the completed roleplay response and a completed Tab status but retained the
  disabled `正在回答...` input state after the turn. This is a separate Tab/Projection render-state
  defect in overlapping Webview work, not a purpose-binding fallback; multi-turn UI acceptance remains
  open until that owning change clears the terminal busy state.
- The documented Ollama `/api` endpoint and `requires_api_key = false` metadata did not directly satisfy
  the Pi completion adapter during this run; the isolated fixture required an OpenAI-compatible `/v1`
  endpoint and a non-sensitive placeholder key. This provider-contract inconsistency remains outside
  the scoped Character purpose-binding repair.
- Platform's standalone test-fixture `tsc` remains blocked by five pre-existing fixture type errors
  (`modelGroups`, provider `displayName`, and Node fetch `preconnect`).
- `pnpm check:legacy-debt` remains blocked by four pre-existing
  `rejectLegacyMediaPathRequest` matches in `packages/neko-quality`; the scoped change added no blocking
  legacy-debt match.

## Quality Review

- Risk: L3 because provider/model routing and the Character AI workflow changed.
- Responsibility: Chara owns the readiness gate, Platform owns validated persistence, and the VS Code
  Host owns user selection. No Webview model-state owner or parallel model runtime was introduced.
- Dependency/interface: the injected Chara port remains provider-neutral; Platform persists exact refs;
  the Host configurator composes existing catalog and config contracts.
- Extension/testing: concurrent preparations are coalesced into one selector/persistence operation, and
  tests poison Agent/default-model fallback paths.
- Findings: no blocking or scoped suggestion finding. The post-turn Webview busy-state and Ollama
  provider-contract inconsistencies above remain explicitly unclosed and are not represented as success.
