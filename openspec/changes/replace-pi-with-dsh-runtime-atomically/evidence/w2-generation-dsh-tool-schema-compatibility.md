# W2 Generation DSH Tool Schema Compatibility

## Scope

`@neko/generation` owns the model-facing `openneko.generation` parameter schema. The video
reference-input array used `anyOf`, while the pinned `@deepseek-ai/dsh-tools` rc.8 contract accepts
`oneOf` for value unions. This made `defineTool` reject the schema at TypeScript build time and
caused its `execute(args)` inference to degrade to optional generic JSON values.

The three video input alternatives are already mutually exclusive through the required `type`
constants `image`, `video`, and `audio`. Replacing `anyOf` with `oneOf` therefore preserves the
accepted input set while restoring the pinned DSH schema contract and exact inference for required
`operation` and `input`. The DSH plugin remains a registration/delegation adapter and does not add a
type assertion, duplicate decoder, compatibility branch, or alternate Host Tool path.

## Agent Evaluation disposition

- Decision: `reuse`.
- Owning suites: `agent-runtime.external-automation` for `submit-comfyui` and
  `agent-runtime.workflow-controller` for ordinary Generation Tool execution.
- Coverage delta: none. The canonical Tool identity, operations, Host reverse request, result and
  failure semantics are unchanged.
- Canonical path: DSH `defineTool` schema admission -> `openneko.generation` plugin delegation ->
  ACP reverse Host Tool -> Generation owning decoder/application runtime.
- Forbidden path: no unconstrained JSON schema, type assertion, duplicate plugin-side domain
  validation, generic Host registry, MCP wrapper, Computer Use fallback, or provider fallback.
- Real provider execution: not authorized for this focused compile fix; no provider/model/cost
  authorization was supplied. Key-free validation is recorded only as harness readiness.

## Deterministic evidence

- `@neko/generation` schema test asserts the exact three discriminated `oneOf` alternatives and
  rejects any remaining `anyOf` keyword.
- `@neko/generation-dsh-plugin` typecheck/build proves `defineTool` accepts the canonical schema and
  infers required `operation` and `input` without assertions.
- Plugin tests prove exact registration, successful `describe`/`submit` delegation, semantic
  negative rejection before Host execution, and absence of parallel Tool paths.

## Validation results

- `pnpm --filter @neko/generation typecheck`: passed.
- `pnpm --filter @neko/generation test -- src/dsh-tool.test.ts`: passed, 31 files / 183 tests.
- `pnpm --filter @neko/generation-dsh-plugin typecheck`: passed.
- `pnpm --filter @neko/generation-dsh-plugin test`: passed, 1 file / 2 tests.
- `pnpm --filter @neko/generation-dsh-plugin build`: passed.
- Targeted ESLint, Prettier and `git diff --check`: passed.
- `pnpm exec openspec validate replace-pi-with-dsh-runtime-atomically --strict`: passed.
- `pnpm check:application-boundaries`: passed, 1,372 files / no findings.
- `pnpm test:agent:eval`: passed, 45 files / 315 tests; dry-run 27 suites / 84 cases. This is
  key-free harness evidence only, not real Agent behavior acceptance.
- `pnpm check:agent-boundaries`: blocked by pre-existing repository gate drift outside this change:
  the inventory expectation contains `submit-comfyui` while its extracted registration inventory
  does not, and the gate references the absent `packages/agent/contracts/src/tool-names.ts`.
