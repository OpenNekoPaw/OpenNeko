## Why

Desktop Home 当前把全局 Skill 与 Canvas、Cut、Preview 等产品内置模块放在“能力”页面，并把后者展示为“内置能力”。这仍然没有回答用户真正需要的扩展目录问题：本机全局 Agent 环境启用了哪些插件、插件贡献了哪些 MCP Server、Skill 或 App，以及有哪些 personal/builtin Skill。产品模块不是插件或扩展，不应出现在这个目录。

## What Changes

- **BREAKING**：Home 一级导航与管理 Surface 从“能力”改为“扩展”，删除 Desktop 内置领域能力目录。
- 扩展页签读取 Codex 全局配置中明确启用的插件，并从对应缓存包的 `.codex-plugin/plugin.json` 投影真实 manifest 元数据。
- 扩展记录展示名称、版本、开发者、Marketplace，以及 manifest 实际声明的 MCP Server、Skill 与 App 贡献；Computer Use 作为真实启用的插件显示，而不是作为 Desktop 内置能力。
- 扩展目录不投影物理路径、启动命令、参数、环境变量、凭据或 connector secret，也不把“已在 Codex 全局配置启用”等同于“已在 OpenNeko Agent runtime 连接或可调用”。
- Skill 页签继续只展示 personal 与 builtin 全局来源，排除 project Skill，并提供来源筛选与个人优先的稳定排序。
- 保留内置 Skill 的 `en` / `zh-cn` 展示投影；插件 manifest 与 personal Skill 的作者元数据保持原文，不做静默机器翻译。
- 缺失 Codex 配置表示没有全局扩展；配置、注册项、缓存包、manifest 或 contribution 损坏时返回安全、可计数的 diagnostic。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `desktop-home-management-surfaces`: 将原“能力”目录收敛为真实全局扩展与 Skill 目录，移除 Desktop 内置模块投影，并支持中英文界面。

## Impact

- `apps/neko-desktop/src/main/desktop-extension-catalog-reader.ts`：新增 Desktop-owned Codex 全局扩展读取 adapter。
- `apps/neko-desktop/src/shared/home-management-contract.ts`：以 extension DTO 替换 builtin capability DTO，并升级 IPC channel/contract version。
- `apps/neko-desktop/src/main/app-host.ts`、`ipc.ts`、`preload/index.ts`：组合并投影全局扩展与 Skill。
- `apps/neko-desktop/src/renderer/`：更新导航、页签、筛选、扩展贡献展示、空状态和中英文文案。
- Desktop producer/consumer、Renderer 与 Electron 真实运行态测试。
