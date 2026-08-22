# Upstream Lock

审计日期：2026-08-09。状态：历史研究证据，已被本 change 当前 proposal/design 的开放接入决策取代。
本文只记录当时的第三方发布与供应链事实，不是当前安装、资格、版本或 Schema 准入要求；下文的
normative wording 仅描述旧 managed-artifact 方案，不约束用户管理的公开 Plugin/Skill/MCP/runtime 路径。

## Browser Use

- 仓库：[`browser-use/browser-use`](https://github.com/browser-use/browser-use)
- 发布：[`0.13.7`](https://github.com/browser-use/browser-use/releases/tag/0.13.7)，发布于
  2026-07-27，source commit `f0aa3a8bb03779c71a5aa262d389e3bfe6b77cdc`
- 许可证：MIT，以上述 commit 的 `LICENSE` 为准
- Python：`>=3.11,<4.0`
- 上游 MCP Python SDK：`mcp==1.26.0`
- PyPI wheel：`browser_use-0.13.7-py3-none-any.whl`
- Wheel size：`718627` bytes
- Wheel SHA-256：`2264439e45cc7dd7fe480ca37e9eabd040c31a4e4d5e20c069ad2f60c07e3ba8`
- Wheel URL host：`files.pythonhosted.org`
- GitHub release 没有平台 runtime artifact。旧 managed-artifact 研究因此评估过固定 source、Python 依赖和
  Chromium 的自包含平台 artifact；当前实现改为向用户展示上游 `uvx` 命令并由用户自行执行和维护。

`browser_use/mcp/server.py` 的初始 observe Tool 审查结果如下。Digest 使用递归排序对象 key、保持数组顺序的
canonical JSON，再计算 SHA-256。该发布没有为这些 Tool 声明 MCP annotations。

| Tool                    | Input schema digest                                                       | OpenNeko trait       |
| ----------------------- | ------------------------------------------------------------------------- | -------------------- |
| `browser_get_state`     | `sha256:ac5bc90805141a1a8917bc64ccb1cea0c06646bfca7ec3d811f429600c3201e4` | read-only, sensitive |
| `browser_get_html`      | `sha256:1f97e90b491aafea0e369501f4917ef365ff2478557b5d0d83d07002fe0de66a` | read-only, sensitive |
| `browser_screenshot`    | `sha256:3b661d759f56b59d15377c68ec7316d16084eb3ef35182cf2e29ec7f6fb23693` | read-only, sensitive |
| `browser_list_tabs`     | `sha256:efddc7bd8bbcef73a14eb1ace1ffdaec81e518ef1e13c1e9271d0b8acb694a49` | read-only, sensitive |
| `browser_list_sessions` | `sha256:efddc7bd8bbcef73a14eb1ace1ffdaec81e518ef1e13c1e9271d0b8acb694a49` | read-only, sensitive |

明确拒绝 `--cli-mcp`、`browser_exec`、`browser_extract_content`、
`retry_with_browser_use_agent` 和所有未审查 Tool。上游 `--mcp` 初始化仍会读取 Browser Use config，并可在
配置存在时构造 LLM client，因此运行时必须使用隔离 HOME/config，且不得继承模型/provider 凭据。

补充审计发现：`FlatEnvConfig` 会从 process working directory 读取 `.env`；缺少 config 时，上游还会创建
含 placeholder OpenAI key 的默认 LLM record，随后 MCP browser session 初始化可能据此构造 `ChatOpenAI`。
Desktop adapter 因此必须把 cwd 固定到新建 session directory，并在启动前写入 `llm: {}` 的精确 config；
仅清空继承环境不足以证明没有 runtime-adjacent `.env` 或默认 LLM 配置参与。

Target/domain 审计还发现两个发布阻塞：

- [direct MCP dispatcher](https://github.com/browser-use/browser-use/blob/0.13.7/browser_use/mcp/server.py) 在第一次
  `browser_*` 调用时新建隔离 `BrowserSession`，没有把 OpenNeko 授权的 exact
  origin/tab 作为启动输入；当前 contained client factory 因而只能证明进程、环境和 profile 隔离，不能证明
  返回内容属于授权页面。用未审核的 `browser_navigate` 在 adapter 内隐式打开 origin 会形成隐藏成功路径，禁止采用。
- [`SecurityWatchdog`](https://github.com/browser-use/browser-use/blob/0.13.7/browser_use/browser/watchdogs/security_watchdog.py)
  会在 `NavigateToUrlEvent` 前拒绝显式越域导航，但 redirect 只在
  `NavigationCompleteEvent` 后检测并跳转到 `about:blank`，新 tab 也在 `TabCreatedEvent` 后关闭；这不满足
  “越域内容进入页面前阻断”的资格要求。`browse-read` 与 `interact` 必须保持 unavailable，直到固定上游
  release 提供可验证的 pre-commit redirect/new-tab policy；不得用事后跳空页或关闭 tab 作为通过证据。

因此当前五个 observe Tool 只是精确 reviewed policy，不是可用性声明。真实 `observe` 仍需一个不调用隐藏
navigation Tool 的 exact page/session binding，并通过 packaged local fixture 证明 state/HTML/screenshot 均来自
授权 target。

## Cua Driver

- 仓库：[`trycua/cua`](https://github.com/trycua/cua)
- 发布：[`cua-driver-rs-v0.19.2`](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.19.2)，
  source commit `20bb34b16ad7c6c56221c332e46b1875e9d8af8c`
- 发布说明将 GitHub prerelease 标记解释为 monorepo latest 指针管理；Cua Driver `0.19.2` 通过普通
  stable npm/PyPI channel 发布。OpenNeko 仍按精确 tag/artifact 审核，不依赖 `latest`。
- 许可证：workspace `license = "MIT"`，根 `LICENSE.md`
- macOS arm64 artifact：`cua-driver-rs-0.19.2-darwin-arm64.tar.gz`
- macOS arm64 size：`64208172` bytes
- macOS arm64 SHA-256：`c30a81f6b5cfd44d40653f7549d7d714b445e9cbd0ed012c4c524f1c43d2872b`
- Windows x64 binary artifact：`cua-driver-rs-0.19.2-windows-x86_64-binary.zip`
- Windows x64 size：`26571495` bytes
- Windows x64 SHA-256：`9868b60999e64ed1028a0f65082624dab7523b06f33b68d582fa0a187d1bf618`
- Artifact host：`github.com` release assets；上游 `checksums.txt` SHA-256 为
  `2aa497943793980bba915ebd6ebfab3aae9b7837064464055804862fd03068b4`
- 2026-08-12 对官方 `darwin-universal` release asset 的独立检查确认：`CuaDriver.app` 的
  `CFBundleIdentifier=com.trycua.driver`、`CFBundleShortVersionString=0.19.2`、Developer ID Team ID
  `YCK386LBJ7`，签名 authority 为 `Developer ID Application: Cua AI, Inc. (YCK386LBJ7)`，包含 stapled
  notarization ticket，并通过 `codesign --verify --deep --strict` 与 Gatekeeper `Notarized Developer ID` assessment。
  bundle 内 authoritative executable 为 `Contents/MacOS/cua-driver`；上游安装器将可见 CLI symlink 精确解析到
  该文件，普通 `cua-driver mcp` 通过 `/Applications/CuaDriver.app` daemon 保持 `com.trycua.driver` TCC
  responsibility。OpenNeko 固定校验这些身份并只运行 `mcp`，不得运行 `mcp --direct` 或 raw `serve` helper。

上游生成的 `libs/cua-driver/contract/manifest.json` 在固定 commit 中包含 23 个 MCP Tool，是本次审计来源。其第三方
`contract_version`、`tools_list_schema_version`、`capability_version` 必须保留为 upstream provenance，
不得复制为 OpenNeko 内部 contract/version dispatch。Computer observe profile 仍需从此 manifest 精确选择
Tool、锁定 schema digest，并完成 target/permission 实机资格化。

macOS arm64 仅代表上游 artifact 存在，尚不代表 OpenNeko packaged qualification 完成。Windows x64
artifact 同样只记录供应链事实；在 packaged Windows OpenNeko、标准用户、窗口/权限/input matrix 完成前，
产品状态必须保持 unavailable。Linux 不在本变更交付范围。

初始 macOS observe profile 只选择 `verify_state`。其 canonical `input_schema` digest 为
`sha256:8bb240b986195599be93f88443dbe3c97203489be33f82b8d7b26b5b15f328e4`；Host 必须覆盖
`pid`、`window_id` 和 `session`，模型参数不得声明这些 routing fields。该记录只证明 schema 审核，
不证明 macOS TCC、target-only capture 或 packaged qualification 已完成。

固定 commit 的 macOS platform registry 还注册了只读 `list_apps` 与 `list_windows`，它们不在上述 portable
`contract/manifest.json` 子集中，因此目标选择 adapter 以同一固定 source tree 的
`platform-macos/src/tools/list_apps.rs`、`list_windows.rs` 为事实来源分别锁定 schema digest：
`sha256:99334726611ccf58a148b0814696bfa6fe08c1b2d027e946beccf5a74331c9aa` 与
`sha256:17649c06ad39be8e10d8148ebb47f6e90d0f0bae57675b1e57cb508d581ce0ed`。后者返回 exact
`window_id`、PID、bounds、`is_on_screen` 与 `on_current_space`；OpenNeko 只接受当前 Space、可见且正尺寸的
窗口。该 metadata 枚举只服务显式 target selection/revalidation，不进入 Agent reviewed operation allowlist，
也不构成 screenshot 或 input 资格证据。

## Official MCP SDK

- npm package：`@modelcontextprotocol/sdk@1.30.0`
- 许可证：MIT
- npm integrity：
  `sha512-xKd8OIzlqNzcqcNumGAa6g+PW2kjD5vrpcKOnfldAUPP3j7lnqMPwlTXQm8gF+UwH72z0lqaRbjr9hqGz0eITA==`
- npm shasum：`dfa8a48347ec2d2c0d47917d7dc57f754e37f5ff`
- npm provenance attestation 已发布；lockfile 固定精确 package release。

## Qualification blockers

- Browser Use Python/Chromium 自包含 artifact、可复现 build recipe、完整 dependency lock 和 SBOM 未完成。
- Browser Use 的生产 transitive license inventory 尚未生成；Cua Driver 已生成精确锁定的 367-package SPDX
  候选，但尚未完成人工 license expression/text 审查。
- Cua Node runtime 已有 OpenNeko-owned exact source/36-package Cargo lock/Rust `1.97.1`/双架构 `--locked`
  rebuild recipe；隔离的 official rustup `1.29.0` 已安装并校验 Rust
  `1.97.1 (8bab26f4f 2026-07-14)` 与两个 macOS target。正式 recipe 的两个 independent build 已产生相同
  1,569,136-byte universal binary 与 receipt，SHA-256 为
  `c4e5b70fddbf6ffdd6477a90ea4da5fa3881d99796d9ded9f5faaf3e1039725a`；receipt 记录隔离 HOME 与
  `/openneko/cargo-home` canonical remap。
- `darwin-arm64` 上游三个 main root package 的 locked target closure 与 first-party Node runtime Darwin closure 合并后
  在排除只由 Cargo `dev` edge 引入的 `cua-driver-testkit@0.19.2` 后，是 367 个唯一 `name@release` identity；
  locale-independent canonical array SHA-256 为 `aaaa49126e1de4500915ddccb371a7688d11d283b57ef114ddba0e4c2b9bad93`。
  Candidate SPDX 必须精确覆盖该 production-only 集合；
  identity closure 通过不代表 license expression 或文本已完成人工审核。
- 两次真实离线 metadata 运行生成逐字节一致的 SPDX candidate：476,482 bytes，SHA-256
  `08756f9c17062202d0efeb8b149aece1a105486cbcb13ea80f9f1816d6725a51`，`reviewed=false`。两次真实 assembly
  生成逐字节一致的 contained candidate：63,911,219 bytes，SHA-256
  `9e3bae3b3358fe0d9ea44007916610e3c5b997360a2146a32349135df2ab63f6`，`catalogReady=false`。
- OpenNeko artifact Host 已实现 catalog-bound Ed25519 signature、streaming size/digest、contained provenance、
  license inventory digest 与 tar.gz/ZIP poison validation；真实 Browser Use/Cua Driver 发布 artifact 的签名、
  已有未复核 provenance/license candidate；真实发布签名、人工许可复核和 packaged qualification 仍未完成。
- Cua Driver macOS signing/notarization、TCC、target-only capture 实机证据未完成。
- Windows 只记录 artifact，不声明产品支持；Browser Use 其他 OS/arch 也未资格化。
