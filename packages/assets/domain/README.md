# @neko/assets-domain

`@neko/assets-domain` 拥有本地文件、Media Library 与已安装 Asset 的 host-neutral 领域能力，不拥有
项目语义内容、Character、World 或第二套内容身份。

## 公共边界

- 使用 canonical `ContentLocator` 浏览、搜索和诊断授权内容。
- 管理 Media Library 的显式连接、重连与移除；移除连接不修改目标内容。
- 管理 manifest-backed Asset 的本地生命周期与可重建技术投影。
- 通过注入的 Content/Host ports 请求 IO、授权与缩略图，不暴露物理路径或 cache path。

Desktop Main 只负责 Electron 授权和 public port wiring；Renderer 只消费 opaque identity、相对 locator
与 typed projection。项目事实、外部目录授权和 Workspace 访问投影保持独立 owner。

系统级资源边界见 [`docs/architecture/asset-library.md`](../../../docs/architecture/asset-library.md) 和
[`docs/architecture/content-access-and-paths.md`](../../../docs/architecture/content-access-and-paths.md)。
