## Context

当前生产调用链为：

```text
Pi Tool Call
  -> Agent Extension QualityCapabilityProvider
  -> Agent-owned canonical QualityGateRuntime
  -> Agent-owned project facade orchestration or content materializer
  -> injected image.understand model
  -> QualityGateResult
```

Agent Quality 目录同时包含 canonical contract 和已无生产调用方的旧评分/remediation runtime。直接把整个目录移动到新包会保留两套成功路径，并让新包继续拥有 Tool-name repair mapping，与已接受 ADR 冲突。

## Goals / Non-Goals

**Goals:**

- 建立 `@neko/quality` 作为 canonical Quality core 和 provider-neutral model evaluator owner。
- 保持 Quality core/model host-neutral、provider-neutral。
- 让 Agent Extension 只负责 Tool schema、purpose-model 绑定和授权资源 materialization。
- 保持现有 `QualityCheck` 输入输出、Gate verdict、project facade 与 image understanding 行为。
- 删除 deprecated/无生产消费者的旧 Quality runtime，不提供兼容 export。

**Non-Goals:**

- 将跨包 Quality DTO 从 `@neko/shared` 迁入新包。
- 将 Cut/Canvas/Chara 的 rubric、project parser、repair/apply 或 revision mutation 移入 Quality core。
- 新增 Quality UI、后台 Job、持久化或 provider 配置。
- 修改 Pi loop、Tool Call 生命周期、Skill prompt 或 Webview protocol。

## Five-layer analysis

| Layer          | Decision                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Quality owns canonical Gate/evidence/model adapter；owning domain owns rubric/repair/apply；Agent owns Tool/Host composition。                                            |
| Dependency     | `quality -> shared`；Agent Extension 可依赖 Quality；Quality 禁止依赖 Agent runtime/Platform/Extension、VS Code、React、Content 或具体领域包。                            |
| Interface      | 显式暴露 `@neko/quality/core`、`@neko/quality/model`、`@neko/quality/project`；不增加 wildcard subpath export，不暴露旧 MediaQuality/Consistency/Remediation API。        |
| Extension      | 新 evaluator 通过 `QualityEvaluator` port 注入；新领域 Quality 通过既有 `ProjectQualityFacade` contract 接入；provider/model/runtime identity 继续由 Host snapshot 提供。 |
| Testing        | 移动 canonical Gate/project tests，保留 Agent Tool/provider path tests，增加静态 ownership/dependency poison，并运行聚焦 Agent evaluation。                               |

## Decisions

### 1. Package shape

```text
packages/neko-quality/
  src/
    internal/
      quality-gate-runtime
    core/
      index
    model/
      index
    project/
      project-quality-orchestration
      index
```

`internal/quality-gate-runtime` 隐藏实现细节；public entries 以显式 export 将 core contract 与 model adapter 分开。根 entry 只等价于 core，不聚合所有可选 adapter。

### 2. Core 只拥有 canonical Gate

Core 拥有：

- Quality profile selection；
- revision-bound evidence validation/freshness；
- evaluator port 和 materializer port；
- Gate aggregation、typed diagnostic 和只读 repair proposal；
- legacy path request 的 fail-visible poison。

Core 不拥有 domain parser、project IO、provider 配置、credential、Tool registration、repair executor 或 artifact mutation。

### 3. Model evaluator 只产生 evidence

`@neko/quality/model` 暴露 multimodal perception evaluator 及其最小 chat service/model identity ports。它只把授权 materialization 和明确 intent 转换成带 provider/model provenance 的 `QualityEvidence`。

Agent Host 将 `image.understand` purpose-model snapshot 适配到该 port；Quality 不读取配置、不选择 provider、不持有 credential，也不直接写项目。

### 4. Project orchestration 只调用 owning facade

`@neko/quality/project` 通过 `ProjectQualityFacadeResolver` 调用 owning package 提供的 facade，将 structural/runtime/export-readiness 结果投影成 canonical evidence。它不得导入 `.nk*` parser、领域 Extension 或项目文件 IO。

### 5. Agent Extension 是薄适配

Agent Extension 继续拥有：

- `QualityCheck` Tool name、参数 schema 和 Tool result wrapper；
- Capability provider registration；
- 当前 Host 的 content-access materializer；
- purpose-model runtime 到 model evaluator chat port 的适配。

它不得重新定义 Gate、evidence validation、project evidence aggregation、模型 evaluator prompt/parser 或 domain repair policy。

### 6. 删除旧平行路径

以下实现没有生产消费者，且使用已被 canonical contract 取代的旧 DTO 或 Tool-name repair mapping，因此直接删除：

- `MediaQualityRuntime` / `createMediaQualityRuntime`；
- `ConsistencyEvaluator`；
- `RemediationPlanner`；
- Agent Quality barrel 中的 legacy aliases；
- 未接入产品 feedback path 的 Quality review validation adapter；
- core 内只被测试调用的 repair executor、technical/CLIP adapter。
- `@neko/shared` 中无生产消费者的旧 `types/quality/qa-types` 场景路径、0-100 评分与 Tool-name remediation DTO。

旧文件和旧 exports 不保留 alias、fallback 或 compatibility barrel。Architecture tests 必须断言它们不存在。

### 7. Shared contract 暂留

`QualityTarget`、`QualityEvidence`、`QualityGateResult`、`ProjectQualityFacade` 等 canonical contracts 仍在 `@neko/shared`，因为它们同时被多个领域、Agent 和 Host 使用。旧 `types/quality/qa-types` 没有生产消费者且与 canonical issue/Gate/remediation 结构冲突，因此在本次删除。其余 contract 的物理迁移需要单独 OpenSpec，避免形成领域包反向依赖或一次性扩大 wire/persistence 迁移范围。

### 8. Evaluation disposition

本变更不修改 prompt、Skill、Tool schema、purpose-model policy 或输出 contract，但会改变 capability implementation route。

- disposition: `reuse`；
- owning suite: `agent-runtime.perception-routing`；
- canonical path: TUI/Host -> Pi Tool Call -> Agent thin capability -> `@neko/quality/model` -> configured `image.understand` model -> revision-bound evidence -> `@neko/quality/core` Gate；
- forbidden fallback: Agent-owned Gate runtime、deprecated MediaQualityRuntime、chat model代替 `image.understand`、mock evaluator 或 legacy path input；
- deterministic evidence: package architecture tests、Agent provider tests和旧路径 absence；
- real evidence: 复用 perception routing 的 provider-backed case；若当前环境没有配置对应 provider credential，记录 blocked，不用 mock 冒充。

## Risks / Trade-offs

- [Shared contracts still obscure physical ownership] → 文档明确 semantic owner；contract move 独立设计。
- [Removing test-only legacy APIs breaks hidden consumers] → repository-wide search and Knip establish no production imports；prelaunch canonical path policy permits removal。
- [Project orchestration looks domain-like] → It consumes only the neutral facade contract and cannot parse/mutate project facts；domain implementations remain in owning packages。
- [Model evaluator remains invoked by Agent today] → API is host-neutral and can also be called by non-Agent domain/Host composition later；Agent is only current adapter。

## Migration Plan

1. Add package manifest, strict config, public entries and architecture tests.
2. Move and narrow canonical Gate/model/project implementations and tests.
3. Update Agent Tool/Capability imports and delete old runtime/barrel/tests.
4. Integrate workspace dependency, boundaries, test ownership and docs.
5. Run Quality/Agent focused tests, typechecks, dependency/unused checks and Agent evaluation evidence.
