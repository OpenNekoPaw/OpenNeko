# Workspace Package 角色与命名

状态：Accepted

更新日期：2026-08-25
稳定依据：[`application-composition.md`](application-composition.md)、[`package-boundaries.md`](package-boundaries.md)

本文定义 `packages/*` 与 `packages/*/*` workspace 的稳定角色、拆包条件、命名、公开入口和产品状态语义。
具体领域行为仍由 `docs/domains/` 和适用的产品功能 OpenSpec 拥有；本文只约束拓扑与依赖方向。

## 角色分类

每个 workspace package 必须声明一个主要角色。一个目录若同时拥有多个运行环境或变化方向，
必须通过明确 subpath 隔离；只有满足“独立拆包”条件时才拆成多个 workspace package。

| 角色             | 职责                                                 | 允许依赖                                                        | 禁止拥有                                            |
| ---------------- | ---------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------- |
| `contracts`      | package-owned L0 类型、codec、错误和 port            | 更低层纯 contract                                               | React、Node/Electron、IO 实现、业务编排             |
| `domain`         | 领域规则、状态机、validation、authoring 与纯数据变换 | contracts、L0 utility                                           | Host API、React、应用组合                           |
| `application`    | 跨 domain object/port 的单领域 use case 与事务编排   | 同领域 domain/contracts、显式 host port                         | Electron concrete API、窗口状态、跨领域万能 manager |
| `node`           | 文件、SQLite、FFmpeg、进程等 Node adapter            | 同领域 public contract、Node-safe infrastructure                | React、renderer state、Desktop IPC                  |
| `webview`        | React/browser UI、交互和可恢复展示投影               | 同领域 public contract、`@neko/ui`、browser-safe infrastructure | Node/Electron、真实路径、持久事实、后台任务 owner   |
| `infrastructure` | 跨领域且语义稳定的窄基础能力                         | 更低层基础能力                                                  | 某个领域的实体、策略、workflow 或事实 schema        |
| `testing`        | fixture、driver、assertion helper 与测试投影         | 被测 public contract                                            | 产品成功路径、生产运行时 fallback                   |
| `content-only`   | Skill、模板、schema 或静态资源 catalog               | 无生产代码依赖，或只依赖内容校验工具                            | 隐式 runtime、宿主协议、业务状态                    |

`runtime` 不是“放不下的代码”的角色。它仅用于一个领域存在长期会话、异步生命周期、资源句柄或
流式执行权威时，并且其变化方向与纯 domain 明显不同；否则保留在 `domain` 或 `application`。

## 独立 package 的准入条件

workspace package 表达真实 ownership 和依赖闭包，不以发布、消费者数量或当前 Host 数量为前提。
同时满足以下条件时应建立独立 package：

1. 有单一且可命名的 owning responsibility；
2. 有明确 caller、public contract、生命周期和错误语义；
3. 能形成可独立验证的依赖闭包；
4. 拆分能够阻止 Node/React/Electron 等运行时能力越界，或隔离真实变化方向；
5. 不是为了目录对称、未来猜测或隐藏应用根中的业务实现。

以下情况默认不拆包：只有少量纯类型、只有一个稳定实现、与 owner 同步变化、没有独立 consumer，
或拆分后只能依赖对方内部实现。此时应使用同一 package 的显式 subpath，例如 `./node`、`./browser`
或 `./document`。当独立构建、运行时隔离、依赖闭包或 owner 生命周期已经不同，再通过有界原子变更拆分；
仅当拆分同时改变产品功能或运行时行为时才使用 OpenSpec。

## 家族与命名

- 跨领域基础能力使用 `@neko/<capability>`，例如 `@neko/ui`、`@neko/media`、`@neko/shared`。
- 领域家族统一使用单一 scope 下的 `@neko/<domain>-<role>`，例如 `@neko/agent-contracts`、
  `@neko/agent-runtime`、`@neko/agent-webview`。
- 单一依赖闭包的领域可保留 `@neko/<domain>`；不要为了命名对称建立空的 contracts、Node 或 Webview 包。
- 当 L0 contract 被其他领域的 contracts/Webview 消费，而同领域 application/runtime 具有更重依赖时，
  必须形成独立 contracts 闭包；例如 `@neko/chara-domain/contracts` 不得通过 `@neko/chara-domain` runtime 聚合入口暴露。
- package 名、目录名、导入名和质量台账 identity 必须一一对应；拆分家族位于
  `packages/<domain>/<role>`，manifest identity 为 `@neko/<domain>-<role>`；单包 owner 位于
  `packages/<name>`，identity 为 `@neko/<name>`。
- 单包与拆分家族是互斥拓扑。只有不存在独立 sibling role package 时，owner 才能保留
  `packages/<name>`；一旦新增第一个独立 Node、Webview、runtime、contracts、plugin 或其他 role package，
  family 根必须变成不含 `package.json` 的纯容器，原 owner 与全部 sibling 一并进入
  `packages/<domain>/<role>`。禁止 `packages/<domain>-<role>` 平铺 package、family 根 package 与 nested
  role package 并存、同一 family 横跨多个物理根，以及用 aggregate/barrel package 保留旧根 identity。
- singleton-to-family 转换必须在同一原子变更中同步目录、package identity、consumer、
  manifest/lockfile、构建与测试发现、质量台账、fixture 和当前文档，并删除旧路径。现存不符合该拓扑的
  package 是待迁移 architecture drift，不得作为新增 package、平铺 sibling 或放松规则的先例。
- package 移动或删除还必须清除精确旧 root 下可重建的 build、cache、package-local dependency 和空 source
  artifacts，并验证旧 root 不再存在；不得用模糊 glob 清理用户数据、Workspace 内容或无关 package。
  同一 workspace package 内显式导出的 `./node`、`./browser` 等 source subpath 不是独立 package；只有形成
  独立构建、依赖闭包或生命周期时才触发上述 family 转换。
- 测试 package 归入对应领域家族，例如 `@neko/agent-test-utils`；零生产消费者且不能证明独立价值时，
  合并到 owning package 的 testing subpath 或删除。

改名必须在一个有界迁移中同步 manifest、lockfile、imports、Vite/Vitest alias、脚本、质量台账和文档，
不得保留旧名 re-export、optional import 或成功 fallback。

## Public entry 与 exports

- 每个生产 consumer 只能通过 package manifest 的显式 `exports` 访问 public entry。
- 禁止 `"./*"` wildcard export；每个 root/subpath 必须列出明确的 types 与 runtime target。
- 禁止消费 canonical package root 下的 `src/*`、未导出的内部文件或用 TypeScript/Vite/Vitest alias 绕过 public entry。
- `node` entry 不得被 Renderer/Webview 解析；browser entry 不得隐式引入 Node builtin、Electron 或
  Node-only transitive dependency。
- root entry 只导出该包最小稳定 surface。大型可选能力、不同运行环境和测试 helper 使用显式 subpath。
- 未声明的 workspace dependency、目录/package identity 漂移和 source alias 都是门禁失败，不作兼容。

## 产品状态

package 是否存在与是否进入当前 Desktop 产品是两个不同事实。机器可读 package catalog 必须标记：

| 状态                 | 语义                                                       | 约束                                                            |
| -------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| `active-product`     | 从受支持应用生产入口经 value import 可达的代码             | 必须有真实 producer/consumer；不自动表示包内所有 operation 可用 |
| `retained-kernel`    | 当前生产入口不可达，但保留的领域核心或验证能力有明确 owner | 不得声称产品可用；不得被隐式注册                                |
| `inactive-prototype` | 尚未批准且生产入口不可达的原型                             | 不得被扫描、自动注册、fallback 或空命令伪装为能力               |
| `content-only`       | 由宿主显式加载的静态内容 package                           | 加载路径、校验和资源生命周期必须显式；不得假装代码 runtime      |

`productStatus` 只回答 package 代码是否进入受支持产品图，不回答某个 UI/operation 是否开放；后者由
capability catalog 独立声明。`quality/package-product-status.json` 固定真实生产入口，并只允许带 owner、
原因、验证路径、review condition 和到期日的非字面动态边；通用 allowlist 禁止。门禁排除显式
type-only、测试和登记的 migration-only 模块，并在状态冲突时输出最短 value-import 路径。

零消费者不是自动删除依据，也不是能力已交付的证据。生产不可达且有稳定 owner、可验证核心或明确
活跃变更的包可标记 retained/inactive；否则删除优于保留空壳。禁止为了让 catalog 看起来完整而增加
空 runtime/Webview package。

## Desktop 与迁移

Electron Desktop 是唯一应用组合根，但不是默认业务 owner。领域 package 即使只有一个 Desktop caller，
仍拥有其规则、状态机和 use case；Desktop 只保留边界授权、concrete adapter、产品 shell、依赖注入与
生命周期释放。完整边界见 [`application-composition.md`](application-composition.md) 和
[`package-boundaries.md`](package-boundaries.md)。

当前 workspace 已按本分类登记源码 package；Tools 原型已退役。Chara 与 Search 的部分 validator/
guard 已进入生产依赖图，因此 package 状态为 `active-product`，但这不表示独立 Chara/Search UI 已
开放；Quality 等生产不可达核心保持 `retained-kernel`。角色目录、依赖方向、显式 exports、运行环境
与产品状态由 `quality/package-roles.json`、`quality/package-product-status.json` 和仓库质量门禁持续校验。
