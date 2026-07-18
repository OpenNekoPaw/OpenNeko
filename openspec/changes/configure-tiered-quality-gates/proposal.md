## Why

当前仓库将本地复现命令、Pull Request 阻断和 main 发布验证混在同一组 `check:ci`/workflow job 中，缺少稳定的分层入口与可配置为分支保护规则的最终聚合信号。需要明确三层门禁，避免 Evaluation 等本地专项验证误入 CI，同时让 production legacy debt、未使用代码、构建、测试和发布矩阵在正确层级 fail-visible。

## What Changes

- 定义本地、分支和 main 三层质量门禁及稳定命令入口。
- 本地门禁执行不带 coverage 的完整 TypeScript 开发验证，保留格式、lint、build、workspace tests、unused、legacy 与架构检查。
- Pull Request 分支门禁继续执行 coverage 测试和仓库质量检查，并提供单一可设为 required check 的聚合结果。
- main 门禁在分支级检查之上聚合 Rust、Proto、OpenSpec 和平台打包结果。
- 保持 Agent Evaluation 为显式本地命令，禁止 GitHub Actions、通用 CI 命令和门禁聚合间接触发 Evaluation。
- 不新增本地化专项测试，也不改变现有 package 测试的业务覆盖范围。

## Capabilities

### New Capabilities

- `tiered-quality-gates`: 定义本地、Pull Request 分支和 main 三层门禁的职责、命令、聚合结果与禁止执行边界。

### Modified Capabilities

- `local-agent-evaluation-execution`: 通用本地/分支/main 门禁均不得直接或间接执行 Agent Evaluation。
- `code-debt-governance`: production legacy/fallback/deprecated debt 和 ledger consistency 必须保留在分支与 main 阻断门禁中。

## Impact

- 根目录 `package.json` 的质量门禁组合命令。
- `.github/workflows/ci.yml` 的 PR/main 聚合 job 与 required-check 名称。
- `scripts/test-orchestration/` 的门禁结果验证脚本和回归测试。
- `docs/architecture/adr-code-review-quality-gates.md` 的命令矩阵和三层门禁政策。
- 不修改业务运行时代码、Evaluation suite、provider/model 配置或本地化测试内容。
