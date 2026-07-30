## Why

Desktop Home 当前把资产中心绑定到单个项目目录、把 Skill catalog 绑定到单个项目 workspace，并在“全部创作”中混入 Agent 会话。这与 Home 的全局管理职责和“所有项目”信息架构冲突，也让用户无法对三类 catalog 做统一搜索、排序和视图切换。

## What Changes

- **BREAKING**：资产中心停止查询项目目录、项目 Media Library 和项目 Entity；改为查询用户级全局媒体/资产根，并移除项目选择器。
- **BREAKING**：插件页停止依赖项目 workspace；Skill 只展示 personal 与 builtin 全局来源，插件展示 Desktop 全局组合能力，并移除项目选择器。
- **BREAKING**：“全部创作”改名并收敛为“所有项目”，只展示 Desktop Project catalog，不再展示 Agent conversation。
- 为资产、Skill/插件和项目 catalog 增加搜索与确定性排序。
- 为所有项目增加列表/网格视图切换，并保持 Project catalog 为唯一事实来源。
- 删除旧的 project-scoped Home 资产/插件成功路径；项目内资源与项目 Skill 仍分别由 Resource Dock 和项目 Agent 使用。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `desktop-home-management-surfaces`: 将 Home 资产、能力和项目管理 Surface 从项目聚合/会话混合模型改为全局 catalog 与纯项目模型。

## Impact

- `packages/neko-types` 用户级存储布局增加全局资产根。
- `apps/neko-desktop` Home management contract、Main composition、preload bridge、Renderer、i18n 和测试。
- Agent Desktop composition 增加不附着 workspace 的 global Skill catalog projection；项目 Agent 的 project/personal/builtin discovery 顺序不变。
- Assets 复用现有 content-tree 扫描与媒体分类能力，不复制项目 Resource Browser controller。
- 不新增 Marketplace、外部 Plugin Host、全局 Entity authority或会话副本。
