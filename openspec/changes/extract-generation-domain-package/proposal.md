## Why

`@neko/generation` 已成为 Desktop generation request/result、provider capability 和 recoverable
GenerationJob contract 的 owner，但 Desktop 仍没有一个可由多个消费者共享的 Workspace application
runtime。Canvas 在包内私建 coordinator 与 `ConfigManager`，Agent generation Tools 没有生产注册点，
Agent composer 的 direct media mode 仍进入 Conversation `sendMessage` 或被 canonical controller 拒绝。
因此当前代码无法证明 direct operation 与 Agent Tool 命中同一 Job owner，也无法排除隐藏
AgentSession、第二配置 authority 和旧 media dispatcher。

## What Changes

- 保持 `@neko/generation` 对 GenerationJob contract/coordinator/store/codec 的唯一所有权。
- 在 `@neko/generation/job` 建立 application-scoped、Workspace-qualified runtime；每个 exact
  Workspace identity 只物化一个共享 GenerationJob owner，并由 Desktop application lifecycle 释放。
- Desktop Host 只注入 Workspace authority、同一配置投影产生的 execution port、持久 store 与结果
  committer；Generation、Canvas 和 Agent 不读取配置文件或 secret。
- Canvas direct action 与 Agent Tool 只消费共享 runtime 返回的同一 `GenerationJobPort`；删除 Canvas
  私有 owner/config 路径，Agent 不创建 generation-specific Session。
- direct media operation 使用独立 typed application intent，不经过 Conversation `sendMessage`；
  Agent Tool 使用 exact Turn purpose binding。两条入口都提交 canonical GenerationJob，失败不得切换入口。
- Provider/config/credential 由 Desktop Host 投影成 immutable binding，不产生兼容 facade。
- 完成一个有明确成本授权的真实 provider path 验收。

## Capabilities

### New Capabilities

- `generation-domain-package`: Generation package ownership、Job lifecycle、Host binding 与 no-fallback path。

### Modified Capabilities

- `domain-job-lifecycle-kernel`: Generation producer 使用 `@neko/generation` 的唯一 Job owner。

## Impact

- `packages/generation`、Desktop Agent/Canvas consumers、Agent Webview direct generation adapter 和
  provider runtime。
- 不保留 TUI/VS Code consumer、Platform Job re-export、双 store/coordinator 或 fallback。
