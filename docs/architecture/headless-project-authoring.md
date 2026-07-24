# 无 UI 项目创作边界

状态：Accepted
更新日期：2026-07-17

Neko 项目文件是持久创作事实。来自 Agent、Assets、TUI、VS Code command 或后台任务的写入必须在没有打开 Webview、可见 Custom Editor 或 UI snapshot 时仍可执行。Webview 是交互投影，不是后台 authoring executor。

当前保留且适用此边界的编辑领域是 Canvas 与 Cut。未来其他项目格式进入 workspace 时，必须通过新的 contract 和测试加入，不能复用已移除 Sketch、Audio、Model、Puppet 或 Story 的旧命令。

## Operation 分类

| Class | 含义 | UI 要求 |
| --- | --- | --- |
| `document-authoring` | 写入 Canvas node、Cut clip/timeline、稳定 source ref 等持久项目事实 | 必须经 owning package authoring service 执行，不要求打开 Webview |
| `interactive-editor` | 依赖焦点、选择、viewport、playhead、键盘或实时 stream | 可以要求 active editor，但缺失时必须明确失败 |
| `projection-only` | 展示预览、进度、状态、波形、画面或 diagnostic | 不得报告持久保存/导入成功 |

一个需求同时有持久与交互语义时必须拆分 contract。例如把生成片段写入 `.nkv` 是 `document-authoring`；选中当前时间线中的片段是 `interactive-editor`。

## Canonical authoring path

| 包 | Canonical path | 禁止路径 |
| --- | --- | --- |
| Canvas | `CanvasProjectAuthoringService`、Canvas authoring capability、`NekoCanvasAPI` 的持久写入 API | 用 Webview 私有 node mutation 充当 Agent/Assets/TUI executor |
| Cut | VS Code Canvas 通过 shared `NekoCutAPI.routes.handoff` 创建新 `.otio`，或追加到已打开的显式 URI + revision | Agent/TUI authoring、active/recent target、隐藏 editor、Webview import message |

共享层只拥有 client-neutral target、result、diagnostic、operation classification 和测试 poison helper。领域 edit planning、codec、source policy 与项目 mutation 留在 owning package。

旧 UI-shaped command 只能被删除、作为调用 canonical authoring 的薄 UI wrapper，或作为 fail-closed migration diagnostic；不得向 Webview 发送 mutation 后报告持久成功。

## Target 与 reveal

持久写入目标必须显式解析：

1. `target.documentUri` 写入指定项目文件；
2. `target.kind: "active"` 只能选择同一领域的安全 active document；
3. `target.kind: "new"` 只在 operation 明确允许时创建文件；
4. 缺失、陈旧或歧义目标返回 typed diagnostic。

`reveal` 是写入后的 adapter 行为，不是写入前置条件。`reveal: false` 成功后保持关闭；`reveal: true` 可以在保存后打开/聚焦 editor，且 reveal 失败必须与 write 失败分开报告。

## Client adapter

- VS Code adapter：command 注册、`vscode.Uri` 转换、Custom Editor reveal 和已打开 Webview 同步。
- TUI adapter：文本 diagnostic 与 filesystem/workspace target 选择，不假设 Webview。
- Agent adapter：capability schema、审批/生命周期和 diagnostic projection。
- Assets adapter：把稳定 Asset/Entity/Resource identity 投影为 owning package authoring request。

Authoring core 不导入 VS Code window API、Webview panel、React、DOM 或终端 UI。TUI 不直接改写 package JSON；VS Code 不通过打开隐藏 editor 制造成功条件；所有 adapter 都使用相同的 `target`、`source`、`reveal` 和 `provenance` 语义。

## Source identity

持久事实可以保存 stable `ResourceRef`、`ContentFileSourceRef`、asset/entity ID、workspace-relative path、`${VAR}/path` 或 project-owned JSON。不得保存 Webview URI、blob URL、cache/temp path、Engine token、stream id、Range URL、preview URL 或未晋升的生成缓存产物。

Canvas Board 的二进制生成媒体必须先提交到项目拥有的稳定生成目录并取得 durable identity；未指定目标时只能使用定义好的 workspace board，不能从 active/recent UI 状态、conversation binding 或 runtime group 猜测写入目标。

## 验证

- `document-authoring` 在没有 active Webview 时成功；
- save/reopen 能恢复持久事实；
- 旧 UI-bound route 被删除、poison 或断言未使用；
- core service 没有 UI/host import；
- 已打开 editor 能在 host write 后同步；
- runtime-only command 在缺失 editor/runtime 时明确失败；
- 路径断言证明 canonical service 被命中，legacy handler 未参与。
