## Context

仓库当前已有格式、lint、build、coverage、Knip、dependency-cruiser、legacy ledger、架构边界、Proto、Rust、OpenSpec 与平台打包检查，但只有 `check:ci`/`ci:local` 这一组通用组合名称。GitHub Actions 直接暴露多个 job，没有稳定的最终 PR/main 聚合信号；本地复现也会默认使用与服务器相同的 coverage 成本。Agent Evaluation 已有 local-only 守卫，必须继续与所有通用门禁隔离。

职责分析：根脚本拥有可复现的门禁组合，GitHub Actions 拥有 runner/事件/矩阵编排，package test config 继续拥有业务测试发现范围，Evaluation runner 继续拥有本地专项行为证据。

依赖分析：门禁只组合既有命令，不让 workflow 复制业务测试逻辑；聚合 job 只消费 job result，不读取业务产物。Evaluation、Webview functional 和 provider-backed 验证不成为通用 CI 的传递依赖。

接口分析：公开接口是稳定的 `gate:local`、`gate:branch`、`gate:main` 命令以及 `Branch Gate`、`Main Gate` required-check 名称。聚合脚本只接收 GitHub `needs` 结果 JSON 和必需成功 job 列表。

扩展分析：未来新增确定性 job 时，只需将其加入对应 aggregator 的 `needs` 和 required-success 列表；无需修改其他 job 或创建第二套 workflow。

测试分析：用 Node 单元测试覆盖 success/skipped/failure/cancelled/required-skipped 聚合语义，用现有 Evaluation local-only guard 覆盖传递脚本隔离，用 OpenSpec/quality gate 验证 workflow 与文档。

## Goals / Non-Goals

**Goals:**

- 提供成本递增、职责明确的本地、PR 分支和 main 门禁。
- 为 GitHub branch protection 提供稳定的单一 `Branch Gate` 信号。
- 为 main 提供包含 Rust、Proto、OpenSpec 和平台打包的稳定 `Main Gate` 信号。
- 保留 production legacy debt、unused code 和架构检查的服务器阻断能力。
- 保持 Agent Evaluation 显式本地运行且不可被通用门禁传递触发。
- 将本机 VS Code 配置、Extension Development Host、GUI 与真实 API/provider 验收明确归入 local-only 测试入口。

**Non-Goals:**

- 不改变任何 package 的 Vitest include/exclude，也不新增本地化专项测试。
- 不把 Webview functional、真实 Agent Evaluation 或 provider-backed case 变成通用 CI。
- 不在仓库内配置 GitHub branch protection API；仓库只提供可选择为 required check 的稳定 job 名称。
- 不解决当前工作树中与 TUI/UI 业务改动相关的测试失败。

## Decisions

### 1. 本地门禁使用无 coverage 的完整开发组合

`gate:local` 依次执行 build gate、普通 workspace tests 和 repository quality。它保留与 PR 相同的生产质量语义，但不生成 coverage，从而降低本地重复运行成本。

替代方案是只运行 lint/affected tests；这会让 Knip、legacy ledger、架构边界或完整构建问题延后到服务器，不适合作为提交前门禁。`check:fast` 继续作为非阻断快速反馈命令。

### 2. 分支门禁保留 coverage 与仓库质量阻断

`gate:branch` 等价于现有完整 TypeScript CI：`check:build`、`check:test`、`check:repository-quality`。GitHub 仍将这些 lane 并行执行，最终由 `Branch Gate` 聚合 job 判定；根命令用于本地串行复现，而不是让 workflow 放弃并行度。

### 3. main 门禁聚合发布级平台信号

`gate:main` 根命令在 branch 级组合后增加 Proto 同步检查，作为源码级本地复现入口。GitHub 的 `Main Gate` 额外要求 main push 上的 Rust、Cargo Deny、OpenSpec、TS VSIX 和平台 Engine VSIX job 成功，因为这些检查依赖 GitHub runner 矩阵，不能由单一跨平台 pnpm 命令可靠替代。

### 4. 聚合器 fail-visible 且只允许显式 optional skip

新增纯 Node 聚合脚本读取 `needs` JSON：任何 failed/cancelled job 都失败；required-success job 被 skipped 或缺失也失败；只有路径条件导致的 optional job skipped 可通过。脚本不接受默认成功、不吞掉未知 result。

### 5. 专项验证不进入通用门禁

Agent Evaluation、provider-backed case、Webview functional acceptance 保持显式本地/专项执行。现有 localization 单元测试仍由 owning package 决定是否属于普通测试；本变更不新增也不重写其发现范围。

### 6. 本地运行态测试与远端确定性测试物理隔离

远端 `gate:branch` / `gate:main` 只组合干净 checkout 可重现的 build、固定 unit/contract tests、coverage、静态架构和发布矩阵。依赖 gitignored `.vscode`、已运行 VS Code/CDP target、GUI、真实用户配置、credential、provider 或外部 API 的测试文件不得匹配远端测试发现 glob，也不得由 workflow 或远端根脚本直接或传递引用。

本机 VS Code launch/tasks 审计使用 `.local.mjs` 文件和显式 `test:local:vscode` 命令，由 `gate:local` 调用；配置全部缺失时视为未配置并跳过，只存在一部分时 fail-visible。GUI/Extension Host 与真实 API 验收继续通过 `test:local:ui`、`test:local:api` 和对应 Skill/runner 显式运行，不成为 `gate:local` 的隐式外部依赖，避免默认产生窗口操作、费用或凭据读取。

## Risks / Trade-offs

- [本地完整门禁仍可能较慢] → 不启用 coverage，并保留 `check:fast` 作为迭代反馈；提交前使用 `gate:local`。
- [聚合 job 因 optional job skipped 被误判] → required-success 与 optional job 显式分开，并用回归测试覆盖 skipped 语义。
- [新增 workflow job 后忘记纳入聚合] → 文档规定新增确定性阻断 job 必须更新 aggregator；编排测试审计稳定 job 名称和依赖。
- [main 根命令无法覆盖平台矩阵] → 文档明确 `gate:main` 是源码级复现，GitHub `Main Gate` 才是发布级权威信号。
- [全量测试存在资源型超时] → 不通过排除业务测试或放松失败来掩盖；保持 fail-visible，并由 owning package 修复确定性或资源配置问题。
- [本地运行态入口可能因环境未准备而不可运行] → 配置审计允许“完全未配置”显式 skip；GUI/API 入口由开发者显式选择并记录 infrastructure blocked，不回退为远端或 mock 成功。

## Migration Plan

1. 新增分层根命令并保留 `check:ci`、`ci:local` 兼容别名。
2. 新增可测试的 CI job result 聚合脚本。
3. 在 workflow 增加 `Branch Gate` 与 `Main Gate`，不改变现有 lane 的执行内容。
4. 更新质量 ADR 和编排守卫。
5. 验证后将 GitHub main 分支保护的 required check 配置为 `Branch Gate`；旧的单项 required checks 可在确认新聚合信号稳定后移除。

回滚时删除两个 aggregator job，并将 `ci:local` 恢复为 `check:ci`；底层检查 job 和业务测试不受影响。

## Open Questions

- GitHub 仓库管理员需要在本变更合入后手动将 `Branch Gate` 设置为 main 分支 required check；该外部配置不由仓库代码自动修改。
