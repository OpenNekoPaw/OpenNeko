# Project 领域

Project 只拥有稳定项目身份、工作区 membership 和精确 owner-qualified 引用。Character、World、Entity、
Canvas、Cut、Asset 与媒体字节仍由各自领域拥有；Project 不复制它们的 payload，也不维护安装、适配、恢复
或 publication 生命周期。

参与包：

- `@neko/project`：L0 contract、application service 与 rebuildable projection；
- `@neko/project-node`：授权 Workspace 内的 association fact IO 与普通同步计划；
- `@neko/project-webview`：Project catalog / Project Content presentation；
- Chara、World、Entity 与文档 owner：通过固定、精确 public port 提供当前事实和引用；
- Desktop：只负责 Workspace 授权、typed IPC 与可见 Surface 组合。

详细 owner、失败边界与数据流见 [`architecture.md`](architecture.md)。跨领域资源语义见
[`../../architecture/creative-resource-semantic-boundaries.md`](../../architecture/creative-resource-semantic-boundaries.md)，
本地状态与同步/打包边界见
[`../../architecture/adr-local-metadata-store-sqlite.md`](../../architecture/adr-local-metadata-store-sqlite.md) 和
[`../../architecture/asset-library.md`](../../architecture/asset-library.md)。
