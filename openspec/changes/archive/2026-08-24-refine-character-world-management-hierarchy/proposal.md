## Why

项目管理已经使用“领域简介 / 我的内容 / 从模板创建”的轻量分组，但开发模式下的角色与世界管理仍把标题、导入按钮、搜索和目录压在同一工具型页面里。三个同层级管理场景的信息层级不一致，也没有清楚表达角色、世界和各自模板属于不同领域。

## What Changes

- 将角色与世界管理目录对齐到项目管理的页面骨架：领域简介、新增/导入操作、我的角色/我的世界集合、紧凑搜索与排序。
- 使用领域自有的 code-native 装饰图形，不复制项目图形或外部竞品资产。
- 保留角色身份卡和世界信息卡的领域密度、选择状态、诊断与详情路径。
- 明确模板按项目、角色、世界归属；角色与世界分别提供一个 package-owned 内置快速起点，并通过显式 callback 进入现有“开始创作”场景，不新增模板目录、持久化实体或隐藏 Prompt 注入。
- 保持 Development-only 导航策略、导入包、搜索、排序、刷新、选择和详情行为不变，并为角色与世界分别补充显式新增入口。

## Capabilities

### New Capabilities

- `character-world-management-hierarchy`: 定义实验性角色与世界管理目录的分组层级、领域差异和模板入口条件。

### Modified Capabilities

无。

## Impact

- `@neko/chara-webview`：继续拥有 Character Management Root，并增加“从角色模板创建”快速起点及 focused tests。
- `@neko/world-webview`：继续拥有 World Management Root，并增加“从世界模板创建”快速起点及 focused tests。
- `scripts/desktop-functional`：增加只覆盖角色/世界目录层级和响应式表现的开发模式验收场景，不创建产品运行路径。
- Desktop Shell 只把新增与模板快速起点 callback 组合到既有 `open-agent-entry` scene transition；Development/Release 可见性、IPC、持久化、导入、选择、详情、authoring 与 runtime 路径不变。
- 用户数据无迁移、覆盖或删除；查询与排序仍是可丢弃 Renderer presentation state。
