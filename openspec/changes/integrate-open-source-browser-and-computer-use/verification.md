# Verification

更新日期：2026-08-12

## Scope

本轮把 Extensions 收敛为开放的本地来源发现与启停入口，并把 Browser Use/Cua 明确拆成两层：OpenNeko
提供 bundled Automation adapter，用户通过外部原生方式安装和授权 runtime。OpenNeko 只提供指南、复制命令、
精确资源授权、复查和断开授权，不执行安装、更新或卸载，也不扫描 `PATH`。

Extension 记录存在即表示本地已配置来源；不再维护重复的 installed 状态、资格标签、release 管理、远程 artifact
生命周期、专用 endpoint 管理或权限矩阵。普通第三方 Plugin、Skill 和 MCP 继续走公开通用路径，OpenNeko 不为其
行为质量背书。

## Architecture Review

- Responsibility：Agent Extension owner 负责本地发现、启停、移除 OpenNeko 管理的个人副本和运行诊断；
  Automation owner 负责 operation compatibility、session/target/action；Desktop Main 仅持有 clipboard、文件授权、
  realpath、签名/TCC、进程和 MCP concrete adapter。
- Dependency：Contracts/Node/Webview/Main/preload/renderer 依赖方向保持不变；外部 Python/Cua runtime 没有进入
  workspace package 或 Renderer。
- Interface：canonical Extension projection 只保留来源、贡献、启用状态、允许动作和局部 diagnostic；
  local-runtime projection 只保留 `not-configured | ready | error`、精确资产状态和安装说明。
- Extension：Browser/Cua 仅因精确目标、敏感观察、OS 权限和动作审批进入 Automation wrapper；普通 MCP 不进入
  这套专用管理。
- Canonical path：已删除 raw Browser/Cua Tool、endpoint fallback、artifact fallback、固定 release gate 和完整
  schema digest；兼容检查只消费 adapter 实际需要的 operation 字段与 annotation。

## Verification Results

- Agent full packages：Contracts 44 files / 287 tests，Runtime 120 / 1144，Webview 98 / 750，均通过。
- Cleanup focused：Extension Runtime 3 files / 21 tests，Extension Webview 1 / 5，均通过；最终格式化后再次运行
  Extension Manager 1 / 7 通过。
- Automation：Contracts 5 files / 19 tests，Node 11 / 56，Webview 4 / 9，均通过。
- Desktop focused：12 files / 92 tests 通过，覆盖 local-runtime Host/provider inspection、Browser/Cua factory、
  permission、AppHost、preload、Extension composition 与 Renderer runtime。
- Desktop full suite：99/100 files、656/659 tests 通过；仅
  `desktop-agent-resource-display-projector.test.ts` 的 3 项因当前并行工作区中 preview descriptor/render URI
  改动失败，与本变更的 Extension/Automation 路径无关。
- Strict typecheck/build：Agent Contracts/Runtime/Webview、Automation Contracts/Node/Webview、Desktop 全部通过。
- Scoped ESLint、Prettier、`git diff --check`、Agent/Application/Webview boundary checks 通过。
- `openspec validate integrate-open-source-browser-and-computer-use --type change --strict --no-interactive` 通过；
  全仓 `check:openspec` 86 项全部通过。
- 全仓 `check:no-internal-versioning` 未通过：当前 dirty worktree 同时包含 Character/Canvas 等并行改动、大量 stale
  allowance 和新 occurrence；本变更保留的 Plugin manifest/MCP protocol 版本属于第三方事实。未修改共享 audit
  baseline 来掩盖这项仓库级阻塞。

## UI Validation

- Authoritative runtime：可见 Electron Desktop development runtime。
- Scenario：`desktop-extension-localization` 通过；报告位于
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-11T20-15-26.059Z-desktop-extension-localization-development/report.json`。
- Functional evidence：Browser 详情只显示 Browser Use local runtime 和
  `uvx --from 'browser-use[cli]' browser-use --mcp`；Computer 详情只显示 Cua Driver、官方安装命令和系统权限区；
  普通 Extension 不显示 Automation controls；英文与中文介绍一致。
- Visual review：首次像素检查发现长命令下操作按钮互相覆盖；已改为命令可换行、按钮按内容宽度自动换行，复跑
  同一场景并直接检查 Browser/Computer 截图后通过。未发现截断、重叠或权限区串位。
- Advisory residual：本轮未覆盖深色主题、Windows/Linux、真实系统拒绝提示或 packaged build。

## Agent Evaluation

- Decision：`update agent-runtime.external-automation`；详见 `evaluation.md`。
- Key-free harness 既有全量结果：45 files / 307 tests；all-suite dry-run：25 suites / 74 cases。
- Cleanup 后重新选择 `agent-runtime.external-automation`：1 suite / 6 cases dry-run 全部通过；该结果只证明
  suite/schema/runner readiness。
- Provider-backed Browser/Computer visible Desktop cases 保持 `infrastructure-blocked`：production
  Cua provider/profile 已完成生产组合但尚未在当前机器完成真实 CuaDriver/UI 验收；Browser exact-target 上游边界
  尚未完成。不以组件测试、mock、最终文本或 dry-run 替代真实 Agent 行为验收。

## Quality Review

- Risk：高。涉及 Agent Tool registration、外部进程、敏感屏幕观察、OS 权限和本地资源授权。
- Scoped review：未发现新的 canonical-path、安全边界或用户数据问题；检查过程中发现并修复 local-runtime 操作按钮
  重叠、验收脚本切换详情未等待，以及两个无调用者辅助函数。
- Fail-visible：缺失/变化的授权资产、provider identity/operation 不兼容、OS 权限丢失和 stale runtime identity 均只
  使当前 source/session 失败，不注册 raw Tool，也不切换 provider。

## Remaining Production Boundary

OpenSpec 仅剩 `5.4b`，不能通过静态 Tool 注册或 active-target fallback 宣称 Browser 完成：

- Cua local runtime 通过现有插件 contribution lifecycle 构造唯一 Automation application service、session-owned MCP
  runtime、target discovery、authorization 和 product Tool；授权、复查、断开与插件启停会重新 reconcile 同一
  Tool Registry，活跃 session 会阻止断开。
- Cua 已有稳定 application/process/window discovery；Browser Use factory 当前为每个 MCP client 建立隔离 browser
  session，inspection/discovery client 看到的 tab 不能作为另一个 execution client 的精确目标。
- Browser 必须先收敛 target/session authority，再注册 product-owned Tool；在此之前保持
  `automation-adapter-unavailable`，不得伪造可用 Tool、退化为 active tab 或暴露 raw Browser/Cua MCP Tool。

## Residual Risk

- `uvx` 和 Cua shell 命令只是上游安装说明文本；用户自行执行并承担第三方供应链与更新风险。
- Browser Use 继续直接跟随官方 PyPI/`uvx` 分发，不 fork；用户若改用 `uv tool install`，其安装、更新和卸载
  仍由用户及 `uv` 管理，不进入 OpenNeko Extension 生命周期。
- 外部 runtime 更新后会重新做路径、publisher/signing/TCC、server、operation/field/annotation 检查，但 OpenNeko
  不保证第三方行为质量。
- 真实 Browser redirect/new-tab、Computer mutation、跨平台输入和 provider-backed Evaluation 仍待独立实现与
  验收；Browser production Tool registration 仍待 `5.4b`。

## Cua Production Registration Increment

- 本增量初次组合后 `@neko/agent-runtime` 与 Desktop strict typecheck 通过。
- Agent focused：Plugin Runtime、Automation adapter、transient image loader/Pi projection、Agent AppHost，5 files /
  111 tests 通过。
- Desktop focused：production Cua adapter、local-runtime Host、Desktop AppHost，3 files / 65 tests 通过。
- 新增验证覆盖：adapter-only raw MCP 不解析/不启动、产品 Tool 进入 canonical registry、相同 runtime identity 复用、
  runtime identity 变化替换、Cua 未配置时不注册、断开被活跃 Automation session 拒绝，以及截图字节仅通过一次性
  receipt 投影给当前 Pi Tool result、持久 Tool data 不包含原始图像字节。
- 本增量最终复跑时 Agent Contracts/Runtime strict typecheck 通过；Desktop strict typecheck 被同一 dirty worktree
  中并行 Character 改动的 `app-host.test.ts` mock contract 错误阻塞（`prepareTurn`/`freezePreparedTurn` 缺失），
  Cua/Desktop 聚焦测试仍全部通过，未修改该并行工作。
- 提交前再次复跑 Agent 5 files / 111 tests 全部通过，Desktop Automation 核心 2 files / 8 tests 全部通过；
  与 `app-host.test.ts` 合并运行时为 64/65，通过项覆盖本变更，唯一失败来自未暂存的并行 Agent/Character
  provider-execution 场景抛出 `exact provider unavailable`。本提交未吸收或修改该并行路径。
