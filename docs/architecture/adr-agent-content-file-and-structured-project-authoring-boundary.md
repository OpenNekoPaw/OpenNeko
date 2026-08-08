# ADR: Agent 内容文件与结构化项目创作边界

状态：Accepted（内容文件边界已实施，结构化领域能力继续分阶段实施）

更新日期：2026-08-08

范围：Agent、Content、Text Editor、Markdown、Screenplay、Canvas、Cut、Preview、Desktop Host
与 Workspace 文件。

## 决策

Agent 创作只有两条 canonical 路径，按内容 authority 分类，不按扩展名是否为 JSON 分类：

1. 内容源文档以 Workspace 文件为协作协议，Agent 通过 Workspace-scoped 原生文件能力直接
   read/search/create/change；
2. 结构化、空间化和时间线项目以 owning domain model 为协作协议，Agent 通过精确 query 与
   revisioned authoring capability 读写。

两条路径不得互相 fallback。

| 类别             | 代表格式                                                | Agent path                               | 写入 authority                    |
| ---------------- | ------------------------------------------------------- | ---------------------------------------- | --------------------------------- |
| 可移植内容源     | Markdown、Fountain、TXT、HTML、字幕、普通 JSON/YAML/CSV | core Workspace file Tool                 | Workspace bytes                   |
| 结构化/空间项目  | Canvas `.nkc`、World/scene project                      | owning-domain query/authoring capability | domain model + project revision   |
| 时间线项目       | Cut `.otio`、未来 animation/audio timeline              | owning-domain query/authoring capability | timeline model + project revision |
| 固定或封装交付物 | PDF、EPUB、DOCX、CBZ                                    | inspect/extract 或从内容源重新生成       | source/import/export owner        |

格式只有在 owning package 定义跨字段不变量、项目 identity、revision、codec 和 headless
authoring contract 后才进入结构化路径。普通 JSON 不会因为语法形式被路由到 Canvas/Cut；未知
结构化格式也不会回退为普通文本成功。

## 内容文件原生路径

```text
Desktop composer
  -> Pi turn
  -> core Workspace file Tool
  -> authorized content-source file
  -> file change
  -> parser / Search / Text Editor / Preview projection
```

Agent 不为内容写入创建 `TextDocumentSession`，不调用格式专用 mutation Tool，不要求打开
Text Editor/Preview Root，也不把 parser 当作 writer。Markdown/Fountain parser 只从已写入文件
重建 AST、source range、outline、Search 和 diagnostic；解析失败不得自动修复或把写入改走另一
路径。

模型可见目标保持 Workspace-relative。Host 负责 containment、ignore、permission、原子发布和
existing-file freshness。替换现有内容必须绑定 Agent 实际读取的文件状态；冲突只拒绝当前写入，
不得自动 merge、覆盖新字节或切换 writer。

## Text Editor 协作

`TextDocumentSession` 只拥有 Window 编辑器的 accepted working buffer、base fingerprint、edit
sequence、dirty state 和 close decision，不是 Agent authoring service。

- clean session 观察到 Agent 写入时可以从 authoritative file reload；
- dirty session 必须保留 buffer 并显示 external-change conflict；
- Agent 写入不伪装为 CodeMirror transaction，也不继承 selection、undo stack 或 active document；
- Renderer 未挂载时不影响 Agent 文件创作。

## 结构化项目接口路径

```text
Desktop composer
  -> Pi turn
  -> exact Canvas/Cut Tool
  -> owning-domain application service
  -> revisioned apply
  -> owning codec
  -> .nkc/.otio
  -> editor projection
```

通用 Agent 文件能力必须拒绝读取和写入 `.nkc`、`.otio` 及其他 owner-declared protected project
format 的内容。安全 catalog metadata 可以用于选择精确目标，但不能成为 raw project editing
surface。

Canvas 使用 document/node/resource identity 与 expected Canvas revision；Cut 使用 OTIO
document/track/clip/time identity 与 expected Cut revision。两者必须 headless，不依赖 active
Renderer、selection、viewport 或 playhead。未实现 operation、非法输入、stale revision、codec
失败或 capability 缺失只返回 typed diagnostic；不得随后尝试 generic file Tool、shell redirection、
其他 adapter/provider 或 active/recent target。

## 固定和封装格式

PDF、EPUB、DOCX、CBZ 可以通过 Preview/DocumentAccess 检查、提取和引用，但不作为普通文本 byte
patch 目标。需要修改时回到明确内容源，或由 owning import/export workflow 重新生成。Renderer
仍分别使用 PDF.js、epub.js、DOCX 和 CBZ viewer；统一的是 locator、session、selection handoff
和 diagnostic，不是 HTML 或单一 document model。

## 替换路径

`InspectScreenplay`、`CreateScreenplayDraft`、`ReplaceScreenplayScene`、Agent Conversation-owned
Text Document session 和 screenplay mutation provider 已原子删除。Fountain 与 Markdown 统一走
core Workspace file Tool；Text Document 仅保留 Window owner。Canvas/Cut 更完整的 headless query
与 revisioned authoring 验收继续由 `openspec/changes/add-ai-screenplay-authoring/` 跟踪。

## 验证

- 内容路径测试证明 Markdown/Fountain 命中 core file Tool，Text Editor/Screenplay mutation service
  未参与；
- clean/dirty Text Editor 测试证明 Agent file change 的 reload/conflict 行为；
- protected-project 测试证明 `.nkc/.otio` generic read/write 被拒绝；
- Canvas/Cut producer/consumer 测试证明 exact query/authoring capability、revision 和 codec 被命中；
- no-fallback 测试 poison screenplay Tool、raw structured file access、Renderer mutation 与
  active/recent target；
- Agent Evaluation 使用真实 Desktop complete-session path 验证内容 artifact、protected denial 和
  owning-domain evidence；key-free suite 不替代真实行为验收。

相关边界见 [`agent.md`](agent.md)、[`headless-project-authoring.md`](headless-project-authoring.md)、
[`adr-agent-markdown-deliverable-authoring-and-canvas-projection-boundary.md`](adr-agent-markdown-deliverable-authoring-and-canvas-projection-boundary.md)
和 [`adr-canvas-cut-playback-route-and-timeline-boundary.md`](adr-canvas-cut-playback-route-and-timeline-boundary.md)。
