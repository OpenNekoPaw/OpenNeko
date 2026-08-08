# ADR: Agent Markdown 交付物与 Canvas 投影边界

状态：Accepted

更新日期：2026-08-01

范围：Agent 长期 Markdown/Fountain 等内容源产物、Skill、授权文件写入、Generation 结果、Canvas authoring 与投递状态。

## 决策

长期 Markdown 交付物是明确文件 artifact，由 Agent file-authoring capability 在授权 workspace/project
位置原子写入。Agent message 可以展示摘要或链接，但 transcript、UI card 和 Canvas 节点都不是文件
内容 authority。

Fountain、TXT、HTML、字幕和普通 JSON/YAML/CSV 等可移植内容源遵守同一原生文件原则。Agent
不为这些内容创建 Text Document session 或格式专用 mutation Tool；parser、Search、Text Editor
和 Preview 在文件变化后重建 projection。Canvas `.nkc`、Cut `.otio` 等 owner-declared 结构化项目
不属于内容文件路径，generic Agent file read/write 必须拒绝其 raw bytes。

交付物包含稳定 artifact identity、content revision/digest、provenance 和 resource ref。图片、音频、
视频或模型先由 owning domain 提交 durable artifact，再以 `ContentLocator` 引用；不内嵌绝对路径、
临时 URL、base64 或 provider response。

## Canvas 投影

Markdown 文件投递 Canvas 必须指定目标或明确创建新 Canvas，并通过 Canvas public authoring port：

```text
Markdown artifact + revision
  -> explicit Canvas target/create intent
  -> Canvas validation/materialization
  -> revisioned apply
  -> delivery receipt
```

不得根据当前面板、最近文件、文件名、会话内容或 UI selection 推断目标。Delivery ledger 只保存
幂等协调状态、目标 identity、source revision 和 receipt，不复制 Markdown 内容，也不成为创作记录。

Canvas 负责节点 schema、布局、资源 binding、项目 revision 与 mutation；Agent/Skill 不拼装私有
Canvas JSON。目标冲突、source revision 变化、资源缺失或 apply 失败明确返回 diagnostic。

Canvas apply 失败不得回退 generic file Tool 或 shell 修改 `.nkc`。Cut `.otio` 同样只通过 Cut
query/authoring capability 修改。完整分类见
[`adr-agent-content-file-and-structured-project-authoring-boundary.md`](adr-agent-content-file-and-structured-project-authoring-boundary.md)。

## 验证

- 文件 authoring 覆盖授权、原子写入、冲突、取消和 digest；
- Canvas producer/consumer 覆盖 create、explicit target、revision conflict、idempotency 和 receipt；
- 路径测试证明文件 artifact 与 Canvas apply 分别由 owning service 提交；
- Document card、打开文件、投递状态和失败诊断使用真实 Electron Desktop fixture；
- Agent 创作质量与交付证据使用聚焦 evaluation。

相关边界见 [`adr-unified-markdown-resource-rendering.md`](adr-unified-markdown-resource-rendering.md)、
[`headless-project-authoring.md`](headless-project-authoring.md) 和
[`cache-file-access-and-paths.md`](cache-file-access-and-paths.md)。
