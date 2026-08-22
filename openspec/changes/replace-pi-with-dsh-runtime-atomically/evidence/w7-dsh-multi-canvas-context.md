# W7 DSH multi-Canvas context evidence

## Implemented canonical path

- Desktop restores the exact Conversation Workspace and asks the Canvas-owned index service for one `CanvasWorkspaceContextCatalog`.
- The retained `WorkspaceCanvasContextBar` renders the logical Workspace Board and every valid exact Canvas from that catalog; no Webview component or visual design was replaced.
- Message and Skill submissions carry only the Canvas-owned `CanvasWorkspaceTurnTarget`. Renderer does not send paths, summaries, authority, or fingerprint data.
- Agent runtime validates the exact Workspace identity and resolves Board or exact Canvas through the same Canvas index service. A missing or cross-Workspace target fails the current submission instead of falling back to Board, active Canvas, or recent Canvas.
- A queued DSH inbox message stores the already validated context text, so later catalog refreshes cannot redirect the queued turn.
- Composer submission creates one short-lived Canvas target admission. The admission is bound to the exact projected DSH turn, or first to the exact queued inbox message and then to the turn that claims it. Completed Tool and terminal delivery read only that binding and release it after the terminal event.
- Final durable assistant Markdown is written through the authorized Workspace writer and projected as a Markdown file reference to the same exact Canvas. Completed content Tool sources remain immediate projections and are deduplicated by their canonical `ContentLocator`.

## Deterministic verification

- Agent contract: 20 tests passed.
- Agent runtime/Desktop turn target and artifact delivery: 6 files / 77 tests passed.
- Agent Webview: 21 tests passed.
- Desktop composer/session/renderer: 41 tests passed.
- DSH bridge: 4 files / 34 tests passed.
- Affected package TypeScript checks passed.
- Agent, application, and package boundary gates passed.
- Strict OpenSpec validation passed.
- Key-free Agent evaluation: 45 files / 314 tests passed; all-suite dry run: 26 suites / 67 cases passed.
- Desktop production package build passed.

## UI and behavior disposition

The deterministic Webview test proves that selecting an exact Canvas submits that exact target while retaining the existing control. It is supporting evidence only. A visible authoritative Desktop check with at least two Canvas options and a real provider turn remains required before task 7.19 can be marked complete; provider/model/cost authorization was not supplied for this run.

## Explicit residual boundary

This change restores catalog awareness, exact per-turn model context, and exact per-turn artifact routing. The routing authority is the Host-validated submission admission bound to the projected DSH turn; prompt text, Tool arguments, current UI selection, active/recent Canvas, and Workspace Board fallback are not accepted as inferred delivery authority. A visible real-provider check with two Canvas choices remains open, so this deterministic evidence does not complete task 7.19.
