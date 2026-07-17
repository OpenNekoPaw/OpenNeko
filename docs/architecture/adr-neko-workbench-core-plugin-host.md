# ADR: Neko Workbench Core 与 Plugin Host 边界

状态：Accepted  
日期：2026-07-08

## 背景

OpenNeko 同时支持 VSCode 插件客户端、TUI 和独立 Desktop。VSCode 提供成熟的 Workbench 与扩展模型，但 Webview CSP、资源投影、codec、10-bit/HDR、色彩管理和纹理复用限制不应成为 Neko 专业创作输出的上限。Desktop 已经证明 Electron AppHost 方向，但如果继续在 `neko-desktop` 内维护文件树、资源面板、Agent 面板和编辑器注册逻辑，会形成第三套 UI/runtime。

Neko 需要吸收 VSCode 的贡献点模型：commands、views、custom editors、menus、keybindings、theme、extension host 隔离和受控 Webview UI；但 Neko 的专业输出、Agent、资源、Skills、Market、Engine viewport 和多端 runtime 必须由 Neko 自己的共享契约掌握。

## 决策

建立 host-neutral 的 **Neko Workbench Core** 与 **Neko Plugin Host contract**：

- Workbench Core 负责 contribution model、command/menu/keybinding/view/editor/resource/Agent/viewport descriptor、注册、校验、快照和诊断。
- Plugin Host contract 负责 `neko.plugin.json` manifest、activation events、permissions、trust level、sandboxed UI surface 和 VSCode-subset compatibility DTO。
- `@neko/ui/workbench` 只负责 React/DOM 渲染组件，不拥有 runtime registry。
- `neko-desktop` 只做 Electron AppHost adapter：窗口、菜单、preload/IPC、本地协议、文件对话框和 Engine 发现/启动。
- VSCode 插件客户端继续作为 VSCode Host Adapter；TUI 只消费 headless projection，不渲染图形 Workbench。
- Feature packages 通过 public contribution/provider/host-adapter 入口贡献 UI 和能力；Desktop 不直接复制各包 UI。

## 取舍

### 不 fork Code OSS

Fork Code OSS 可以快速获得 Workbench、Explorer、Monaco、SCM、Terminal、Debug 和插件系统，但维护成本和产品边界过重，而且很多限制来自 Webview/Workbench 架构本身。Neko 的主线不 fork VSCode。

### 不完全自研无参考框架

完全自研一个与 VSCode 无关的编辑器框架会重复已经被验证的贡献点、命令、视图容器、快捷键和扩展宿主设计。Neko 参考 VSCode 的设计模式，但使用 Neko 自己的契约和 host adapter。

### 不把 Plugin UI 放进主 DOM

用户插件 UI 必须运行在受控 view/custom editor/webview/sandboxed surface 内，通过权限化 bridge 访问能力。插件不能直接修改主 Workbench DOM、全局 CSS、Electron、VSCode、Node 或 Engine runtime handle。

## 不变量

- Workbench Core 不导入 React、DOM、VSCode、Electron、Node-only API 或 feature package internals。
- Plugin manifest/schema/version 不支持时 fail-closed。
- 重复 contribution id、未知 contribution kind、缺失 permission、未注册 provider/editor/handler 必须返回 typed diagnostic 或测试失败。
- Resource provider 持久身份必须是 stable ref、workspace-relative path、`${VAR}/path`、asset/entity id 或领域格式引用；不得用 `.neko/.cache`、Webview URI、blob URL、Engine token 或绝对路径作为事实来源。
- 专业 viewport 真值属于 `neko-engine`；WebContents、Webview、HTML media、canvas 或 WebCodecs 只可作为 projection。

## 后果

- Desktop 后续改造应先接 Workbench Core/provider registry，再迁移现有 desktop-local scanner/resource surface。
- 用户自定义 UI 通过 Neko Plugin Host 和受控 surface 进入，而不是通过 VSCode fork 或主 DOM patch。
- VSCode 兼容是显式 subset mapping，不承诺完整 VSCode API 兼容。
- 新跨端 UI/runtime 能力优先进入 Workbench Core、Plugin Host、`@neko/ui` 或 owning package public adapter，而不是某个客户端私有实现。

## 验证

- Workbench Core 边界测试禁止 React/DOM/VSCode/Electron/Node/feature package import。
- Manifest/Plugin Host 测试覆盖版本、权限、trust、重复 id、unsupported contribution kind。
- Desktop 测试证明 workbench surfaces 来自 Workbench Core bootstrap/provider descriptor，并标记临时 desktop bootstrap provider。
- VSCode Webview 相关改动仍使用 Extension Development Host 与 `vscode-extension-debugger` 验证。
