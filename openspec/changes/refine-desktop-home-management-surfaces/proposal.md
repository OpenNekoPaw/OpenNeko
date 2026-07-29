## Why

Desktop Home 当前只有“开始创作 / 动态 / 资产中心”三个入口，其中资产中心仍是 unavailable
占位，“开始创作”只能打开文件夹，无法把创作意图交给项目 Agent；Skill 与全部创作也没有独立
管理 Surface。继续增加无 owner 的按钮会再次形成只有 UI、没有真实能力的 Desktop。

## What Changes

- 将 Home 一级导航收敛为“开始创作 / 资产中心 / 插件 / 全部创作”。
- “开始创作”提供项目选择与 Agent 意图输入；提交后打开真实 Content Project，并把输入交给
  package-owned Agent Root 的 tabless composer，不创建第二套对话运行时。
- “资产中心”作为全局导航与检索 Surface，按已授权 Content Project 聚合真实目录、Media
  Library 与 Entity source；事实仍归各项目 owner，Home 不创建全局素材副本。
- “插件”展示 Pi SkillHost 的 personal/project/builtin Skill catalog，以及 Desktop 已组合
  内置领域扩展的真实 capability 状态。外部扩展安装、启用和 Plugin Host 执行保持不可用。
- “全部创作”聚合 Project catalog 与 Agent Home conversation projection。
- Desktop 新安装与本次预发布设置迁移后首先进入 Home，不再把历史项目恢复作为隐式默认。
- “开始创作”收敛为紧凑的 Agent Home 起始面：项目作用域属于 composer 控件，快捷意图属于
  composer 下方的真实操作，不再使用放大的品牌 Hero、装饰性光晕或伪工作区入口。

## Capabilities

### New Capabilities

- `desktop-home-management-surfaces`: 定义 Desktop Home 的 Agent 启动、全局资产索引、Skill/
  内置扩展可用性和全部创作聚合 Surface。

### Modified Capabilities

无。

## Impact

- `apps/neko-desktop` application settings migration、Shell contract、Main composition、preload
  bridge、Home renderer 和 i18n
- Agent public Root 增加一次性初始输入 presentation handoff
- Assets 继续复用现有 Resource Browser source，不复制文件扫描、Media Library 或 Entity
  catalog
- 不新增 Plugin Host、Marketplace、外部扩展执行或全局 Entity authority
