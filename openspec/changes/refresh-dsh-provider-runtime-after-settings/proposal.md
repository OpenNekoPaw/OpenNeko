## Why

Agent 设置已经把 Provider、模型和默认用途写入 canonical 配置，但当前 DSH subprocess、profile 和 execution catalog 仍是应用启动快照，导致用户必须重启整个 OpenNeko 才能让新会话使用修改后的配置。

## What Changes

- Provider 或模型目录成功保存后，局部重物化 DSH profile、credential environment、subprocess 与 execution catalog，不重启 Desktop 应用。
- 没有运行中 turn 时立即刷新；存在运行中 turn 时保留该精确任务并排队刷新，任务结束后自动应用。
- 配置刷新排队期间拒绝启动使用旧 catalog 的新工作，并显示明确的局部状态。
- 默认模型引用通过同一局部刷新路径作用于后续新会话；既有 Conversation、DSH session identity、transcript 与 durable binding 不被改写。
- 删除“重启 OpenNeko 后生效”的产品路径和文案。

## Capabilities

### Modified Capabilities

- `desktop-dsh-provider-settings`: Provider 和模型目录修改改为局部刷新 DSH runtime，并为运行中 turn 提供有界排队语义。

## Impact

- `@neko/host` model-settings service 继续唯一决定 canonical 配置变更，并报告是否改变 DSH execution configuration。
- Desktop DSH runtime owner 负责重新投影 Provider、重物化 profile/credential environment、原子替换 subprocess 与 execution catalog，以及保护运行中 turn。
- Desktop Main 只组合现有 ConfigManager、CredentialAuthority 与 DSH runtime；不拥有新的 Provider 事实。
- Renderer 只展示 `applied` 或 `pending` runtime effect，不读取 secret，也不维护第二份 catalog。
