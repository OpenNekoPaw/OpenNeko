# Evaluation Evidence

## Evaluation Scope

- Change/feature: move current Character Dialogue, Embody, evidence, profile and purpose-model behavior into `@neko/chara`.
- Decision and owning suite: `create`; a future target-scoped `character.role-session` suite is required because no indexed suite owns VS Code Character role-session behavior.
- Why real Evaluation is required: the move touches character purpose-model routing, session behavior, cancellation and result projection even though the intended output is unchanged.
- Canonical path: VS Code user entry -> Agent Chat shell/router -> `@neko/chara/host-vscode` -> Chara application/core -> injected configured purpose-model runtime -> Chara transcript/projection.
- Forbidden fallback: direct Chara/Agent session construction by Evaluation, mock responder acceptance, old `@neko/entity` Character runtime, old Agent Extension controller/evidence path, ordinary Agent chat fallback.

## Cases

- Canonical positive: start a stable Character identity, send one roleplay message, observe Chara-owned session identity and configured purpose-model evidence, then exit.
- Failure: request a missing/stale Character identity and assert fail-visible diagnostic with no role session and no ordinary chat fallback.
- Evidence required: Character run/session identity, Chara host/application path marker or neutral runtime fact, effective purpose-model identity, transcript turn, terminal state and absence of retired path.
- Missing observability: current TUI debug automation has no CharacterRun/role-session input operation or Chara session facts.

## Verification

- Key-free validation: `pnpm test:agent:eval` passed 39 files / 278 tests; all-suite dry-run passed 23 suites / 48 cases.
- Deterministic package validation:
  - `@neko/chara`: 10 files / 77 tests passed.
  - `@neko/entity`: 11 files / 44 tests passed.
  - `@neko-agent/extension`: 79 files / 591 passed / 6 skipped.
  - Agent architecture guard: 58 tests passed.
  - Full workspace `pnpm test`: 26 Turbo tasks passed.
- Build and boundary validation:
  - `pnpm build` and `pnpm build:neko-agent` passed.
  - Chara, Entity and Agent Extension strict TypeScript checks passed.
  - `pnpm check:quality`, dependency-cruiser, Agent/application/content boundaries, strict OpenSpec and diff checks passed.
  - Chara-scoped Knip passed with zero findings. Repository-wide Knip remains red on pre-existing debt (61 unused files, 1 unused dependency, 1 unused dev dependency and 600 unused exports) and reports no Chara finding.
- Real cases and reports: blocked until the canonical TUI can originate Character role-session behavior without direct runtime injection.

## Interpretation

- Passing deterministic tests will prove code ownership, dependency direction and behavior-preserving module migration.
- It will not prove provider-backed roleplay quality or the complete real Agent path.

## Residual Risk

- Character roleplay remains exposed only through the VS Code Chat surface, so the repository Evaluation platform cannot yet produce canonical provider-backed evidence.
- Existing role-session Webview projection and shared `Npc*` DTO remain outside `@neko/chara` in this phase and require later contract/UI composition work.
- No Extension Development Host visual run was performed because this change preserves the Webview protocol and renderer and only relocates Host/runtime ownership; the residual risk is VS Code command-to-Chara wiring beyond deterministic router/controller tests.
