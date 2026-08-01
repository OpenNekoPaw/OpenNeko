## Evaluation Scope

- Change/feature: Plugin Skill and MCP contributions become available to Desktop Pi Agent turns.
- Decision and owning suite:
  - `update` `agent-runtime.skill-runtime` for plugin Skill source, receipt and no-source-fallback
    once the Desktop complete-session driver can install an isolated fixture plugin before launch.
  - `create` a focused `agent-runtime.plugin-mcp-routing` owner for dynamic MCP registration/call
    evidence once that same driver can project fixture plugin state. `agent-runtime.perception-routing`
    is not the owner because it validates media perception model routing rather than dynamic Tool
    registration.
- Why real Evaluation is required: Skill selection and Tool registration/routing change model-visible
  behavior and executable Tool availability.
- Canonical path:
  - plugin Skill: OpenNeko install root -> verified `.openneko-plugin` manifest -> Pi SkillHost
    plugin root -> Pi read receipt.
  - plugin MCP: verified contribution -> MCPManager connection -> dynamic MCP Tool ->
    ToolRegistry/Pi projection -> MCP client call.
- Forbidden fallback: manifest-only readiness, personal/builtin Skill substitution, synthetic Tool,
  direct MCP call outside Pi, App connector fallback, old capability cards.

## Cases

- Canonical Skill case: an installed fixture plugin contributes a uniquely named Skill; the selected
  Pi receipt must contain source `plugin`, exact plugin id and expected Host fingerprint.
- Skill boundary case: uninstall/disabled/invalid plugin Skill cannot be selected and no
  personal/builtin record may satisfy the expected identity.
- Canonical MCP case: an installed fixture plugin starts an isolated synthetic MCP server, exposes
  one Tool and completes a Pi Tool call through the MCP client.
- MCP failure case: invalid/unsupported/unconnectable contribution produces a runtime diagnostic,
  registers no Tool and cannot return success.
- Required evidence: Skill receipt, registered Tool identity, Tool call status, plugin/runtime
  generation revision, MCP server/tool provenance and zero forbidden fallback counts.

## Verification

- Key-free validation: `pnpm test:agent:eval` plus focused suite dry-runs.
- Deterministic path validation: Pi SkillHost, MCP runtime, Desktop composition and IPC tests with
  old paths poisoned.
- Available catalog support filtering is deterministic Main projection, covered by policy tests that
  reject App-only/no-contribution/invalid packages and accept Pi-valid Skill or supported MCP
  packages. It does not substitute for installed plugin Agent routing evidence.
- Home builtin exclusion uses disposition `excluded`: the changed behavior is a deterministic
  Desktop management projection and cannot alter Pi Skill selection, injection or execution.
  Contract, Main and Renderer tests reject builtin Home payloads and omit builtin records,
  diagnostics, duplicate counts, filters and cards, while Desktop Agent composition regressions
  continue to prove builtin discovery through the Agent-owned Pi SkillHost path.
- Foreign marketplace exclusion is deterministic repository ownership, covered by a poisoned
  Codex/OpenAI local marketplace fixture that must remain unread and unprojected.
- Real case: run through the Desktop-owned complete-session driver when available.
- 2026-07-31 deterministic results:
  - focused Desktop extension/runtime/composition: 3 files, 32 tests passed;
  - Agent runtime: 98 files, 925 tests passed;
  - Evaluation harness: 35 files, 234 tests passed; 22 suites and 50 dry-run cases;
  - application boundary: 1,411 files passed; Agent boundary: 488 files passed;
  - Desktop lint passed with one unrelated existing unsafe-regex warning;
  - legacy-debt, strict OpenSpec, focused formatting and `git diff --check` passed;
  - production Electron packaging passed and contains the empty first-party
    `extension-marketplace/marketplace.json`.
- 2026-07-31 Home builtin-exclusion follow-up:
  - Desktop: 64 files, 360 tests passed, including shared contract, Main projection,
    Renderer and packaged builtin Agent discovery regressions;
  - Evaluation harness: 35 files, 234 tests passed; 22 suites and 50 dry-run cases;
  - application boundary: 1,411 files passed; Agent boundary: 488 files passed;
  - Desktop lint passed with one unrelated existing Cut unsafe-regex warning;
  - legacy-debt, unused, strict OpenSpec, production Electron packaging and
    `git diff --check` passed.
- 2026-07-31 management-toolbar simplification follow-up:
  - the Renderer removes source, status, category and sort selectors together with their local
    state, parsers and selector-only locale keys;
  - search and the Skill/extension segmented control remain, while Skill personal-first ordering
    and extension content-creation-first ordering are fixed and deterministic;
  - focused Renderer coverage passed with 1 file and 19 tests, including `en`/`zh-cn` rendering
    without selector markup; complete Desktop coverage passed with 64 files and 362 tests;
  - production Electron packaging passed, and the restarted packaged app exposed only search plus
    the Skill/extension segmented control on both tabs; source, status, category and sort controls
    were absent from the visible UI and accessibility tree.
- Production Electron runtime evidence:
  - the OpenNeko extension catalog is honestly empty and contains no Codex/OpenAI or other
    application marketplace records;
  - the Home Skill tab projects only personal/plugin management records; the current package has
    neither and therefore shows an honest empty state while deterministic Agent composition tests
    continue to discover packaged builtin Skills;
  - Simplified Chinese and English Skill source menus contain only all, personal and plugin;
    extension title, recommended sorting and empty states were exercised in the packaged app, and
    the locale was restored to follow-system.
- Additional boundary regressions prove a package cannot escape the OpenNeko snapshot through an
  intermediate symlink and a Tool conflict in a later workspace cannot partially replace an earlier
  workspace's plugin generation. Failed generation construction disposes its MCP manager.
- Repository-wide Desktop tests currently have three unrelated Resource Browser/Workbench failures,
  and Desktop typecheck plus `check:unused` are blocked by the same active workbench change and
  existing input/prompt strictness errors. No reported error references the extension manager,
  plugin runtime or Agent plugin composition files.

## Blocked or Unexecuted Cases

- The repository currently documents that Desktop has no complete-session evaluation driver.
  Provider-backed execution is therefore expected to remain `infrastructure-blocked` unless that
  owner is added independently. Key-free or direct runtime tests must not be reported as real Agent
  behavior acceptance.
- Current scenario steps cannot install a contained global plugin fixture before Desktop startup, so
  adding either case to an indexed suite now would create a permanently failing scenario rather than
  executable coverage. Deterministic Pi SkillHost, generation swap and synthetic MCP call tests are
  retained as path evidence only; the indexed suite update/create remains blocked on that driver.
- Because the first-party marketplace is intentionally empty, the production app cannot exercise a
  real install/remove/readiness cycle without either adding a maintained plugin or adding an isolated
  Desktop fixture-profile driver. The packaged empty-catalog check is runtime UI evidence, not plugin
  lifecycle or Agent execution acceptance.

## Residual Risk

- OAuth/App connector execution remains outside this change and must display unsupported.
- OpenNeko-maintained plugin code remains a user-installed trust boundary; management confirmation,
  package containment and workspace permission policy remain required.
- The provider-backed complete-session Skill/MCP cases remain `infrastructure-blocked`; deterministic
  Tool calls and key-free Evaluation cannot substitute for model-selected Pi execution.
