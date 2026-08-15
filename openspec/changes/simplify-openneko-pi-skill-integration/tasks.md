## 1. Inventory And Boundary Guards

- [x] 1.1 Inventory every production export and consumer of the duplicate OpenNeko `Skill`, Neko overlay/host-fit/workflow/catalog types, invocation requirements, Skill external processor and command-artifact path; record the canonical owner and deletion target for each item.
- [x] 1.2 Add architecture and poison fixtures proving production Skill execution consumes Pi discovery/invocation only, does not branch on Skill name/source/builtin status and cannot register Tool/model/provider/target authority from Skill metadata.
- [x] 1.3 Add repository path guards proving Portable Skill production roots are only `~/.agents/skills` and Workspace `.agents/skills`, while `.neko/skills` remains absent from startup, discovery, creation and public layout exports.

## 2. Remove The Parallel Skill Contract And Overlay

- [x] 2.1 Reduce `@neko/agent-contracts` to minimal portable definition, Skill management/executable projection, exact invocation and creation contracts; delete unused Tool injection, model/path trigger, media workflow, catalog hierarchy, host-fit/quality and duplicated runtime `Skill` fields without compatibility exports.
- [x] 2.2 Remove `NekoSkillOverlay`, dependency/relationship envelopes, the `CreateSkillInput.neko` field and `agents/neko.yaml` serialization/reserved-path behavior; update all producers, fixtures and contract tests and prove no production reader/writer remains.
- [x] 2.3 Simplify `CreateSkillResult` to name, personal/project source and fingerprint; update the creation service, capability provider, Desktop consumers and tests, and add a consumer test proving absolute paths and internal root metadata cannot cross the runtime boundary.
- [x] 2.4 Coordinate the deleted contract exports with `purify-agent-contracts`, updating its inventory/path guards so neither change recreates aliases or parallel definitions.

## 3. Make Every Skill Ordinary

- [x] 3.1 Remove `openneko.binding`, `openneko.authoring-target-kind`, `invocationRequirements` parsing/projection and Skill-driven target selection from SkillHost, launch catalog, contracts and Renderer; add exact producer/consumer tests for ordinary builtin, personal, project and plugin invocation.
- [x] 3.2 Remove `character-creator` target metadata and rename the Chara provider, prompt fragment and ports to generic Character authoring ownership; verify mutation requires the current exact Capability/Conversation authority rather than Skill identity.
- [x] 3.3 Update Entry/Session UI tests to prove selecting or typing any Skill stays in the current scene, does not open a Workspace selector or create/rebind a Conversation target, and fails locally when a required domain Tool is unavailable.
- [x] 3.4 Reconcile `unify-agent-launch-and-domain-bindings` and `unify-skill-creator-authoring-targets` artifacts/tests with the final ordinary-Skill invariant and delete superseded target/receipt terminology rather than retaining compatibility paths.

## 4. Separate Command And Script Execution

- [x] 4.1 Introduce a host-neutral CommandHost/CommandCatalog for personal and project command Markdown with its own record, fingerprint, collision namespace, argument interpolation and invocation formatter; add focused loader and exact-invocation tests.
- [x] 4.2 Atomically switch global/Workspace discovery, unified Agent input catalog, handler identity, Desktop bridge and Webview fixtures from SkillHost `command-artifact` records to CommandHost records; add producer/delegation tests and delete all command-artifact branches from Pi SkillHost.
- [x] 4.3 Add a same-name `$review` and `/review` path test proving Skill and Command remain independently discoverable and executable with no cross-shadowing or name fallback.
- [x] 4.4 Delete `PiSkillHost.executeExternalProcessor` and all Skill-specific authorizer/executor/result/error contracts; prove no production caller remains and route any demonstrated script execution through the ordinary registered process Tool with standard permission and cancellation.

## 5. Separate Management From Execution

- [x] 5.1 Define minimal executable Skill records containing Pi canonical metadata plus Host source, fingerprint, activation id and opaque locator; remove redundant `trusted/enabled` success fields and add stale-activation/no-fallback tests.
- [x] 5.2 Define a distinct management projection for installed source, enablement, plugin provenance, removable state, opaque management id and diagnostics; update `clarify-desktop-capability-catalog` producers/consumers without letting management identity execute a turn.
- [x] 5.3 Update personal install/remove services and Desktop native picker/trash adapters to consume the management projection, with producer tests for atomic installation and recoverable removal plus delegation tests proving Desktop Main contains no Skill parsing or fallback policy.
- [x] 5.4 Add management UI tests for card-level enable/disable, personal removal, plugin-owned lifecycle, localized first-party descriptions and unchanged canonical fingerprint/content across locale changes.

## 6. Canonicalize Storage And Protect User Data

- [x] 6.1 Remove `skills` from `NEKO_CONTENT_SUBDIRS`, `NekoContentSubdir`, generic `.neko` content layout exports and their tests; retain dedicated `agent-skill-layout` resolution for `~/.agents/skills` and Workspace `.agents/skills`.
- [x] 6.2 Add production reachability tests proving startup and catalog scans do not inspect `~/.neko/skills` or Workspace `.neko/`, while `~/.neko` config/state/prompts/commands and Workspace `neko/` project facts remain on their existing owners.
- [x] 6.3 Add user-data preservation tests using isolated fixture homes to prove legacy `.neko/skills` bytes are not read, moved, rewritten or deleted by discovery, creation, installation, disablement or removal operations.
- [x] 6.4 Verify Personal Skill create/install duplicate, traversal, symlink, size and Pi validation failures leave existing target/source bytes unchanged and release staging directories.

## 7. Skill Content And Agent Behavior Verification

- [x] 7.1 Audit every builtin `packages/skills/skills/*/SKILL.md`; move OpenNeko Tool names, argument schemas, approval/polling protocols, provider handles, Webview/cache/path and package-private lifecycle instructions to their system/Capability/Tool owners while preserving portable domain methodology.
- [x] 7.2 Expand builtin content guards from point checks to the full catalog and add allowed fixtures for domain methods, output standards, relative references and Agent Skills portable metadata.
- [x] 7.3 Add focused Agent evaluation cases for natural-language and explicit `$skill` activation, third-party same-domain Skill behavior, missing Capability diagnostics, Character proposal without mutation authority and exact Workspace/personal Skill creation destination.
- [x] 7.4 Run advisory visible Desktop UI validation for Skill management and composer behavior, including no target-selector/navigation side effect and card-level enable/disable interaction; record screenshots, runtime diagnostics and any blocked real-provider evidence.

## 8. Final Quality Gates And Evidence

- [x] 8.1 Run `pnpm --filter @neko/agent-contracts test && pnpm --filter @neko/agent-contracts typecheck`, `pnpm --filter @neko/agent-runtime test && pnpm --filter @neko/agent-runtime typecheck`, `pnpm --filter @neko/chara test && pnpm --filter @neko/chara typecheck`, `pnpm --filter @neko/agent-webview test && pnpm --filter @neko/agent-webview build`, `pnpm --filter @neko/local-metadata test && pnpm --filter @neko/local-metadata typecheck` and `pnpm --filter @neko/app-desktop test && pnpm --filter @neko/app-desktop typecheck`.
- [x] 8.2 Run repository architecture/storage/internal-versioning gates, `pnpm check:unused`, `pnpm check`, `pnpm build` and the focused local Agent evaluation entry; record exact passed, failed, blocked and intentionally unexecuted commands without substituting key-free evidence for real Agent behavior.
- [x] 8.3 Record `rg` deletion evidence for overlay, invocation requirements, Skill external processor, command-artifact-in-SkillHost and `.neko/skills` production paths; document canonical producer/consumer hits for Pi SkillHost, CommandHost, management catalog and `.agents/skills` layouts.
- [x] 8.4 Complete the repository quality review with findings classified by risk and document residual risks for Pi dependency drift, CommandHost coordination, retained legacy bytes, third-party portable metadata and any unexecuted visible/real-provider evaluation.
