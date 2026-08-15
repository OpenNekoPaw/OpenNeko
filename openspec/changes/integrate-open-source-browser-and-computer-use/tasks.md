## 1. Canonical MCP and result boundary

- [x] 1.1 Replace the handwritten MCP client with the official SDK while retaining the single
      `MCPManager -> ToolRegistry -> Pi` path.
- [x] 1.2 Preserve Tool annotations, ordered text/image/resource results, cancellation and fail-local diagnostics.
- [x] 1.3 Add transient sensitive-observation projection so raw screenshot bytes and Host identities do not persist in
      transcript or cross preload.
- [x] 1.4 Keep `adapter-only` Automation MCP out of generic raw Tool registration while ordinary sibling MCP remains
      available.

## 2. Open Plugin, Skill and MCP model

- [x] 2.1 Audit current public Plugin, Skill and MCP paths and identify actual enforcement consumers versus status-only
      permission/qualification bookkeeping.
- [x] 2.2 Revise proposal, design and capability specs so Extension is an open loader rather than a qualification and
      release-management platform.
- [x] 2.3 Simplify the Extension canonical projection to enable/action/runtime-diagnostic facts; make record presence
      mean the configured local source exists, and remove redundant install-presence state plus public dependency,
      enable-grant, Host-permission, qualification and declared/accepted-permission matrices.
- [x] 2.4 Simplify durable Plugin enablement to `{ pluginId, enabled }`; remove permission-set acceptance and expansion
      logic without adding a legacy/dual-read path.
- [x] 2.5 Update Extension producer/consumer tests, typed Main/preload/Renderer contracts and localized UI; show only
      contribution, enabled state, actions and local diagnostic.
- [x] 2.6 Prove personal/workspace/plugin Skill discovery and ordinary MCP connection use the same public path for
      OpenNeko and third-party sources, with Workspace Trust and runtime Tool permissions as the only applicable gates.
- [x] 2.7 Remove remote artifact install/update/cancel operations, transfer progress, staged qualification, reviewed
      artifact provenance/license state and the unavailable Desktop artifact Host from the canonical Extension path.
- [x] 2.8 Reduce Extension catalog actions to local source rescan, enable/disable and removal only where OpenNeko owns
      the copied local Plugin; retain personal Skill install/remove and fail-local discovery diagnostics.
- [x] 2.9 Remove Browser/Cua special endpoint management from the current Desktop composition and prove the one selected
      local-runtime path cannot fall back to an endpoint or generic raw MCP Tool.
- [x] 2.10 Scope local-runtime and OS-permission controls to the selected Browser/Cua Extension instead of appending
      global Automation controls to every Extension detail.

## 3. User-managed external runtime setup

- [x] 3.1 Add `user-managed-local-runtime` with opaque Host-owned runtime/resource authorization; never persist package
      raw paths or scan `PATH`.
- [x] 3.2 Add a copyable installation command to the local-runtime source contract and Browser Use/Cua descriptors;
      commands are user-visible text and are never executed by OpenNeko.
- [x] 3.3 Replace local-runtime qualification states with `not-configured | ready | error`; keep exact asset state and
      concrete diagnostics, and remove qualification/unverified labels from UI and locale catalogs.
- [x] 3.4 Keep guide, select/reselect, recheck and disconnect actions; disconnect removes only OpenNeko authority and
      never modifies user-installed files.
- [x] 3.5 Add contract, Desktop IPC and Webview tests proving command copy and no install/update/uninstall execution path.
- [x] 3.6 Replace the Browser Use manual `uvx` launch example with a persistent `uv tool install` command, accept the
      standard uv entrypoint/shebang link layout through exact realpath freezing and revalidation, and state that the
      selected browser is an external Chrome/Chromium executable rather than a Renderer WebView.

## 4. Minimal Browser/Cua compatibility

- [x] 4.1 Replace complete Automation input-schema digests with operation-owned structural requirements for fields used
      by each adapter; update provider inspection and compatibility tests atomically.
- [x] 4.2 Remove exact Browser Use package/server version equality as a readiness gate while retaining exact entrypoint
      interpreter/path and server-name checks.
- [x] 4.3 Remove exact Cua bundle/server version equality as a readiness gate while retaining bundle identifier,
      Developer ID/Team ID, notarization and stable TCC responsibility-chain checks.
- [x] 4.4 Prove a compatible release-string change succeeds, while missing operation, incompatible required field,
      changed path identity, wrong Cua publisher and contradictory annotation fail locally.
- [x] 4.5 Keep unknown Automation operations out of the product wrapper, preserve exact Browser runtime/browser asset
      authorities and reject raw/alternate provider fallback.
- [x] 4.6 Remove upstream release from Automation provider/session/authorization identity and make any displayed release
      an optional owning-runtime diagnostic fact.
- [x] 4.7 Rename qualification APIs, diagnostics and temporary runtime ownership to compatibility/inspection terminology
      without weakening exact provider, operation, field, annotation, signature or TCC checks.

## 5. Automation ownership and real permissions

- [x] 5.1 Keep host-neutral Automation contracts/application service and thin Desktop process/window/OS adapters.
- [x] 5.2 Freeze exact session/target/mode/budget/owner, revalidate target before approval and input, and retain
      single-action mutation approval.
- [x] 5.3 Keep Pause, Stop and Take over on the exact Tool Call/session projection without a second Task catalog or
      retained hidden Root.
- [x] 5.4a Register the production Cua provider/profile through the existing Automation session owner and canonical
      Agent Tool Registry; reconcile local-runtime authorization through the existing plugin contribution lifecycle.
- [x] 5.4b Register the production Browser Use provider/profile with one exclusive MCP client, isolated profile and
      single page per Automation session. Bootstrap only the user-confirmed HTTP(S) origin through the upstream
      navigation operation, keep navigation/raw execution unavailable to Agent, reject additional pages or origin
      changes, and consume the official PyPI distribution without a fork, shared client or parallel CDP controller.
- [x] 5.5 For the current observe-only profile, query macOS Screen Recording and Accessibility at use time, keep Input
      Control explicitly unavailable, and interrupt the exact running session through Stop/Take over. Do not add a
      global input monitor before an interact profile has a real correctness consumer.

## 6. Evaluation and quality gates

- [x] 6.1 Create `agent-runtime.external-automation` Evaluation ownership and deterministic Browser/Computer cases.
- [x] 6.2 Update Browser cases for open local-runtime setup, structural compatibility, no model credential and no raw/
      nested/Computer fallback.
- [x] 6.3 Update Computer Evaluation coverage and deterministic companion tests for Cua signing/TCC identity, exact
      target, permission loss, cancellation/Take over and no release-string gate.
- [x] 6.4 Run focused contracts/runtime/webview/Desktop tests, strict typecheck, OpenSpec check and `git diff --check`.
- [x] 6.5 Run Neko quality review and record provider-backed Desktop Evaluation evidence, unexecuted platform cases and
      residual Browser/Cua privacy or write risks.
- [x] 6.6 Re-run focused contract/runtime/Webview/Desktop tests, key-free external-Automation Evaluation selection,
      strict typecheck, OpenSpec validation, UI validation and quality review after the lifecycle cleanup.
