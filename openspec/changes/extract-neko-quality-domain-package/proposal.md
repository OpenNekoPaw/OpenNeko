## Why

当前 canonical Quality Gate、模型感知 evaluator 和 ProjectQuality facade 编排仍位于 `neko-agent` Extension。Agent 因此既是通用 Pi/Tool Host，又成为 Quality runtime owner；同时同一目录还保留已无生产调用方的旧 `MediaQualityRuntime`、旧评分 DTO、Consistency runtime 和 Tool-name remediation 映射。

已接受的 Agent 简化 ADR 要求 `@neko/quality` 成为中立 Quality core，Agent Extension 只保留 Tool/Capability/Host 适配。本变更建立该 package，迁移仍在使用的 canonical path，并删除旧平行实现。

## What Changes

- 新建 `packages/neko-quality` / `@neko/quality`，提供显式 `core`、`model` 和 `project` public entry。
- 将 canonical QualityTarget/Profile、evaluator port、evidence freshness、Gate aggregation 和 ProjectQuality facade orchestration 移入新包。
- 将 provider-neutral multimodal evaluator 通过 `@neko/quality/model` 暴露；provider/model 配置和 credential 继续由 Host 注入。
- `neko-agent` Extension 仅保留 `QualityCheck` Tool schema、Capability provider 和 VS Code/content-access materializer。
- 删除无生产消费者的 deprecated `MediaQualityRuntime`、Consistency runtime、旧 remediation planner、Quality review feedback adapter 及旧 Agent Quality barrel，不保留 compatibility re-export。
- 删除 `@neko/shared` 中无生产消费者的旧 `types/quality/qa-types` 场景路径、评分和 Tool-name remediation DTO，只保留 canonical media-quality contract。
- 增加 package ownership/dependency tests，证明旧 Agent runtime 文件不存在，Quality core/model 不依赖 Agent runtime、Platform、Extension、VS Code 或 React。

## Capabilities

### New Capabilities

- `neko-quality-domain-package`: canonical Quality Gate、evaluator ports、模型 evidence adapter 和通用 ProjectQuality facade orchestration 的唯一中立 package owner。

### Modified Capabilities

- `agent-quality-capability`: Agent 从 Quality runtime owner 收敛为 Tool/Capability/Host composition adapter。

## Impact

- 新增 `packages/neko-quality` 和 Agent Extension workspace dependency。
- 删除 `packages/neko-agent/packages/extension/src/capabilities/quality` 下除 canonical Tool adapter 外的实现。
- 删除 `packages/neko-types/src/types/quality/qa-types.ts` 及旧 export；canonical `media-quality.ts` 和 `project-quality.ts` contract 继续保留。
- 移动 ProjectQuality orchestration 及其测试。
- 更新 dependency-cruiser、Knip、strict tsconfig、测试 ownership、Agent architecture guard、package boundary 文档和 lockfile。
- 不移动 `@neko/shared` 中仍有消费者的 canonical Quality contract，不改变 `QualityCheck` Tool schema、模型用途选择或 Webview protocol。
