# Upstream Lock

审计日期：2026-08-09。本文只记录第三方发布与供应链事实，不作为 OpenNeko 内部 contract 代际。
任何 release、commit、artifact、Tool schema 或依赖集合变化都必须重新审查并原子替换当前记录。

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
- GitHub release 没有平台 runtime artifact。OpenNeko 不得在用户机器调用 `pip`、`uv` 或浏览器下载器；
  发布流程必须从固定 source、Python 依赖和 Chromium 构建自包含平台 artifact。

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

## Official MCP SDK

- npm package：`@modelcontextprotocol/sdk@1.30.0`
- 许可证：MIT
- npm integrity：
  `sha512-xKd8OIzlqNzcqcNumGAa6g+PW2kjD5vrpcKOnfldAUPP3j7lnqMPwlTXQm8gF+UwH72z0lqaRbjr9hqGz0eITA==`
- npm shasum：`dfa8a48347ec2d2c0d47917d7dc57f754e37f5ff`
- npm provenance attestation 已发布；lockfile 固定精确 package release。

## Qualification blockers

- Browser Use Python/Chromium 自包含 artifact、可复现 build recipe、完整 dependency lock 和 SBOM 未完成。
- Browser Use/Cua Driver 的生产 transitive license inventory 尚未生成和审查。
- OpenNeko artifact Host 已实现 catalog-bound Ed25519 signature、streaming size/digest、contained provenance、
  license inventory digest 与 tar.gz/ZIP poison validation；真实 Browser Use/Cua Driver 发布 artifact 的签名、
  provenance/license inventory 产出和 packaged qualification 仍未完成。
- Cua Driver macOS signing/notarization、TCC、target-only capture 实机证据未完成。
- Windows 只记录 artifact，不声明产品支持；Browser Use 其他 OS/arch 也未资格化。
