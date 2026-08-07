## 1. Conversation Ownership Contracts

- [x] 1.1 Add strict `AgentConversationOwnerRef`, owner-qualified navigation identity, optional Project grouping and canonical home projection codecs in `@neko/agent-contracts`; cover Assistant, Workspace, Character, Room, unknown kind and identity mismatch cases.
- [x] 1.2 Add qualified CharacterRun and RoomRun navigation owner variants without admitting them into the executable `AgentConversationContext`; update restore consumers to return owner-qualified unavailable instead of treating them as Assistant/Workspace.
- [x] 1.3 Update Pi catalog/context reading and Agent application projection so canonical Assistant/Workspace records emit exact owner identities; add producer tests and delete the fabricated `content:${workspaceId}` navigation path.

## 2. Host Grouping And Lifecycle

- [x] 2.1 Add package-owned Desktop grouped conversation navigation projection/codec and compose Project plus standalone owner groups in Host with deterministic ordering, bounded children and exact diagnostics.
- [x] 2.2 Replace Project-required conversation validation with exact conversation + owner validation for restore/delete; prove standalone Assistant lifecycle operations require no Project and wrong-owner operations fail closed.
- [x] 2.3 Keep Project header activation distinct from conversation restore, preserve same-Workspace runtime reuse, and return owner-qualified unavailable for Character/Room restore before owner composition.
- [x] 2.4 Keep stored/wire contracts version-free and test that unknown fields/kinds or unresolved context reject only the affected record while valid Assistant/Workspace identities remain available.
- [x] 2.5 Remove product reachability to the retired embedded-context `pi_conversations` table; keep old bytes untouched, reject non-canonical rows locally and prove the former NOT NULL launch failure cannot affect canonical startup.
- [x] 2.6 Make the initial provider turn a receiver-independent Agent application port, invoke it with the exact materialized Assistant/Workspace runtime, and add a regression test for detached composition-boundary invocation.
- [x] 2.7 Route initial and connected turn phase snapshots through the exact Workspace-owned Agent state runtime so late UI attachment receives terminal idle; prove completed Entry replies do not retain Thinking/Stop presentation.
- [x] 2.8 Persist a completed initial-turn lifecycle terminal after the provider port resolves; keep failures visible and prove replay does not restart a claimed terminal turn.

## 3. Desktop Composition And Sidebar

- [x] 3.1 Switch Desktop Main/preload/renderer consumers atomically to the grouped navigation contract and remove the separate recent Projects/recent conversations interpretation.
- [x] 3.2 Refactor `ApplicationPrimarySidebar` with existing `@neko/ui` primitives into Project and standalone owner groups, active exact conversation state, bounded expand/collapse, attention and delete controls; preserve compact, resize, theme and accessibility behavior.
- [x] 3.3 Hide Agent session Tab/history switching as a top-level navigation surface while preserving package-internal session/runtime state and Entry Draft reset behavior.
- [x] 3.4 Add Desktop consumer/delegation and renderer tests for empty Project, multiple conversations, standalone Assistant, grouped non-Workspace projection, expand/collapse, exact restore/delete, reload and forbidden renderer inference.

## 4. Documentation And Evaluation

- [x] 4.1 Update Agent, Desktop application composition, package boundaries and Chara owner documentation with transcript/context/group separation and PrimarySidebar switching rules.
- [x] 4.2 Record `neko-agent-evaluation` disposition and focused canonical-path/no-fallback evidence for Assistant versus Workspace restore; run key-free validation and a provider-backed Desktop complete-session conversation with persisted resume.
- [x] 4.3 Run isolated development and packaged Electron scenarios for grouped navigation, Project Draft activation, Assistant/Workspace restore/delete, expand/collapse, reload and narrow/large layouts; record evidence in `verification.md`.
- [x] 4.4 Run a visible provider-backed Electron scenario through the actual Agent composer; prove UI submit, launch/materialization, rendered assistant response, sidebar conversation presence and absence of global errors without bridge-created conversation setup.
- [x] 4.5 Update Agent development acceptance policy with visible UI + real API feature verification, hidden complete-Desktop + real API batch evaluation, and the conversation/compaction/reopen/generation-record/switching/isolation baseline matrix.

## 5. Quality And Completion

- [x] 5.1 Run focused Agent contracts/runtime, Host and Desktop tests plus affected typechecks/builds; record exact commands and path-level assertions in `verification.md`.
- [x] 5.2 Run `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:quality`, `pnpm check:legacy-debt`, `pnpm check:unused`, `pnpm check:application-boundaries`, `git diff --check` and strict OpenSpec validation.
- [x] 5.3 Apply `neko-quality-review`, resolve all findings, document unchanged user-data behavior and residual Character/Room/provider-backed risks, and split commits by contract/runtime, Host/Desktop UI, and docs/evidence.
- [x] 5.4 Re-run focused runtime/Desktop and retired-path reachability tests, key-free Evaluation, strict OpenSpec, affected typechecks/build and quality review; record the visible UI report and remaining recovery risks.
