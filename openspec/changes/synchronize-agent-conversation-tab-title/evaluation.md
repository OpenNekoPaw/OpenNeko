# Evaluation: synchronize-agent-conversation-tab-title

## Disposition

- Agent Evaluation: excluded from a provider-backed TUI suite. The changed behavior is a VS Code
  Host-only metadata preflight and revisioned Header TabState projection. TUI has no corresponding
  Tab label, and the change does not modify Prompt, Skill, capability/tool routing, provider/model
  selection, queue behavior, continuation, Generation Job execution or TUI event projection.
- Deterministic owner: ConversationBridge, AgentMessageTurnHandler and ChatViewProvider Extension
  tests prove authority persistence, pre-dispatch ordering, failure behavior, duplicate ordinary Tab
  synchronization and role-owned label isolation.
- Forbidden fallback: Webview input text does not update the label locally; a failed authority write
  emits no TabState title update.

## Key-free platform validation

- `pnpm test:agent:eval`: 39 files and 280 tests passed.
- All-suite dry-run: 24 suites and 53 cases selected successfully.
- These results validate Evaluation infrastructure only and are not presented as real Agent behavior
  acceptance for the VS Code-only label.

## Real Host evidence

- Host: VS Code 1.130.0 arm64 Extension Development Host.
- Configuration: product-composed `Debug Dev (All)` after `pnpm build:vscode:dev`.
- Workspace: isolated synthetic `~/Git/neko-test`.
- User input: `验证会话标签自动更新`.
- Observed canonical result: the selected ordinary Tab changed from `New conversation` to
  `验证会话标签自动更新` immediately after send. Its running and completed status remained attached
  to the updated title, and the provider-backed turn returned a terminal response.

## Residual risk

- This acceptance proves the visible Host label and a real provider turn, but not Webview DOM,
  iframe console or `postMessage` internals because the current VS Code process has no CDP endpoint.
  Those internals are covered deterministically by revisioned TabState message assertions.
