## 1. Delivered Foundation

- [x] 1.1 Replace the Home builtin capability channel with typed Extensions/Skill management contracts, sender-bound IPC and bilingual management presentation.
- [x] 1.2 Implement Pi SkillHost discovery for project, personal, plugin and builtin sources with deterministic precedence, fingerprint, locator, receipt and duplicate diagnostics.
- [x] 1.3 Implement contained personal Skill staging, Pi validation, atomic installation and recoverable removal through opaque management identity.
- [x] 1.4 Compose verified Plugin Skill roots and compatible MCP Tools through the existing Pi SkillHost, MCPManager and ToolRegistry paths with idle-only runtime replacement and disposal.
- [x] 1.5 Project Plugin runtime readiness and fail-visible unsupported/App/OAuth/connection diagnostics without manifest-only success.
- [x] 1.6 Add deterministic Agent, Desktop producer/consumer and Renderer coverage for the delivered foundation and exclude foreign application state and Desktop product modules.

## 2. OpenSpec and Canonical Contract Replacement

- [x] 2.1 Revise proposal, design, delta spec, evaluation and task scope to remove Marketplace from P0 and define independent Skill, local Plugin, SQLite and runtime authorities.
- [x] 2.2 Atomically replace marketplace-backed catalog fields/intents with bundled/local Plugin records, local install intent, enable/disable/remove/rescan and component-local readiness across Agent contracts, AppHost, preload and Renderer.
- [x] 2.3 Delete `marketplace`, available inventory, marketplace refresh, catalog-category recommendation and `name@openneko` identity from production contracts, fixtures, locale copy and tests; add rejection/poison tests for each removed payload.

## 3. Canonical Plugin Package

- [x] 3.1 Implement the root `plugin.json` minimal codec and fixed `skills/` / `mcp.json` discovery in `@neko/agent-runtime/extensions`, with reverse-domain validation for OpenNeko-specific metadata.
- [x] 3.2 Convert first-party Browser Use and Computer Use packages to the canonical layout and inject them as exact bundled Plugin roots from Desktop composition.
- [x] 3.3 Delete `.openneko-plugin` and `marketplace.json` readers, parser helpers, bundled index/resources and tests; prove `.openneko-plugin`, `.codex-plugin`, foreign marketplace and manifest-version paths cannot satisfy discovery.
- [x] 3.4 Add producer tests for missing optional components, duplicate Plugin identity, path/symlink escape, unknown top-level/private fields, invalid extensions namespace and independent Skill/MCP/App verification.

## 4. SQLite Plugin State and Local Installation

- [x] 4.1 Define the package-owned Plugin state repository contract and stable `neko.db#state` table for identity, delivery source, contained relative install locator, install lifecycle, enabled state and non-sensitive configuration references.
- [x] 4.2 Implement the `@neko/local-metadata` SQLite repository and inject it from Desktop's single metadata Store owner; add transaction, reopen, corrupt-row fail-local and sibling-preservation tests.
- [x] 4.3 Replace JSON enable grants with the SQLite repository and delete all production reads/writes of `${NEKO_HOME}/extensions/state/*.json`; add reachability tests proving old grants remain untouched and cannot control runtime.
- [x] 4.4 Add the typed local Plugin picker/install workflow with contained staging validation, exact identity conflict handling, canonical rename and visible cross-filesystem/SQLite interruption diagnostics.
- [x] 4.5 Implement exact enable, disable and recoverable remove coordination with runtime ownership checks, system trash, invalid durable-record preservation and no arbitrary installed-root auto-registration.

## 5. Skill and Contribution Independence

- [x] 5.1 Add path-level tests proving personal/project/builtin Skills discover, select and execute with no Plugin manager, MCP config or Marketplace source present.
- [x] 5.2 Change Plugin verification/runtime projection so valid Skill, MCP and App contributions have independent readiness; a failing MCP cannot hide or disable a valid sibling Skill.
- [x] 5.3 Preserve valid installed Plugins with no currently executable contribution as manageable unsupported records without synthetic Tools, Skills or manifest-only readiness.
- [x] 5.4 Maintain Skill-content boundary tests proving builtin/personal/plugin Skill prompts contain no concrete Tool name tutorial, parameter table, polling protocol or Host authoring schema.

## 6. Package Ownership and Executable Identity

- [x] 6.1 Finalize the `@neko/agent-runtime/extensions` public application entry for manifest, catalog, mutation, state port, personal Skill and runtime-generation lifecycle without Electron DTO or policy ownership.
- [x] 6.2 Reduce Desktop Main to app/resource/install roots, SQLite/file/picker/trash/process/env/credential adapters, sender-bound typed IPC composition and disposal; add consumer/delegation tests proving Agent package ownership.
- [x] 6.3 Project verified Pi SkillHost records into the canonical Entry/Session input catalog with exact source, Plugin identity and fingerprint; reject stale/same-name invocation without management-card, active/recent or source fallback.
- [x] 6.4 Add application/package boundary and poison tests proving removed marketplace, JSON grant, private manifest and Desktop policy paths cannot be imported, registered or return success.

## 7. Management Experience

- [x] 7.1 Replace installed/available Marketplace presentation with Skills and local Plugins, Add local, Enable, Disable, Remove, Rescan and honest empty states.
- [x] 7.2 Remove Marketplace/category recommendation copy and state; retain stable display-name/identity ordering, search, author-owned metadata and `en`/`zh-cn` coverage.
- [x] 7.3 Render durable invalid installation and per-component readiness diagnostics without exposing physical path, process arguments, environment, credentials, database details or raw errors.

## 8. Verification and Acceptance

- [x] 8.1 Run `pnpm --filter @neko/agent-contracts test`, `pnpm --filter @neko/agent-runtime test`, `pnpm --filter @neko/agent-webview test`, `pnpm --filter @neko/app-desktop test` and affected package typechecks.
- [ ] 8.2 Run `pnpm test:agent:eval`, `pnpm check:storage-authorities`, `pnpm check:application-boundaries`, `pnpm check:agent-boundaries`, `pnpm check:no-internal-versioning`, `pnpm check:legacy-debt`, `pnpm check:unused`, strict OpenSpec validation and `git diff --check`.
- [ ] 8.3 Package and launch a visible real Electron Desktop with isolated fixture storage; verify standalone Skill use, local Plugin install/enable/disable/remove/reopen, invalid-record locality, Skill-only/MCP-only/mixed contribution readiness and both locales.
- [ ] 8.4 Run provider-backed complete-session Plugin Skill and MCP cases through the public Agent input path; record infrastructure-blocked status when fixture installation or provider authority is genuinely unavailable.
- [x] 8.5 Perform Neko quality review across responsibility, dependency, interface, extension and testing layers and record remaining risks for deferred Marketplace, App connector and OAuth ownership.

## 9. VS Code-style Details and Personal Skill Host Actions

- [x] 9.1 Define overview-only Skill/Plugin presentation and source-scoped Host action requirements without projecting package contents or physical paths.
- [x] 9.2 Add exact typed Personal Skill open/reveal intents and manager-owned current identity/fingerprint/containment resolution with Desktop system adapters.
- [x] 9.3 Update the Extensions detail UI to show Skill/Plugin overview information, navigate Plugin-owned Skills to their exact Plugin, and expose open/reveal only for personal Skills.
- [x] 9.4 Add contract, manager, Desktop delegation, Renderer runtime, Webview interaction and bilingual copy coverage, including stale identity and no-path projection tests.
- [ ] 9.5 Run focused deterministic validation, record the Agent Evaluation exclusion decision, and perform visible UI plus Neko quality review.
