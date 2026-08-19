## Why

Desktop 当前把 DSH subprocess、ACP、profile materializer 和 DSH-specific domain plugins 作为生产
Agent 路径。实际接入已经表明，这条路径要求 OpenNeko 重复维护会话投影、权限、配置、Tool bridge、
运行时打包和领域绑定，同时删除了原有成熟的 Agent Webview 与领域 capability composition。结果是
内容创作能力和最终 UI 被协议适配主导，领域 owner 不能通过现有 typed port 直接接入。

产品决定不再使用 DSH。替换必须一次性恢复 package-owned OpenNeko Agent application authority，
并删除 DSH 的全部生产入口、contract、profile、插件、打包和 fallback，避免第三条 Agent 成功路径。

## What Changes

- **BREAKING** 删除 DSH subprocess/ACP/session/profile/permission/runtime Host、`@neko/dsh-bridge`、
  Generation/Canvas/Cut DSH plugin 以及所有 DSH-specific contract、IPC、质量清单和开发运行时脚本。
- 恢复 `@neko/agent-runtime` 的唯一 Conversation/Turn/queue/permission/Tool/Skill/MCP application
  authority；Pi 只作为其通用 Agent loop、provider 和 Skill runtime adapter，不拥有 OpenNeko 领域事实、
  Desktop 信任边界或产品 UI。
- 恢复 `ToolRegistry + CapabilityRegistryRuntime` 的唯一领域能力组合路径，并通过 owning package public
  port 接入 Content、Generation、Canvas、Cut、Search 和 Automation；缺失 provider 或 exact owner 时当前
  capability fail-visible，不选择其他领域、provider、active/current Workspace 或旧 DSH Tool。
- 恢复已有 `@neko/agent-webview` 最终 UI 与 typed Main/preload/renderer projection，不重新开发 composer、
  模型选择、模式切换、上下文栏、Timeline 或消息组件。
- 保留磁盘上的既有用户数据；不启动 DSH 读取旧 transcript，也不迁移、覆盖或伪造内容。canonical catalog
  无法解析的记录必须在记录边界保留并显示 diagnostic，不得使 Window Shell、其他 Conversation 或 Workspace
  不可用。
- 增加 DSH absence/poison、canonical capability path、领域 owner、Desktop producer-consumer 与 Agent
  Evaluation 证据。

## Capabilities

### New Capabilities

- `openneko-agent-runtime-cutover`: 定义无 DSH 的唯一 OpenNeko Agent runtime、领域 capability composition、
  最终 UI 复用和用户数据 fail-local 要求。

### Modified Capabilities

<!-- None. -->

## Impact

- `packages/agent/contracts` 拥有 canonical Agent/Host/Webview contract；删除 DSH/ACP contract。
- `packages/agent/runtime` 拥有 Conversation application authority、Pi adapter、Tool/Capability registry、Skill、
  MCP 与领域 typed port composition。
- Content、Generation、Canvas、Cut、Search、Automation 继续拥有各自业务行为；Agent 只通过 public provider
  注册 Tool，不复制领域规则。
- `packages/agent/webview` 继续拥有最终 Agent UI；`apps/neko-desktop` 只组合 Electron sender、grant、IPC、
  process/credential/file adapter 和 package public Root。
- 删除 DSH bridge/plugin packages、运行时资源和相关 dependency/packaging inputs。
- 不修改用户创作事实；无法解析的历史记录保留原数据并局部失效。
