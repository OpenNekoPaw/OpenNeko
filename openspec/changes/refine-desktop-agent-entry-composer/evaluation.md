## Evaluation Scope

- Change: Desktop tabless Agent entry forces the effective Agent session mode and LLM model projection while hiding alternative mode controls.
- Decision: `update` the existing visible `desktop-agent-provider-ui` scenario and `reuse` `agent-runtime.model-binding/explicit-chat-model` for effective provider/model facts.
- Canonical path: visible Desktop entry Composer -> Agent draft submit -> Desktop Agent runtime assembly -> effective provider/model facts -> persisted terminal turn.
- Forbidden path: media-session projection, hidden mode selection, default-model fallback, direct turn injection or mock-provider success.

## Cases

- The visible provider scenario now rejects an entry that is not `desktop-entry`, exposes session/execution or shortcut controls, omits model/Project controls, or advertises `/` and `$` in the placeholder.
- Deterministic Agent Webview tests prove a reconstructed non-Agent entry sends `sessionMode: agent` with the selected LLM model and does not expose the hidden controls.
- The isolated `desktop-agent-entry-composer` Electron scenario proves the visible model control, Project control and canonical system/registered Project navigation, but its local functional provider is not counted as Agent behavior evidence.

## Verification

- Key-free harness: 44 files and 285 tests passed; all 22 suites and 52 cases passed dry-run discovery and validation.
- Focused `agent-runtime.model-binding/explicit-chat-model` dry-run: passed.
- Visible Electron presentation scenario: `desktop-agent-entry-composer` passed; evidence is recorded in `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-07T10-02-07.475Z-desktop-agent-entry-composer-development/report.json`.
- Visible real-provider run: attempted and returned `infrastructure-blocked` because explicit provider authorization was missing, before Desktop launch or API use.
- Provider-backed result: not claimed.

## Residual Risk

- A visible real-provider entry submission must still confirm the requested and effective provider/model identities and terminal response after explicit cost authorization is supplied.
- Session persistence, multi-turn, switching and isolation are unchanged by this presentation-only change and remain owned by the existing foundational Agent matrix.
