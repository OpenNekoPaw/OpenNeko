## 1. Delete Dead Runtime Modules

- [x] 1.1 Delete `runtime/src/provider/{provider-card-parser,provider-card-registry,provider-card-loader,provider-card-runtime,provider-router,provider-expression-context}.ts`, `provider/cards/`, and `provider/index.ts`.
- [x] 1.2 Delete `runtime/src/approval/`, `runtime/src/permission/`, `runtime/src/validation/`, `runtime/src/perception/`, `runtime/src/profile/`.
- [x] 1.3 Delete `runtime/src/runtime/capability/{external-processor-runtime,external-research-capability-provider,external-research-mcp-capability,external-research-url-policy,external-research-projection,research-note-markdown,fake-external-research-provider,mcp-external-research-provider,capability-runtime-registries,capability-runtime-bindings}.ts`.
- [x] 1.4 Delete `runtime/src/session/conversation-control-runtime.ts`, `runtime/src/tools/tool-pattern-matcher.ts`, and empty `runtime/src/memory/`, `runtime/src/events/`.

## 2. Delete Dead Contract Files

- [x] 2.1 Delete `contracts/src/{creative-ai-invocation,agent-autoheal,prompt-schema,agent-output-validation,capability-kind,external-processor}.ts`. (`runtime-config.ts` kept: real test consumer `runtime-isolation-contracts.test.ts`.)

## 3. Collapse Public Entries

- [x] 3.1 Remove dead exports from `runtime/src/index.ts`, `runtime/src/runtime/index.ts`, `session/index.ts`, `session/types.ts`, `tools/index.ts`, and `mcp/index.ts` where applicable.
- [x] 3.2 Remove `./approval` and `./validation` subpath exports from `runtime/package.json` (also removed now-unused `ajv` dependency and stale knip entry patterns).
- [x] 3.3 Remove dead exports from `contracts/src/index.ts`.
- [x] 3.4 Surgically remove provider-card/artifact-profile/provider-expression-profile branches from `runtime/src/runtime/capability/capability-registry-runtime.ts`.

## 4. Verification

- [x] 4.1 Add a path-absence/public-surface test proving deleted symbols are absent from the runtime root entry and that canonical symbols remain.
- [x] 4.2 Run `pnpm --filter @neko/agent-runtime --filter @neko/agent-contracts run typecheck`.
- [x] 4.3 Run `pnpm --filter @neko/agent-runtime --filter @neko/agent-contracts run test`.
- [x] 4.4 Run `pnpm check:unused` and record residual findings.
