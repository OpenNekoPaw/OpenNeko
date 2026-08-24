## Decision

- Disposition: update.
- Owning suite: `agent-runtime.launch-binding`.
- Reason: Agent Entry target availability and first-submit binding change by distribution composition; Release absence must be
  proven at the public Entry and Scene boundaries. Character/World content quality and Tool semantics do not change.

## Canonical Paths

- Development Character/World: Main development composition -> Host ready capability -> Renderer experimental Entry context
  -> exact target loader -> canonical Dialogue/Room/World launch binding -> DSH Session.
- Release Entry: Main release composition -> Host unavailable capability -> Renderer omits experimental Entry context -> ordinary
  Assistant or explicit Project Creation only.
- Release direct call: typed Scene intent -> Host capability gate -> owner-qualified unavailable before Workspace, authoring,
  runtime or presentation mutation.
- Release Agent catalog: release DSH profile/builtin Skill root -> SkillHost/Tool registry snapshot with no Character/World
  contribution.

## Forbidden Fallbacks

- Renderer `NODE_ENV`, Vite URL, localStorage or user setting inference.
- CSS-only hiding with callable Scene transition or Entry loader remaining.
- Empty Character/World catalog interpreted as successful Release capability.
- direct domain handler, same-name personal/builtin Skill, generic Assistant binding, active/recent owner or failed-bundle try-next.
- deleting or rewriting Character/World/Conversation durable data to make the capability disappear.

## Evidence

- Deterministic Host tests: exact capability projection, transition result, zero workspace/runtime mutation, sibling Scene success,
  Release presentation reset and Development preservation.
- Renderer/Webview tests: Development controls present; Release top-level/recent/Entry/Project/Resource controls absent; stable
  Assistant, Project, Asset and Extension controls remain.
- DSH/resource closure tests: exact Development/Release bundle arrays, symlink targets and builtin Skill resource filter.
- Key-free: focused suite schema/dry-run and existing Evaluation runner tests. This proves harness readiness only.
- Runtime: visible unbundled Electron for Development and packaged Electron for Release. Provider-backed first-submit is required
  only if existing configured provider authority is available; otherwise report `infrastructure-blocked` with the exact missing
  authority.

## Residual Risk

- Existing historical Character/World records are intentionally inaccessible in Release UI until product promotion, but remain
  intact. Acceptance must inspect storage/state before and after Release launch to prove no deletion.

## Current Verification Record

- Passed: strict OpenSpec validation; Host (38 files / 328 tests), Desktop (103 / 636), Agent Webview (5 / 57) and Project
  Webview (2 / 15) suites; affected TypeScript checks; application-boundary and package-role checks; `git diff --check`.
- Passed: `pnpm test:agent:eval` (45 files / 314 tests plus 27-suite / 83-case dry-run). This is key-free harness evidence,
  not provider-backed Agent or UI evidence.
- Passed: actual Release staging excludes `character-creator` and `world-creator` while retaining other builtin Skills; Release
  profile tests exclude Character/World DSH bundles and symlinks.
- Passed: visible Development Electron inspection and isolated
  `development-creative-capability-visibility`; Character/World navigation, recent sections and Entry context actions are visible.
  Evidence: `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-23T16-34-17.416Z-development-creative-capability-visibility-development/`.
- Passed: canonical packaged Release build, `codesign --verify --deep --strict`, byte-identical staged/packaged DSH closure and
  `release-creative-capability-visibility`. Character/World navigation, recent sections, Entry context actions and active surfaces
  are absent. Asset, Extension and Project navigation succeeds and returns to one isolated Agent Entry Root with no retained
  sibling Root. Evidence:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-23T16-47-30.206Z-release-creative-capability-visibility-packaged/`.
- Passed visual review: Development and five Release screenshots were opened directly. Entry, Asset empty state, fourteen-skill
  Extension grid, Project empty state and Agent return are settled, readable and free of clipping, overlap or hidden
  Character/World controls. The isolated fixture's missing provider diagnostic is expected and no provider-backed behavior is
  claimed.
- Resolved during packaged acceptance: Forge originally re-signed the verified DSH Node/native payload and invalidated the
  checksum/closure fingerprint. Forge now preserves only the canonical DSH payload signatures; the outer App remains ad-hoc
  signed and passes strict deep verification.
- Repository-wide unrelated failures remain visible: Agent boundary inventory references an absent `tool-names.ts` and an
  unrelated ComfyUI operation mismatch; internal-versioning and unused checks report the existing dirty worktree's broader
  findings. None is hidden or rewritten as a pass for this change.

## L4 Quality Review

- Risk: L4, because the change crosses Electron Main composition, Host Scene routing, Agent executable contributions, macOS
  packaging/signing and user-visible navigation, while intentionally preserving existing user records.
- Responsibility/dependency: Electron alone owns `app.isPackaged`; Host receives a required host-neutral composition input;
  Renderer and Webviews consume the canonical capability projection. No package gained an Electron dependency.
- Interface/path: Host and DSH composition inputs are required rather than defaulting to an enabled Release surface. Each
  distribution has one successful implementation path; Release only removes contributions and rejects owner-qualified Scene
  intents before resolution or mutation.
- Extension/testability: promotion later changes the Main composition only; domain owners and contracts remain intact. Focused
  tests cover producer/consumer projection, direct-call poison paths, durable data preservation, profile closure, Webview controls
  and sibling navigation.
- Resolved during review: optional DSH materializer input could have exposed Character/World after a future omitted argument;
  it and the Host composition input are now mandatory and all callers are explicit.
- Resolved during review: macOS signing changed verified DSH payload bytes. The exact canonical payload is now excluded from
  re-signing, while similar paths, the descriptor, Electron binaries and the enclosing App remain signed normally; package bytes,
  runtime closure validation and strict deep code-sign verification all pass.
- Open scoped findings: none. Provider-backed Agent output quality was not in scope because Release behavior is capability absence;
  the key-free Evaluation result is not represented as real model evidence.
