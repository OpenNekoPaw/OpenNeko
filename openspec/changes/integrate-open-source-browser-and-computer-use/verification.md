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
- P0 Browser runtime 增量：Desktop Browser/Host/provider-inspector 聚焦测试 3 files / 15 tests、Desktop strict
  typecheck、scoped ESLint、Prettier、`git diff --check` 和 OpenSpec strict validation 全部通过。验证覆盖持久安装
  命令、标准 uv entrypoint/shebang link、冻结解释器启动，以及解释器链接换目标后的局部拒绝。
- 全仓 `check:no-internal-versioning` 未通过：当前 dirty worktree 同时包含 Character/Canvas 等并行改动、大量 stale
  allowance 和新 occurrence；本变更保留的 Plugin manifest/MCP protocol 版本属于第三方事实。未修改共享 audit
  baseline 来掩盖这项仓库级阻塞。

## UI Validation

- Authoritative runtime：可见 Electron Desktop development runtime。
- Scenario：`desktop-extension-localization` 通过；报告位于
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-11T20-15-26.059Z-desktop-extension-localization-development/report.json`。
- Prior functional evidence：既有报告证明 Browser/Computer 控件范围、长命令布局、系统权限区和中英文介绍；
  该报告捕获的是变更前命令，不作为本次精确命令文本的证据。
- P0 functional attempt：场景已将 Browser 断言更新为 `uv tool install 'browser-use[cli]'`，并保留 Cua 精确命令
  断言；development authoritative runtime 连续两次在进入产品页面前因 Desktop CDP target 未就绪而超时，
  因此本次 UI 验收为 `blocked`。Host 命令复制和“不执行安装”仍由聚焦测试通过。
- Visual review：首次像素检查发现长命令下操作按钮互相覆盖；已改为命令可换行、按钮按内容宽度自动换行，复跑
  同一场景并直接检查 Browser/Computer 截图后通过。未发现截断、重叠或权限区串位。
- Advisory residual：本轮未覆盖深色主题、Windows/Linux、真实系统拒绝提示或 packaged build。

## Agent Evaluation

- Decision：`update agent-runtime.external-automation`；详见 `evaluation.md`。
- Key-free harness 既有全量结果：45 files / 307 tests；all-suite dry-run：25 suites / 74 cases。
- Cleanup 后重新选择 `agent-runtime.external-automation`：1 suite / 6 cases dry-run 全部通过；该结果只证明
  suite/schema/runner readiness。
- P0 完成后再次 dry-run `agent-runtime.external-automation`：1 suite / 6 cases 通过；未把该结果解释为真实
  Browser 行为或 UI 验收。
- Provider-backed Browser/Computer visible Desktop cases 保持 `infrastructure-blocked`：production Cua 与 Browser
  provider/profile 均已完成生产组合；本轮 Browser 用例在 Desktop 启动前因缺少显式 provider、model 和 cost
  authorization 返回 blocker，Cua 未执行。不以组件测试、mock、最终文本或 dry-run 替代真实 Agent 行为验收。

## Quality Review

- Risk：高。涉及 Agent Tool registration、外部进程、敏感屏幕观察、OS 权限和本地资源授权。
- Scoped review：未发现新的 canonical-path、安全边界或用户数据问题；检查过程中发现并修复 local-runtime 操作按钮
  重叠、验收脚本切换详情未等待，以及两个无调用者辅助函数。
- Fail-visible：缺失/变化的授权资产、provider identity/operation 不兼容、OS 权限丢失和 stale runtime identity 均只
  使当前 source/session 失败，不注册 raw Tool，也不切换 provider。

## Browser Production Registration Increment

`5.4b` 已按首期单页面边界完成，未使用静态 Tool 注册或 active-target fallback：

- Cua local runtime 通过现有插件 contribution lifecycle 构造唯一 Automation application service、session-owned MCP
  runtime、target discovery、authorization 和 product Tool；授权、复查、断开与插件启停会重新 reconcile 同一
  Tool Registry，活跃 session 会阻止断开。
- Browser Tool 参数只接受 canonical HTTP(S) origin，Host 将其投影为用户确认的脱敏目标；每个 Automation
  session 独占一个 Browser Use MCP client、隔离 profile 和唯一 page。
- Desktop Browser factory 只在连接后通过内部 `browser_navigate` 启动授权 origin，并在启动、每次 observe 前后
  和 session revalidation 时通过内部 tab inventory 强制 exactly-one-page 与 same-origin。Agent registry 只暴露
  `browser_get_state`、`browser_get_html`、`browser_screenshot`，不暴露导航、tab management 或 raw MCP Tool。
- Browser production adapter 已复用 Plugin contribution lifecycle、session grant、target selector、transient
  observation receipt 和 runtime disposal；断开后删除 session-owned profile 数据，不接管现有用户 tab。
- Deterministic verification：Automation Node 12 files / 63 tests、Agent adapter 1 file / 4 tests、Desktop Browser/
  production adapter 2 files / 12 tests 通过；Automation Node、Agent Runtime、Desktop strict typecheck 通过。
- Quality verification：scoped ESLint、Prettier、`git diff --check`、application/Agent boundary checks、legacy-debt
  gate 和 OpenSpec strict validation 通过。`check:unused` 被并行 worktree 的 `@neko/generation` 与既有 Desktop
  `pi-ai` dependency 报告阻塞，未修改这些无关文件。

## 5.4b UI Validation

- Scope：Browser origin target confirmation 与 Browser Tool availability，属于用户可见交互；未新增或修改 UI
  组件、布局或样式。
- Authoritative runtime：可见 Electron Desktop + 真实 provider，因为 target selector、Tool approval、外部进程和
  transient screenshot 跨越 Main/Renderer/Agent runtime。
- Inventory：Tool approval -> origin candidate confirmation -> single-page observation -> terminal result；额外页面、
  跨 origin、现有 tab 接管和取消必须 fail-visible；相邻 Computer selector 不变。
- Evidence：contract/adapter/Factory deterministic tests 通过；真实 visible case 在启动 Desktop 前因缺少显式
  provider/model/cost authorization 返回 `infrastructure-blocked`，因此没有可审阅的当前截图。
- Result：`blocked`（advisory）。功能实现不以 key-free 或 mock 证据替代视觉/真实 provider 验收。

## Residual Risk

- `uv tool install` 和 Cua shell 命令只是上游安装说明文本；用户自行执行并承担第三方供应链与更新风险。
- Browser Use 继续直接跟随官方 PyPI 分发，不 fork；安装、更新和卸载由用户及 `uv` 管理，不进入
  OpenNeko Extension 生命周期。Browser runtime 使用用户单独选择的外部 Chrome/Chromium executable，不使用
  Renderer WebView。
- 外部 runtime 更新后会重新做路径、publisher/signing/TCC、server、operation/field/annotation 检查，但 OpenNeko
  不保证第三方行为质量。
- 真实 Browser redirect/new-tab、Computer mutation、跨平台输入和 provider-backed Evaluation 仍待独立验收；
  existing-tab takeover 不属于首期范围。

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
