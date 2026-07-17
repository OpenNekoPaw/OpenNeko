# 客户端产物目标与职责边界

状态：Accepted  
更新日期：2026-07-14

OpenNeko 当前只有三个产品构建根：OpenNeko Home、OpenNeko TUI 和 OpenNeko for VSCode。它们共享 Agent runtime、领域 capability、Host adapter ports、Engine client 与 Rust Engine，但服务不同目标；产品 composition 位于 `apps/*`，可复用实现位于 `packages/*`。

## 目标总览

| 产物 | Canonical root | 核心身份 | 目标 | 非目标 |
| --- | --- | --- | --- | --- |
| OpenNeko Home | `apps/neko-home` | Agent 与 AIGC 管理中心 | 类 Codex 的多会话导航、队列/取消/恢复、生成任务/产物/溯源/诊断及专业工具交接 | 专业 timeline、canvas、scene、code 或 media 编辑器 |
| OpenNeko TUI | `apps/neko-tui` | Agent 与模型验证实验台 | 真实 Agent、模型、Skill/Tool、消融、回归和结构化 Evaluation 证据 | 图形化创作编辑、VSCode/Webview/Electron 依赖 |
| OpenNeko for VSCode | `apps/neko-vscode` | 插件化专业创作客户端 | 聚合领域 Extension/Custom Editor，完成创作、编辑、预览、编排与发布 | 在 Extension Pack 中实现领域 runtime 或复制 Engine 权威计算 |

旧 `neko-desktop` 编辑器壳已退出产品结构并删除。未来 native Studio 必须通过独立 OpenSpec 重新定义产品目标、Engine-native viewport 和宿主边界，不得依赖或恢复旧壳。

## OpenNeko Home

Home 管理多个独立 Agent session/runtime。每个实例独立拥有配置投影、消息队列、任务、日志、异步工作和资源句柄；当前选择只决定 UI 投影，不能成为运行时状态 owner。

Home 同时投影 AIGC creation task/run、进度、诊断、生成输出、provenance、validation、retry/cancel 和 promotion/handoff。Task、Run、Resource 与 Artifact 使用稳定身份；cache path、preview URL 和 Webview URI 不得成为持久身份。需要精确编辑时，Home 通过公共契约交接给 OpenNeko for VSCode 或未来已注册的专业工具。

权威验收使用真实 Electron application functional suite，覆盖 typed IPC、实例隔离、陈旧身份拒绝、后台任务连续性、重启恢复、生成产物和专业工具交接。

## OpenNeko TUI

TUI 的 Commander 命令、Ink UI、terminal presentation、Node host composition、debug automation、executable、构建、测试与发布全部由 `apps/neko-tui` 拥有。host-neutral AgentSession、provider/platform 与共享契约继续由对应公共 package 拥有；已删除的 `@neko/cli` 不提供 facade 或兼容入口。

TUI 优先服务路径级 Agent 验证、模型/preset 对比、prompt/Skill 消融、真实 API smoke、batch suite、replay 和结构化报告。图像、音频、视频和工程对象表现为稳定引用、摘要、诊断和可保存产物，而不是交互式 GUI。

权威验收由确定性测试与聚焦真实 Agent Evaluation 共同组成，并必须证明 app executable 命中公共 entry、package-local executable 没有参与。

## OpenNeko for VSCode

`apps/neko-vscode` 只拥有 `neko.neko-suite` Extension Pack identity、成员 extension IDs、VSIX 打包、Marketplace/release metadata 和应用级验收。Story、Canvas、Cut、Preview、Model、Sketch、Puppet、Audio、Assets、Market、Dashboard、Search 与 Agent 的 runtime、Extension 和 Webview 仍由各领域包拥有。

VSCode 客户端必须遵守 Webview CSP、resource projection、Range/codec、focus 和 Extension/Webview 生命周期边界。媒体、Scene、Puppet、Audio、Device、ML、导出和专业 viewport 真值属于 Rust Engine；Extension Pack 不提供平行实现。

权威验收包括 VSIX manifest/identity、隔离 profile 安装，以及 Extension Development Host 中的聚焦 Webview functional 场景和 runtime-error gate。

## 共享边界

- `apps/*` 拥有 product identity、composition、lifecycle、build、test、package 和 release selection。
- `packages/*` 拥有 host-neutral/shared contracts、Agent runtime、领域实现、Extension/Webview 和 Engine client；terminal product composition 由 `apps/neko-tui` 独占。
- `packages/*` 不得依赖 `apps/*`；apps 只能消费 documented public package entries。
- `packages/neko-workbench-core` 保留为 host-neutral Workbench contribution 与 Plugin Host manifest 契约层。它不属于任何单个 app，也不拥有具体 UI、Extension activation、Electron window、TUI output 或 Engine connection。
- 持久项目事实只能保存 portable refs、stable ResourceRef、asset/entity id、workspace-relative path 或领域格式；不得保存 cache/runtime projection identity。

## 相关文档

- [`application-composition.md`](application-composition.md)
- [`package-boundaries.md`](package-boundaries.md)
- [`adr-neko-workbench-core-plugin-host.md`](adr-neko-workbench-core-plugin-host.md)
- [`engine-runtime.md`](engine-runtime.md)
- [`agent.md`](agent.md)
