# W1 Provider Credential Authority Slice

## Scope And Ownership

This slice moves provider credential ownership out of the deleted Pi runtime:

- `@neko/host/settings` owns the host-neutral `ProviderCredentialAuthority`, exact provider identity, config ownership precedence and SecretStorage key semantics.
- `apps/neko-desktop` owns only the Electron `safeStorage` concrete adapter and composition.
- Direct-UI Generation consumes the `ProviderCredentialReader` public contract and receives only an ephemeral API-key credential for the exact provider.

The authority reads a valid config-owned API key without consulting SecretStorage. Invalid config fails before SecretStorage access. Non-config credentials use `openneko.provider.credential:<providerId>` in a new `provider-credentials.json` encrypted file. The retired `agent-credentials.json` and `openneko.agent.pi.credential:*` keys are not read, migrated, rewritten or deleted.

The retired macOS Pi authentication prompt and credential injection into the old Agent controller composition were deleted. No replacement auth protocol, compatibility adapter, environment fallback or no-op path was added.

## Remaining Work

OpenSpec task 4.11 remains incomplete. The rc.7 public surface is sufficient to implement a DSH-side `CredentialProvider`: providers resolve one `CredentialRef` per operation, and the OpenNeko bridge bundle can disable the base `credentials` entry before providing the unique replacement service. The Host response would travel only on Host→DSH stdin; DSH→Host stdout requests, Session events and Renderer projections need carry only a bounded reference.

That seam cannot yet be connected correctly. A `CredentialRef` is an environment-style name, not an OpenNeko provider identity. Production now has a public `session/new` consumer, but the current publication call does not carry the exact Conversation/Workspace provider and model into the DSH Session; DSH therefore retains its base `deepseek-official` / `deepseek-v4-flash` default while OpenNeko may select a different provider. Mapping a ref or DSH default to an OpenNeko provider would silently send the wrong credential and create a second configuration authority. Task 4.11 therefore still depends on task 2.5 publishing exact provider/model during Conversation→DSH Session creation. Task 2.5 is itself blocked on the missing public durable Session delete seam needed for provisional cleanup. No reverse credential code, environment fallback or duplicate credential service was added.

There is still no producer/consumer proof that secrets cannot enter ACP transport capture, Session, Renderer or Evaluation facts. Real provider/API validation remains explicitly skipped and is not release evidence.

Agent Evaluation disposition is `update`: `packages/host/src/settings/` maps to `agent-runtime.model-binding`. The eventual DSH-backed Desktop case must prove exact provider identity and credential-source success while poisoning environment, DSH settings, old Pi storage and alternate-provider fallback. The current DSH Desktop composition is incomplete, so no real case was run.

## Verification

- `pnpm --dir packages/host exec vitest run src/settings/__tests__/provider-credential-authority.test.ts src/settings/__tests__/provider-credential-source.test.ts`: passed, 6 tests.
- `pnpm --dir apps/neko-desktop exec vitest run src/main/desktop-media-execution-provider.test.ts`: passed, 2 tests.
- `pnpm --dir apps/neko-desktop exec vitest run src/architecture-boundary.test.ts -t "keeps provider credentials"`: passed, 1 focused test.
- `pnpm check:agent-boundaries`: passed.
- `pnpm check:package-boundaries`: credential findings are closed; one unrelated `index.ts` Pi catalog/Skill import remains for the next cutover slice.
- `pnpm --dir packages/host exec tsc --noEmit`: blocked by pre-existing `DesktopWorkbenchInteractionSurfaceRef.agentSurfaceId` test errors outside this slice.
