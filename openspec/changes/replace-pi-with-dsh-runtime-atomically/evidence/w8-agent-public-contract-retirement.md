# W8 Agent Public Contract Retirement

## Scope and ownership

- Risk: L2 public-contract deletion with no user-visible UI change.
- Owning responsibility: `@neko/agent-contracts` owns the remaining host-neutral DSH/Agent message contracts; DSH owns Agent/Session/Skill/MCP/Plugin execution; first-party domain packages own Tool schemas and results.
- Canonical path: Desktop typed Session/Permission ports -> package-owned Conversation/ACP application -> ACP stdio -> DSH. Current Composer command/Skill input uses the DSH-derived input catalog. Domain Tools use `dsh-acp.ts` and exact owning-domain adapters.
- User data: no storage, transcript, project, credential, fixture, or legacy Pi byte is read or changed by this deletion.

## Producer and consumer audit

The following files formed closed graphs containing only their own implementation, the package root export, adjacent dead contracts, or their own tests. Repository-wide production identifier and import scans found no runtime producer or consumer:

- `agent-capability-diagnostics.ts`
- `agent-capability-lifecycle.ts`
- `agent-capability.ts`
- `capability.ts`
- `domain-routing.ts` (the unused router only)
- `perception-tool.ts`
- `plugin-command-contract.ts`
- `plugin-slash-command.ts`
- `portable-skill.ts`
- `prompt-fragment.ts`
- `reference-contributor.ts`
- `resource-display-projection.ts`
- `skill.ts`

The obsolete `canvas_lifecycle` message block depended only on the retired capability lifecycle and had no producer or renderer, so it was removed from the canonical `Message` contract. A later repository-wide consumer audit also removed the dead Search media-analysis card bridge and its reference field; source-attributed semantic text/tag contracts remain canonical.

`CreativeDomainMetadata` remains a real consumer contract for `tool.ts` and `platform.ts`; it moved from the deleted router module to the focused `creative-domain.ts` contract. The following surfaces were explicitly retained because they have current runtime or UI consumers:

- multimodal context/tooling and provider projection;
- `agent-input-trigger.ts` and `agent-input-intent.ts` for the DSH-derived Composer catalog;
- `plugin-transfer-contract.ts` for existing Webview presentation;
- `extension-management.ts` / `extension-management-host.ts` while the public DSH management seam remains incomplete;
- current `Message`, Tool, ACP, Session, Permission, Conversation, and domain authoring contracts.

No Webview, renderer component, style, layout, or interaction file was modified.

## Deterministic no-return proof

- The root public export no longer exposes the retired contracts.
- `retired-skill-activation-poison.test.ts` asserts representative exports and every retired path remain absent.
- `check-neko-agent-boundaries.mjs` rejects recreation of every deleted path; its isolated negative fixture covers the complete path set.
- `quality/agent-extension-surface.json` now cites DSH ACP/bridge/domain plugin evidence rather than the retired Capability and portable-Skill contracts.
- The extension surface gate requires the sender-bound Desktop host to read `runtime.client.readExtensions()` and rejects `plugin_states`, `pluginStates`, `mcp_servers`, or `external_research` as Host authorities. The current preload/renderer/Webview chain is snapshot-only and consumes this DSH-derived projection; it is not the retired extensions runtime.
- Evaluation no longer advertises a `resource-display-projection` coverage target. The current message resource projector maps to `tool-result-delivery`; strict schema tests continue to reject the retired resource-display assertion.

## Agent Evaluation disposition

- Decision: `excluded` for real provider behavior.
- Reason: this change removes public contracts with no production producer or consumer and preserves all current ACP/DSH Session, input-catalog, Tool, and canonical projection paths. It cannot change model output, Skill selection, Tool routing, provider/model selection, Session workflow, or Desktop event projection.
- Deterministic evidence: contracts/runtime/Desktop typechecks, contracts/runtime tests, change-selector and coverage-index tests, complete key-free Evaluation harness, source/export/path poison, and architecture gates.
- Real Desktop/provider case: not run because no user-visible or executable Agent behavior changed. Existing release-wide provider, approval, Tool, reopen, and hidden/visible matrices remain required by the parent change.

## Verification

Passed:

```text
pnpm --dir packages/agent/contracts run typecheck
pnpm --dir packages/agent/contracts run test                         # staged snapshot: 34 files / 189 tests
pnpm --dir packages/agent/runtime run typecheck
pnpm --dir packages/agent/runtime run test                           # 50 files / 379 tests
pnpm --dir apps/neko-desktop run typecheck
pnpm test:agent:eval                                                 # 45 files / 314 tests; 26 suites / 65 cases
pnpm check:agent-boundaries                                          # 13 tests; 12 evidence inputs; 348 source/Evaluation files
pnpm check:application-boundaries                                    # 1380 files
pnpm check:package-boundaries                                        # 54 packages
pnpm check:storage-authorities                                       # 1385 sources
pnpm check:legacy-debt                                               # 0 blocking production findings
pnpm check:openspec
pnpm exec openspec validate replace-pi-with-dsh-runtime-atomically --strict
git diff --check
```

Known repository-wide blockers, unchanged by this slice:

- `pnpm check:agent-retired-output` finds 10 stale markers in existing generated bundles/package; build/package remains prohibited until release guard 12.5 passes.
- `pnpm check:unused` reports 6 unused files, 1 unused dependency, 2 unlisted test dependencies, and 180 unused exports.
- `pnpm check:no-internal-versioning` reports 74 wider-worktree new occurrences and stale allowances.
