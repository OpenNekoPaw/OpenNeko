## Canonical ownership inventory

| Concern                                                | Previous OpenNeko path                                        | Canonical owner                          | Implementation action                                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skill runtime shape, parsing, discovery and invocation | `agent-contracts/src/skill.ts` plus `PiSkillHost` extensions  | `@earendil-works/pi-agent-core`          | Deleted the duplicate runtime `Skill` contract and retained a thin Pi adapter for source, fingerprint, exact activation and opaque resource locators.     |
| OpenNeko Skill overlay and Host-fit/workflow metadata  | `portable-skill.ts`, `agents/neko.yaml` writer                | None                                     | Deleted contracts and writer; portable metadata cannot register Tool, provider, target or execution authority.                                            |
| Skill-driven authoring target                          | Skill metadata, launch catalog and Renderer selector          | Domain Capability/Conversation authority | Deleted metadata parsing and target projection; `$skill` stays in the current scene and Conversation.                                                     |
| Command Markdown                                       | `SkillHost` `command-artifact` branch                         | `CommandHost`                            | Added an independent catalog, fingerprint, activation identity and argument formatter; commands execute as ordinary prompts rather than Skill activation. |
| Skill script execution                                 | `PiSkillHost.executeExternalProcessor`                        | Registered process Tool                  | Deleted the Skill-specific permission/executor path and contracts.                                                                                        |
| Personal Skill management                              | Executable `SkillHostRecord` passed to install/remove UI flow | `PersonalSkillManagementRecord`          | Added an opaque management projection and removed executable locators from mutation inputs.                                                               |
| Skill creation receipt                                 | Absolute path, root id and diagnostics                        | Public `CreateSkillResult`               | Reduced to `name`, `source` and `fingerprint`; filesystem authority remains inside the creation service.                                                  |
| Personal/Workspace Skill roots                         | Generic `.neko` content layout                                | `agent-skill-layout`                     | Canonical roots are `~/.agents/skills` and `<workspace>/.agents/skills`; legacy `.neko/skills` is ignored and preserved.                                  |

## Deterministic evidence

- Agent Contracts: 44 files / 277 tests passed; typecheck passed.
- Agent Runtime: 126 files / 1,182 tests passed after the final CommandHost and management changes.
  A focused post-change run passed 4 files / 71 tests. Runtime typecheck passed before an unrelated
  concurrent Chara edit introduced the external failure recorded below.
- Agent Webview: 99 files / 764 tests passed and build/typecheck passed. The final focused composer,
  management, localization and presenter run passed 5 files / 140 tests; the locale immutability
  presenter check passed 4 tests after it was added.
- Chara: 35 files / 177 tests passed; typecheck passed at the Skill change validation snapshot.
- Local Metadata: 14 files / 90 tests passed; typecheck passed.
- Desktop focused Main/launch tests passed 63 tests; Desktop typecheck passed at the validation
  snapshot. The selected-row style regression passed 27 tests after removing the left indicator.
- Added exact same-name `/review` and `$review`, inert Host metadata, stale activation, Command
  interpolation/duplicate diagnostics, management-fingerprint revalidation, create/install byte
  preservation, staging cleanup and legacy `.neko/skills` preservation fixtures.

## Agent Evaluation

Evaluation Scope

- Decision: update `agent-runtime.skill-runtime`, `skill.storyboard`, `skill.character-creator`,
  `skill.skill-creator`, `skill.media-production` and the existing project
  `skill.evaluation-artifact-author` coverage. Pure loader, containment and localization behavior
  remains deterministic.
- Canonical path: visible Composer input -> typed exact Skill activation -> Pi SkillHost receipt ->
  current Conversation -> registered Capability/Tool when available. Forbidden paths are target
  selection/navigation from Skill metadata, name fallback, `.neko/skills`, ordinary file writing
  for CreateSkill and Character mutation without exact authority.
- Cases cover natural-language Storyboard activation, explicit `$skill`, same-domain project Skill,
  missing Capability, reviewable Character proposal with absent mutation Tool, Workspace CreateSkill
  result `source: project`, and Assistant Personal CreateSkill result `source: personal`.

Verification

- `pnpm test:agent:eval`: 45 files / 307 tests passed.
- All-suite key-free dry-run: 26 suites / 77 cases passed.
- Focused real run for `skill.skill-creator/create-personal-portable-skill` was attempted and returned
  `infrastructure-blocked` before Desktop/API execution: `Real Desktop Agent evaluation requires
explicit provider, model and cost authorization.` The redacted summary is
  `reports/agent-eval/local-run-summary.json`.
- Key-free validation and dry-run prove authoring/schema/hard-gate readiness only; they are not real
  model behavior acceptance. Usage and cost are unavailable because no API call was authorized.

## Visible Desktop UI evidence

- `desktop-extension-localization` passed in the real development Electron runtime. It verified one
  enable/disable control on each card, zero controls in detail, English/Chinese first-party
  descriptions, Browser Use `uv tool install 'browser-use[cli]'`, Cua Driver installation guidance,
  and no console errors, warnings or exceptions. Report:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-12T09-29-14.811Z-desktop-extension-localization-development/report.json`.
- Direct image-capable review inspected all four report screenshots and found no clipping, left
  selected indicator or detail-page enablement control.
- `desktop-agent-entry-workspace-skill` was attempted but failed before opening the Skill menu on an
  adjacent composer-position invariant: expected `y=343`, observed `y=421.5`. The same displacement
  predates this change. Report:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-12T09-30-04.702Z-desktop-agent-entry-workspace-skill-development/report.json`.
- Deterministic Entry/Session tests still prove `$character-creator` and `$skill-creator` remain in
  Assistant, preserve arguments, do not configure a target, do not create another Conversation and
  keep the selector closed. This does not replace the blocked visible/runtime evidence.

## Repository gates

- Passed: strict OpenSpec validation, `git diff --check`, `check:package-boundaries` (48 packages),
  `check:storage-authorities` (1,679 sources), `check:agent-boundaries` (530 files), package build and
  macOS arm64 packaging.
- `check:no-internal-versioning` was run and reported unrelated dirty-worktree findings. The Agent
  Skills `compatibility` occurrences are third-party-standard metadata and were added only to the
  external allowance inventory; the focused production scan has no unapproved Skill finding.
- `check:unused` and therefore aggregate `pnpm check` remain failed on unrelated existing unused
  dependencies: `@neko/generation` in Agent Webview and `@earendil-works/pi-ai` in Desktop.
- Full Desktop tests retain three unrelated resource-display projection failures expecting the old
  `renderUri` shape instead of the concurrent `previewDescriptor` work. The only Skill-adjacent
  selected-row style failure was fixed and its focused suite passes.
- A final Runtime typecheck rerun is currently blocked by a concurrent unrelated edit at
  `packages/chara/src/application/character-usable-version-service.ts:154`: an optional
  `CharacterVersionLineage` is assigned to a required field. Earlier Runtime and Chara typechecks
  passed before that worktree change.

## Deletion and canonical-path evidence

- Production `packages/` and `apps/` contain zero hits for `NekoSkillOverlay`, `SkillHostFit`,
  `invocationRequirements`, `executeExternalProcessor`, `command-artifact`, `agents/neko.yaml` and
  `.neko/skills`.
- Pi discovery and formatting are owned by `PiSkillHost` through `loadSourcedSkills` and
  `formatSkillInvocation`; exact activation uses the Host fingerprint/source identity.
- Command Markdown is owned by `CommandHost`; same-name precedence is deterministic and shadowed
  files produce `duplicate-command` diagnostics.
- Mutation uses `PersonalSkillManagementRecord`; current package fingerprint is revalidated before
  recoverable trash, so a stale card cannot remove changed bytes.
- Canonical Portable Skill roots are projected only by `agent-skill-layout` as
  `~/.agents/skills` and `<workspace>/.agents/skills`; AgentAppHost consumes those resolvers instead
  of spelling a second root policy.

## Quality review and residual risk

- Risk classification: high architectural surface, local execution/security impact, no database or
  user-content migration. No unresolved P0/P1 finding was found in the Skill/Command implementation.
- Pi dependency drift remains a risk because OpenNeko intentionally delegates parser/formatter
  semantics; characterization and exact-activation tests pin the consumed API behavior.
- CommandHost is intentionally smaller than Pi SkillHost. It now has exact activation, strict source
  identity, deterministic precedence and visible duplicate diagnostics, but future public Command
  metadata changes require an owning OpenSpec rather than reuse of Skill contracts.
- Retired `.neko/skills` bytes remain untouched and undiscovered by design; there is no automatic
  import, migration or deletion.
- Third-party portable metadata remains author input only and cannot register Tools, providers,
  targets or permission authority.
- Visible composer behavior and provider-backed Skill execution remain unaccepted until the
  adjacent layout assertion is repaired and an explicit provider/model/cost-authorized run is made.
