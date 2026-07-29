## Why

媒体生成的请求、provider capability、结果和可恢复 `GenerationJob` 当前位于
`packages/neko-platform/src/media`。但它们同时被 Agent Tool、TUI direct
mode、VS Code direct generation 和未来 Canvas/Character consumer 使用；继续嵌套在
`neko-agent` 会把 Agent 错误表达为所有生成模型与异步生成事实的 owner。

配置读取也仍与媒体 runtime 组合在 `Platform` 中。若直接把整个 ConfigManager 搬入新包，
Generation 会拥有用户文件、credential mutation 和 Host watcher；若创建一个转发到
`@neko/platform` 的新包，则只会增加 compatibility facade，不能形成新的 canonical path。

## What Changes

- 新建一级领域包 `packages/neko-generation` / `@neko/generation`，与 `neko-agent`、
  `neko-quality`、`neko-search`、`neko-chara` 和 `neko-cut` 平级。
- 第一垂直切片让新包直接拥有 generation request/result、provider capability contract、
  `GenerationExecutionPort` 和完整 `GenerationJob` contract/coordinator/store/codec/migration。
- `GenerationJobCoordinator` 只依赖窄 execution port，不依赖 `MediaGenerationService`、
  `ConfigManager`、Agent、VS Code 或 Webview。
- 现有 Platform provider runtime 暂时实现该 port；TUI/Extension 等 consumer 直接依赖
  `@neko/generation` 的领域契约，不再从 `@neko/platform` 获取 Job 类型或实现。
- 删除 `@neko/platform` 的 GenerationJob export 和本地 Job 实现；禁止 compatibility
  re-export、双 store、双 coordinator 或 fallback。
- 配置文件继续由 Host-owned canonical config runtime 统一读取和合并。领域只声明 purpose、
  capability 和 immutable effective binding contract，不读取 TOML、不解析 credential、不持有
  watcher 或配置 mutation。
- 后续切片再把 provider adapters/routing/execution 和生成产物 finalization 从 Platform
  迁入 Generation；本变更不创建第二个 Host 或独立 VS Code Extension。

## Capabilities

### New Capabilities

- `generation-domain-package`: 定义 Generation 一级领域包、canonical contract/Job ownership、
  Host 配置投影边界和无 platform compatibility path 的迁移要求。

### Modified Capabilities

- `domain-job-lifecycle-kernel`: Generation producer 从 `@neko/platform` 迁入
  `@neko/generation`，生命周期与恢复语义保持不变。

## Impact

- 新包：`packages/neko-generation/`。
- 迁出：`packages/neko-platform/src/media/generation-job-*` 与 generation
  contract types。
- 消费者：`apps/neko-tui`、`packages/neko-agent/packages/extension`、Platform media runtime。
- 配置：仍使用 `~/.neko/config.toml`、`.neko/config.toml` 和 Host credential store；不增加
  domain-local 配置文件。
- Evaluation：更新 `agent-runtime.workflow-controller` 的 package/path evidence；真实 provider
  行为必须证明新 package/port 被命中且旧 Platform Job path 未参与。
