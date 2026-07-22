## Why

OpenNeko 当前在 Pull Request 和每次 main push 上分别运行 `Branch Gate` 与 `Main Gate`，导致合并后才执行的平台打包无法阻止不可发布代码进入 main，同时普通远程 push 触发与本地开发门禁的职责重叠。仓库需要收敛为开发分支日常开发、开发分支到 `main` 的合并验收和 main 标签发布三条明确路径，在不为每次开发提交消耗远程矩阵资源的前提下，让完整构建、测试和打包在合并前成为硬门禁。

## What Changes

- **BREAKING** 将分支职责收敛为非 main 开发分支和唯一 `main` 发布分支；main 只接受非空、非 main 的开发分支 Pull Request。
- **BREAKING** 移除远程 `Branch Gate` / `Main Gate` 事件语义及普通 main push CI，替换为手动 `Manual Gate` 和 PR required check `Merge Gate`。
- 保留 `gate:local` 作为日常开发权威入口；普通开发分支 push 不自动触发 GitHub Actions。
- `workflow_dispatch` 在显式选择的 ref 上运行完整、无发布副作用的远程验证和双平台 VSIX 打包。
- 开发分支到 `main` 的 Pull Request 自动运行完整 TypeScript、Rust、Proto、OpenSpec、仓库质量和 macOS/Linux VSIX 打包；任一 required job 缺失、跳过、失败或取消都阻止合并。
- main 的版本标签发布前验证标签提交属于 main、版本标签与可发布 VSIX manifest 一致，并由受保护 release environment 执行 GitHub Release 创建。
- 迁移 GitHub 分支与 protection：创建初始 `dev` 开发分支，允许正常 push 但禁止 force push/删除；main required check 从 `Branch Gate` 原子切换为 `Merge Gate`。
- 更新本地命令、CI 编排测试、发布路径断言和质量 ADR，删除被替代的 branch/main 远程入口，不保留双门禁成功路径。

## Capabilities

### New Capabilities

- `tag-release-promotion`: 定义 main 版本标签的来源、版本一致性、批准、产物与 GitHub Release 发布约束。

### Modified Capabilities

- `tiered-quality-gates`: 将本地、PR 和 main push 三层远程门禁替换为本地开发、手动远程验证和开发分支到 `main` 的合并门禁。
- `local-agent-evaluation-execution`: 新的本地、手动和合并门禁均不得直接或间接执行 Agent Evaluation、真实 provider 或 GUI 验收。
- `code-debt-governance`: production debt 与 unused/architecture 检查必须保留在本地、Manual Gate 和 Merge Gate 中，不再依赖已移除的 Main Gate。

## Impact

- `.github/workflows/ci.yml`：事件、job 条件、完整打包矩阵和稳定聚合信号。
- `.github/workflows/release.yml`：标签来源、版本校验、并发、environment 和产物完整性。
- `package.json`：本地、手动和合并门禁的可复现命令入口；移除旧 branch/main 命令事实来源。
- `scripts/test-orchestration/`：事件拓扑、required job、平台矩阵、local-only 隔离和发布来源回归测试。
- `docs/architecture/adr-code-review-quality-gates.md` 与开发入口文档：开发分支/main 职责、手动 CI、合并门禁和发布流程。
- GitHub 外部状态：开发分支、main protection、main required check 和 release environment。
- 不修改业务运行时代码、用户项目数据、VSIX 内容契约、支持平台集合或 Agent/Webview 运行态验收边界。
