## Context

当前公共链为 `GenerationJob -> GenerationExecutionPort -> MediaGenerationService ->
MediaGenerationExecutor`。executor 先解析 AI SDK provider，否则进入 MediaAdapter。AI SDK V3 video
provider 通常在单次 `generateVideo` 内提交并轮询；Job 虽有 `providerTask` 和恢复状态机，却无法统一
重建 AI SDK model 的 status 调用。MiniMax 仍由旧 V1 adapter 拥有。

### Five-layer analysis

| Layer          | Decision                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| Responsibility | GenerationJob 拥有 durable lifecycle、poll/reconcile/retry/cancel 与 result commit；AI SDK Provider 只拥有外部协议。 |
| Dependency     | `@neko/generation` 消费 `@neko/ai-sdk` public runtime；Provider 不依赖 Job、Desktop、Agent 或 Renderer。             |
| Interface      | Job 保存现有 `{providerId, externalTaskId}` checkpoint；describe/cancel 同时接收 Job 中冻结的 model binding。        |
| Extension      | 新异步视频模型实现同一 AI SDK VideoModelV4 start/status contract，并由精确 provider type 唯一解析。                  |
| Test           | 覆盖 request mapping、task 持久化先于轮询、恢复不重提、精确 provider/model、旧路径 poisoned 和 sibling isolation。   |

## Decisions

### GenerationJob is the only asynchronous lifecycle owner

`GenerationJobCoordinator` 负责何时轮询、何时停止、如何在重启后 reconcile，以及何时提交结果。
Provider 返回的 task id 只是 Job checkpoint，不建立通用 TaskManager、第二个 task repository 或
Agent-owned 后台任务。DSH Tool 可以提交和观察 Job，但不复制状态机。

执行端口的 external-task describe/cancel 接收冻结的 provider/model binding。Job snapshot 已保存该
binding，因此不把 model id 复制进 provider task，也不按 active/default model 恢复。

### AI SDK provides execution primitives, not the durable loop

异步 AI SDK 视频执行使用 `experimental_startVideo` 立即取得 operation，解析出精确 task id 并通过
`onExternalTask` 等待持久 commit 完成；随后才允许 status 查询。普通运行与重启恢复使用同一个
`experimental_getVideoStatus`/VideoModelV4 `doStatus` 语义。不得调用会在 Provider 内部隐藏 task id 的
`experimental_generateVideo` 作为 H3/Seedance 成功路径。

### Seedance uses the official ByteDance provider

`@neko/ai-sdk` 通过 `@ai-sdk/bytedance` 创建 Seedance model。Provider type `bytedance` 唯一映射到该
runtime；配置的 base URL 和 credential 由 Host 注入。默认文档目标是 BytePlus ModelArk，其他 endpoint
只有在用户显式配置且通过同一协议校验时使用。

### H3 uses one start/status VideoModelV4 implementation

最新官方 MiniMax Provider 已覆盖 H3 请求，但当前实现仍在 `doGenerate` 内部轮询，不能在付费提交后
立即把 task id 交给 Job。因此 `@neko/ai-sdk` 提供一个 H3 VideoModelV4 start/status 实现，直接映射
MiniMax V2 API；它不是旧 MediaAdapter 的 wrapper，也不注册第二条 H3 成功路径。官方 Provider 增加
等价 start/status 后，替换必须原子完成并删除本地实现。

### Canonical video inputs are role-typed

视频请求使用角色明确的 input union：first-frame、last-frame、reference-image、reference-video、
reference-audio。Job 仅持久化 `ContentLocator`；Host materializer 在执行前生成 provider-ready bytes/URL。
H3/Seedance adapter 负责把 canonical roles 映射到 AI SDK `frameImages`、`inputReferences` 和 typed
provider options。互斥角色、数量、媒体类型、时长与分辨率在 provider 边界前失败，不删除输入、不夹取
数值、不退回 prompt-only 请求。

## Canonical path

```text
Agent DSH Tool or direct generation control
  -> exact Workspace GenerationJobPort
  -> GenerationJobCoordinator
  -> MediaGenerationService
  -> MediaGenerationExecutor
  -> exact AI SDK provider/model
  -> startVideo
  -> persist provider task checkpoint
  -> Job-owned status scheduling / restart reconcile
  -> result commit
```

MiniMax 的旧 V1 MediaAdapter 注册是被替换路径。AI SDK provider failure 不得进入 MediaAdapter，
Seedance/H3 failure 不得切换 gateway、模型或默认 provider。

## Runtime and user-data boundary

- Host：Provider config、credential、authorized ContentLocator materialization。
- `@neko/ai-sdk`：Node/HTTP 外部 provider boundary 和 model implementation。
- `@neko/generation`：host-neutral contract 与 Node application execution/Job owner。
- Job snapshot：不保存 credential、absolute path、Base64、临时 URL 或完整 provider response。
- 既有有效 Job 和产物保持可读；单个失效 provider task 在该 Job 上进入明确 diagnostic，不影响 sibling。

## Evaluation

Provider/model routing、异步恢复和 Agent generation Tool 均受影响。复用并更新
`agent-runtime.workflow-controller` 的 GenerationJob cases；确定性测试证明路径和恢复。真实 H3/Seedance
调用需要用户显式成本授权与可用 credential，否则记录 `infrastructure-blocked`，不得用 mock 结果宣称
真实 provider 验收。
