# D0 Desktop Pi Consumer Cut

## Removed Production Consumers

Desktop Main no longer imports or composes:

- `@neko/agent-runtime/pi`
- `NodePiConversationCatalogReader`
- `createAgentCredentialRuntime`
- `createNodeSkillPackageCreationService`
- `resolveAgentSkillsDir`
- the Pi-coupled macOS protected authentication prompt

The old Pi Skill creation capability was removed rather than replaced with a no-op. The old Pi Conversation catalog is not read. Until the DSH Conversation catalog owns Agent CharacterVersion references, the Agent reference reader throws an owner-qualified composition diagnostic. `CharacterVersionReferenceInventoryService` therefore returns incomplete coverage and deletion remains fail-closed, preserving user data instead of treating missing Agent references as an empty success.

Desktop also no longer registers the retired Character/World capability providers through `createAgentAppHost`. Direct Character and World UI/application services remain available to their owning domains, but Agent execution cannot reach them until W6 registers new typed DSH domain Tools. The architecture poison test rejects restoration of all four old provider registrations.

The old `createAgentAppHost` and controller composition are already deleted package producers but still have unresolved Desktop consumers. They remain explicit ACP/Desktop replacement inventory; this slice does not restore them or claim Desktop Agent functionality.

## Verification

- Production scan over `apps`, `packages` and `scripts` excluding tests and `scripts/dsh-q0` found no Pi public entry/catalog/credential/Skill consumer.
- `pnpm --dir apps/neko-desktop exec vitest run src/architecture-boundary.test.ts src/main/retired-pi-composition-poison.test.ts src/main/retired-extension-composition-poison.test.ts`: passed, 3 files / 25 tests.
- `pnpm check:package-boundaries`: passed with no findings.
- `git diff --check`: passed for the slice.

Full test-fixture/Evaluation deletion proof, DSH catalog projection and Desktop ACP composition remain incomplete W4/W5/W7/W8 work.
