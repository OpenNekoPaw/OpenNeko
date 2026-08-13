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
- [x] 1.16 Add contract, renderer and Host red tests proving unavailable Conversations/Projects remain visible, their primary actions are disabled, forged requests execute no domain call, and valid siblings remain operable.
- [x] 1.17 Add red Renderer, Workspace registry, Host and Agent/AppHost tests for one-time retained-metadata startup notice, missing Project identity projection, stored/unavailable Project convergence and unavailable conversation deletion without Workspace attach.
- [x] 1.18 Add Host codec, service and SQLite reopen regression tests proving invalid Window presentation is diagnosed once, never serialized back, and valid sibling/user data remains unchanged.
- [x] 1.19 Add red Webview tests proving unaccepted sends preserve the complete composer draft, accepted active-run sends use the Host queue, and pending first-submit requests are consumed only after acceptance.
- [x] 1.20 Add red presenter/component tests proving every active Conversation pending approval appears above the composer while transcript Tool Calls expose no approval buttons.

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
- [x] 3.9 Remove missing-context owner inference, project item-local unavailable diagnostics, and reject unavailable Conversation/Project transitions before context, Workspace or Scene effects.
- [x] 3.10 Capture retained-metadata warnings only from the first Renderer projection with bounded dismissal; inspect Project identity during catalog listing, preserve unavailable state over stored Project display facts, and route exact conversation cleanup through Agent authority without Workspace resolution.
- [x] 3.11 Remove retained invalid Window payloads from Shell state, canonicalize through the existing state repository before first Window claim, and project the isolated diagnostic only for the current application instance.

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
- [x] 4.12 Make the composer send contract receipt-based so rejected submissions preserve the owning draft resources.
- [x] 4.13 Move canonical Tool approval actions into one bounded composer-adjacent panel without changing Host approval ownership.
- [x] 4.15 Reconcile cross-Workspace persisted Scene/Main presentation mismatches at startup, retain exact Project presentations, emit a Workspace reset diagnostic, and cover reopen plus live-validation regressions.

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
- [x] 5.12 Enforce functional fixture HOME/database/userData containment before storage startup and run its focused tests without accessing the user database.
      Evidence: the `no-active-project-catalogs` development Electron scenario passed at `1200x800` with an isolated fixture HOME, `${FIXTURE_HOME}/.neko/neko.db`, contained Electron userData and Workspace; unavailable Conversation/Project open controls were disabled, forced DOM clicks left the Scene unchanged, cleanup controls remained enabled, and runtime observation recorded no console errors, warnings or exceptions.
- [x] 5.13 Run focused Renderer/Desktop/Host/Agent tests and typechecks, strict OpenSpec validation, visible Electron notice/navigation acceptance, and the affected quality gates.
      Evidence: the isolated `no-active-project-catalogs` development Electron scenario passed with a one-time non-blocking retained-metadata notice, unavailable Conversation cleanup without Workspace attach, missing-identity Project open disabled, list-mode Asset display, and no console errors, warnings or exceptions. Report: `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-06T19-30-13.100Z-no-active-project-catalogs-development/report.json`.
- [x] 5.14 Run focused Host/Desktop/SQLite tests, typechecks, strict OpenSpec and quality gates; restart an isolated Electron fixture to prove the invalid Window notice does not recur, then verify the normal Desktop startup removes only the user's invalid Shell Window records.
      Evidence: Host Shell tests passed `58/58`, Desktop SQLite integration passed `5/5`, Host typecheck, strict OpenSpec and affected lint/format/internal-versioning/legacy/unused/dependency gates passed. The isolated `desktop-invalid-window-convergence` Electron scenario displayed the item-local diagnostic with a usable Workbench on first launch and reopened the same canonical Window without the diagnostic. Normal Desktop startup removed only the two invalid user Shell Window records while preserving the valid primary Window and Project count; a second normal restart restored that valid Window without startup errors. Desktop typecheck remains blocked by unrelated concurrent Agent draft API edits outside this task.
- [ ] 5.15 Run focused Agent Webview tests/typecheck, key-free Agent Evaluation validation, strict OpenSpec and quality review; then inspect accepted queue text plus pending approval placement in the authoritative visible Electron path and record any provider/environment blocker.
      Deterministic evidence: Agent Webview passed `102/102` files and `780/780` tests; focused receipt/approval coverage passed `168/168`; Webview typecheck, ESLint, Prettier, strict OpenSpec, Desktop renderer style contracts (`27/27`), Desktop runner contracts (`14/14`), Agent Evaluation harness (`45/45`, `307/307`) and all `26` suites/`76` cases dry-run passed. Evaluation reuses `agent-runtime.workflow-controller/queue-during-run` and `tool-approval-visible`. The visible real-provider `desktop-agent-provider-ui` scenario was extended to inspect the approval panel geometry, unique action surface and terminal Tool result, but execution is infrastructure-blocked before Desktop/API launch because explicit provider/model identities and cost authorization are absent; `~/.neko/config.toml` is readable and was not treated as implicit authorization. Repository-wide internal-versioning and unused-dependency gates remain blocked by unrelated concurrent Character/allowance changes and existing `@neko/generation` / `@earendil-works/pi-ai` declarations; affected dependency-direction and legacy-debt gates passed.
      Visual correction (2026-08-13): user evidence showed the initial implementation still read as two approval surfaces because the composer-adjacent panel spanned the full Agent column while the transcript retained a large warning card. The canonical panel now renders inside the same centered `820px` composer rail immediately above the input shell, uses `width: 100%` with the same maximum width so it cannot exceed the composer, uses the normal elevated surface, preserves a bounded multi-request list and orders secondary Deny before primary Approve. Transcript Tool approval is a compact non-actionable fact row with no repeated description, parameter expansion or routing instruction. Focused component, owner-structure and CSS contracts cover the unique action path and geometry. Current Desktop pixel acceptance remains blocked: Computer Use could not resolve/read the active OpenNeko instance among multiple same-bundle applications, and the readable `Electron` process was an unrelated worktree default page. No Tool decision was invoked during inspection.
