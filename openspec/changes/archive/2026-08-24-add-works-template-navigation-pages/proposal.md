## Why

Desktop 主导航已经把稳定入口与 Development 实验入口分开，但仍缺少用户要求的“作品”页面，并继续显示“所有项目”“资产中心”等与目标信息架构不一致的字段。现有三个内置模板不足以拥有独立管理生命周期，其中只有概念分镜和视频方案属于 Project 创建起点；继续保留一级模板入口会制造没有 durable owner 的单例管理 Scene。

## What Changes

- 将稳定主导航统一为“开始创作、项目、作品、资产库、扩展”。
- 在 Host-owned Creative Management Scene 中增加 `works` 单例管理目录，不增加独立 `templates` catalog。
- 项目管理页复用概念分镜和视频方案两组内置快速创作内容；选择模板进入现有开始创作 Scene，不新增 Agent prompt 注入、项目事实或第二条创作路径。
- 角色创作包不伪装成 Project 模板；在 Character 创建流程拥有真实承载入口前不从项目页暴露。
- 作品页提供独立、诚实的空目录状态；在全局作品发布事实和 catalog owner 尚未定义前，不把 Project、打开中的 View 或资产记录伪装成作品。
- 在不增加作品操作或数据来源的前提下，将作品空目录调整为与项目、角色、世界一致的 Hero 与“我的作品”内容分区，避免空状态漂浮在整页中央。
- 将作品 Hero 插图的主卡片、右下叠层、虚线连接和图标块比例与项目、角色、世界管理页统一，同时保留作品语义图标。
- 保持“实验（Development）/ 角色 / 世界”、统一“会话”和底部“设置”的既有结构。

## Capabilities

### New Capabilities

- `desktop-works-template-navigation`: Defines the stable Works management scene, project-owned quick-start templates and canonical sidebar labels.

### Modified Capabilities

None.

## Impact

- `packages/host`: 扩展 Host-owned Creative Management Scene catalog 的 canonical union、codec 和转换测试，同时删除未形成业务 owner 的 `templates` Scene path。
- `apps/neko-desktop` Renderer 与 `@neko/project-webview`：组合作品页面与 Project 模板起点、统一导航字段；不拥有作品或模板 durable facts。
- 用户数据：不读取、创建、迁移或修改项目、作品、模板、资产和会话数据。
