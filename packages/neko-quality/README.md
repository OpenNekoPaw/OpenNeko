# @neko/quality

OpenNeko 的中立 Quality runtime。该包拥有 canonical Quality Gate、evaluator/materializer ports、revision-bound evidence 聚合、provider-neutral model evaluator 和通用 ProjectQuality facade orchestration。

Public entries：

- `@neko/quality` / `@neko/quality/core`：profile、evaluator port、evidence freshness 和 Gate aggregation；
- `@neko/quality/model`：由 Host 注入模型与凭据的 multimodal evidence evaluator；
- `@neko/quality/project`：只调用 owning package `ProjectQualityFacade` 的项目证据编排。

该包不得读取 provider/config/credential，不得依赖 Agent runtime、Platform、VS Code、React、Content 或具体领域包，也不拥有领域 rubric、项目 parser、repair/apply、revision mutation 或 UI。

Desktop Agent composition 只保留 `QualityCheck` Tool/Capability 与 Host materializer；当前尚未建立 `@neko/quality` 的 Desktop 产品 consumer。Cut、Canvas、Chara、Assets 等 owning package 继续拥有各自的确定性检查、Gate policy 和修复写回。
