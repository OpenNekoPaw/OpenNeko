# ADR: Canvas 创作 AI 按钮的 Candidate-First Agent Run 边界

状态：Accepted
日期：2026-07-10
范围：`neko-canvas` Shot/Scene AI 按钮、`neko-agent` 后台创作会话投影、run/workItem、candidate 写回、媒体并发和质量晋升边界。

本文补充 [`adr-agent-creative-invocation-run-boundary.md`](adr-agent-creative-invocation-run-boundary.md)、[`adr-agent-message-task-queue-boundary.md`](adr-agent-message-task-queue-boundary.md)、[`agent.md`](agent.md)、[`headless-project-authoring.md`](headless-project-authoring.md) 与 [`cache-file-access-and-paths.md`](cache-file-access-and-paths.md)。通用 Agent 创作调用仍以 document/run/workItem 为执行权威；本文记录 Canvas Shot/Scene AI 按钮的更具体产品约束。

## 背景

Canvas Shot 界面需要新增或修正这些 AI 动作：

- 优化提示词。
- 生成图片。
- 编辑图片。
- 生成视频。
- 编辑视频。

这些动作不同于 `Send to Agent`。`Send to Agent` 仍表示把当前 Canvas 上下文发送给前台 Agent 会话，由用户在前台对话中继续处理。新增 AI 按钮是 Canvas 文档内的创作动作，必须指定输入、目标填充位置、revision、质量门禁和写回策略，并由 Agent 作为后台任务调度和生命周期 owner。

当前代码和设计中已有 `ExternalCreativeAiInvocation`、`CreativeAiRunRuntime`、Canvas apply adapter、Agent workItem/TaskCard 投影和后台会话列表基础，但 Canvas 新按钮不能继续依赖旧 `neko.agent.generateForNode`、`dataUrl` 和 `generationProgress` 写回路径，也不能让 Canvas 直接接入 provider/model SDK。

## 决策

### 1. `Send to Agent` 与 Canvas AI 按钮分离

`Send to Agent` 保持现有前台语义：

```text
Canvas Webview
  -> sendToAgent
  -> Canvas Extension
  -> neko.agent.sendContext
  -> selected foreground Agent conversation
```

Canvas 新 AI 按钮使用独立创作调用路径：

```text
Canvas Webview action
  -> Canvas Extension preflight
  -> explicit ExternalCreativeAiInvocation
  -> Agent creative run/workItem
  -> ResourceRef / structured candidate
  -> Canvas candidate apply
  -> user accept or judge pass
  -> Canvas mutating apply
```

新按钮不得把请求伪装成前台聊天消息，不得默认使用 Agent 面板当前选中会话，也不得通过 `neko.agent.generateForNode` 返回 `dataUrl` 作为成功写回依据。

### 2. 调用 Agent 时必须指定返回填充位置

每个 Canvas AI 动作必须在进入 Agent 前指定目标填充位置：

- `optimize-image-prompt`：候选目标为 `storyboardPrompt.promptBlocks.imagePromptDocument`。
- `optimize-video-prompt`：候选目标为 `storyboardPrompt.promptBlocks.videoPromptDocument`。
- `generate-image`：候选目标为 shot/image result slot 或 package-owned generated image candidate ref。
- `edit-image`：候选目标为 edited image candidate ref，并必须有 source/reference image。
- `generate-video`：候选目标为 scene/shot video result slot 或 generated video candidate ref。
- `edit-video`：候选目标为 edited video candidate ref，并必须有 source/reference media。

缺少 mutating target、candidate target、document revision、target revision 或 idempotency key 必须 fail-visible。Agent 不得从当前 Webview selection、最近聊天上下文或自由文本中猜测写回位置。

### 3. 默认 candidate-first，不直接覆盖正式内容

所有 Canvas 创作 AI 结果默认写入 candidate。candidate 只有在以下条件之一满足后才能晋升为正式目标：

- 用户显式接受 candidate。
- judge workItem 通过质量检查，且该动作配置允许自动晋升。

晋升时必须重新检查 target revision。revision check 用于避免旧任务覆盖新编辑；candidate-first 与 judge/user accept 用于避免低质量素材污染正式内容。这两个门禁不能互相替代。

judge 失败时，candidate 可以保留为可查看、重试、删除或手动接受的结果，但不得被报告为正式写回成功。

### 4. 只保留 `videoPromptDocument` 作为视频/语音生成输入

新路径不再产生或依赖独立 `voicePromptDocument`。对白、旁白、语音、音效、动作、镜头和画面要求都应进入 `videoPromptDocument` 的文本与 semantic spans。

旧数据可以在迁移或读取投影中合并到视频提示词；新写入不得重新创建分离的 voice prompt authority。这样可以避免对话/声音和画面提示词分离后导致生成结果错位。

### 5. Canvas 负责创作参数，Agent 负责非创作参数和生命周期

Canvas 负责从 shot/scene 文档事实中解析和校验创作参数：

- action id 与 typed creative capability。
- prompt document refs 与目标填充位置。
- reference media 与 source refs。
- duration、aspectRatio、style/profile hints、shot/scene creative config。
- 用户选择的模型能力需求或模型偏好。
- document/target revision 与 idempotency。

Agent 负责：

- provider/profile/model runtime resolution。
- 非创作运行参数推断，例如 retry/backoff、timeout、scheduler lane、provider transport、token/response budgets 和内部执行策略。
- cost/approval gate。
- run/workItem 生命周期、取消、重试、进度、诊断、observation 和 conversation projection。
- ResourceRef/artifact 生成和 package-owned apply orchestration。

Canvas 不直接调用 provider SDK，不传 provider runtime handle，不复制 Agent 模型能力逻辑，也不把自然语言提示词当作参数校验替代品。

### 6. 后台 Agent 会话可见，但执行权威是 run/workItem

Canvas 创作 AI 动作应投影到完整独立的后台 Agent 创作会话，用户可以从 Agent 会话列表打开查看。这一会话展示 run/workItem、进度、诊断、candidate、judge 结果、重试和继续创作入口。

但 conversation 不是执行、并发、成本、幂等或写回权威。权威身份仍是 document/run/workItem/target/ref/revision。Project Memory 晋升必须显式发生，不从后台会话或 run 自动写入。

### 7. 媒体并发由 Agent lane 调度限制

Agent run/workItem 调度层必须支持独立 lane 限制：

```text
image lane: max active image workItems
audio lane: max active audio workItems
video lane: max active video workItems
text lane: max active prompt/judge workItems
```

具体默认值和配置来源属于 Agent 配置。Canvas 只发起请求和展示状态，不实现 provider 并发调度。

Canvas 需要展示聚合进度，例如总任务数、完成数、失败数、运行数和排队数。单个生成任务的进度、错误、取消和重试状态由 Agent workItem 负责。

### 8. 图片/视频生成和编辑是不同动作

生成和编辑必须在 action id、capability、preflight 和模型能力上区分：

- `generate-image` 需要 image prompt，可使用 reference media。
- `edit-image` 必须有可编辑 source image 或 reference image。
- `generate-video` 必须有 `videoPromptDocument`。
- `edit-video` 必须有 source video、start/end frame、keyframe 或等价 reference media，并要求模型支持 video editing。

不满足动作要求时，Canvas 前端应展示明确参数问题，Agent 不应启动 provider 调用。

## 五层分析

### 职责

- `@neko/shared` 定义 invocation、refs、revision、candidate/promotion、run/workItem、diagnostics 和 apply DTO。
- `neko-canvas` Webview 发起 typed action request，只展示 Canvas state、candidate 和聚合进度。
- `neko-canvas` Extension 解析 shot/scene 创作参数、校验目标、构造 invocation、执行 package-owned candidate/mutating apply。
- `@neko/agent` runtime 管理 run/workItem、lane concurrency、judge、ResourceRef 输出、observation 和 conversation projection。
- `neko-agent` Extension 连接 VS Code 命令、Agent config、provider/model resolution 和 Canvas apply command。

### 依赖

- Canvas Webview 不导入 VS Code、Agent runtime、provider SDK 或 Node API。
- Canvas Extension 不导入 Agent 内部实现，通过 shared contract 和 command/API facade 调用 Agent。
- Agent runtime 不导入 Canvas Webview 或 Canvas 内部 store；写回通过 Canvas apply adapter。
- 媒体和二进制结果使用 ResourceRef/artifact 生命周期，不使用 Webview URI、blob URL、cache path、temp path 或 `dataUrl` 作为 durable identity。

### 接口

- Canvas Webview 发送 typed creative action request，而不是 `sendToAgent`。
- Canvas Extension 构造 `ExternalCreativeAiInvocation` 或其后续 typed envelope，必须包含 target/candidate refs、revision、idempotency 和 action config。
- Agent 返回 run/workItem snapshot、lane status、candidate refs 和 diagnostics。
- Canvas apply 支持 candidate apply、promotion apply、stale target、judge rejected、deleted target 和 idempotent reapply。

### 扩展

- 其他创作包可以复用 candidate-first、run/workItem、lane scheduling 和 package-owned apply 模式。
- 新模型能力只需扩展 Agent capability/model catalog 和 Canvas preflight projection，不应增加 Canvas provider SDK 依赖。
- 将来可增加 variant compare、manual review panel、auto-promotion policy 和 project memory promotion，但默认不自动写正式内容或记忆。

### 测试

- Contract tests 覆盖 invocation、target/candidate refs、revision、idempotency、candidate promotion 和 lane snapshot。
- Canvas tests 覆盖 action preflight、video prompt 合并、缺参诊断、candidate 写回、promotion revision conflict。
- Agent runtime tests 覆盖 lane 并发、workItem 排队、取消、重试、judge pass/fail、idempotent duplicate invocation。
- Legacy poison tests 证明新按钮不会命中 `sendToAgent`、`neko.agent.generateForNode`、`generationProgress dataUrl` 或 Webview store 直接写回。
- 真实 VS Code Webview 功能场景覆盖按钮 disabled、诊断展示、candidate/progress UI、Agent 会话投影和运行错误门禁。

## 后果

- Canvas AI 按钮可以安全触发长耗时媒体生成，不污染前台 Agent 对话。
- 低质量生成结果默认停在 candidate，不会直接覆盖正式 shot/scene 内容。
- Agent 继续作为模型、调度、生命周期和进度 owner；Canvas 保持领域事实和写回 owner。
- 旧 `generateForNode` 路径必须逐步收窄到 legacy 或被移除，不能作为迁移后按钮的成功路径。

## 不做

- 不修改 `Send to Agent` 的前台会话语义。
- 不让 Canvas 直接接入 provider/model SDK。
- 不把 voice prompt 作为新路径的独立提示词文档。
- 不用 `dataUrl`、Webview URI、cache path 或 temp path 作为生成结果身份。
- 不把后台创作会话历史自动写入 Project Memory。
