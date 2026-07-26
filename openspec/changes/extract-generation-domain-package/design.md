## Context

`@neko/platform` 当前同时拥有配置、provider adapters、媒体生成 service、Agent Tool
registration、generated output helpers 和 `GenerationJob`。它是迁移中的集成层，不是稳定
bounded context。GenerationJob 已具备独立 identity、persistence、recovery 和 direct TUI
consumer，因此继续由 Agent Platform 拥有会违反领域事实与调用方边界。

本仓库已有一级领域包先例：`@neko/quality`、`@neko/search` 和 `@neko/chara`。Generation
当前不需要独立 Extension/Webview/发布生命周期，所以先建立一个一级 npm package，而不是
立即复制 `neko-agent/packages/*` 的二级组结构。

## Goals / Non-Goals

**Goals:**

- 让 Generation contract 与 GenerationJob 直接归属于一级领域包。
- 让 Job coordinator 依赖可替换的 execution port，而不是 Platform concrete service。
- 保持一个 Host-owned 配置读取和 credential 边界。
- 迁移生产 consumer，并证明旧 Platform Job path 不再成功。
- 为后续 provider/routing/finalization 迁移建立正确依赖方向。

**Non-Goals:**

- 一次性搬迁所有 Platform provider adapter、vision preprocess 或 generated asset helper。
- 新建 `GenericModelManager`、`GenericJobManager` 或统一领域 payload/result。
- 为 Generation 新建 VS Code Extension Host、Webview 或配置文件。
- 改变 provider 请求、计费、模型选择结果或 generated artifact 格式。

## Five-Layer Analysis

| Layer          | Decision                                                                                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Generation owns request/result/capability/Job facts; Host owns mutable config and credentials; Agent owns only Tool orchestration.                                               |
| Dependency     | `@neko/generation -> @neko/shared`; Platform and Hosts depend on Generation. Generation never imports Agent, Platform, VS Code or React.                                         |
| Interface      | `GenerationExecutionPort` exposes image/video/audio execution plus exact external-task describe/cancel. Job store and result committer remain separate ports.                    |
| Extension      | Provider runtime can move implementation-by-implementation without changing Job contract; a second-level package appears only after a real independent surface/lifecycle exists. |
| Testing        | Package architecture guards, migrated Job/store tests, TUI production path tests, Platform no-export poison, build/dependency checks and focused Agent Evaluation.               |

## Decisions

### 1. Generation is a first-level domain package

Initial shape:

```text
packages/neko-generation/
  package.json
  tsconfig.json
  src/
    contracts.ts
    execution.ts
    job/
    index.ts
```

The package is host-neutral. It may gain subpath exports such as `./job` or `./testing`, but it does not
gain `packages/extension` or `packages/webview` until it owns a separately activated product surface.

### 2. Contracts move before provider implementations

Generation request/result and provider observation contracts move first because they are the language
shared by Job, Platform provider runtime and consumers. Platform can implement the contracts, but cannot
re-export Job symbols or retain a second local definition.

`GenerationExecutionPort` contains only:

```text
generateImage
generateVideo
generateAudio
describeExternalTask
cancelExternalTask
```

It has no config mutation, registry access, file IO, Tool registration or artifact delivery.

### 3. Configuration remains Host-owned

One canonical Host config runtime reads and merges:

```text
~/.neko/config.toml
.neko/config.toml
Host credential store
```

Generation declares purpose/capability requirements. The Host eventually projects an immutable effective
binding into the provider runtime. The domain package never opens config files and never persists API
keys in Job snapshots. The first slice keeps the existing Platform routing implementation behind
`GenerationExecutionPort`; moving it requires a later vertical slice with real effective-binding
consumers, not an unused parallel config interface.

### 4. No additional Host

VS Code Extension Host and TUI remain the runtime hosts. Each composition root constructs one
Generation coordinator per workspace/runtime instance. A Generation host adapter is a module, not a new
process, extension identity or global singleton.

### 5. Breaking migration with no compatibility facade

The migration order is:

1. Create `@neko/generation` contracts and Job implementation.
2. Change Platform implementation and production consumers to import the new package.
3. Move Job tests to the owning package.
4. Delete Platform Job files and public exports.
5. Add source/path guards rejecting Platform Job imports and local duplicate contracts.

Because OpenNeko is prelaunch, no compatibility export is retained. Persisted SQLite schema and
`generation` Job identity remain unchanged, so valuable local Job state continues to recover.

## Evaluation Decision

- Disposition: `update` `agent-runtime.workflow-controller`.
- Canonical path: TUI/Agent/domain input -> caller adapter -> `@neko/generation`
  `GenerationJobCoordinator` -> internal `GenerationExecutionPort` -> domain store -> stable result refs.
- Forbidden fallback: Platform Job export/local coordinator, generic Task/TaskRef, direct JobStore
  mutation, domain-local config reader or a second ConfigManager.
- Deterministic evidence: exact package imports, execution port invocation, persistent recovery, no-export
  poison and dependency checks.
- Real evidence: configured provider proves model identity, Job revision/progress and terminal artifact
  through the new package path. Key-free harness is not real acceptance.

## Risks / Trade-offs

- [Partial extraction leaves Platform media implementation] -> accepted only as an explicit implementation
  adapter behind the new domain port; Job ownership and public contracts move now, remaining migration is
  tracked and cannot regain Job exports.
- [Duplicate contract drift] -> Platform local generation contract files are deleted rather than
  re-exported.
- [Package proliferation] -> one first-level package only; no nested packages or separate Host until a
  real lifecycle requires them.
- [Config split] -> domains declare requirements, but one Host runtime reads files and credentials.
- [Persisted Job loss] -> table/schema/kind stay unchanged; strict codec tests prove recovery continuity.

## Migration Plan

1. Establish package and move contracts/Job with architecture guards.
2. Adapt Platform media runtime to the new contracts and execution port.
3. Migrate TUI and Extension imports; poison Platform Job access.
4. Run focused tests, build, dependency checks and key-free Evaluation.
5. In a later slice, move provider adapters/routing/execution and generated-output ownership out of
   Platform, then remove the remaining media manager surface.

## Remaining Platform Media Ownership

| Current files                                                                                                             | Target owner                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `adapters/*`, `media-adapter-capabilities.ts`, `media-generation-kind.ts`, `media-operation-capabilities.ts`, `routing/*` | `@neko/generation` provider implementation                                                    |
| `media-generation-executor.ts`, `media-generation-service.ts`, `media-request-assets.ts`                                  | `@neko/generation` application/provider runtime with Host-injected asset materialization port |
| `media-generation-output-finalizer.ts`, `media-file-downloader.ts`, `media-generated-asset.ts`, `generated-asset-*`       | Generation output application layer plus Node/VS Code Host adapters                           |
| `media-generation-delivery-settings.ts`                                                                                   | Existing Host configuration projection; the domain must not read settings                     |
| `media-agent-tools.ts`, `media-turn-dispatcher.ts`                                                                        | Agent/TUI caller adapters consuming the public GenerationJob application port                  |
| `vision-preprocessor.ts`, `vision-preprocess-policy.ts`                                                                   | Perception/media-input owner; these are not generation responsibilities                       |

The follow-up migration must move a complete row at a time and then delete its Platform path. It must
not add a reverse `@neko/generation -> @neko/platform` dependency or a Platform re-export facade.
