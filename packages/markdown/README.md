# @neko/markdown

`@neko/markdown` 拥有 OpenNeko 的 host-neutral CommonMark/GFM 语义契约。原始 Markdown 字符串是
内容 authority；解析结果、标注、诊断、outline 与 reference 都是可重建投影。

## 公共入口

- 默认入口：解析与流式语义 contract，不依赖 React、DOM、Electron 或具体编辑器。
- `@neko/markdown/rich-surface`：浏览器侧受控 Rich Surface；调用方继续拥有文档和 session 状态。
- package-owned conformance corpus：约束所有 presentation adapter 的 GFM 与扩展语义。

## 边界

- Workspace 引用、mention、Mermaid、Math 与 footnote 是显式扩展，不冒充 GFM。
- parser 不执行文件 IO、资源授权、Canvas mutation 或 Agent workflow。
- 第三方 AST、DOM、selection、runtime URL 与 cache path 不跨公共边界。
- 不支持或失效的语义返回局部 diagnostic，不切换 parser、renderer 或事实来源。

跨运行边界的内容授权与资源投影规则见
[`docs/architecture/content-access-and-paths.md`](../../docs/architecture/content-access-and-paths.md)。
