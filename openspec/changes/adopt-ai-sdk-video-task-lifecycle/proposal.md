## Why

`@neko/generation` 已经拥有可恢复的 `GenerationJob`，但媒体执行仍把 AI SDK 与轮询
`MediaAdapter` 作为并列栈，并由具体 provider 或 executor 内部等待异步任务。最新 AI SDK 7 已提供
可序列化 operation 的 `startVideo/getVideoStatus`，且官方 ByteDance Provider 支持 Seedance；现有
MiniMax adapter 仍调用旧 `/v1/video_generation`，无法表达 H3 V2 的多模态输入。

如果继续让 SDK/provider 自己拥有轮询，外部 `task_id` 不能在付费提交后立即写入 Job，应用退出时会
失去恢复依据。Generation 还需要一条精确、可测试且不回退旧 adapter 的执行路径。

## What Changes

- 将 Generation 使用的 Vercel AI SDK 升级到 7.x，并同步 `@neko/ai-sdk` Provider 依赖。
- `GenerationJob` 继续作为异步生成的唯一 durable owner；AI SDK/provider 只提供 start、status 和可选
  cancel 原语，外部 task identity 在提交成功后立即持久化为 Job checkpoint。
- 为 Seedance 接入官方 `@ai-sdk/bytedance` VideoModelV4 start/status 路径。
- 为 MiniMax H3 提供唯一的 AI SDK VideoModelV4 start/status 实现，调用 `/v2/video_generation` 与
  `/v2/query/video_generation/{task_id}`；删除旧 MiniMax V1 MediaAdapter 成功路径。
- 将视频请求收敛为角色明确的首帧、尾帧、参考图片、参考视频和参考音频输入，并在调用 provider 前
  fail-visible 校验 H3/Seedance 约束，不依赖 SDK warning 静默忽略输入。
- AI SDK 不支持的既有 provider 继续由其唯一 MediaAdapter 执行；同一 provider type 不得同时注册到
  两个执行栈，也不得在失败后切换栈或 provider。

## Capabilities

### New Capabilities

- `generation-video-task-lifecycle`: AI SDK 视频 operation 与 GenerationJob checkpoint、恢复和取消边界。

### Modified Capabilities

- `generation-single-execution-stack`: MiniMax 从旧 MediaAdapter 原子切换到 AI SDK H3 Provider，并新增
  ByteDance/Seedance 的 AI SDK owner。

## Impact

- Owning responsibility：`@neko/generation` 拥有 Job、轮询调度、恢复、失败和产物提交；
  `@neko/ai-sdk` 拥有第三方 Provider 格式、认证和 AI SDK model 实现；Desktop 仅注入凭据与配置。
- Affected packages：`packages/generation`、`packages/ai/sdk`、`packages/ai/contracts`、Host 配置 codec 与
  相关测试；不改变 Renderer、DSH Session 或 Agent Tool contract 的 owner。
- User data：既有 Job identity、请求、产物和 provider task string 保持；凭据、URL materialization 和
  Base64 不进入 Job snapshot。
- Replaced path：`MiniMaxMediaAdapter` V1 注册和执行被删除，H3 请求不得回退旧 V1 endpoint。
