## 1. Shared lifecycle kernel

- [x] 1.1 Add explicit `@neko/shared/job-lifecycle` entry with typed refs, base snapshot, phase and failure contracts
- [x] 1.2 Implement strict transition/revision/terminal invariant helpers and a test/reference in-memory store
- [x] 1.3 Add architecture tests rejecting generic payload/result, central handler registry and Agent/VS Code/React dependencies

## 2. Generation Job vertical path

- [x] 2.1 Split current provider submit/describe/cancel capabilities, reject unsupported operations without no-op, and defer push subscription until a real provider producer exists
- [x] 2.2 Define GenerationJob snapshot, store and coordinator with exact identity, progress revision and provider reconciliation
- [x] 2.3 Implement result validation and atomic generated `ResourceRef` commit owned by Generation
- [x] 2.4 Implement retry as a new GenerationJob with `retryOf`; preserve outcome-unknown without automatic resubmission
- [x] 2.5 Route linked Agent media Tools through GenerationJob, await event-driven terminal observation in the same Tool Call, and poison direct GenerationExecutionPort execution
- [x] 2.6 Persist Generation snapshots through a domain-owned LocalMetadata schema/codec/CAS adapter and implement workspace recoverable scan
- [x] 2.7 Reconcile persisted provider identities on Host startup; mark ambiguous running submissions outcome-unknown without resubmission

## 3. Cut Export Job vertical path

- [x] 3.1 Extract host-neutral ExportJob coordinator/port from VS Code `ExportService`
- [x] 3.2 Replace latest-job fallback, silent cancel no-op and nullable progress recovery with exact identity diagnostics
- [x] 3.3 Persist versioned ExportJob snapshots and reconcile Engine queue/progress after Host restart
- [x] 3.4 Validate output and commit the final export atomically before terminal success

## 4. Agent and direct consumers

- [x] 4.1 Add Agent Tool adapters for explicit submit/describe/observe/cancel/retry domain Job operations
- [x] 4.2 Ensure each observation or command uses a new Tool Call and the owning domain port
- [x] 4.3 Make direct generation always submit a GenerationJob, choose wait or detached consumption, use the persistent production store, and expose progress/cancel/retry
- [x] 4.4 Add exact path facts and generic Task/TaskRef/continuation poison
- [x] 4.5 Replace Agent-injected purpose media forwarding with Host-composed public Generation Job ports for Canvas/Cut/Character consumers

## 5. Caller-owned projections

- [x] 5.1 Remove the superseded cross-domain Activity contracts, projector, Host aggregation and command router
- [x] 5.2 Remove the Agent Webview Activity page, attachment protocol and global Job cards
- [x] 5.3 Preserve Agent Tool Timeline, Canvas action and Cut editor/status-bar projections over concrete domain ports
- [x] 5.4 Document Generation persistence as an operational ledger without introducing user-visible generation history
- [x] 5.5 Add source-absence and caller-path tests proving no global Activity or active/latest Job fallback remains
- [x] 5.6 Project Agent Tool and direct-media generation through one caller-owned Generation Job card with revisioned progress and terminal media
- [x] 5.7 Deliver the same committed generated assets to the local index and Workspace Board, exposing Board delivery diagnostics in the terminal card
- [x] 5.8 Checkpoint direct-media terminal turns through Pi conversation authority and rebuild the same Generation card from ContentLocators after Extension restart
- [x] 5.9 Map every Board delivery state exactly so pending or failed delivery is never presented as Board success

## 6. Documentation and cleanup

- [x] 6.1 Update package boundaries and the Tool Call/Domain Job ADR with the implemented shared kernel boundary
- [x] 6.2 Delete migrated provider/ExportService polling and event duplication without compatibility adapters
- [x] 6.3 Add source-absence checks for generic JobManager, generic payload/result and retired Task lifecycle paths
- [x] 6.4 Add source-absence checks for direct generation execution from Agent/direct/domain entry points and Agent-routed domain media forwarding

## 7. Evaluation and verification

- [x] 7.1 Update `agent-runtime.workflow-controller` authoring/evidence for Job submit-observe-cancel-retry
- [x] 7.2 Run key-free Agent evaluation harness and focused real configured-provider cases without retrying failures into success
- [x] 7.3 Run Generation/Cut/shared focused tests, producer/consumer tests, `pnpm build`, `pnpm test` and architecture checks
- [x] 7.4a Add a generated `apps/neko-vscode` product-composition development staging root and make canonical `Debug Dev (All)` use it; retain any standalone feature launch under an explicitly package-local name
- [x] 7.4b Run the product-composed Extension Development Host scenario for Tool Timeline progress/terminal phase and prove the global Activity page/protocol is absent
- [x] 7.4c Run direct image-mode Extension Development Host acceptance for Job card progress, terminal preview, local persistence and Board projection
- [x] 7.5 Record provider capability gaps, unexecuted recovery cases and repository baseline gate failures
