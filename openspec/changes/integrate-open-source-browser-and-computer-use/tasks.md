## 1. Upstream lock and supply chain

- [ ] 1.1 Record the selected stable Browser Use, Cua Driver and official MCP SDK releases, source commits, licenses,
      transitive license inventory, build recipes, artifact sizes and supported OS/arch without using `latest`.
- [ ] 1.2 Build reproducible first-party platform artifacts from pinned upstream sources/dependencies; include all required
      runtime/browser/native payloads and a contained launcher, with no user-machine post-install package manager.
- [ ] 1.3 Add checksum/signature/SBOM validation and poison tests for modified archives, path escape, symlink, duplicate
      identity, unknown platform and unreviewed upstream Tool sets.
- [ ] 1.4 Keep the first-delivery catalog inside the signed application as the only catalog authenticity root; constrain
      artifact HTTPS hosts/redirects and defer a remotely mutable catalog to a separate trust/key-management change.

## 2. Canonical MCP boundary

- [x] 2.1 Replace the handwritten MCP stdio/HTTP client with the official SDK adapter while retaining the existing
      `MCPManager -> ToolRegistry -> Pi` product path; delete the old transport implementation and direct test paths.
- [x] 2.2 Update the package-owned MCP contract to preserve standard Tool annotations and ordered text/image/supported
      resource result blocks without adding internal contract or schema versions.
- [x] 2.3 Add producer/consumer tests for protocol negotiation, cancellation, mixed text/image delivery, `isError`,
      malformed single-Tool isolation and sibling Tool/server availability.
- [x] 2.4 Add transient sensitive-observation projection and transcript-safe receipt tests proving raw screenshot bytes,
      Host paths and secret/window handles are not persisted or exposed to Renderer.
- [x] 2.5 Prevent automation providers from using generic raw MCP exposure; assert unknown, contradictory and changed-schema
      Tools remain absent in plan, ask and auto modes even when upstream annotations claim read-only.

## 3. Extension artifact lifecycle

- [ ] 3.1 Extend `@neko/agent-runtime/extensions` public entry with reviewed remote platform artifact download, staging,
      integrity/provenance/license validation and atomic install through injected Host ports.
- [ ] 3.2 Add explicit enable, disable and update state owned by the extension application service; migrate current
      installed-equals-enabled behavior atomically and remove the old implicit activation path.
- [ ] 3.3 Add idle/session ownership gates for enable/disable/update/remove, exact operation identity, safe diagnostics and
      fail-local sibling behavior.
- [ ] 3.4 Update typed Main/preload/Renderer management contracts and Extensions UI for size, install, enable, disable,
      update, dependency, permission and qualification status in English and Simplified Chinese.
- [ ] 3.5 Add a real Electron management path proving catalog refresh does not download, install is user-triggered, enable
      performs qualification, and failed install/update does not alter the authoritative package/runtime.
- [ ] 3.6 Persist the exact installed artifact/release/digest/provenance, enable grant and accepted declared permission set
      separately; query integrity/MCP/OS/qualification facts and keep invalid installed records visible but non-runnable.
- [ ] 3.7 Add streaming download size/digest, disk-space, archive expansion/file-count, path/case-collision/link, redirect,
      cancellation, crash-staging cleanup and same-artifact bounded-resume tests on macOS and Windows.
- [ ] 3.8 Stage and qualify updates without Agent registration, block commit until exact turns/processes/sessions are idle,
      terminate candidate processes before replacement and require a new enable grant for permission expansion.
- [ ] 3.9 Separate runtime removal from profile/download/extension-data removal and add independent confirmations, trash,
      active-owner checks and recovery tests.
- [ ] 3.10 Own install/update progress outside the Extensions React Root with exact operation identity, explicit cancel and
      restart cleanup/resume; verify scene changes do not cancel work or retain hidden UI.

## 4. Automation package ownership

- [x] 4.1 Create `@neko/automation-contracts` L0 contracts for provider/profile/session/target/action trait/evidence/
      diagnostic with one canonical shape and strict invalid-input isolation.
- [x] 4.2 Create `@neko/automation-node` L1 application service and narrow Browser/Computer provider, Host permission,
      transient observation and extension runtime ports; add package boundary tests forbidding Electron/React imports.
- [x] 4.3 Implement the Agent Capability adapter that freezes exact session/target/mode/budget, intersects reviewed policy
      with MCP annotations, revalidates mutations and delegates to one explicitly selected provider without fallback.
- [ ] 4.4 Add Desktop Main concrete download/process/window/OS-permission/resource adapters and typed IPC while keeping
      automation policy, target selection and completion semantics out of `apps/neko-desktop`.
- [ ] 4.5 Add Tool Call/Timeline projection for target, mode, budget, observation/action state, Pause, Stop, Take over and
      evidence status without a second Task/session catalog or retained hidden Root.
- [x] 4.6 Implement layered authorization tests for install confirmation, enable grant, queried OS permission, exact
      session scope and single-action mutation approval; prove none substitutes for another and hard blocks are not
      approval-overridable.
- [x] 4.7 Revalidate the exact target before showing mutation approval and immediately before input; include target,
      effect/data exposure, mode and remaining budget in the approval projection.
- [x] 4.8 Keep first-delivery mutation approval single-action and reject persistent, cross-target or cross-session allow;
      add approval replay and stale-target poison tests.

## 5. Browser Use extension

- [ ] 5.1 Add a first-party Browser Use marketplace package that starts only the contained pinned
      `browser-use --mcp` runtime and declares an exact reviewed Tool allowlist.
- [x] 5.2 Allow exactly `browser_get_state`, `browser_get_html`, `browser_screenshot`, `browser_list_tabs` and
      `browser_list_sessions` in initial `observe`; reject `--cli-mcp`, `browser_exec`, `browser_extract_content`,
      `retry_with_browser_use_agent`, arbitrary file operations, implicit cloud provider and all unknown Tools at
      composition time.
- [ ] 5.3 Implement isolated profile ownership, explicit allowed domains and `observe`, `browse-read`, `interact` policy;
      start Browser Use without model-provider/API credentials and add deterministic allowlist, process-environment,
      mode, domain, redirect and approval tests.
- [ ] 5.4 Qualify Browser Use on packaged `darwin-arm64` with real local fixture sites for state, HTML, screenshot,
      Pi-owned page understanding, navigation and denied mutation; prove no nested model call and record other platform
      blockers.
- [x] 5.5 Launch Browser Use with extension/session-scoped home/temp/browser-data directories and exact contained paths;
      prove real user `HOME`, general `PATH`, existing profiles and unrelated secrets are absent.
- [ ] 5.6 Enforce domains for navigation, redirects and new tabs at the qualified upstream browser boundary; block `file:`
      and external application protocols, require explicit localhost/private-network scope and keep download/upload
      unavailable in the first delivery.

## 6. Computer Use extension

- [ ] 6.1 Add a first-party Computer Use marketplace package containing the pinned Cua Driver artifact and bounded MCP
      policy; reject unrestricted/bypass modes and unknown operations.
- [ ] 6.2 Implement exact app/process/window/region binding, OS permission projection, pre-input revalidation, timeout,
      step budget, Pause/Stop/Take over and user-input interruption through Automation ports.
- [ ] 6.3 Qualify signed/notarized `darwin-arm64` Cua Driver observe mode with a real fixture app, target-only screenshot,
      permission denial/loss, process restart, target mismatch and cleanup.
- [ ] 6.4 Qualify mutating actions individually on macOS with approval and independent result evidence; keep unsupported
      actions unavailable rather than reporting generic interact readiness.
- [ ] 6.5 Add Windows artifacts only after packaged OpenNeko Windows exists; run a real Windows x64 app/window/permission/
      input matrix before changing support status. Linux remains outside this change.
- [ ] 6.6 Request no OS automation permission during install; add explicit macOS Screen Recording and qualified
      Accessibility/Input grant actions, current TCC queries, revocation tests and stable responsibility-chain evidence.
- [ ] 6.7 Prove Windows standard-user execution without service/driver installation or elevation; reject elevated apps,
      UAC secure desktop, lock screen and higher-integrity targets, and verify executable shutdown before update/removal.

## 7. Agent Evaluation

- [ ] 7.1 Create `agent-runtime.external-automation` and update the coverage index for capability Tool routing, Tool Call
      lifecycle, Tool result delivery and Desktop event projection; do not map unrelated capabilities to it.
- [ ] 7.2 Add declarative Browser observe positive and mutation-denied cases proving exact extension/server/Tool/session,
      domain policy, structured result, Pi-owned page understanding and no model credential, extraction Tool, nested
      Agent, exec or Computer Use fallback.
- [ ] 7.3 Add Computer observe, wrong-target and cancel/takeover cases proving exact pid/window, OS permission, transient
      screenshot receipt, sibling isolation and no active-window/mock fallback.
- [ ] 7.4 Run key-free suite/schema/dry-run validation, then hidden complete Desktop + real provider Browser cases and a
      visible Desktop + real provider + real OS permission Computer case; preserve `infrastructure-blocked` where an
      upstream runtime, platform artifact, credential, model or OS grant is unavailable.
- [ ] 7.5 Re-run affected foundational cells for Tool result delivery, cancellation, projection, conversation switching
      and isolation; record other matrix cells as unaffected with rationale.
- [ ] 7.6 Add disabled-extension and poisoned-unknown-Tool cases proving no Tool registration or execution in ask/auto,
      plus session-scope expiry and target-change-after-approval cases proving no grant transfer.

## 8. Completion and quality gates

- [ ] 8.1 Run focused package tests, strict typecheck, MCP conformance, packaged Desktop builds, architecture/security/
      internal-version checks, `pnpm check:openspec`, `git diff --check` and applicable local gates.
- [ ] 8.2 Run Neko quality review across responsibility, dependency, interface, extension and testing layers; verify no
      handwritten automation engine, second Agent/MCP/Task path, implicit install or provider fallback remains.
- [ ] 8.3 Record exact upstream/plugin releases, platform qualification evidence, Evaluation reports, unexecuted cases,
      screenshot/privacy limitations and remaining Windows/Computer-write risks before changing capability status.
