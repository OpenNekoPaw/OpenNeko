## Evaluation Scope

- Change/feature: standalone Skills and locally installed Plugin Skill/MCP contributions enter Desktop Pi Agent turns without Marketplace participation.
- Owning cases:
  - update `agent-runtime.skill-runtime` for standalone and Plugin Skill source, receipt and no-source-fallback;
  - create `agent-runtime.plugin-mcp-routing` for dynamic MCP registration/call and component-local failure;
  - add Desktop local-install fixture operations before provider-backed execution.
- Why real Evaluation is required: Skill selection and Tool registration/routing change model-visible behavior and executable Tool availability.
- Canonical paths:
  - standalone Skill: exact builtin/personal/project root -> Pi SkillHost -> Entry/Session input catalog -> Pi read receipt;
  - Plugin Skill: SQLite-installed or explicit bundled Plugin -> root `plugin.json` -> fixed `skills/` -> Pi SkillHost Plugin root -> Pi read receipt;
  - Plugin MCP: verified `mcp.json` contribution -> MCPManager connection -> dynamic MCP Tool -> ToolRegistry/Pi projection -> MCP client call.
- Forbidden fallback: Marketplace inventory, `.openneko-plugin`, `.codex-plugin`, old JSON grant, manifest-only readiness, management-card/display-name invocation, personal/builtin same-name substitution, synthetic Tool, direct MCP call outside Pi, App connector fallback or old capability cards.

## Cases

- Standalone Skill case: with no Plugin and no MCP source, a uniquely named personal or project Skill is selected and its Pi receipt contains the exact source and Host fingerprint.
- Plugin Skill case: a locally installed and enabled fixture Plugin contributes a uniquely named Skill; the selected receipt contains source `plugin`, exact Plugin identity and expected Host fingerprint.
- Skill boundary case: disabled, removed, invalid or stale Plugin Skill cannot be selected and no personal/builtin record satisfies the expected identity.
- Canonical MCP case: a locally installed fixture Plugin starts an isolated synthetic MCP Server, exposes one Tool and completes a Pi Tool call through the MCP client.
- Component locality case: one Plugin contains a valid Skill and an invalid/unconnectable MCP contribution; the Skill remains executable while MCP registers no Tool and exposes an error diagnostic.
- State reopen case: SQLite restores install/enablement, current package content is revalidated, and old JSON grant presence cannot change runtime state.
- Missing package case: an SQLite record whose package is missing remains visible and non-executable without hiding valid sibling Plugins.
- Required evidence: SQLite Plugin row, verified manifest/component result, Pi Skill receipt, registered Tool identity, Tool call terminal status, runtime instance identity, per-component readiness and zero forbidden-fallback counts.

## Verification

- Deterministic package validation:
  - root `plugin.json` codec and fixed component discovery;
  - old/private/foreign path poison tests;
  - local staging, containment, identity conflict, SQLite reopen and invalid-record locality;
  - Skill-only, MCP-only, mixed and unsupported Plugin projections.
- Deterministic runtime validation:
  - standalone Pi SkillHost execution without Plugin/MCP dependencies;
  - Plugin Skill receipt and MCP Tool call through the canonical Agent paths;
  - idle-only generation swap, resource disposal and sibling contribution preservation.
- Desktop validation:
  - producer/consumer/delegation tests for Agent package ownership and sender-bound IPC;
  - Extensions UI for local install, enable, disable, remove, rescan, invalid records and both locales;
  - packaged resources contain explicit bundled Plugin roots and no `marketplace.json` or `.openneko-plugin` package.
- Key-free evaluation: `pnpm test:agent:eval` and focused suite dry-runs prove harness/schema readiness only.
- Provider-backed acceptance: visible or hidden complete Desktop session, driven through the public Agent input path after installing an isolated local fixture Plugin.
- Required static gates: storage authority, application/Agent boundaries, internal-versioning, legacy-debt, unused, strict OpenSpec and `git diff --check`.

## Prior Evidence Retained as Foundation

- 2026-07-31 deterministic extension/runtime/composition, Agent runtime, Evaluation harness, application/Agent boundary, lint, packaging and visible Electron checks passed for the previous bundled-Marketplace design.
- That evidence remains valid only for delivered SkillHost, MCPManager, runtime replacement, typed IPC, bilingual UI and builtin-capability exclusion foundations.
- It does not prove the new root manifest, Marketplace deletion, SQLite Plugin state, local install workflow, contribution-local readiness or provider-backed Plugin execution.

## Launch Catalog Ownership

- Plugin/personal/builtin/project Skill installation and runtime provenance remain owned by the Agent package and Pi SkillHost.
- Executable Entry/Session discovery and first-submit invocation must consume exact Pi SkillHost records and receipts.
- Required no-fallback evidence includes full source identity and zero management-card, manifest-only, display-name, old JSON, Marketplace, personal/builtin substitution or try-next participation.

## Blocked or Unexecuted Cases

- Provider-backed Plugin Skill/MCP execution remains unaccepted until the complete-session driver can install an isolated local Plugin fixture before Desktop startup through a product-authorized fixture path.
- Key-free tests, direct runtime calls, synthetic final text and packaged UI inspection must not be reported as real Agent behavior acceptance.
- Native-picker install/enable/disable/remove/reopen acceptance remains pending in a packaged Desktop because the current functional driver cannot operate the native directory picker; deterministic Main/application tests cover the lifecycle but do not replace that user-path evidence.

## Current Evidence (2026-08-14)

- `pnpm test:agent:eval` passed 45 files / 310 tests and dry-ran 26 suites / 77 cases; this proves authoring and harness readiness only.
- `desktop-extension-localization` passed in a visible real Electron development runtime at 1280x800 and 1000x700 with zero console errors or warnings. Pixel inspection confirmed English and Simplified Chinese management entry, Add local Plugin control, bundled Plugin cards and Browser/Computer runtime controls without clipping or overlap.
- `pnpm --filter @neko/app-desktop package` produced and verified the current darwin-arm64 application bundle. The same localization scenario could not reach the packaged bundle's CDP target before timeout, so packaged-launch evidence is not accepted.
- Deterministic Agent/Desktop tests cover root manifest validation, SQLite reopen and corrupt-row locality, contained staging, exact mutation identity, system-trash delegation, old JSON grant exclusion, independent Skill/MCP readiness and unsupported App projection.
- Provider-backed complete-session cases were not run: no fixture installation driver currently reaches the product-authorized local Plugin install boundary before the public Agent input path starts.

## Skill/Plugin Overview and Host Action Decision (2026-08-14)

- Decision: excluded from new provider-backed Agent behavior evaluation.
- Reason: the overview projection, owning-Plugin navigation, and Personal Skill open/reveal intents do not change Skill prompt content, selection, activation, runtime provenance, Tool routing, or model-visible behavior.
- Deterministic evidence must cover exact typed routes, current management identity/fingerprint and root containment checks, no physical path projection, Desktop adapter delegation, Personal-vs-Plugin action visibility, and bilingual copy.
- Existing provider-backed Plugin Skill/MCP cases remain required for the broader runtime change and are neither replaced nor satisfied by these management UI checks.
- Focused contract/manager/Webview/Renderer/preload tests passed 24/24; the focused Desktop AppHost delegation case and affected package typechecks also passed.
- The visible `desktop-extension-localization` scenario now checks the Personal Skill overview/actions and Plugin overview boundary, but the development Desktop CDP target was not reachable before timeout in two attempts; no visual acceptance is claimed for this addition.

## Residual Risk

- Root `plugin.json` intentionally uses a minimal portable subset; tracking future external Plugin specifications is deferred to a future install-boundary adapter.
- Official Marketplace, remote updates, publisher authentication and signatures have no P0 owner and are explicitly excluded.
- OAuth/App connector execution remains outside this change and must display unsupported per contribution.
- Local Plugin MCP execution remains a user-installed trust boundary; package containment, explicit enablement, credential isolation, Tool/action approval and exact runtime ownership remain required.
