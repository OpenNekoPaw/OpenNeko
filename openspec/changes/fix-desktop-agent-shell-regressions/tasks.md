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

## 5. Verification and documentation

- [x] 5.1 Run focused Agent runtime/Webview/UI/Desktop tests and affected typechecks/builds, then run `pnpm test:agent:eval`, legacy, unused, dependency and strict OpenSpec gates.
- [ ] 5.2 Package and inspect Electron Desktop against an isolated fixture for cold-start recents, Agent load/send visibility, themed menus and all Chat/Main modes.
- [x] 5.3 Update active Desktop/Agent architecture or status documentation, record evaluation evidence and blockers, and complete the Neko quality review.
- [ ] 5.4 Re-run focused tests/build/evaluation and isolated Electron acceptance for opaque Popover computed style, visible sent text, default Canvas and Resource Browser Main View; replace superseded evidence and repeat quality review.
- [x] 5.5 Extend `desktop-agent-provider-ui` to observe live transcript execution with the real provider, prove the legacy status region is absent throughout the run, and retain terminal response/lifecycle evidence.
  Evidence: `desktop-agent-provider-ui` passed with `nekoapi-chat / gpt-5.6-luna`; the report recorded transcript activity, no legacy status, no terminal activity residue, a visible provider response, and a completed persisted lifecycle.
