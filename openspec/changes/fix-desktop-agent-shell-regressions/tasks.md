## 1. Red-capable regression coverage

- [x] 1.1 Add a cold-start AppHost test proving persisted scoped conversations appear before any workspace runtime is attached and unknown workspaces remain excluded.
- [x] 1.2 Add an Agent Root ordering test with a synchronously replying adapter and a pending-send path test proving the optimistic user message is visible and submitted once.
- [x] 1.3 Add shared Popover stylesheet coverage and Desktop layout tests for opaque portal tokens plus `chat-main` with zero Main Views.
- [x] 1.4 Add a controller-level red test covering tabless submit, Host-created conversation/Tab, empty projection frames, config hydration and visible optimistic text in the owning realm.
- [x] 1.5 Add a production-renderer computed-style check for the Radix portal background/opacity and Desktop workbench red tests for default Workspace Canvas plus Resource Browser Main View open/focus.
- [x] 1.6 Add a renderer-startup red test proving Agent module loading joins the bootstrap/settings readiness gate without creating a Project/View adapter.
- [x] 1.7 Add a StrictMode red test proving a completed shared resize pointer session clears `isResizing` while committing `onResizeEnd` once.
- [x] 1.8 Add Desktop and package CSS contract tests proving Agent and Resource Browser Roots share the Workbench Main surface and the Agent composer rail has no separate region divider.
- [x] 1.9 Add a Resource Browser embedded-chrome red test proving Desktop renders one Resource management title while add/refresh actions remain available.
- [x] 1.10 Add Home renderer/CSS red tests proving the application brand contains only interactive `OpenNeko` text and the Agent launchpad is centered with a low-height safety rule.
- [x] 1.11 Add Home renderer/CSS red tests proving the Agent heading has no standalone icon tile and centers its title/subtitle without removing action icons.
- [x] 1.12 Add Agent Webview red tests proving live activity is inside MessageList, the composer-adjacent run-status region is absent, canonical tool/streaming records are not duplicated, and idle/conversation switching clears the temporary item.
- [x] 1.13 Add red tests proving a committed user message survives assistant-only projection and every transcript item uses one centered maximum-width rail, while Desktop Dock renders no roleplay Header action.
- [x] 1.14 Add red Main/Bridge/preload tests proving exact retired projection cleanup succeeds, ordinary or forged retired operations fail, and queued retired events cannot mutate the current connection.
- [x] 1.15 Add red Agent Webview tests proving global/session diagnostics portal to the renderer body, remain viewport-bounded, and retained hidden Tabs do not project alerts.

## 2. Persistent Agent Home catalog

- [x] 2.1 Add a read-only Pi conversation catalog reader with workspace-scoped listing and explicit disposal, without session/runtime/lease ownership.
- [x] 2.2 Initialize the Desktop Agent Home workspace scope from Shell Project state before the first window snapshot and merge attached runtime attention by exact workspace/conversation identity.
- [x] 2.3 Add failure and lifecycle tests proving catalog errors are visible, removed workspaces are excluded, and no execution lease is acquired.

## 3. Agent surface initialization and conversation projection

- [x] 3.1 Prepare the Agent Webview module and owner-fenced Desktop bootstrap concurrently while rejecting stale Surface completion.
- [x] 3.2 Establish the Agent Root Host subscription before descendant initialization requests and dispose it on adapter replacement/unmount.
- [x] 3.3 Preserve the owning optimistic user message across empty initial snapshots and make missing config/send rejection clear the false executing state with a conversation diagnostic.
- [x] 3.4 Bind pending send to the Host-created conversation/Tab realm, consume it only after the owning render coordinator receives the user message, and prevent ordinary Tab reconciliation from clearing it.
- [x] 3.5 Move Agent module loading to one renderer-startup-owned promise and make every Agent Surface reuse it while keeping bootstrap and adapter state View scoped.
- [x] 3.6 Project the active conversation Agent state through MessageList, replace the legacy thinking bubble with a transcript execution activity, and delete the independent `AgentRunStatus` path.
- [x] 3.7 Preserve the owning user message across Host/Timeline completion and render user, assistant, process and execution records through the canonical transcript rail.
- [x] 3.8 Split active-Scene Agent routing from sender-bound connection cleanup, retain bounded retired identity tombstones, and replace the preload global cursor with exact connection-scoped lifecycle tracking.

## 4. Desktop portal and Workbench layout

- [x] 4.1 Give the shared Popover a semantic, compiled stylesheet surface and project Desktop light/dark theme tokens without business-local style duplication.
- [x] 4.2 Enable Chat + Main for an empty primary Main group, render the explicit empty Main surface, and keep Main only disabled until a Main View exists.
- [x] 4.3 Replace the empty Main placeholder path with Host-owned default `neko/boards/workspace.nkc` Canvas open/focus and preserve existing project-owned Main Views on restore.
- [x] 4.4 Add `resource-browser` as an independent Workbench Main View, route the project navigation entry through open/focus, reuse the existing Assets Root, and disconnect the project Resource Dock render path.
- [x] 4.5 Make the shared resize mounted guard symmetric across effect setup/cleanup so Sidebar, Dock, Main split and Timeline indicators clear after drag under React StrictMode.
- [x] 4.6 Scope Agent and Resource Browser Desktop package Roots to `--neko-desktop-main`, keep the global muted sidebar token unchanged, and remove the Agent composer rail region divider.
- [x] 4.7 Rename the Desktop Dock to Resource management and render Resource Browser in embedded mode without its duplicate package title row.
- [x] 4.8 Replace Home primary-sidebar brand icons with the existing visibility action on `OpenNeko` text and center the Home Agent launchpad without changing its internal feature ownership.
- [x] 4.9 Remove the decorative Agent heading icon tile and align the launchpad title/subtitle on one centered text axis while preserving task/template icons.
- [x] 4.10 Hide the roleplay selector with the rest of package-owned conversation navigation in Desktop Dock and keep standalone Agent navigation unchanged.
- [x] 4.11 Replace the duplicated fixed Agent error blocks with one package-owned portal diagnostic surface while preserving global/session state ownership and Workbench clipping.

## 5. Verification and documentation

- [x] 5.1 Run focused Agent runtime/Webview/UI/Desktop tests and affected typechecks/builds, then run `pnpm test:agent:eval`, legacy, unused, dependency and strict OpenSpec gates.
- [ ] 5.2 Package and inspect Electron Desktop against an isolated fixture for cold-start recents, Agent load/send visibility, themed menus and all Chat/Main modes.
- [x] 5.3 Update active Desktop/Agent architecture or status documentation, record evaluation evidence and blockers, and complete the Neko quality review.
- [ ] 5.4 Re-run focused tests/build/evaluation and isolated Electron acceptance for opaque Popover computed style, visible sent text, default Canvas and Resource Browser Main View; replace superseded evidence and repeat quality review.
- [x] 5.5 Extend `desktop-agent-provider-ui` to observe live transcript execution with the real provider, prove the legacy status region is absent throughout the run, and retain terminal response/lifecycle evidence.
      Evidence: `desktop-agent-provider-ui` passed with `nekoapi-chat / gpt-5.6-luna`; the report recorded transcript activity, no legacy status, no terminal activity residue, a visible provider response, and a completed persisted lifecycle.
- [x] 5.6 Extend the real-provider Electron scenario to assert the exact sent prompt remains visible and the transcript rail is centered and narrower than the Agent panel, then rerun focused tests, build, evaluation and quality review.
- [x] 5.7 Add regression tests and the canonical restore path for Pi conversations that have exact context but no first-submit lifecycle record.
- [ ] 5.8 Bind completed Timeline turns to their persisted Pi transcript entry identity and prove live completion, restart, same-text turns and conversation switching do not duplicate records.
- [ ] 5.9 Extend visible real-provider Electron acceptance through two conversations, switching, application restart, transcript/generation restoration and isolation; record path-level evidence and forbidden fallbacks.
- [ ] 5.10 Run focused Main/preload/renderer/Agent projection tests and affected typechecks, then validate the visible real-provider conversation path without stale-connection errors.
- [x] 5.11 Run focused Agent Webview tests/typecheck, package Desktop, and inspect the diagnostic portal in a real Electron Workbench with a narrow Agent pane; record residual risk and repeat quality review.
