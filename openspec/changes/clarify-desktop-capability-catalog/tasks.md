## 1. Contract and owner

- [x] 1.1 Replace the Home builtin capability DTO/channel with a versioned extension catalog contract, safe discovery diagnostics and rejection coverage for the removed capability payload.
- [x] 1.2 Add a Desktop Main extension catalog reader that projects only valid OpenNeko package
      manifests and safe MCP Server/Skill/App contribution summaries.

## 2. Main and preload composition

- [x] 2.1 Inject the extension reader into Desktop AppHost, preserve global personal/builtin Skill discovery, remove Shell domain projection and return the new extension result.
- [x] 2.2 Migrate Main IPC and preload to the extensions channel/bridge, with no fallback to the removed capabilities path.

## 3. Extension catalog experience

- [x] 3.1 Rename the Home navigation and management Surface to Extensions, replace Built-in capabilities with Extensions, and render manifest metadata plus contribution labels.
- [x] 3.2 Preserve personal-first deterministic Skill ordering and author-owned
      personal/plugin metadata.
- [x] 3.3 Add complete English and Simplified Chinese extension-shell copy while preserving extension manifest metadata verbatim.

## 4. Tests and validation

- [x] 4.1 Add reader, producer/consumer and Renderer regressions proving invalid/foreign plugins
      and Desktop modules are excluded, supported Skill/MCP fixture contributions are projected,
      paths and execution fields are absent, and both locales render correctly.
- [x] 4.2 Run focused Desktop tests, Desktop typecheck/build, strict OpenSpec validation, `git diff --check`, and applicable boundary/debt checks.
- [x] 4.3 Restart and validate the Extensions Surface in a real Electron Desktop host for both
      locales, Skill filtering, the honest empty OpenNeko catalog and absence of builtin capability
      claims.
- [x] 4.4 Perform the Neko quality review across responsibility, dependency, interface, extension and testing layers; record residual risk.

## 5. Management contract and OpenNeko owner

- [x] 5.1 Replace the manifest-only extension result with installed/available, compatibility,
      runtime readiness, catalog revision and typed plugin/Skill mutation contracts.
- [x] 5.2 Replace the manifest-only reader with an injected OpenNeko repository adapter for list,
      install, remove and catalog refresh, preserving safe manifest projection and diagnostics.
- [x] 5.3 Add a personal Skill manager with staged Pi validation, contained atomic install and
      recoverable removal using opaque management identity.

## 6. Pi Agent integration

- [x] 6.1 Add plugin Skill source identity/provenance and deterministic
      project > personal > plugin > builtin selection to Pi SkillHost.
- [x] 6.2 Parse compatible plugin MCP definitions into the existing MCP runtime, including contained
      stdio cwd/command, allowlisted inherited env and supported HTTP bearer configuration.
- [x] 6.3 Compose plugin Skill roots and connected MCP Tools into Desktop Pi turns with idle-only,
      atomic runtime generation replacement and explicit disposal.
- [x] 6.4 Project per-plugin runtime readiness and fail-visible unsupported/App/OAuth/connection
      diagnostics without manifest-only success or fallback.

## 7. Management experience and i18n

- [x] 7.1 Implement localized plugin install, remove, refresh, busy, confirmation and operation
      states.
- [x] 7.2 Implement personal Skill add/remove management, plugin Skill provenance and immutable
      builtin/plugin action states.
- [x] 7.3 Complete `en` and `zh-cn` coverage while preserving author-owned plugin and Skill metadata.
- [x] 7.4 Filter available inventory through the Pi SkillHost/OpenNeko MCP support policy and add
      content-creation-first recommended sorting without hiding installed unsupported plugins.
- [x] 7.5 Replace the Codex/OpenAI marketplace and `.codex-plugin` path with an OpenNeko-owned
      repository snapshot, `.openneko-plugin` package contract and isolated OpenNeko install root;
      poison foreign application marketplace/config/cache access.
- [x] 7.6 Exclude builtin Skills and builtin-only diagnostics from the Home management contract,
      cards and counts while preserving builtin discovery for Pi Agent turns.
- [x] 7.7 Remove the low-value Skill source and extension status/category/sort selectors while
      preserving search, tabs and deterministic product ordering.

## 8. Agent evaluation and verification

- [x] 8.1 Add deterministic producer/consumer, repository adapter, personal Skill, Pi plugin Skill,
      MCP registration/call, generation swap and no-fallback tests.
- [x] 8.2 Record and validate the Agent Evaluation authoring decision for plugin Skill/MCP routing;
      update/create focused canonical and failure coverage as required.
- [ ] 8.3 Run focused tests, Desktop and affected package typecheck/build, `pnpm test:agent:eval`,
      strict OpenSpec, boundary/debt/unused checks and `git diff --check`.
- [ ] 8.4 Validate plugin install/remove state, personal Skill management, both locales and Agent
      runtime readiness in a real Electron Desktop host without mutating non-fixture user data.
- [x] 8.5 Perform the Neko quality review and record unavailable provider-backed Desktop
      complete-session evidence as an explicit infrastructure blocker when applicable.
