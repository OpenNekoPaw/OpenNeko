## Context

The accepted Pi architecture freezes one exact `purpose -> provider/model + parameters` policy per Turn. Portable Skills are discovered and invoked by the Pi SkillHost and may provide reusable method, task judgment, creative semantics, and output standards, but cannot grant Tool authority or select a provider/model. The repository nevertheless retains two disconnected provider-expression remnants:

1. `@neko/agent-contracts` exports `provider-card.ts` and advertises `providerExpressionProfile` manifest declarations plus `AgentCapabilityProvider.getProviderExpressionProfiles`, even though `CapabilityRegistryRuntime` registers only Tools and prompt fragments and no production provider implements either profile branch.
2. `providerExpressionProfileId` is carried from AI config through Host TOML, Agent configuration and Evaluation evidence without any registry or runtime consumer that resolves or applies the identifier.

The only live code imported from `provider-card.ts` outside this ghost graph is the media generation Tool's Markdown-to-generation-intent parsing types. Existing builtin `image`, `video`, and `media-production` Skills already own capability-neutral creative methods and are the appropriate reusable guidance surface.

## Goals / Non-Goals

**Goals:**

- Delete the provider-expression profile identity, registry, routing, adaptation and configuration graph atomically.
- Keep provider/model choice exclusively in the immutable Pi purpose model policy and real provider adapters.
- Preserve live media Tool behavior by making generation-intent parsing a package-private implementation detail.
- Use ordinary Pi Skills for capability-neutral expression guidance without giving Skills provider/model or Tool authority.
- Reject obsolete configuration locally and visibly while preserving unrelated user configuration and content.
- Add path-level absence and Evaluation evidence that the old graph cannot participate.

**Non-Goals:**

- Do not replace provider-expression profiles with a new profile registry, Skill metadata schema, model override, provider-specific Skill, compatibility reader, or migration.
- Do not change provider/model credentials, purpose selection, generation Job ownership, Tool schemas, or user-created Skills.
- Do not add a new Skill when the existing media Skills can own the reusable method.
- Do not rewrite or delete user TOML bytes.

## Decisions

### 1. Remove the entire expression-profile contract, not only its runtime registry

`@neko/agent-contracts` will delete `provider-card.ts`, its root export, `CapabilityDeclaration` profile variants, `AgentCapabilityProvider.getProviderExpressionProfiles`, and related diagnostic/contribution kinds. The canonical capability provider surface remains Tools, prompt fragments, reference contributors, and currently consumed artifact facets.

Keeping descriptor types without a consumer was considered and rejected because it advertises an extensibility point that cannot affect execution and was the sole reason the larger routing DSL survived the earlier dead-public-surface cleanup.

### 2. Remove the configuration field at every producer and consumer

`@neko/ai-contracts` removes `providerExpressionProfileId`; `@neko/host` removes the native TOML field, parser/export projection, source resolver and model service projection; Agent contracts/runtime/Webview and Evaluation remove the same field from their canonical shapes and hard gates. The accepted model shape contains only real provider/model identity and parameters.

The native TOML parser remains the owning trust boundary. A model entry containing `provider_expression_profile_id` is rejected as an obsolete unknown field with a diagnostic scoped to that configuration load/record. No old value is translated into a Skill name, prompt fragment, provider parameter or hidden default. Existing bytes remain untouched and unrelated valid provider/model/Skill records remain available according to the Host config owner's current fail-local behavior.

### 3. Internalize live generation-intent parsing

`@neko/agent-runtime` media generation Tools still need a bounded internal representation of parsed Markdown intent. Those types move beside `media-agent-tools.ts` and are not exported as a public provider/profile contract. They describe one Tool input normalization step and never select a provider, fallback chain or profile.

The Tool continues to execute through the exact model/capability already selected by the Turn snapshot. Provider-specific syntax and request shaping remain inside the selected provider adapter or a prompt fragment whose owning Tool is present.

### 4. Extend existing ordinary Skills

The builtin `image`, `video`, and `media-production` Skill bodies gain concise rules for converting user intent into provider-neutral expression constraints: subject, composition/camera, action/motion, style/light, audio/dialogue, duration, preservation and negative constraints, plus explicit distinction between observed evidence and desired output.

The Skills do not name OpenNeko Tools, configuration fields, providers/models, adapter parameters, routing algorithms, or UI flows. They are selected through the normal Pi catalog by explicit `$skill` invocation or natural-language matching. Skill activation does not change the Turn's provider/model snapshot; absent execution capability remains a visible unavailable result.

Creating a `provider-expression` Skill or mapping the deleted ID to a same-named Skill was considered and rejected because it would preserve the retired identity and make Skill selection a hidden compatibility route.

### 5. Keep Desktop as composition only

No host-neutral replacement logic is retained in `apps/neko-desktop`. Desktop continues to inject exact Host configuration and package-owned Agent/Skill ports at the Electron trust boundary. Any Desktop edits are limited to canonical type consumption and wiring deletion; no expression parsing, Skill selection, provider routing, or migration is added there.

### 6. Verification is path-level

Contract and architecture tests will assert deleted file/export/field/manifest/provider methods are absent, obsolete TOML cannot produce a successful model, and existing Skills contain capability-neutral expression guidance while forbidden provider/Tool/config protocol does not enter Skill bodies. Focused Agent Evaluation reuses the Skill-selection/Turn-policy owner where possible and records exact Skill activation plus unchanged effective model identity; the forbidden old field/profile path must be absent from facts and reports.

## Risks / Trade-offs

- **[Existing user TOML contains the retired field]** → Preserve bytes, reject the affected configuration locally with a precise diagnostic, and require the user to remove the obsolete field; do not silently ignore or migrate it.
- **[Skill guidance cannot guarantee provider-specific prompt syntax]** → This is intentional. Provider-specific request shaping belongs to the exact adapter/capability prompt and must fail visibly when unsupported.
- **[Removing exported types breaks internal consumers]** → Update all producers, consumers, fixtures, Evaluation schemas and tests atomically; add absence tests and run repository boundary/type gates.
- **[Existing active changes overlap Agent contracts/runtime]** → Apply surgical patches around current worktree edits, never revert or reformat unrelated content-document and prompt-composition changes, and inspect the final diff by path.
- **[Real Agent behavior cannot be exercised without provider/cost authorization]** → Complete key-free schema/path checks and record real visible/hidden Desktop execution as explicitly blocked rather than claiming behavior acceptance.

## Migration Plan

1. Add focused absence/obsolete-field/Skill-boundary tests that fail against the current graph.
2. Internalize media generation intent types and prove unchanged Tool behavior.
3. Remove provider-expression contract, capability declaration and configuration/projection/Evaluation fields in one boundary-wide edit.
4. Enhance existing Skills and validate the builtin Skill catalog and anti-protocol guards.
5. Run focused typechecks/tests, strict OpenSpec and repository gates, then run/reuse the focused Agent Evaluation case when infrastructure is authorized.

Rollback is a source revert of the atomic change before release. There is no runtime compatibility or dual-read rollback path, and user configuration bytes are never rewritten.

## Open Questions

None. The accepted architecture already fixes provider/model ownership and ordinary Skill semantics.
