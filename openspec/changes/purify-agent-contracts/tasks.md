## 1. Export And Dependency Inventory

- [ ] 1.1 Classify every `@neko/agent-contracts` export as schema/codec or prohibited behavior and record
      each producer, consumer, runtime boundary, and owning domain dependency.
- [ ] 1.2 Add boundary fixtures that distinguish structural validation/direct wire construction from
      planning, projection, recommendation, transition, and review/presentation behavior.

## 2. Agent Domain Package

- [ ] 2.1 Create `packages/agent/domain` and `@neko/agent-domain` with one public entry, strict TypeScript
      settings, no Node/Electron/React/DOM/Pi/storage dependency, and package-role documentation.
- [ ] 2.2 Move shot-image preparation derivation, table, transition, and recommendation behavior while
      retaining types/constants/codecs/validators in Agent Contracts.
- [ ] 2.3 Migrate all shot-image producer and runtime/Webview consumers; delete old exports and add poison
      tests proving the new canonical path.
- [ ] 2.4 Move comic-animation perception/index projection, capability policy/diagnosis, shot-reference
      projection, and review-table/artifact behavior while retaining schema/codecs in Agent Contracts.
- [ ] 2.5 Migrate all comic-animation producer and runtime/Webview consumers; delete old exports and add
      poison tests proving the new canonical path.

## 3. Ownership And Compatibility Verification

- [ ] 3.1 Add dependency tests preventing owning domains from importing Agent Domain and preventing Agent
      Domain from mutating domain facts or importing runtime/application adapters.
- [ ] 3.2 Run existing serialized artifact fixtures through Agent Contracts and prove codec/version output
      remains unchanged across the extraction.
- [ ] 3.3 Run Agent Contracts/Domain/runtime/Webview tests and typechecks, package/application/Agent
      boundary gates, `pnpm build`, `pnpm test`, `pnpm check`, and `pnpm check:unused`.
- [ ] 3.4 Record actual commands/results, old-path deletion/search evidence, any intentionally retained
      package-local behavior with extraction criteria, and residual cross-domain dependency risk.
