## Why

Workspace Agent 的最终回复既可能是普通对话总结，也可能包含应长期保存的确定性分析、计划或文案。当前运行时没有稳定、显式的区分方式：恢复“所有最终 Markdown 自动落盘”会把普通回复误建为文件；恢复已删除的 CompositeArtifact JSON contract 又会改变 Agent 的 Markdown-native 输出并引入第二套内容协议。

需要在不改变现有 Webview UI 的前提下，为 Workspace turn 建立一个最小、可验证的 Markdown 产物边界：普通总结仍只进入会话；明确的长期文档由 Host 持久化到精确 Workspace，并以 `ContentLocator` 投影到本轮已选择的索引画布。

## What Changes

- 定义 Markdown-native terminal result：最终回复始终包含对话总结；只有 Host 已准入且 Agent 明确输出产物分隔符时，才包含一个 reviewable Markdown 文档。
- Workspace 上下文注入产物准入和默认文档规范；Assistant、Character、World/Room 上下文不获得默认自动持久化准入。
- Agent Runtime 解析最终 Markdown、校验单一 H1 文档、生成稳定 Workspace 相对路径，并通过一个 durable publication port 请求 Host 写入。
- Desktop Main 在精确 Workspace authority 内幂等写入文档，再沿现有 Workspace Board delivery port 投影一个 Markdown 文件引用节点。
- 会话最终消息展示总结和一个可直接打开的持久 Markdown 引用；引用仅在精确 Workspace 文件已发布且内容匹配后出现，并使用同一个 `ContentLocator` 在重开会话后重建。普通 Markdown、流式内容和未准入上下文保持原行为。
- 删除产品提示词中已失效的 NEKO fenced JSON CompositeArtifact 要求，不恢复已移除的 composite contract/parser。

## Capabilities

### New Capabilities

- `explicit-agent-markdown-artifact`: 定义 Markdown-native 总结/长期文档边界、Workspace 持久化和索引画布投影。

### Modified Capabilities

- 无。

## Impact

- `@neko/dsh-bridge`：拥有通用 Markdown terminal 输出协议，不拥有文件路径、Workspace IO 或 Canvas schema。
- `@neko/agent-runtime`：拥有 Workspace 准入、terminal Markdown 解析、稳定文档 identity/path 和投递编排。
- `apps/neko-desktop`：仅在 Electron Main trust boundary 实现精确 Workspace 写入并调用现有 Canvas projection adapter；不判断内容价值。
- `@neko/canvas-domain` / Canvas Webview：复用现有 locator-backed Markdown 文件节点与实时 projection，不新增 UI contract。
- Agent Webview：复用现有引用展示和 Host 打开动作，在摘要下显示持久 Markdown 引用；不恢复完整文档副本或临时 Preview session。
- 用户数据：只新增显式产物文件；普通回复不落盘。重复投递同一内容命中相同相对路径，不覆盖不同内容。
