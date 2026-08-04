## 1. Conversation Ownership Contracts

- [x] 1.1 Add strict `AgentConversationOwnerRef`, owner-qualified navigation identity, optional Project grouping and versioned home projection codecs in `@neko/agent-contracts`; cover Assistant, Workspace, Character, Room, unknown kind and identity mismatch cases.
- [x] 1.2 Add qualified CharacterRun and RoomRun navigation owner variants without admitting them into the executable `AgentConversationContext`; update restore consumers to return owner-qualified unavailable instead of treating them as Assistant/Workspace.
- [x] 1.3 Update Pi catalog/context reading and Agent application projection so existing Assistant/Workspace records emit exact owner identities; add producer tests and poison the fabricated `content:${workspaceId}` navigation path.

## 2. Host Grouping And Lifecycle

- [x] 2.1 Add package-owned Desktop grouped conversation navigation projection/codec and compose Project plus standalone owner groups in Host with deterministic ordering, bounded children and exact diagnostics.
- [x] 2.2 Replace Project-required conversation validation with exact conversation + owner validation for restore/delete; prove standalone Assistant lifecycle operations require no Project and wrong-owner operations fail closed.
- [x] 2.3 Keep Project header activation distinct from conversation restore, preserve same-Workspace runtime reuse, and return owner-qualified unavailable for Character/Room restore before owner composition.
- [x] 2.4 Add supported stored/wire migration or derived-projection rebuild behavior and tests preserving existing Assistant/Workspace conversation identities while unknown versions/kinds and unresolved context fail visibly.

## 3. Desktop Composition And Sidebar

- [x] 3.1 Migrate Desktop Main/preload/renderer consumers to the grouped navigation contract and remove the separate recent Projects/recent conversations interpretation.
- [x] 3.2 Refactor `ApplicationPrimarySidebar` with existing `@neko/ui` primitives into Project and standalone owner groups, active exact conversation state, bounded expand/collapse, attention and delete controls; preserve compact, resize, theme and accessibility behavior.
- [x] 3.3 Hide Agent session Tab/history switching as a top-level navigation surface while preserving package-internal session/runtime state and Entry Draft reset behavior.
- [x] 3.4 Add Desktop consumer/delegation and renderer tests for empty Project, multiple conversations, standalone Assistant, grouped non-Workspace projection, expand/collapse, exact restore/delete, reload and forbidden renderer inference.

## 4. Documentation And Evaluation

- [x] 4.1 Update Agent, Desktop application composition, package boundaries and Chara owner documentation with transcript/context/group separation and PrimarySidebar switching rules.
- [x] 4.2 Record `neko-agent-evaluation` disposition and focused canonical-path/no-fallback evidence for Assistant versus Workspace restore; run key-free validation and real Desktop complete-session cases when infrastructure is available.
- [x] 4.3 Run isolated development and packaged Electron scenarios for grouped navigation, Project Draft activation, Assistant/Workspace restore/delete, expand/collapse, reload and narrow/large layouts; record evidence in `verification.md`.

## 5. Quality And Completion

- [x] 5.1 Run focused Agent contracts/runtime, Host and Desktop tests plus affected typechecks/builds; record exact commands and path-level assertions in `verification.md`.
- [x] 5.2 Run `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:quality`, `pnpm check:legacy-debt`, `pnpm check:unused`, `pnpm check:application-boundaries`, `git diff --check` and strict OpenSpec validation.
- [x] 5.3 Apply `neko-quality-review`, resolve all findings, document user-data migration behavior and residual Character/Room/provider-backed risks, and split commits by contract/runtime, Host/Desktop UI, and docs/evidence.
