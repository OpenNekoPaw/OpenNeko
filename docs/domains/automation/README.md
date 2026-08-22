# Browser and Computer Automation

Browser/Computer Automation 将用户授权的外部 runtime 接入 DSH Agent。它是安全与目标授权领域，不是 OpenNeko Plugin 平台、包管理器、MCP runtime 或第二套 Agent controller。

## Ownership

| Owner | Responsibility |
| --- | --- |
| DSH official MCP contribution | MCP connection、Tool discovery/registration、call、cancel 与 exact Agent scope |
| DSH profile | 官方 contribution 的装配、生命周期、readiness 与 failure isolation |
| `@neko/automation-contracts` | provider、target、mode、budget、action、evidence 与 diagnostic 的 L0 canonical shape |
| `@neko/automation-node` | exact target/session grant、effect policy、approval requirement 与 bounded observation orchestration |
| Future Desktop adapter | 仅在产品重新引入可达 Automation 工作流后，负责用户选择、OS permission、realpath/process/window authority 与 Cua signature/TCC 检查 |

Canonical Agent path：

```text
official DSH profile
  -> Browser Use / Computer Use MCP contribution
  -> DSH Tool registry and Agent call lifecycle
  -> typed OpenNeko target/grant/approval boundary
  -> exact external runtime action and bounded evidence
```

OpenNeko 不维护 MCP Manager、generic Tool Registry、Pi Tool bridge 或 Plugin contribution runtime。DSH 不拥有 OS 权限、Window sender、用户目标选择和领域 grant；两个边界通过精确 identity 协作。

## Runtime Contribution Boundary

- 产品 Extensions 管理只展示 DSH-owned Skill 与 MCP，不展示 Plugin 或 Automation 专用管理面。
- Browser Use 与 Computer Use 是官方维护、随产品精确锁定的 DSH MCP integrations，不是普通第三方 Plugin。
- 当前产品不提供 Automation runtime、权限、目标或会话控制管理 UI。未来可达 Automation 工作流必须通过独立 OpenSpec 建立 typed trust boundary，不得把这些能力塞入通用 Extensions catalog。
- MCP transport、Tool schema 和 Cordis rows 不进入普通创作者 UI，也不得通过私有 DSH 模块投影产品目录。

## User-Managed Runtimes

OpenNeko 可以展示 upstream 安装说明，但不代替用户执行安装、更新或卸载。用户显式选择 runtime 和目标；Desktop Main 冻结 exact realpath/identity，并在启动、连接和每次高风险操作前重新校验。Disconnect 只撤销 OpenNeko authority，不删除外部文件。

Browser Use 需要独立选择 Chrome/Chromium-compatible executable，不能控制 OpenNeko Renderer WebView，也不能推断或接管现有用户浏览器标签页。Computer Use 绑定 exact app/process/window/region 和适用 OS permission。

## Compatibility And Security

兼容检查只覆盖产品真实消费的边界：

1. 显式选择的 runtime/target identity 仍精确有效；
2. DSH MCP contribution 完成 handshake 并确认预期 server identity；
3. 必需 operation 与输入字段存在且 effect classification 不冲突；
4. exact target、mode、timeout、step budget 与 Conversation/DSH Session/turn/toolCall owner 完整绑定；
5. Cua 在 macOS 保持预期 bundle、Developer ID/Team ID、notarization 与 TCC responsibility chain；
6. 单次 mutation approval 只授权当前 action 和 target。

失败只影响 exact contribution/session/action，不选择另一 provider、installation、endpoint、active/recent target 或原始 raw MCP Tool。Renderer 不接收 screenshot 持久原始字节、真实 HOME/path、secret、process/window handle 或 MCP connection。

## Session And Evidence

- Browser runtime 与 browser executable authority 分离；session home/temp/data 隔离且不继承模型凭据。
- Browser session 首版绑定一个用户确认的 HTTP(S) origin、一个 session-owned client 和一个 page；额外页面、跨 origin navigation 或 target transfer fail-visible。
- Computer session 在 approval 和 input 前重新校验 exact target 与 OS permission。
- Pause、Stop 与 Take over 只作用于 exact Automation session。
- Screenshot/observation 通过短生命周期授权进入 bounded evidence；是否作为模型图片输入由 Agent attachment/perception contract 决定，不能直接持久化 raw Host path。

## Current Status

`@neko/automation-contracts` 与 `@neko/automation-node` 当前是 retained kernel：保留 target、session grant、approval、bounded execution 与 evidence 的领域安全规则和单元测试，但没有 Desktop 产品消费者。旧 Plugin/Automation 专用管理 UI、IPC、preload bridge、Desktop adapter 与 Webview 已删除；通用 Extensions Skill/MCP catalog 不构成 Automation 产品入口。DSH official MCP contribution、重新建立产品入口以及真实 provider Evaluation 均需独立 OpenSpec；在此之前不得宣称 Browser/Computer Automation 已通过 Desktop 产品路径交付。
