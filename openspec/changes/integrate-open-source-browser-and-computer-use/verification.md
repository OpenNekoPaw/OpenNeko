# Verification

更新日期：2026-08-10

## Passed

- `pnpm --filter @neko/automation-contracts typecheck`
- `pnpm --filter @neko/automation-contracts test`：4 tests
- `pnpm --filter @neko/automation-node typecheck`
- `pnpm --filter @neko/automation-contracts test`：5 tests；覆盖 managed/user-managed delivery source 的 strict
  canonical shape、opaque endpoint identity 与 Host-only authorization rejection
- `pnpm --filter @neko/automation-node test`：25 tests；provider/profile/session grant/registry key 精确绑定同一
  delivery source，GitHub profile 不会尝试同名 user-managed endpoint
- Desktop Browser Use contained client factory：4 tests
- Desktop Cua Driver contained bounded client factory：2 tests
- Agent Automation Capability adapter：2 tests
- Extension unavailable-artifact catalog projection：1 test
- official SDK MCP client focused suite：4 tests
- Automation runtime release-input lock：6 tests；覆盖 exact Browser/Cua/MCP release facts、六个平台 Cua
  URL/size/digest、Cua workflow/main Cargo/npm/31-crate build evidence、53-file Node source、36-package first-party
  Cargo lock、Rust `1.97.1`、moving URL、平台缺项、Browser source-archive poison、invented lock/incomplete closure、
  toolchain drift 与 modified local artifact
- Cua Driver first-party Node runtime rebuild：6 tests；覆盖 locale-independent source digest、exact
  source/lock/toolchain、双架构 `--locked`、
  `SOURCE_DATE_EPOCH`、隔离 HOME、build/Cargo-home path remap、固定 Mach-O metadata、Electron RustBuffer patch boundary、双构建一致性门禁，
  以及 nondeterministic build、source/symlink/lock/release-log/patch/toolchain poison 与 existing-output preservation
- `pnpm prepare:automation-runtime-cua-node` 真实发布命令：隔离 official rustup `1.29.0`（aarch64 macOS
  installer SHA-256 `aeb4105778ca1bd3c6b0e75768f581c656633cd51368fa61289b6a71696ac7e1`）安装 Rust
  `1.97.1 (8bab26f4f 2026-07-14)` 与双 macOS target；两个 independent build 的 binary 和 receipt 均逐字节一致，
  输出 1,569,136 bytes，`sha256:c4e5b70fddbf6ffdd6477a90ea4da5fa3881d99796d9ded9f5faaf3e1039725a`，
  receipt 记录 `independentBuilds=2`、`isolatedHome=true`、`cargoHomeRemap=/openneko/cargo-home` 与当前 recipe
  `sha256:fb8a423573c2ce9735539a1219056ee9f11d2e0ef176e135e8e0ca943cf3a750`；`lipo` 确认
  `x86_64 + arm64`，两个 slice 的 install name 均为 `@rpath/cua_driver_node_runtime.node` 且无 `LC_UUID`
- Cua locked SPDX candidate builder：3 tests；覆盖 deterministic production-only closure、dev-only exclusion、
  slash license normalization、workspace license inheritance、crate checksum、isolated HOME/offline metadata、source/license/
  registry/closure/toolchain poison 与 existing-output preservation。真实命令使用全新 crates.io cache 预取后执行
  `cargo metadata --locked --offline`，两份输出逐字节一致：367 packages、476,482 bytes，
  `sha256:08756f9c17062202d0efeb8b149aece1a105486cbcb13ea80f9f1816d6725a51`、`reviewed=false`，当前 recipe
  `sha256:42c6978d2853b505dd2eee13566810de7c7b0e3feffe5e73a23245332f17d746`
- Automation runtime artifact builder：6 tests；覆盖 deterministic byte-identical Cua candidate、contained
  marketplace/provenance/build-inputs/SPDX/native/App payload、modified upstream、link、incomplete/duplicate SPDX 与
  exact 367-package production closure mismatch、exclusive output preservation；强制 matching first-party Node receipt，替换
  upstream `.node` 并拒绝 poisoned bytes/receipt
- `pnpm check:automation-runtime-inputs`：Browser/Cua 均明确输出 `installable=false` 与未完成发布门禁
- Cua Driver release build audit：macOS release run `31217509888` 的 Rust cache miss；main payload 使用 locked
  Cargo workspace，Node runtime 使用 `uniffi-bindgen-react-native@0.31.0-3` 临时 workspace 且无 published
  `Cargo.lock`/`--locked`。日志列出 31 个实际 crate/release；当前重解析已发生 `cc 1.4.1 -> 1.4.2`。OpenNeko
  已固定 own 36-package lock；上游 `.node` 仍不可用，first-party locked replacement 已真实可复现产出但尚未随
  完整 SPDX、OpenNeko signature 与 packaged qualification 发布
- Cua Driver `darwin-arm64` upstream live audit：64,208,172 bytes，
  `sha256:c30a81f6b5cfd44d40653f7549d7d714b445e9cbd0ed012c4c524f1c43d2872b`；CLI `codesign --verify`
  通过，App `spctl --assess` 返回 Notarized Developer ID。该证据只确认上游资产，不是 OpenNeko artifact 资格
- Cua Driver contained candidate：真实 assembly 用 exact upstream tar、build-15 first-party Node runtime 与上述 SPDX
  生成两份逐字节一致的 63,911,219-byte tar.gz，
  `sha256:9e3bae3b3358fe0d9ea44007916610e3c5b997360a2146a32349135df2ab63f6`；receipt 为
  `catalogReady=false`，保留人工许可复核、OpenNeko signature 与 packaged qualification 三项 blocker
- `pnpm --filter @neko/app-desktop typecheck`：passed
- Desktop artifact/archive policy Host：2 files，35 tests；覆盖真实 tar.gz/ZIP、streaming size/digest/progress、
  Content-Length、download/extraction AbortSignal cancel、Ed25519、license/provenance、精确 reviewed-host redirect 与
  5-hop 上限、production disk-space（含 TAR scratch）/1.5 GB expansion/20,000-entry bounds、TAR 声明内容截断、
  跨平台 path/case/hierarchy collision、link、unknown key、局部 staging cleanup 和 atomic commit/discard；same-operation
  resume 覆盖 strong ETag/Last-Modified、精确 final URL + Range/If-Range + Content-Range、落盘 offset 前缀重哈希、缺失/
  变化 validator 拒绝及第二次中断不再请求。真实 Windows 执行尚未覆盖，3.7 保持未完成
- Managed artifact delivery source contract：reviewed artifact、持久安装事实、Main/preload/Renderer projection 与
  Ed25519 signature message 均显式绑定 `github-release` 或 `official-download`；GitHub source 若不是固定
  `github.com` 入口会在 marketplace decode 边界 fail-local，绝不改走 official source。用户管理 endpoint 仍是
  独立 connector 待实现项，没有伪造 installed artifact 状态
- `pnpm --filter @neko/agent-contracts typecheck`
- `pnpm --filter @neko/agent-runtime typecheck`
- `pnpm --filter @neko/agent-runtime test`：118 files，1124 tests
- `pnpm --filter @neko/agent-runtime exec vitest run src/extensions/extension-manager.test.ts
src/extensions/extension-package-integrity.test.ts`：2 files，23 tests；覆盖
  reviewed platform artifact install、旧 marketplace-directory copy poison、host allowlist、digest、signature、
  provenance、license inventory、失败 discard、atomic commit gate、installed-without-grant、exact
  `updatesFrom` update projection、disabled-only atomic update、same-operation pre-commit idle recheck、permission expansion
  grant revoke、commit rollback、invalid-candidate fail-local、exact Agent/Automation ownership gate、Main-owned
  progress/cancel、restart staging cleanup、durable artifact/grant recovery、fresh readiness query、installed tree content/
  executable-mode/link integrity、accepted/declared permission mismatch 与 tampered-extension sibling isolation
- `pnpm --filter @neko/agent-contracts test`：42 files，273 tests；覆盖 `canUpdate` / `updatePackageRelease`
  producer-consumer consistency
- `pnpm --filter @neko/agent-webview build`
- `pnpm --filter @neko/agent-webview exec vitest run src/extension-management/root.test.tsx`：7 tests
- `pnpm --filter @neko/app-desktop exec vitest run src/main/app-host.test.ts src/renderer/desktop-extension-management-runtime.test.ts`：
  2 files，45 tests
- Desktop artifact/Main/preload/Renderer management focused suite：4 files，57 tests
- Desktop Browser/Cua/artifact/management/preload focused suite：6 files，62 tests
- Agent Runtime MCP/extension focused suite：7 files，89 tests
- Agent plugin runtime focused suite：7 tests；包含 adapter-only launcher poison、generic sibling connect/call 与
  `dependencyStatus=unchecked` readiness projection
- Agent Contracts extension management focused suite：3 tests
- `pnpm check:quality`：passed；包括 internal-versioning、offline repair、package/application/Agent/Webview
  boundary、strict tsconfig、Agent typecheck、storage、legacy-debt、121 项 test orchestration 与全仓 OpenSpec
- `openspec validate integrate-open-source-browser-and-computer-use --strict --no-interactive`：passed；全仓
  `pnpm check:openspec` 为 72 passed / 0 failed
- `pnpm check:package-roles`
- `pnpm check:package-product-status`：`@neko/automation-contracts` 与 `@neko/automation-node` 由 Desktop
  composition 真实可达并登记为 `active-product`；这只激活 exact session ownership gate，不表示已有可启动
  Browser/Cua profile
- `pnpm check:package-boundaries`
- `pnpm check:application-boundaries`
- `pnpm check:agent-boundaries`
- `pnpm check:strict-tsconfig`
- `pnpm check:test-orchestration`：121 tests and both ownership audits
- scoped ESLint and Prettier checks
- `pnpm check:legacy-debt`
- `pnpm check:unused`：当前被同一工作区未提交的 Markdown/Canvas 改动阻塞：Markdown browser test 使用但未声明
  `jsdom`，且 `packages/canvas/webview/src/utils/nodeFactory.ts` 导出 `NODE_DEFAULT_SIZES` 但未使用；本批 Automation endpoint
  代码无 unused finding，另有 82 项 configuration hints
- `pnpm check:deps`：1529 modules / 5174 dependencies，无 violation
- `git diff --check`
- `pnpm test:agent:eval`：45 files，304 tests；key-free harness only。新增 Automation Tool result strict assertion，
  覆盖 neutral/Desktop evaluator、canonical session/evidence shape、transient PNG receipt、raw observation/session routing
  poison 与 assertion transport consistency
- `node scripts/agent-eval/all-suite-dry-run.mjs`：25 suites，70 cases；新增
  `agent-runtime.external-automation` 的 6 个 declarative cases，未运行 provider-backed lane
- 开发态真实 Electron UI：Extensions 页显示 Browser Use `0.13.7`、Computer Use `0.19.2`、声明权限与
  artifact unavailable diagnostic，且不存在安装入口；直接图像检查未见裁切、重叠或不可读状态。active operation
  视觉态因正式 catalog 不可安装而 blocked
- 当前源码开发态真实 Electron UI：Extensions 页新增 Browser Use `0.13.7` 与 Cua Driver `0.19.2`
  用户自管端点卡片，均显示“未检查 / 未资格化 / 未配置”；Browser Use 配置表单可展开并取消，包含 MCP URL、
  none/bearer/custom-header authorization 与“保存并检查”，没有 install/start/update/stop/terminate 动作。本次验收未保存
  endpoint 或 credential，也未连接、启动或停止外部服务。验收过程中捕获并修复 StrictMode 提前 dispose 缺陷后复验通过
- 当前源码可见 Electron UI：Computer Use 系统权限区在标准窗口与较小窗口均显示 Screen Recording、Accessibility、
  Input Control exact facts；本机前两项为已授予，Input Control 为当前构建不可用。进入 Extensions、读取状态与滚动均未
  弹出授权提示，也未改变系统权限。由于当前 TCC 状态已授予，真实 request/denial/loss action 未执行，保持 blocked
- Automation contracts：3 files，11 tests；Automation node：8 files，34 tests；Automation Webview：2 files，2 tests；
  Desktop permission/endpoint/Main/preload/Renderer focused suite：6 files，68 tests。覆盖 HTTPS/loopback transport、
  forbidden credential URL/header、safeStorage-backed secret key、MCP `serverInfo`、reviewed Tool schema/annotation、
  单 connector 损坏隔离、typed Main/preload/Renderer route、脱敏 projection，以及 service interface 不存在
  install/start/update/stop/terminate operation。配置/删除 mutation 直接返回本次唯一 qualification projection，不会由
  Desktop 或 Webview 再次探测；资格检查与 session-owned connection 复用 exact Host client factory，每次从加密 Host
  store 解析 exact connector/endpoint 配置，过期 endpoint/server identity 无 fallback；session disconnect 失败保留 owner
  以便重试，operation/cleanup 双失败均保留。macOS Screen Recording/Accessibility 查询不触发系统授权提示，Input
  Control 与非 macOS 平台保持 unsupported；permission list/query 不 prompt，Screen Recording request 只打开 fixed
  System Settings URI，Accessibility 只在 exact explicit request 使用 prompting trust query；StrictMode lifecycle replay
  不会提前 dispose runtime
- Desktop full Vitest 当前重跑：94/95 files、612/614 tests passed；2 个既有 `agent-launch-bridge` fixture 因 strict
  catalog contract 含 unsupported fields 失败，与本批 artifact/archive 文件无调用关系。聚焦 artifact suite 仍为
  2 files / 35 tests 全通过
- Automation target authorization：`@neko/automation-node` 10 files / 47 tests、typecheck passed；新增
  package-owned bounded discovery、redacted browser/computer candidate projection、explicit Host selection、exact
  post-selection revalidation 与 one-time grant issuance。取消、stale authorization、unknown/duplicate target、changed
  bounds/profile 均在发 grant 前 fail-local；browser projection poison test 证明 profile/session/tab handle 不进入选择面。
- Agent Automation Capability：Tool schema 已删除 model-authored `targetKey`，poison test 证明该字段在请求 Host
  authorization 前即被拒绝；Agent adapter 直接消费 `AutomationSessionAuthorizationService` public contract。串行完整
  Agent Runtime 复验为 117 files / 1118 tests；一次与全仓门禁并行执行时 official SDK MCP fixture 的 4 个连接超时，
  串行复跑全包通过，归类为并行资源争用而非产品回归。
- Exact target selection slice：Automation Contracts 4 files / 15 tests，Automation Node 11 files / 51 tests，
  Automation Webview 3 files / 5 tests，Desktop focused 5 files / 69 tests，相关 typecheck 全部 passed。覆盖
  package-owned pending coordinator、Workspace/Conversation filtering、duplicate/unknown/stale/Abort/dispose poison、
  sender-derived Window + current Agent connection + visible session Surface + Conversation 校验、generic no-data
  changed event、preload/runtime strict result identity、空状态、显式 target 选择、取消与可见错误重试。Desktop
  `DesktopAgentSurface` 只为 ready Conversation connection 挂载该 Root；不存在 focused/active Window、recent
  Conversation、first candidate 或 model-authored target fallback。
- Live session control slice：Automation Contracts 5 files / 19 tests，Automation Node 11 files / 54 tests，Automation
  Webview 4 files / 8 tests，Agent Webview 93 files / 721 tests，Agent Runtime 117 files / 1119 tests，Desktop focused
  5 files / 71 tests；相关 typecheck、
  scoped ESLint 与 Prettier passed。覆盖 redacted projection、exact Conversation/Run/Tool Call command、Pause/Resume/
  Stop/Take over、phase/evidence state、provider AbortSignal、takeover 后迟到 result/receipt rejection、Agent cleanup
  terminal preservation、sibling isolation、sender Window + current connection + visible Conversation Surface、data-free
  changed event、preload/runtime strict identity、UI success/error/empty 与 Surface-owned disposal。该 slice 当时的 Desktop full
  Vitest 为 94 files / 589 tests，其中 587 passed，2 个既有 Agent launch fixture 因未同步的 `agent-launch` catalog
  shape 失败；本批 5-file focused Desktop suite 71 tests passed，失败文件不在本批修改范围。`pnpm
check:package-boundaries`、25-suite/70-case key-free Evaluation dry-run 与 strict OpenSpec validation passed；scoped
  ESLint 0 error、1 个本文件既有 exhaustive-deps warning。

## UI Validation：Automation live session control

- Scope：当前 ready Agent Conversation 中的 live Automation 控制卡；覆盖 empty、active observation、Pause/Resume、
  Stop/Take over、busy、provider-close error、terminal disappearance 与 sibling isolation。适用 `neko-ui-validation`。
- Runtime：Desktop Main/preload/Renderer 是权威边界，因为 control 依赖 sender Window、当前 Agent connection、可见
  Conversation Surface、provider lifecycle 与 Tool Call owner。Automation Webview component 只提供补充功能证据。
- Evidence：contracts/node/webview、AppHost、preload 与 Renderer runtime focused tests 均通过；组件测试证明 control
  command 使用 exact owner、终态卡片消失、错误保持可见且 UI 文本不含 PID/window/tab/endpoint。Agent Webview
  path test 进一步证明 accessory 只位于 exact canonical Tool Call card；Desktop test 证明 same Conversation + Tool Call
  嵌入、foreign/sibling isolation、终态仅移除 control 而保留 Timeline item，以及 Draft -> Session Root identity 不变。
  composition-level 浮动卡成功路径与 absolute overlay CSS 已删除。production
  `automationService` 仍以空 profiles/providers 组合，不能通过用户可操作路径创建 populated live card，因而没有真实
  Desktop 像素或 provider takeover 证据。
- Result：`blocked`（UI 验收）。exact Tool Call Timeline embedding 的 deterministic implementation 已通过并完成
  OpenSpec 4.5；populated、dense、小窗口、深色主题与真实 Pause/Take over 像素/交互仍待 qualified provider。
- Residual risk：当前只能直接检查 idle Desktop 与组件级 populated state，不能据此宣称真实 provider control 的
  layout、焦点、长 target label、busy/error 或 takeover 视觉已通过。

## UI Validation：Automation target selection

- Scope：当前 ready Agent Conversation 中的目标选择卡片；覆盖 idle/empty、pending candidate、select、cancel、
  decision error、StrictMode replay 与相邻已有 Agent Conversation。适用 `neko-ui-validation`。
- Runtime：Desktop Main/preload/Renderer 是权威边界，因为该交互依赖 sender Window、Agent connection、可见
  session Surface 与 Conversation。Automation Webview component runtime 仅作为 pending/error/cancel 的补充证据。
- Evidence：真实源码 Electron 首次检查发现新增 package export 被旧 Vite dev server 缓存，重启 dev runtime 后
  应用正常加载；打开现有 Assistant Conversation 时又复现 `target selection runtime is disposed` 的 StrictMode
  局部失败。改为与 Agent adapter 一致的 replay-safe 延迟释放后，新增回归测试通过，真实窗口复验可正常显示
  transcript/composer，idle selection 不产生隐藏卡片、错误或布局占位。截图直接检查未见新增裁切、重叠或不可读
  状态；已有 stored-settings diagnostic 与本变更无关。
- Result：`blocked`。真实 idle 与相邻 Agent Conversation 通过；production provider/profile 尚未注册，无法通过
  用户可操作路径产生 pending authorization，因此真实 pending/select/cancel/error 卡片的 Desktop 像素与交互证据
  不可生成。组件测试覆盖这些状态，但按 skill 规则不能替代 Desktop trust-boundary 验收。
- Residual risk：真实候选密集列表、小窗口、深色主题和 provider-backed select/cancel 将随 production Capability 与
  real-provider Evaluation 一并复验，不得据当前 component evidence 宣称 UI 完全通过。

## Blocked Or Unrelated

- `pnpm check:no-internal-versioning` 已通过：本变更的 extension package release 登记为用户可见的 package
  release，Cua bounded policy format 登记为第三方 external fact；0 个新增 occurrence。仓库当前有 2 个既有
  Agent Runtime baseline occurrences。
- packaged Desktop、真实 Browser Use/Cua Driver、真实 OS permission fixture 和 provider-backed Agent
  Evaluation 尚未运行。Browser/Cua contained MCP client factory、Agent Automation Capability adapter 与
  transient screenshot receipt 已实现；reviewed artifact application-service contract 和 concrete Desktop artifact
  downloader/archiver、Main-owned progress/cancel 与 restart staging cleanup 已实现，package-owned target discovery /
  selection / post-selection revalidation / grant 语义也已闭合；但发布公钥/signed artifact、production
  registration、Browser domain binding 和 packaged qualification 仍未实现。exact Conversation/Window-bound
  Renderer target selection adapter 已接通。受管 GitHub/official source 与 Host-owned user-managed endpoint 的 canonical management contract 已闭合；
  endpoint authorization/credential、health/schema qualification、session-owned Host connection adapter 与双语 UI 已实现；
  macOS Screen Recording/Accessibility 的 non-prompting query 与 explicit permission action 也已进入 production composition，
  live session control contract/IPC/exact Tool Call Timeline placement 已实现，但 endpoint-backed Agent provider、
  Browser domain authorization 与真实 OS/provider qualification 仍未完成。
  Browser Use fixed upstream 还没有
  证明 direct MCP 空白 session 与授权 exact origin/tab 的无隐藏导航绑定；redirect/new-tab 是加载/创建后处置，
  因而不满足 `browse-read` / `interact` 的 pre-content domain gate。

## Quality Review

- 职责：artifact lifecycle、enable/update policy、Automation session/action/permission semantics 留在 owning packages；
  Desktop 只拥有 download/archive/process/Window/secret/MCP client/TCC query/prompt/System Settings/IPC 等 Host boundary。
- 依赖：L0 contracts -> L1 application service -> Desktop adapter 方向保持单向；package/application/Agent/Webview
  boundary gates 全部通过。
- 接口：management、artifact receipt、runtime readiness、session/target/action/evidence 均为单一 strict canonical
  shape；非法输入在当前 extension/session/action fail-local。
- 扩展：Browser/Cua 使用明确 provider identity 和 reviewed operation schema；generic plugin runtime 对 adapter-only
  server 不注册、不连接、不启动且不暴露 raw Tool，不存在 provider/source/handler fallback。
- 测试：本批 contracts/runtime 定向测试、完整 Automation/Agent package tests、类型检查、`pnpm check:quality` 与
  key-free Evaluation harness 均通过；独立 `pnpm check:unused` 仍被共享工作区的 Markdown `jsdom` 未声明依赖和 Canvas
  `NODE_DEFAULT_SIZES` unused export 阻塞，本批 Automation 文件无 finding。真实 artifact、OS permission fixture、
  packaged Desktop 和 provider-backed Evaluation 未执行项在本文与 `evaluation.md` 保持 fail-visible。target selection
  scoped ESLint 无 error，Prettier 与 `git diff --check` 通过；静态审查发现并删除了两个无效声明及一处非空断言。
- 本批 archive policy 按 L4 安装/信任边界审查：Desktop 仅拥有磁盘、归档、路径与 AbortSignal concrete adapter，
  artifact lifecycle/authoritative install transaction 仍由 Agent Runtime application service 持有；ZIP/TAR 不存在平行
  policy 或 fallback。聚焦 35 tests、Desktop typecheck、四文件 ESLint、application-boundaries、internal-versioning、
  legacy-debt、strict OpenSpec 与 scoped `git diff --check` 均通过；Windows 与 signed artifact smoke
  继续作为显式残余风险。
- 本批 update candidate lifecycle 按 L4 安装/runtime 边界审查：Agent Runtime extension application service 是唯一
  update transaction owner，concrete candidate qualifier 通过 public port 注入。候选只使用 staging descriptor 建立隔离
  runtime，不进入 Agent generation；exact close handle 完成后才进行第二次 idle 检查和 commit。资格、关闭与取消失败
  均阻止 commit、discard staging 并保留旧 runtime；generic qualifier 的 adapter-only poison test 证明 Browser/Cua MCP
  不会经通用插件路径启动。聚焦 Extension Manager/Plugin Runtime 2 files / 29 tests、完整 Agent Runtime 118 files /
  1126 tests 与 Agent Runtime/Desktop typecheck
  已通过；provider-owned Browser/Cua qualifier、exact extension-owned Agent turn/process facts 和 permission expansion
  grant 仍是 3.8 的显式剩余项。Agent Evaluation disposition 为 `excluded`：本批只改变 pre-registration candidate
  validation/cleanup，生产 Agent Tool snapshot 与 session 路径未改变，29 个 focused deterministic path-level tests
  是权威证据。
- 本批 grant-state 收敛继续按 L4 安装/信任边界审查：唯一 extension application service 以 strict canonical
  document 分别保存 `enabled` 与 `acceptedPermissions`；disable 后 restart 保留 accepted set 但 runtime descriptor
  仍为空，缩权 update 只保留候选声明集合，扩权 update 清空 acceptance 并投影 `required`。旧的
  existence-implies-enabled shape 只产生局部 `state-invalid`，不做 dual-read、迁移或成功 fallback。Agent Contracts
  42 files / 274 tests、Agent Runtime 118 files / 1127 tests、两包及 Desktop typecheck、scoped ESLint 与 focused
  2 files / 24 tests 均通过。Agent Evaluation disposition 更新为 `reuse agent-runtime.external-automation` 的
  `disabled-and-unknown-automation-tools`；真实 provider lane 仍受 production provider/artifact 阻塞。Provider-owned
  Browser/Cua qualifier、exact turn/process ownership，以及 expanded grant 在 candidate process 资格化前的单独用户
  接受顺序仍未闭环，因此 3.8 保持未完成。
- Exact ownership slice：production `AgentPluginRuntime` 已按 extension identity 建立独立 MCP Manager child；aggregate
  只投影 Skills/Tools/readiness，Workspace 仍通过唯一 Tool Registry/Pi path 注册。reconcile 以 contribution fingerprint
  复用 unchanged child，预检所有 Workspace 后只交换 changed Tool/Skill contribution，并只关闭被替换 child。Agent
  turn 在 enqueue 与实际 execution start 记录 exact plugin owner，且在首次 await 前冻结 Tool/Skill snapshot；production
  mutation ownership 现在查询 pluginId-bound run identity，不再使用 global active-turn boolean。测试证明 active target
  阻止自身替换、同一 turn 未拥有的 sibling child 可加入、changed child close 不影响 sibling Tool、冲突 candidate
  不替换 authoritative sibling，初始 server-id 冲突逐项 error 且不启动进程。聚焦 Agent Runtime 3 files / 87 tests、
  完整 Agent Runtime 118 files / 1132 tests、Agent Runtime/Desktop typecheck 与 Desktop AppHost 46 tests 通过。Agent
  Evaluation disposition 为 `reuse
agent-runtime.external-automation`：Tool/Skill snapshot 与 canonical registry 路径发生变化，现有
  `disabled-and-unknown-automation-tools` 继续拥有 forbidden raw/fallback Tool 行为；真实 provider lane 仍被 production
  provider/artifact 阻塞。authoritative MCP process 的 pre-commit quiesce/close handoff 仍未实现，3.8 保持未完成。

## UI Validation：disabled extension retained grant

- Scope：Extensions runtime facts 中 disabled extension 的 enable grant 从 `required` 改为可显示 `accepted`；不新增
  控件、布局或样式。适用 `neko-ui-validation`。
- Runtime：该事实跨 durable extension state、Main/preload contract 与 package-owned Webview，权威运行时是可见
  Electron Desktop；contract/component 只能作为补充证据。
- Inventory：enable -> disable -> reopen 后扩展仍 disabled、Enable 操作仍可用、runtime 不注册，同时 grant fact
  显示 accepted；旧 grant shape 显示局部 invalid；相邻未授权 extension 仍显示 required。
- Evidence：restart/state producer tests、strict management consumer test 与完整 Agent Contracts/Runtime tests 通过；
  当前 bundled Browser/Cua catalog 不可安装，且不得修改真实用户 trust state 来制造 accepted-disabled fixture，无法
  通过正常用户操作捕获这一真实 Desktop 状态。
- Result：`blocked`（advisory visual evidence）。没有观察到功能或 contract 缺陷；仅缺少可安装隔离 artifact 的
  Desktop 像素和完整 enable/disable/reopen 用户路径。
