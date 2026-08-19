# W4 Desktop Projection Authority

## Canonical Consumer Path

DSH ACP notifications and permission requests enter the package-owned `DshAcpProjection` and `DshPermissionOwner`. Desktop Main projects bounded Session events and pending approvals through sender-bound typed IPC. Preload strictly decodes each result and validates the requested Conversation identity; permission mutations additionally validate the exact DSH Session identity. Renderer combines only a matching Session projection and permission list.

Renderer does not decode raw DSH Session bytes, persist transcript state, read Pi history, or recover from browser storage. Its local state is a disposable view of Host projections. Concurrent refreshes use a monotonic request sequence, so a late older response cannot replace the latest projection.

## Fail-Local Matrix

- A Session result for another Conversation is rejected in preload.
- A permission result with another top-level Conversation or pending sibling is rejected in preload.
- A permission mutation result for another DSH Session is rejected in preload.
- A mismatched Session/permission pair is rejected by the current Agent Surface and rendered as its local diagnostic.
- Raw Tool payload and retired `runId` fields are rejected by the canonical Session contract decoder.
- A late older refresh is ignored and cannot replace the latest Host projection.
- Missing reverse binding or invalid ACP sequence/turn/tool correlation fails only the affected request or Session projection.

## Evidence

- `packages/agent/contracts/src/dsh-session-host.test.ts`
- `packages/agent/runtime/src/acp/dsh-acp-projection.test.ts`
- `packages/agent/runtime/src/acp/dsh-acp-application-client.test.ts`
- `apps/neko-desktop/src/main/desktop-dsh-session-host.test.ts`
- `apps/neko-desktop/src/preload/dsh-session-bridge.test.ts`
- `apps/neko-desktop/src/preload/dsh-permission-bridge.test.ts`
- `apps/neko-desktop/src/renderer/DesktopAgentSurface.test.tsx`
- `apps/neko-desktop/src/architecture-boundary.test.ts`

Task 7.6 is complete for the canonical Desktop Agent consumer. Task 7.4 remains open because inbox close/restart preservation still depends on the upstream DSH public disposal seam recorded under task 4.6.

## Evaluation Disposition

Decision: update the existing `agent-runtime.workflow-controller` and `agent-runtime.stream-delivery` owners. `DesktopAgentSurface` maps to the workflow owner; the Session/permission preload consumers map to the stream-delivery owner and its existing coverage-index expansion. No new suite or direct ACP driver is introduced.

The deterministic cases prove owner identity, stale-response rejection and forbidden local/Pi/raw-Session recovery. They do not prove model behavior, provider execution, complete-session recovery or visible UI acceptance. Real cases remain `infrastructure-blocked` because the current Evaluation Desktop driver still targets the deleted Pi bridge and cannot be replaced by direct `dshSessions` calls; the exact blocker is recorded in `evidence/w7-evaluation-driver-blocker.md`.
