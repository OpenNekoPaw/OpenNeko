# ADR: Agent WebSearch、供应商扩展与计费边界

状态：Proposed

更新日期：2026-08-10

范围：Agent External Research、Extension、MCP、Host settings、credential、计费授权、Browser
Automation 与 Desktop trust boundary。

## 背景

Agent 需要通过结构化 WebSearch 检索公开网页，并在必要时抓取正文、生成引用和保留来源证据。搜索
供应商可能按请求、credit、网页提取量或搜索内容 Token 计费；一次用户请求也可能被拆成多次搜索、
抓取或有界重试。因此 WebSearch 虽然不修改用户数据，仍具有真实的费用与外部网络副作用。

OpenNeko 已有 canonical External Research contract、MCP provider binding、Extension 安装与启用边界，
以及 Host-owned credential storage。需要在这些现有 owner 上定义唯一调用链，避免供应商原始 Tool、
模型原生搜索、Browser Automation 和统一 WebSearch 同时成为可成功路径。

## 决策

OpenNeko 将 WebSearch 分为“产品能力”和“供应商连接器”两个稳定职责：

| 职责                                                                      | Canonical owner                                     |
| ------------------------------------------------------------------------- | --------------------------------------------------- |
| `WebSearch` / `WebFetch` 输入、输出、来源、引用、域名策略与 diagnostic    | Agent External Research contracts/runtime           |
| 搜索供应商 API/MCP 格式转换、认证参数投影和调用                           | 明确选择的 provider extension adapter               |
| Extension package 安装、更新、启停、权限声明、资格状态与 runtime 生命周期 | Agent Extension application service                 |
| provider 选择、区域、凭据、付费授权和预算设置                             | Host settings、provider registry 与 CredentialStore |
| 当前 Tool Call 的审批、取消、结果和使用量回执                             | canonical Pi Tool Call / AgentSession               |
| Electron secret、网络与进程 concrete adapter                              | Desktop Main trust boundary                         |
| 设置、扩展和 Agent 结果展示                                               | Renderer 的只读 projection                          |

WebSearch 是内建的 canonical Agent capability，不作为扩展目录中的产品模块，也不由扩展拥有搜索
语义。Tavily、Brave、腾讯云 WSA 或其他具体供应商连接器可以作为扩展安装和管理。安装或启用连接器
只表示该 adapter 可被组合，不能自动选择 provider、读取凭据、授权付费或让 Agent 开始调用。

## 唯一调用链

```text
Agent Tool Call
  -> External Research WebSearch / WebFetch
  -> Host 冻结的精确 provider、区域、预算和授权 snapshot
  -> 已启用且 ready 的 adapter-only provider extension
  -> 精确的供应商 API 或 MCP server
  -> normalized result、source evidence 与 usage receipt
  -> Agent Timeline projection
```

Extension provider 必须使用 `adapter-only` exposure。供应商原始 MCP Tool 不得同时进入 Pi 的通用 Tool
目录；External Research wrapper 是唯一能把搜索 provider 投影为 Agent Tool 的 owner。相同搜索意图不得
同时存在 `web_search`、`tavily_search`、模型原生 search tool 或 generic MCP bypass 等多条成功路径。

Provider registry 以精确 identity 映射唯一 adapter。用户可以显式选择国内或海外 provider/profile，
区域、endpoint 和第三方 API release 等 provider-specific 事实封闭在对应 adapter 与 Host 设置中。系统
不得依据 IP、语言、失败、超时、价格、结果数量或加载顺序自动切换国内外 provider，也不得在一个
provider 失败后尝试另一个 provider。

## 凭据、付费授权与预算

首期采用 BYOK：用户在 Host-owned 设置中配置自己的供应商凭据，由供应商直接向用户计费。Extension
manifest、extension durable state、Renderer、Agent prompt、transcript、日志和 usage receipt 均不得保存
secret。Desktop 只在当前精确 provider 请求边界通过 secret adapter 注入凭据。

WebSearch 必须分别表达：

- 数据影响：只读查询或只读抓取；
- 网络影响：会向精确 provider 和目标站点发送请求；
- 费用影响：免费额度内、可估算付费或供应商计费，未知时必须显示未知而不是假定免费；
- 内容影响：查询是否允许包含 Project/Workspace 上下文，以及正文进入模型上下文的 Token 上限。

用户授权分为不可互相替代的四层：

1. 安装精确 extension package；
2. 启用并接受其声明的网络与 Host 权限；
3. 在 Host 设置中配置精确 provider credential；
4. 选择该 provider 用于 WebSearch，并确认付费策略与预算。

启用扩展不得隐式完成后三项。付费授权至少绑定 provider、区域、计费单位、每轮搜索次数、每轮抓取
次数和内容 Token 上限。系统可以支持用户设置的免逐次确认额度；超出预算、缺失价格事实或缺失授权
时只拒绝当前 Tool Call 并返回明确 diagnostic。

`maxResults` 和 `maxFetchContentTokens` 只限制结果与上下文规模，不能单独作为费用上限。实现还必须
提供搜索调用次数、抓取调用次数和 provider 可表达时的 credit/费用预算。一次请求的费用事实至少考虑：

```text
搜索请求 + 网页提取 + 搜索内容的模型输入 + 模型输出 + 已明确执行的重试
```

供应商价格会变化。Extension catalog 可以展示带来源和更新时间的非权威价格说明，但不得把静态报价
作为运行时计费权威。实际 usage 以当前 provider 返回的计量事实为准；provider 不返回费用时，回执必须
保留调用次数、提取次数、Token 或 credit 等可观测单位，并明确费用未知。

超时或连接中断后如果无法证明请求未被供应商接受，不得静默自动重试。允许的有界重试必须保持同一
provider、contract、query 和预算，并将可能重复计费暴露给当前 Tool Call。

## Browser 与 WebView 边界

结构化 WebSearch 不依赖内部 WebView，也不要求启动 Browser Automation。内部浏览器只用于用户查看
来源或经过授权的交互式浏览；Browser Automation 只用于目标页面操作、视觉读取和没有结构化搜索
API 的显式浏览任务。

Search API/MCP 失败不得自动改用 Browser Automation，Browser Automation 失败也不得改用另一个 Search
provider。二者具有不同的 session、权限、成本、证据和失败语义。Agent 可以在用户明确授权的新 Tool
Call 中选择浏览器能力，但这不是 WebSearch 的 fallback。

## Extension 生命周期和失败隔离

- Extension 安装、更新、启停与 provider 选择是不同 authority；更新不得改写用户的 provider、区域或预算。
- 扩展声明的网络、环境 secret 或 Tool 范围扩大时，必须重新取得 enable grant。
- Extension disabled、not ready、schema 不匹配、credential 缺失或 provider 不可用时，只拒绝当前搜索能力。
- 单个 provider 失败不得停用其他扩展、Agent Conversation、Workspace 或应用 Shell。
- 正在执行的 Tool Call 使用启动时冻结的精确 provider/runtime snapshot；Extension runtime 只能在无 active
  consumer 时替换或释放。
- 卸载当前选择的 provider extension 后，WebSearch 保持 disabled/invalid selection diagnostic；不得自动选择
  已安装列表中的其他 provider。

## OpenNeko 托管额度的边界

OpenNeko Desktop 不在首期提供共享搜索 API Key、统一充值或平台代理计费。共享 secret 不能安全打包进
Electron，也无法仅靠本地状态可靠完成用户计量、配额和滥用控制。

未来若提供 OpenNeko 托管额度，必须通过独立 OpenSpec 定义服务端代理、账户与额度 authority、计量、
账单、退款、风控、隐私、区域合规、credential rotation 和离线/服务不可用语义；不得把这些职责塞入
extension manifest、Desktop 本地 catalog 或 Agent runtime。

## 后果

- 新搜索供应商可以通过 extension adapter 增加，而不修改 Agent 的搜索语义和 Tool contract。
- 国内外 provider 可以分别交付、配置和计费，但共享唯一 External Research 成功路径。
- 用户能够区分“安装了连接器”“配置了凭据”“选择了 provider”和“允许产生费用”。
- Agent 的引用、域名控制、审批、预算和回执保持一致，不受供应商原始 Tool shape 影响。
- 相比直接暴露 MCP Tool，需要额外的 adapter qualification、usage normalization 和 Host 设置投影；这些
  成本换取了可测试的计费、安全和唯一调用链。

## 验证要求

- Contract 测试断言所有 provider 产生同一个 canonical search/fetch result shape 和 source evidence。
- 路径测试断言 adapter-only raw MCP Tool、模型原生 search Tool 和 Browser fallback 不进入当前 Tool snapshot。
- Extension 测试覆盖 install、enable、credential、provider selection 和 paid-use grant 互相独立。
- 预算测试覆盖最大搜索/抓取次数、内容 Token、provider credit、未知费用和预算耗尽的 fail-local 行为。
- 故障测试覆盖超时后的不确定计费、禁止隐式重试、禁止 provider fallback 和 sibling capability 可用性。
- 安全测试断言 credential 不进入 manifest、Renderer、prompt、transcript、日志或 usage receipt。
- 真实 Agent Evaluation 使用完整 Desktop session、真实 provider 和显式成本授权，验证引用、回执、
  cancellation、Conversation isolation 及国内/海外精确路由。

## 实施状态

当前仓库已有 External Research contract、MCP provider binding 和 Extension `adapter-only` descriptor，但
尚不能据此声明 Desktop 已交付生产 WebSearch、provider 配置 UI、费用预算或完整 usage receipt。本 ADR
只定义目标边界；实现必须由独立 OpenSpec 原子更新 provider、Host settings、Extension composition、Pi Tool
projection、Renderer 和测试，完成验收后再将本 ADR 提升为 Accepted。

相关决策：

- [`adr-agent-runtime-single-authority-and-simplification-boundary.md`](adr-agent-runtime-single-authority-and-simplification-boundary.md)
- [`adr-pi-agent-runtime.md`](adr-pi-agent-runtime.md)
- [`adr-ai-native-product-surface-and-capability-composition-boundary.md`](adr-ai-native-product-surface-and-capability-composition-boundary.md)
- [`adr-agent-sandbox-and-external-processing-boundary.md`](adr-agent-sandbox-and-external-processing-boundary.md)
- [`auth.md`](auth.md)
- [`package-boundaries.md`](package-boundaries.md)
