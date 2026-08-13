## Why

OpenNeko 已有 Skill/Plugin 管理和 Agent runtime 主链路，但当前仍以 bundled
`marketplace.json`、`.openneko-plugin/plugin.json` 和独立 JSON enable grant 作为核心输入。
在官方插件仓库尚不存在时，这些私有分发约定增加了不必要的定制化，并让独立 Skill、Plugin
package、用户状态和 MCP runtime 相互侵入。

## What Changes

- **BREAKING**：P0 删除 bundled/foreign marketplace inventory、`marketplace.json` reader、
  marketplace refresh 和公共 contract 中的 marketplace identity；官方仓库与远程分发延后到独立变更。
- **BREAKING**：将 `.openneko-plugin/plugin.json` 原子替换为 package 根目录的 canonical
  `plugin.json`；使用最小 portable metadata、固定 `skills/` 与 `mcp.json` component location，
  OpenNeko-specific metadata 只能进入 reverse-domain `extensions` namespace。
- Skill 保持独立一等能力：personal/project/builtin Skill 只依赖 `SKILL.md` 和 Pi SkillHost，
  不要求 Plugin、MCP 或 marketplace。
- Plugin 只负责聚合和声明 package content；Skill、MCP 和未来 App contribution 独立验证、
  独立进入 owning runtime，并在最小 contribution scope fail-local。
- Extensions Surface 只展示明确的 bundled plugin roots 与本地已安装 Plugin；用户可以从本地目录
  安装、启用、禁用、移除和重新扫描，不展示虚构的 available marketplace catalog。
- Skill/Plugin 详情采用类 VS Code 的概览信息层级：展示作者 metadata、来源、组件贡献、
  runtime readiness 与真实管理操作，不展示 Plugin 文件树、manifest/MCP 原文或物理路径。
  Personal Skill 可通过 opaque management identity 打开 `SKILL.md` 的系统默认编辑器并在文件管理器中显示；
  Plugin Skill 只导航至所属 Plugin，不暴露单独编辑或移除。
- Plugin package bytes 保存在 OpenNeko install root；安装 lifecycle、启用状态和用户配置引用进入
  `~/.neko/neko.db#state`。旧 JSON grant 不导入、不兼容读取，也不作为 fallback。
- 已验证 Plugin Skill 继续进入 Pi SkillHost；兼容 MCP contribution 继续复用唯一
  `MCPManager -> ToolRegistry -> Pi` 路径。Plugin 是否有效不以 MCP 是否存在或连接成功判定。
- 继续要求 sender-bound typed IPC、安全路径授权、idle-only runtime replacement、明确 readiness、
  `en`/`zh-cn` 管理 UI 和 fail-visible diagnostics。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `desktop-home-management-surfaces`: 将 Extensions 从 marketplace-backed available/installed catalog
  收敛为独立 Skill 管理、bundled/local Plugin 安装管理、SQLite 用户状态和真实 runtime readiness。

## Impact

- `packages/agent/runtime/src/extensions/`：拥有 canonical Plugin manifest codec、local install planning、
  contribution support policy、catalog、mutation 和 runtime generation application contract；不得依赖 Electron。
- `packages/agent/runtime/src/pi/`：继续拥有四类 Skill discovery、selection、fingerprint、receipt 和
  personal Skill lifecycle，确保独立 Skill 不经过 Plugin/MCP manager。
- `packages/agent/contracts`：删除 marketplace identity/available inventory，增加本地安装 intent、
  durable state projection 和 contribution-local readiness contract。
- `packages/local-metadata`：拥有 Plugin install/enable state 的 SQLite repository 与稳定表；
  package bytes、credential 和 runtime handle 不进入 SQLite。
- `apps/neko-desktop/src/main/`：只保留 bundled root、install root、SQLite/file/picker/trash、
  process/env/credential concrete adapter、typed IPC composition 和 disposal；不决定 Plugin 业务策略。
- `apps/neko-desktop/resources/extension-marketplace/`：删除 marketplace index；现有第一方 package
  转为明确 bundled plugin roots 或迁入更准确的资源目录。
- `packages/agent/webview` 与 Desktop renderer placement：展示 Skills 与已安装 Plugins，提供本地安装、
  启停、移除、搜索和 diagnostics；Renderer 不接触物理路径、数据库或进程配置。
- Agent/SQLite producer tests、Desktop consumer/delegation tests、真实 Electron UI 与 provider-backed
  Agent Evaluation 需要按新 canonical path 更新。
