# W6 Cut DSH Authoring Slice

## Scope

This slice adds one official `openneko.cut` DSH Tool with five canonical operations:

- `query` reads bounded facts from one normalized Workspace-relative `.otio` document.
- `apply` submits at most 32 allowlisted semantic commands against the exact content fingerprint returned by
  `query`.
- `export-submit` freezes the exact queried document/session facts and submits a Workspace-scoped durable
  Export Job.
- `export-describe` and `export-cancel` address only the exact Workspace-relative document and Job identity.

The Tool does not accept raw media paths, media URLs, `link-media`, `relink-media`, active Cut tabs or
Renderer runtime identity. Results contain at most 16 tracks and 64 items per track and omit OTIO bytes and
media target URLs.

## Ownership And Five-Layer Analysis

| Layer          | Decision                                                                                                                                                                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | `@neko/cut-domain` owns schema, semantic command selection, document facts and mutation through `CutProjectAuthoringService`. DSH owns Tool registration/call lifecycle. Desktop owns only exact Workspace grant resolution and Node content adapters.                                                    |
| Dependency     | The domain contract is host-neutral. `@neko/agent-runtime/acp` depends on public domain contracts and resolves exact DSH Session/Conversation context. Electron Main constructs concrete `ContentReadService` and `AuthorizedWorkspaceWriter`; Renderer and `CutApplicationRuntime` are not dependencies. |
| Interface      | One `openneko.cut` identity, one `query/apply` union and one reverse ACP handler are used. Unknown fields, unsupported commands, invalid paths, stale fingerprints and wrong context fail with explicit diagnostics.                                                                                      |
| Extension      | A later media/export slice must use a separately accepted durable Job port owned by Cut/Node. It must not expand `apply` with raw paths or route through an active UI runtime.                                                                                                                            |
| Testing        | Domain producer/negative/bounded-result tests, DSH plugin delegation tests, ACP dispatch/Host adapter tests and Desktop real-OTIO/exact-grant tests cover the deterministic path. Production profile/closure and registration inventory tests prove packaging reachability.                               |

## Canonical Path

```text
@neko/cut-dsh-plugin ctx.tools.register
  -> @neko/dsh-bridge opennekoHostTools reverse request
  -> DshAcpApplicationClient exact openneko.cut dispatch
  -> CutDshHostAdapter strict decode
  -> DSH Session -> Conversation -> exact Workspace context
  -> DesktopWorkspaceGrantAuthority exact grant
  -> CutProjectAuthoringService
  -> authorized ContentReadService / AuthorizedWorkspaceWriter
```

There is no MCP wrapper, generic Tool registry, wildcard handler, active Workspace fallback, direct runtime
shortcut or secondary Cut authority. Invalid schema and raw/escaping paths are rejected before Workspace
grant resolution. Domain errors remain local to the current Tool request.

## Media And Export Status

Task 9.2 remains open. Cut Node now composes a Workspace-scoped Export Job owner with a persistent store,
frozen timeline request, headless FFmpeg executor and startup recovery entry. The owner stores only
Workspace-relative document/output locators and domain facts; a missing executor after restart marks the
exact Job `outcome-unknown` rather than falling back to the UI runtime. SQLite restart, absolute-path
exclusion and fail-local recovery tests are covered by `CutExportTaskRegistry.test.ts` and
`export-job/store.test.ts`.

The DSH media/export Tool contract, ACP submit/describe/cancel delegation and exact Desktop Workspace
grant wiring are now implemented. Export requests validate container-matched Workspace-relative output
paths, reuse the existing Workspace-scoped Cut registry, and return bounded Job facts. Missing export
ownership returns `CUT_DSH_EXPORT_OWNER_MISSING` rather than creating a second registry. Complete visible
Desktop reopen evidence and real media execution remain incomplete, so Task 9.2 stays unchecked.

## Agent Evaluation Decision

- Behavior: a Workspace-bound Agent can query and semantically edit the exact Cut document, while invalid,
  stale or unauthorized requests fail visibly.
- Decision: `update` the existing `agent-runtime.creative-media-workflow` suite.
- Canonical evidence required: exact `openneko.cut` Tool identity and terminal call, DSH Session/Conversation
  binding, exact Workspace grant, pre/post document fingerprint and owning Cut validator evidence.
- Forbidden fallback: direct ACP injection, direct `CutProjectAuthoringService` Evaluation call, active Cut
  tab/runtime selection, Pi Tool identity, MCP wrapper or final-text-only success.
- Status: real case is `infrastructure-blocked` until W7 provides a complete DSH Desktop driver through the
  visible composer and projection. No scenario is added through a test-only direct runtime path.

The foundational Agent matrix is unaffected at the persistence/session owner level by this slice, but the
basic Tool path, generated Tool/Job/artifact restoration cell and visible Desktop lane remain unverified for
Cut. Key-free Evaluation validation is harness readiness only.

## Deterministic Verification

Passed on 2026-08-19:

- `pnpm --filter @neko/cut-domain typecheck` and `pnpm --filter @neko/cut-domain test`.
- `pnpm --dir packages/cut/node run typecheck` and focused Cut Node export tests (24 tests,
  including SQLite Export Job restart, Workspace-relative persistence and fail-local executor recovery).
- `pnpm --filter @neko/cut-dsh-plugin typecheck`, `test` and `build`.
- `pnpm --filter @neko/dsh-bridge typecheck`, `test` and `build`; the bridge package was moved from
  non-canonical `packages/agent/dsh-bridge` to `packages/dsh-bridge` without changing its public identity.
- `pnpm --filter @neko/agent-runtime typecheck` and `pnpm --filter @neko/agent-runtime test`.
- `pnpm --filter @neko/app-desktop typecheck` and focused Desktop DSH domain/profile/runtime tests.
- Cut export DSH focused coverage: `pnpm --filter @neko/cut-domain test -- src/dsh-tool.test.ts`,
  `pnpm --filter @neko/agent-runtime test -- src/acp/cut-host-adapter.test.ts`, and the Desktop exact
  Workspace export-owner test in `desktop-dsh-domain-tool-handlers.test.ts` (all passed).
- `pnpm check:agent-boundaries`, `pnpm check:package-boundaries`, `pnpm check:application-boundaries`,
  `pnpm check:deps`, `pnpm check:legacy-debt` and the DSH runtime closure test.
- `pnpm test:agent:eval` key-free validation; this is harness/dry-run readiness, not Agent behavior evidence.

Real provider/API, visible Desktop Agent behavior, package/release smoke and complete media execution/reopen
evidence were not run. They are not implied by these deterministic results and continue to block task 9.2/release.
`pnpm check:unused` also remains blocked by the recorded repository-wide six unused files and 182 unused
exports; none is introduced by this slice. `pnpm check:no-internal-versioning` remains blocked by the W5
retired Pi data-protection fixture/allowance cleanup and has no new Cut or moved bridge finding.
