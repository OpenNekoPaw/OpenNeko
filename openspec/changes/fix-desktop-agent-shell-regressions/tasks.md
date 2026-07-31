## 1. Red-capable regression coverage

- [x] 1.1 Add a cold-start AppHost test proving persisted scoped conversations appear before any workspace runtime is attached and unknown workspaces remain excluded.
- [x] 1.2 Add an Agent Root ordering test with a synchronously replying adapter and a pending-send path test proving the optimistic user message is visible and submitted once.
- [x] 1.3 Add shared Popover stylesheet coverage and Desktop layout tests for opaque portal tokens plus `chat-main` with zero Main Views.
- [x] 1.4 Add a controller-level red test covering tabless submit, Host-created conversation/Tab, empty projection frames, config hydration and visible optimistic text in the owning realm.
- [x] 1.5 Add a production-renderer computed-style check for the Radix portal background/opacity and Desktop workbench red tests for default Workspace Canvas plus Resource Browser Main View open/focus.

## 2. Persistent Agent Home catalog

- [x] 2.1 Add a read-only Pi conversation catalog reader with workspace-scoped listing and explicit disposal, without session/runtime/lease ownership.
- [x] 2.2 Initialize the Desktop Agent Home workspace scope from Shell Project state before the first window snapshot and merge attached runtime attention by exact workspace/conversation identity.
- [x] 2.3 Add failure and lifecycle tests proving catalog errors are visible, removed workspaces are excluded, and no execution lease is acquired.

## 3. Agent surface initialization and conversation projection

- [x] 3.1 Prepare the Agent Webview module and owner-fenced Desktop bootstrap concurrently while rejecting stale Surface completion.
- [x] 3.2 Establish the Agent Root Host subscription before descendant initialization requests and dispose it on adapter replacement/unmount.
- [x] 3.3 Preserve the owning optimistic user message across empty initial snapshots and make missing config/send rejection clear the false executing state with a conversation diagnostic.
- [x] 3.4 Bind pending send to the Host-created conversation/Tab realm, consume it only after the owning render coordinator receives the user message, and prevent ordinary Tab reconciliation from clearing it.

## 4. Desktop portal and Workbench layout

- [x] 4.1 Give the shared Popover a semantic, compiled stylesheet surface and project Desktop light/dark theme tokens without business-local style duplication.
- [x] 4.2 Enable Chat + Main for an empty primary Main group, render the explicit empty Main surface, and keep Main only disabled until a Main View exists.
- [x] 4.3 Replace the empty Main placeholder path with Host-owned default `neko/boards/workspace.nkc` Canvas open/focus and preserve existing project-owned Main Views on restore.
- [x] 4.4 Add `resource-browser` as an independent Workbench Main View, route the project navigation entry through open/focus, reuse the existing Assets Root, and disconnect the project Resource Dock render path.

## 5. Verification and documentation

- [x] 5.1 Run focused Agent runtime/Webview/UI/Desktop tests and affected typechecks/builds, then run `pnpm test:agent:eval`, legacy, unused, dependency and strict OpenSpec gates.
- [ ] 5.2 Package and inspect Electron Desktop against an isolated fixture for cold-start recents, Agent load/send visibility, themed menus and all Chat/Main modes.
- [x] 5.3 Update active Desktop/Agent architecture or status documentation, record evaluation evidence and blockers, and complete the Neko quality review.
- [ ] 5.4 Re-run focused tests/build/evaluation and isolated Electron acceptance for opaque Popover computed style, visible sent text, default Canvas and Resource Browser Main View; replace superseded evidence and repeat quality review.
