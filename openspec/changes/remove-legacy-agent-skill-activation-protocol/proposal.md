## Why

Pi 已经是唯一 Agent loop、Session、transcript 和 Skill 发现/读取路径，但生产 Prompt、公共 contract、Webview 投影、Chara policy 与 Agent Evaluation 仍保留旧 `GetContext`、Skill activation slot 和 ToolSet/category 协议。这些无生产 owner 的平行路径会误导模型和维护者，并可能让旧消息或测试夹具掩盖 canonical Pi 路径缺失。

## What Changes

- **BREAKING** 删除无生产 producer 的 Skill activation progress contract、Desktop IPC allowlist、Webview handler/presenter/state/props 与公共导出。
- **BREAKING** 删除无生产 consumer 的 ToolSet、Tool injection、Tool category registry/tier resolver 和可选 category bridge；保留实际注册 turn tools 的 `ToolRegistry` 与 capability contribution owner `CapabilityRegistryRuntime`。
- 将系统 Prompt 收敛为 Pi Skill catalog、`read_skill`、显式 `$skill` 与自然语言匹配规则，删除不存在工具和 lifecycle slot 的说明。
- 删除 Chara、i18n、测试和 Agent Evaluation 中对旧 activation/meta-tool 的依赖，并改用当前真实 Tool/Capability 路径。
- 增加旧符号 absence/poison、唯一 producer-consumer、公共导出收敛和聚焦 Agent Evaluation 证据。
- 保留 Pi SkillHost、Conversation/Turn/queue、permission/approval、Capability lifecycle、领域 Job 与 Desktop projection 生命周期；这些仍由 OpenNeko owning package 管理，不交给 Pi 或旧 Skill activation 协议。

## Capabilities

### New Capabilities

- `legacy-agent-skill-activation-retirement`: 定义旧 Skill activation、ToolSet/category 和假 meta-tool 路径的完整退役要求，以及 Pi/OpenNeko owner 边界与无回退验收。

### Modified Capabilities

- 无。

## Impact

- `packages/agent/contracts` 拥有 host-neutral Agent/Webview contract；移除旧 activation 与 ToolSet/category 公共 surface，并一次性迁移全部 consumer。
- `packages/agent/runtime` 拥有 Prompt、Pi bridge、Tool/Capability composition；删除旧提示词、category bridge 和死实现，但保留 Pi SkillHost、`ToolRegistry`、`CapabilityRegistryRuntime` 与 Conversation runtime。
- `packages/agent/webview` 只拥有 Renderer 投影；删除无 producer 的 activation progress UI 链，不改变真实 capability lifecycle result 展示。
- `apps/neko-desktop` 只移除旧 Host message allowlist；不新增业务逻辑，也不改变 typed capability lifecycle IPC。
- `packages/chara` 删除对不存在 Skill activation 工具的 policy 阻止项；Character 领域 owner 与真实 capability policy 不变。
- `scripts/agent-eval` 更新外部评测 fixture/hard gate，使其只引用当前可执行 Tool，并记录真实 Desktop provider-backed 验收是否可运行。
- 不迁移或覆盖用户当前正在修改的 Agent launch/message queue 文件；若发现相邻旧 runtime surface，作为 `deferred-overlap` 独立记录。
> **后继处置（2026-08-21）**：删除 legacy activation 的结论仍有效，但其中 Pi-specific runtime 描述已由 `replace-pi-with-dsh-runtime-atomically` 的 DSH Skill authority 取代。
