# ADR: 统一 Markdown 与资源增强渲染边界

状态：Accepted

更新日期：2026-08-01

范围：Agent、Canvas、`@neko/markdown`、共享契约、Desktop Host、Renderer 与资源投影。

## 决策

`@neko/markdown` 是 Markdown parse、normalized AST、source range、annotation、diagnostic 和 streaming
session 的唯一基础实现。Agent 和 Canvas 通过 adapter/renderer 扩展语义，不维护第二套 parser。

```text
Markdown source/delta
  -> @neko/markdown normalized session
  -> semantic annotations + stable resource refs
  -> Agent or Canvas renderer adapter
  -> shared UI primitives
```

Markdown core 不依赖 Agent、Canvas、Electron、React、DOM 或领域内部实现。Renderer adapter 可以
把已解析节点映射为 React UI，但不得修改 AST 语义、读取文件或写项目事实。

## 资源引用

Markdown 只保存稳定 resource/entity/artifact ref 与可选 revision/digest，不保存磁盘路径、cache path、
blob URL 或 Desktop resource URL。Desktop Host 将 stable ref 解析为受授权短生命周期 descriptor；
未知、陈旧或无权访问的引用显示明确 diagnostic。

## Canvas handoff

`Send to Canvas` 创建 Agent-visible handoff intent，包含 source、stable refs、diagnostics、provenance、
user intent 和显式 target hint。它不直接调用 Canvas mutation。Agent 根据当前能力决定激活 Skill、
查询 Canvas context 并调用 Canvas-owned authoring capability。

Canvas 拥有 schema、资源绑定、节点创建、布局、validation 和项目写入。Markdown renderer 不猜测
active/recent Canvas，不生成私有 Canvas DTO，也不绕过 revisioned apply。

## 验证

- parser/streaming fixture 覆盖 CommonMark/GFM、partial delta、range、diagnostic 和 finalization；
- Agent/Canvas 共享 fixture 证明同一 source 产生同一 normalized contract；
- resource ref 测试证明路径和短生命周期 URL 不进入持久内容；
- handoff 路径断言先进入 Agent，再命中 Canvas public capability；
- streaming、资源展示、CSP 和 Canvas 交互使用真实 Electron Desktop fixture。

相关边界见 [`cache-file-access-and-paths.md`](cache-file-access-and-paths.md)、
[`adr-agent-markdown-deliverable-authoring-and-canvas-projection-boundary.md`](adr-agent-markdown-deliverable-authoring-and-canvas-projection-boundary.md) 和
[`package-boundaries.md`](package-boundaries.md)。
