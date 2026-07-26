# Evaluation: add-agent-header-roleplay-entry

## Disposition

- Agent Evaluation: excluded. This change does not alter Prompt, Skill, capability/tool routing,
  provider/model selection, AgentSession behavior or TUI event projection. The changed path is a
  deterministic VS Code Webview selection -> Project Search re-resolution -> Entity facade mutation
  -> existing Character Dialogue handoff.
- Owning verification: focused deterministic Webview/Entity tests, product-composed Extension
  Development Host interaction, build and repository quality gates.

## Extension Development Host

- Date: 2026-07-25
- Host: VS Code 1.130.0 arm64
- Configuration: `Debug Dev (All)`
- Extension identity: composed `neko.neko-suite` development stage
- Workspace: isolated synthetic `~/Git/neko-test`
- Lane: `vscode-extension-debugger` Host UI / black box through Computer Use

Observed results:

- The Header order was New Chat, Role Session, History and Account, with the Role Session button
  exposed as a popup action.
- Opening Role Session displayed roleplay-scoped Candidate rows with explicit confirmation labels.
- Selecting Candidate `小橘` closed the menu and created one selected
  `Character Dialogue: 小橘` tab with the Character Dialogue surface. No ordinary conversation tab
  was created and the stale-Candidate diagnostic did not appear.
- The Entity facade wrote one confirmed character record to the synthetic fixture. Reopening the
  menu projected `小橘` as a confirmed Entity rather than another Candidate.
- Escape closed the reopened menu, restored focus to the Role Session action and created no
  additional tab.

The first acceptance attempt failed with `角色候选已失效或不再可确认，请刷新后重试。`.
Source-level exact-id regression coverage was already green, but the running
`packages/neko-agent/dist/extension.js` predated the Entity source fix and still filtered only
`searchText`. After a direct current-source compile and Extension Host reload, the scenario passed.
The product development stage now forces all composed feature compiles; a subsequent
`pnpm build:vscode:dev` completed with 9 successful tasks, 0 cached tasks, and the Agent bundle
contained the exact-id match.

## White-box preflight

`pnpm smoke:webview:targets` was attempted and failed because the running VS Code instance did not
expose a debugger at port 9222 (`ECONNREFUSED`). No DOM, iframe console, CSP or postMessage claim is
made from the Host UI run. Message identity and no-ordinary-conversation behavior are owned by the
deterministic ConversationController and Host router tests; the visible Character Dialogue tab is
the black-box end-to-end result.

## Residual risk

- The role selector was accepted in the normal auxiliary-sidebar width. Narrow-width stability is
  covered by fixed-dimension CSS and component tests, not a separate pixel measurement.
- The CDP white-box lane remains unavailable until VS Code is started with a verified debugger
  endpoint. This does not block the Host-visible workflow accepted here, but it remains required for
  future DOM, CSP, resource or console-specific claims.
