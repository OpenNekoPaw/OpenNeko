## 1. Freeze Host Export Dispositions

- [ ] 1.1 Inventory every Host export with owner, consumers, product/domain coupling, runtime layer,
      mutability/lifecycle, concrete effects, boundary evidence, and target disposition.
- [ ] 1.2 Apply Host admission/exclusion rules and resolve every `application.ts`, `commands.ts`,
      `workspace-content-settings.ts`, and `projection-attachment.ts` export.
- [ ] 1.3 Add failing export/import guards for application identities, product commands, registries,
      concrete adapters, React, and ownerless domain DTOs in `@neko/host`.

## 2. Move Non-Primitive Responsibilities

- [ ] 2.1 Define the Desktop-owned L0 application identity/handoff/storage contract and migrate
      Main/preload/renderer producers and consumers with storage compatibility tests.
- [ ] 2.2 Move product command IDs/payloads to owning domain or Desktop contracts and mutable command
      registry implementations to Desktop composition or owning runtime.
- [ ] 2.3 Move or retain workspace-content and projection helpers export by export according to the
      admission rule, with consumer and runtime-boundary tests.
- [ ] 2.4 Narrow Host root/subpath exports and migrate consumers to precise ports; delete old barrels,
      aliases, fallback registries, and dual contracts.

## 3. Validate Host Primitive Boundary

- [ ] 3.1 Run Host and Desktop producer/consumer tests, IPC/storage path assertions, package
      typechecks/builds, and dependency/legacy/unused guards.
- [ ] 3.2 Run `pnpm build`, `pnpm test`, `pnpm check`, Desktop packaging, and focused real Electron
      application-start/IPC/resource-release acceptance.
- [ ] 3.3 Update architecture/package documentation and record exact validation, data behavior, and
      residual risk before identity normalization.
