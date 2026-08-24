## Agent Evaluation decision

- Coverage owner: `agent-runtime.skill-runtime` for effective Skill membership and the existing
  capability/tool-routing coverage for MCP Tool registration.
- Skill lifecycle refresh now crosses the asynchronous Agent turn boundary. The canonical path is
  `sender-bound lifecycle command -> DSH filesystem mutation -> Desktop configuration refresh ->
  active turn terminal state -> subprocess replacement`; unconditional restart during the turn is
  the forbidden path.
- Conversation ownership, transcript persistence, approval and provider/model selection remain
  unchanged. Deterministic runtime coverage must prove active-turn preservation, new-work blocking
  and post-turn refresh; the remaining foundational matrix cells are unaffected.
- A provider-backed behavior case was not added because the current strict Scenario contract has no
  public extension-lifecycle setup operation or terminal evidence for enabling/disabling a Skill or
  MCP server before a turn. Adding an eval-only direct runtime path would create a forbidden second
  control path.

## Evidence

- `pnpm test:agent:eval`: passed, 45 test files / 315 tests; all 27 suites and 84 cases passed the
  key-free dry-run.
- DSH bridge tests prove that personal Skill enablement changes the discovered filesystem root and
  MCP enablement reconciles the single Loader entry owned by the official DSH MCP client.
- Desktop Host/runtime tests prove Skill mutation requests the active-work-aware configuration
  refresh and does not call unconditional restart. DSH bridge tests prove concurrent MCP mutations
  are linearized through persistence and official Loader reconciliation.
- The deterministic runtime case covers the affected foundational matrix boundary: an active turn
  keeps its subprocess, new work is rejected while refresh is pending, and the same durable session
  catalog remains available after the terminal event and replacement. Transcript, generation,
  provider/model and cross-conversation ownership paths are unchanged by this follow-up.

## Remaining evaluation work

A real provider-backed case remains blocked until the Evaluation platform exposes a canonical,
public extension-lifecycle setup operation and evidence adapter. Key-free evidence is authoring and
orchestration readiness only; it is not Agent behavior evidence.
