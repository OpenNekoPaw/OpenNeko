## Why

Desktop Home 已经移除了 Canvas、Cut、Preview 等伪“扩展”，但当前实现错误地读取
Codex/OpenAI marketplace 和 `.codex-plugin` package。OpenNeko 是基于 Pi Agent 的独立
应用，不能把其他应用的本地 marketplace、安装状态或缓存当成自己的插件目录。仅显示
Computer Use 或 MCP 名称也会让用户误以为 Agent 已经可以调用，仍然属于伪能力声明。

## What Changes

- **BREAKING**：删除 Codex CLI、`~/.codex`、Codex marketplace 和 `.codex-plugin`
  依赖，改由 `@neko/agent-runtime` 的 extension application entry 管理 OpenNeko 自有 catalog、
  package lifecycle 与 Agent contribution；Desktop Main 只注入 bundled snapshot、安装根和原生 adapter。
- OpenNeko marketplace 首阶段由公开 `OpenNekoPaw/OpenNeko` 仓库维护并随 Desktop
  打包；没有真实 OpenNeko 插件时返回空目录，不借用其他应用条目或伪造数据。
- Extensions Surface 只投影 OpenNeko marketplace 或 OpenNeko 安装根中的插件；available
  目录还必须通过 Pi SkillHost 或 OpenNeko MCP runtime 支持判定。
- 可安装插件默认按内容创作相关性、通用生产力和其他类别排序，提供安装、卸载和
  marketplace 刷新，并通过 revision 防止陈旧操作。
- personal Skill 支持从本地目录安装和移除；plugin Skill 随插件生命周期管理；builtin
  Skill 继续服务 Pi Agent，但不进入扩展管理目录。
- 已安装插件的 Skill contribution 进入 Pi SkillHost，并携带明确 `pluginId` provenance。
- 已安装且兼容的 MCP contribution 进入现有 `MCPManager -> ToolRegistry -> Pi`
  canonical path；卸载时在无 active turn 后原子替换 runtime generation。
- App-only、OAuth 或其他当前没有 OpenNeko runtime owner 的 contribution 明确显示为
  unsupported，不注册 Tool，也不伪装成可执行。
- Desktop shell、状态、操作、确认、空态与 diagnostics 完整支持 `en` / `zh-cn`；
  manifest 和 personal Skill 作者元数据保持原文。
- Extensions Surface 删除低价值的来源、状态、分类和排序控件，只保留搜索与
  Skill/扩展页签；目录继续使用固定、确定性的产品排序。
- Renderer 只发送 typed management intent；物理路径、命令、环境变量、凭据和 raw
  repository diagnostic 不跨 preload 边界。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `desktop-home-management-surfaces`: 将原“能力”目录收敛为真实全局扩展与 Skill 目录，移除 Desktop 内置模块投影，并支持中英文界面。

## Impact

- `packages/agent/runtime`：OpenNeko extension catalog、manifest/support policy、install/remove transaction、
  personal Skill lifecycle、Plugin Skill/MCP contribution 与 runtime generation application service。
- `apps/neko-desktop/src/main/`：bundled snapshot/install-root、native picker/trash、process/env/credential
  concrete adapter、composition、disposal 与 Desktop typed IPC；不得保留 catalog/install/runtime policy。
- `apps/neko-desktop/resources/extension-marketplace/`：公开仓库维护、随包发布的
  OpenNeko marketplace snapshot；只包含真实第一方维护 package。
- `packages/agent/runtime/src/pi/`：plugin Skill source/provenance 与确定性优先级。
- `packages/agent/runtime/src/mcp/`、package-owned Agent contracts：Plugin MCP
  process/auth configuration 的最小 runtime contract。
- `packages/agent/webview` 与 Desktop renderer placement：双语安装/卸载、Skill 管理、兼容性和
  operation 状态；Renderer 不拥有 mutation 或 runtime state。
- Desktop producer/consumer、Pi Skill/MCP path、Evaluation harness 与真实 Electron 验收。
