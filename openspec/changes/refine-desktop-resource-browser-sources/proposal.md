## Why

Desktop Resource Browser 已复用 Assets Root 和 ContentLocator，但当前 Files/Media/Entities
投影仍由 Desktop 本地递归扫描拼装：Files 被拍平成列表，Media 混入整个工作区媒体，
Entity 只显示少量 confirmed fact/binding 字段，搜索也只是分类内字符串过滤。这使界面名称、
数据 owner 和真实能力不一致，并造成 Resource Browser 与 Agent Entity mention 的可见结果漂移。

## What Changes

- 将 Resource Dock 固定为由一级侧边栏入口控制的独立、可隐藏、可调整宽度的项目面板；
  Main 和 Chat 只消费选择或引用，不拥有资源投影。
- 将资源分类收敛为 Directory、Media Library 和 Entity；不恢复已退休的 Asset membership
  catalog，也不创建第三套“素材库”事实来源。
- Directory 读取真实工作区层级，支持目录树和当前目录网格两种视图，并以显式节点 identity
  做展开、选择、打开和搜索结果定位。
- Media Library 只展示 `neko/assets/<libraryName>` 下已显式添加的 linked roots，提供库级
  availability、add、relink 和 remove，以及库内 tree/grid 浏览。
- Entity 使用统一 Entity authority 和 representation binding 投影，区分 confirmed Entity、
  candidate/diagnostic 状态，并使 Resource Browser 与 Agent mention 共享相同 confirmed 查询语义。
- 为 Directory、Media Library 和 Entity 提供分类内搜索及 sectioned All 搜索；Desktop
  renderer 不执行目录遍历、路径推断或独立索引。
- 工作区文件与已链接媒体内容可自动重建 projection；Entity candidate 可以自动发现但不得
  自动确认；全局资源只能由用户显式添加或发布。

## Capabilities

### New Capabilities

- `desktop-resource-browser-sources`: 定义 Desktop Resource Dock 的位置、Directory/Media
  Library/Entity 数据来源、tree/grid 投影、管理操作、搜索及自动发现边界。

### Modified Capabilities

- `media-library-resource-entry`: 明确 Desktop Media Library 只列出已配置 linked roots，
  并通过 canonical Media Library owner 提供管理、搜索与 availability。
- `unified-entity-representation-bindings`: 明确 Desktop Resource Browser 与 Agent mention
  使用同一 confirmed Entity/binding authority，candidate 不得伪装为 confirmed Entity。

## Impact

- `packages/neko-assets/src/resource-browser/` 的公共 contract、controller、Root、presenter 和样式。
- `apps/neko-desktop/src/main/desktop-resource-browser-*`、固定 IPC/preload bridge 和测试。
- `@neko/entity` confirmed Entity、candidate/diagnostic 与 representation binding reader。
- workspace-linked Media Library helper、Search/metadata projection 和 ContentLocator 授权路径。
- Resource Browser i18n、Desktop Electron fixture 与 package/architecture quality gates。
