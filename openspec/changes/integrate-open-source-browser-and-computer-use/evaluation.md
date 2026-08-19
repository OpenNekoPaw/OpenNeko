# Agent Evaluation Evidence

> **Successor disposition (2026-08-20):** `replace-pi-with-dsh-runtime-atomically` supersedes this change's OpenNeko Plugin catalog, Skill Host, MCP Manager, Tool Registry, Pi Tool Call and production Automation composition. Browser Use/Cua upstream compatibility, exact target, OS permission, action approval and evidence rules remain input to the successor, but no task or requirement here authorizes a production success path. The successor owns DSH MCP contribution wiring, deletion of old registrations/contracts and new Evaluation evidence.

更新日期：2026-08-12

## Evaluation Scope

- Change：将 Browser Use/Cua 从固定版本、完整 Schema 摘要和资格状态管理，收敛为用户管理的外部
  runtime、最小结构兼容检查和真实执行权限边界。
- Authoring decision：`update agent-runtime.external-automation`。该 suite 继续拥有 Browser/Computer
  capability Tool routing、精确目标、调用拒绝、取消和 Tool result projection。
- Canonical path：用户启用 Plugin -> 明确授权外部 runtime -> MCP handshake/server name -> 所需 operation
  结构兼容 -> Automation exact session/target/mode -> product-owned Tool -> Pi Tool Call。
- Forbidden path：OpenNeko 执行安装命令、扫描 `PATH`、按固定第三方版本或完整 Schema digest 准入、暴露 raw
  Browser/Cua Tool、模型提交目标 identity、失败后切换 provider/runtime 或使用 direct turn runner/mock。

## Cases

- Updated：`browser-observe-selected-tab`、`browser-mutation-denied-in-observe-profile` 改为显式确认 canonical
  origin，并要求一会话一客户端、一隔离 profile 和一页面；保留观察证据、mutation denial、raw/nested Tool
  rejection，并禁止 existing-tab takeover、Agent navigation/tab management 和 provider fallback。
- Updated：`computer-observe-selected-window`、`computer-target-routing-fields-rejected`、
  `computer-observation-cancelled` 删除固定 Cua release 和“资格化”语义，保留签名/TCC owner、精确目标、
  Host 注入路由字段、取消和 raw fallback rejection；permission loss 与显式 Take over 由同一 Automation owner 的
  deterministic companion tests 验证，不伪造成当前 Desktop Evaluation harness 尚不支持的 UI step。
- Reused：`disabled-and-unknown-automation-tools` 继续证明 disabled/unavailable Plugin 不注册 Browser/Computer
  Tool，且不会自动安装、启用或模拟成功。
- Deterministic coverage：Extension canonical state、命令复制不执行、local runtime 状态、MCP operation
  compatibility、Browser/Cua release-string tolerance、Cua publisher/notarization 和 exact path identity 由 contracts、
  Node、Webview 和 Desktop tests 直接验证。

## Verification

- Key-free：`pnpm test:agent:eval` passed（45 files / 307 tests）；全 suite dry-run passed（25 suites / 74
  cases）。它们只证明 suite/schema/runner readiness。
- 5.4b focused key-free：更新后的 `agent-runtime.external-automation` 1 suite / 6 cases dry-run 通过；Evaluation
  evidence、Desktop scenario 和 discovery 聚焦测试 3 files / 14 tests 通过。
- Real Browser/Computer cases：Cua 与 Browser production provider/profile 已通过 Plugin contribution lifecycle
  完成组合，但当前 Browser 可见用例因未提供显式 provider、model 和 cost authorization 在 Desktop 启动前返回
  `infrastructure-blocked`；Cua 本轮未执行。两者都不以组件测试、mock、最终文本或 key-free dry-run 替代。
- Foundational Agent matrix：本批不改变 Conversation/session persistence、compaction、generation record、
  conversation switching 或 isolation owner，均为 unaffected；Tool registration 的受影响范围由
  `agent-runtime.external-automation` cases 拥有。

## Residual Risk

- Browser Use 使用 `uv tool install 'browser-use[cli]'` 作为可复制的持久安装文本；OpenNeko 不执行该命令，
  也不保证上游依赖、外部 Chrome/Chromium runtime 或模型凭据可用。
- 当前 Cua observe profile 只消费 Screen Recording；Accessibility 可查询并仅在显式请求时触发系统提示，Input
  Control 保持 unavailable，直到真实 interact profile 成为正确性消费者。bundle identifier、Team ID、Developer ID
  和 notarization 的 deterministic tests 不替代 TCC 行为验收。
- Browser 单页面/同源限制已有 deterministic 边界测试，但真实 redirect/new-tab 行为、Computer mutation 和
  跨平台输入仍未获得 provider-backed 行为证据。
