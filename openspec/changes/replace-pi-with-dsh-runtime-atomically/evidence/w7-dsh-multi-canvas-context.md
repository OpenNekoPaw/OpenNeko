# W7 DSH multi-Canvas context evidence

## Implemented canonical path

- Desktop restores the exact Conversation Workspace and asks the Canvas-owned index service for one `CanvasWorkspaceContextCatalog`.
- The retained `WorkspaceCanvasContextBar` renders the logical Workspace Board and every valid exact Canvas from that catalog; no Webview component or visual design was replaced.
- Message and Skill submissions carry only the Canvas-owned `CanvasWorkspaceTurnTarget`. Renderer does not send paths, summaries, authority, or fingerprint data.
- Agent runtime validates the exact Workspace identity and resolves Board or exact Canvas through the same Canvas index service. A missing or cross-Workspace target fails the current submission instead of falling back to Board, active Canvas, or recent Canvas.
- A queued DSH inbox message stores the already validated context text, so later catalog refreshes cannot redirect the queued turn.

## Deterministic verification

- Agent contract: 20 tests passed.
- Agent runtime turn context: 6 tests passed.
- Agent Webview: 21 tests passed.
- Desktop composer/session/renderer: 41 tests passed.
- Affected package TypeScript checks passed.
- Agent, application, and package boundary gates passed.
- Strict OpenSpec validation passed.
- Key-free Agent evaluation: 45 files / 314 tests passed; all-suite dry run: 26 suites / 67 cases passed.
- Desktop production package build passed.

## UI and behavior disposition

The deterministic Webview test proves that selecting an exact Canvas submits that exact target while retaining the existing control. It is supporting evidence only. A visible authoritative Desktop check with at least two Canvas options and a real provider turn remains required before task 7.19 can be marked complete; provider/model/cost authorization was not supplied for this run.

## Explicit residual boundary

This change restores catalog awareness and exact per-turn model context. Automatic terminal artifact delivery still targets the Workspace Board because the DSH terminal event does not carry the Host-validated structured turn target. Prompt text, Tool arguments, and current UI selection are not accepted as inferred delivery authority.
