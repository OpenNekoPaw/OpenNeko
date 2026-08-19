# W6 Character DSH Authoring Slice

## Scope

This slice adds one official `openneko.character` DSH Tool with two canonical operations:

- `query` reads bounded facts for the exact CharacterProject target, including precise immutable
  CharacterVersion identities and publication lifecycle metadata.
- `fill-draft` fills only the exact fresh CharacterProject with the current canonical
  `CharacterDefinition` shape.

Both operations require the input `characterProjectId` to match the durable Conversation's exact
`authoring` / `character-project` target. The slice does not create global Characters, publish or delete
versions, modify evidence/candidates, create Room/runtime/memory facts, or accept Renderer/active target state.

## Ownership And Five-Layer Analysis

| Layer          | Decision |
| -------------- | -------- |
| Responsibility | `@neko/chara` owns schema, semantic validation, bounded project/version projection and the fresh-target write transaction. DSH owns Tool registration/call lifecycle. Desktop owns only exact Workspace grant resolution and Chara repository composition. |
| Dependency     | The Chara contract and application service are host-neutral. `@neko/agent-runtime/acp` depends only on public Chara entries and resolves exact DSH Session/Conversation context. Electron Main constructs the existing file repository after Workspace authorization; Renderer is not a dependency. |
| Interface      | One `openneko.character` identity, one `query/fill-draft` union and one explicit reverse ACP handler are used. Unknown fields, malformed canonical definitions, wrong target identity, non-authoring context and non-fresh targets fail with explicit diagnostics. |
| Extension      | Version publication/deletion, global Character creation, Room/runtime/memory and other Character workflows require separate accepted slices. They must not expand this fresh-target operation or introduce a generic Character command router. |
| Testing        | Domain producer/semantic/bounded/lifecycle tests, DSH plugin delegation tests, ACP dispatch/Host adapter tests and Desktop exact-target/grant tests provide deterministic path evidence. Profile closure and machine-readable inventory must prove production registration. |

## Canonical Path

```text
@neko/chara-dsh-plugin ctx.tools.register
  -> @neko/dsh-bridge opennekoHostTools reverse request
  -> DshAcpApplicationClient exact openneko.character dispatch
  -> CharacterDshHostAdapter strict decode
  -> DSH Session -> Conversation -> exact authoring binding
  -> exact character-project target + DesktopWorkspaceGrantAuthority
  -> existing Chara repository + CharacterAuthoringService
```

There is no MCP wrapper, legacy capability provider, generic Tool registry, wildcard handler, active/current/
recent Workspace or Character fallback, global Character write, Renderer authority or Evaluation direct-runtime
shortcut. A malformed request or unavailable target rejects only the current Tool call.

## Agent Evaluation Decision

- Behavior: a CharacterProject-bound Agent can inspect the exact target and fill its fresh draft once, while a
  wrong target, malformed definition, non-authoring context or non-fresh project fails visibly.
- Decision: `update` the existing Character authoring/creation owning suite selected by the Evaluation
  change-to-suite mapping.
- Canonical evidence required: exact `openneko.character` Tool identity and terminal call, DSH
  Session/Conversation binding, exact Workspace grant and CharacterProject target, owning Chara validator,
  and pre/post project facts with immutable CharacterVersion identities unchanged.
- Forbidden fallback: direct ACP injection, direct Chara service Evaluation call, old capability provider or Tool
  identity, MCP, active Workspace/Character selection, global Character creation or final-text-only success.
- Status: the complete DSH Desktop driver exists, but its scenario setup currently starts only at Entry or a
  generic Workspace surface. It cannot create/select an exact Character authoring surface, bind the resulting
  CharacterProject target, or collect the owning pre/post project facts required by this case. The retired global
  Character success case has been removed from executable discovery instead of being translated into a false
  success; the adjacent roleplay boundary now poisons `openneko.character`, and Character DSH implementation
  paths select `agent-runtime.creative-media-workflow`. The real provider and visible Desktop case therefore
  remains `infrastructure-blocked`; no direct-runtime scenario may substitute.

The foundational session/persistence matrix is not changed by the domain transaction, but the basic Tool path,
Conversation isolation, restored Character artifact projection and visible Desktop lane remain unverified.
Key-free validation is harness readiness only.

## Deterministic Verification (2026-08-20)

- Character domain schema, semantic validation, bounded project/publication projection and fresh-target mutation:
  `241` package tests passed.
- Character DSH plugin registration, strict DSH argument admission and Host-port-only delegation: `2` tests passed.
- ACP application/runtime dispatch and Character Host adapter: `375` runtime tests passed.
- Desktop exact authoring target, cross-Workspace rejection, Workspace grant and repository composition: focused
  Desktop tests passed.
- Production closure/profile, package role/product reachability, Tool inventory and extension registration graph:
  relevant package and Agent boundary checks passed.
- `pnpm test:agent:eval`: `45` files / `307` key-free harness tests and all `26` suites / `72` cases dry-run passed.
  This is infrastructure readiness, not Character Agent behavior acceptance.
