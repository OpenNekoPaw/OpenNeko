## Context

`apps/neko-desktop` 是唯一可执行产品和 Electron composition root；这一身份不因未来是否存在 TUI、
VS Code 或其他 Host 而改变。一级 `packages/*` 按领域和运行时边界拥有可复用能力，也拥有只有一个
当前消费者但具有稳定业务 owner 的逻辑。

现有架构文档已经禁止 Application 层复制领域事实，但约束仍不足以阻止业务规则继续进入应用根。
以下内容记录实施前基线；其中的路径、数量和漂移状态不是当前架构事实。

## Implementation Outcome

- 32 个源码 package 已全部登记为 `converged`，package role、依赖、strict TS、exports、manifest 和
  source-alias 门禁均从 workspace 自动发现。
- `@neko/platform` 与 Tools/TUI/VS Code 旧路径已删除；Agent test-utils 合并到 owning package，未保留
  facade、alias 或成功 fallback。
- `@neko/shared` 收敛为 core/errors/job-lifecycle/logger/path；UI theme/i18n/diff、AI provider/model
  contracts、storage/local metadata 和全部领域 contract 已迁入明确 owner。
- AI family 使用 `@neko-ai/contracts` 与 `@neko-ai/sdk`；Agent、Assets、Canvas、Cut、Preview family
  使用 contracts/domain/runtime/node/webview 的真实依赖闭包，不为对称性建立空包。
- Desktop 中所有清单里的 `D` 职责均已迁移；应用根只保留 Electron trust boundary、concrete adapter、
  shell、typed bridge、composition 和 disposal。

### 迁移前责任基线

| 当前区域                                                                               | 已观察职责                                                           | 目标判断                                                                 |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `desktop-canvas-material-actions.ts`                                                   | action catalog、可用性和执行分派策略                                 | Canvas contract/core 或中立 handoff owner；Desktop 只注入具体 adapter    |
| `desktop-canvas-material-authoring.ts`                                                 | authoring transaction、素材导入与投影规则                            | Canvas owning package + Node/Host port；Desktop 只提供授权选择结果       |
| `desktop-canvas-media-library-copy.ts`                                                 | 目标选择、identity 校验和 copy result 映射                           | Canvas/Assets package-owned application service                          |
| `desktop-workspace-media-library-sync.ts`                                              | sync 状态机、recovery plan、revision 和 portability policy           | Assets/Content owning package 的 Node application service                |
| `desktop-portable-media-library-snapshot.ts`、`desktop-project-portability-runtime.ts` | snapshot/recovery/portability workflow                               | owning domain package；Desktop 保留文件授权和产品 command adapter        |
| `desktop-resource-browser-runtime.ts`                                                  | controller 状态、搜索/恢复/变更业务编排与 Desktop shell adapter 混合 | 拆分 package-owned controller/application service 与薄 Desktop adapter   |
| `application-settings-service.ts`                                                      | revision、串行更新、projection event 状态机                          | 明确的 settings owner package；Desktop 保留 Electron persistence adapter |

对当时全部 28 个 package 的 manifest、exports、消费者、运行环境和源码职责审计确认了以下系统性漂移：

| 当前区域                                | 证据                                                                                                                  | 目标判断                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `@neko/shared` (`packages/neko-shared`) | 约 7.8 万行生产源码；同时包含领域 types、local metadata、React components、Node IO 和 config；23 个 package consumer  | 收缩为最小跨领域基础层；领域、React、Node 和 config 职责按 owner 迁出   |
| `@neko/platform`                        | 约 1.6 万行；混合 Agent config、AI provider、Generation media lifecycle 和 files；只有 Desktop consumer               | 完全解体，不保留新的 Platform facade                                    |
| `neko-assets`                           | contract/controller/service/React root 同包且 Main/Renderer 共同消费                                                  | 拆分 Assets domain/application、Node adapter 和 Webview                 |
| Agent family                            | runtime 为 `@neko-agent/runtime`，contracts 为 `@neko-agent/contracts`，Webview/test-utils 使用另一 scope；多个 `./*` | 保留真实 runtime split，统一 family 名称并把 `types` 收敛为 contracts   |
| Cut/Preview family                      | Cut Webview 名为通用 `@neko-cut/webview`；Preview contracts 与 Webview scope 不一致                                   | 保持运行环境分离，统一 domain family identity                           |
| Tools family                            | contracts 只有 dormant Webview consumer；Webview 无 exports、无产品 consumer                                          | 由 Tools OpenSpec 接通 domain/node/webview 全路径，否则保持未激活或退役 |
| package gates                           | 默认 `check:deps` 只列出部分 source roots；若手工巡检全部 `packages` 当前无 cycle/规则违规                            | 门禁必须从 workspace 自动发现全部 package，不能依赖手写闭集             |

运行环境隔离本身已有有效基础：全量 dependency-cruiser 对 1,504 个模块和 4,503 条依赖未发现 cycle，
Webview boundary 检查覆盖六个 browser root 且通过。问题主要是 package ownership、命名、exports 和
聚合层漂移，而不是需要推翻现有 monorepo。

这张表是迁移入口而非完整结论。迁移前必须逐文件、逐职责确认 owner、依赖、contract、生命周期和
测试；不能根据文件名前缀机械移动，也不能创建一个新的 `desktop-core` 收纳所有无处归属的逻辑。

## Goals / Non-Goals

**Goals:**

- 让 Application 层只承担可执行产品入口、Electron trust boundary、concrete adapter 和 wiring。
- 让领域语义按 owning responsibility 下沉，即使当前只有一个 Desktop consumer。
- 建立一致但不过度机械化的 package role 和拆包判据。
- 解体 `@neko/platform`，显著收缩 `@neko/shared`，补齐 Assets/Canvas/Preview/Tools family。
- 统一 package identity、public exports、workspace dependency 和全量架构门禁。
- 为现有漂移建立可追踪的审计和分批迁移方法，最终删除应用根中的旧业务路径。
- 用评审规则和自动门禁同时验证依赖方向与 canonical execution path。

**Non-Goals:**

- 不移动 `apps/neko-desktop` 到 `packages/`，不改变 `@neko/app-desktop` 身份。
- 不恢复 TUI、VS Code Host，不为假想 Host 建立通用 adapter framework。
- 不要求每个领域机械建立 `contracts/domain/runtime/node/webview/testing` 全套 package。
- 不用 package rename 代替 ownership 修复，也不执行一次性全仓大爆炸迁移。
- 不复制 Generation、Tools、Agent Evaluation 等活跃领域 OpenSpec 的业务需求和验收。
- 不因目录迁移改变用户数据格式、持久 identity、credential 或 cache semantics。
- 不以文件行数、文件名或“可复用次数”作为唯一架构判断。

## Decisions

### 1. Application root 是部署与信任边界，不是业务 owner

`apps/neko-desktop` 允许拥有：

- Electron app/window/view/webContents 生命周期、single-instance、protocol、CSP 和 fuse；
- Main/preload/renderer 入口及 sender-bound typed IPC projection；
- 本地文件、凭据、shell、原生 dialog、外部进程和 opaque resource 的 concrete Host adapter；
- package public application ports 的实例化、依赖注入、注册与释放；
- Desktop shell、产品导航、窗口级 presentation state、Forge/Vite 打包和真实 Electron fixture。

Application root 不得拥有：

- 领域实体、业务状态机、业务 revision/CAS、业务校验或业务错误 taxonomy；
- Prompt/Skill/Tool、Agent workflow、Canvas/Cut/Assets/Media/Generation 的策略和数据变换；
- 可通过注入 host ports 脱离 Electron 运行的业务事务、恢复计划、同步、authoring 或 portability
  workflow；
- package-owned wire/domain contract 的应用级副本；
- 为多个领域决策的万能 controller、manager、registry 或 facade。

Electron 边界可以执行安全、sender identity、路径授权、schema decode 和资源生命周期校验；这些校验
保护真实 trust boundary，不得扩展为领域决策。IPC handler 只解析请求、绑定身份、调用 package public
port 并投影结果或明确 diagnostic。

备选方案是把所有 Desktop-only 逻辑视为应用私有。该方案会把“当前消费者数量”误当作“职责 owner”，
继续制造无法独立测试和演进的组合根，因此拒绝。

### 2. 是否下沉由语义 owner 决定，不由第二个 Host 决定

一个职责只要具有明确领域语义、独立状态/错误/生命周期或可替换 Host port，就必须进入对应一级
package；即使它当前只有一个调用方，也不要求先出现 TUI 或 VS Code consumer。一级 package 表达的是
ownership 和依赖方向，不等同于发布给第三方的通用库。

判断顺序固定为：

1. 职责：这段逻辑决定 Electron 行为、产品 shell，还是领域结果？
2. 依赖：它真正需要 Electron object，还是只需要文件、时间、凭据等可注入 port？
3. 接口：输入输出是否已经是领域 contract，可否由 package public application port 表达？
4. 扩展：变化来自 OS/Electron，还是来自领域规则、provider、format 或 workflow？
5. 测试：authoritative test 应在 package 中验证业务结果，还是必须启动 Electron 才有意义？

若职责跨多个领域，先识别真正 workflow owner；没有 owner 时通过 OpenSpec 建立中立 package，不得默认
留在 Desktop，也不得创建宽泛 `@neko/desktop-core`。

### 3. Package role 由职责和依赖闭包共同决定

采用以下统一语义：

| Role                      | 允许职责                                                                  | 独立 workspace package 条件                                                |
| ------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `contracts`               | serialization-safe DTO、wire schema、codec、parser、validator、error code | 两个以上 runtime producer/consumer 需要在不引入 domain/runtime 依赖时共享  |
| `domain` / `core`         | entity、value、状态机、业务规则、revision、领域错误                       | 默认作为领域 owner；同一依赖闭包时可与 application 放在同包不同子路径      |
| `application` / `runtime` | use case、session/job 生命周期、业务事务、consumer/provider ports         | 只有依赖或生命周期明显区别于 domain 时才独立 package，否则使用显式 subpath |
| `node`                    | Node/FFmpeg/SQLite/文件/外部进程的 concrete adapter                       | browser/domain consumer 不能安全继承其依赖闭包时必须独立                   |
| `webview`                 | React/DOM、交互、可恢复 presentation state、typed Host port consumer      | 与 Main/Node/domain 物理隔离，生产源码禁止 Node/Electron                   |
| `testing`                 | 跨 package fixture、harness、poison path、contract test kit               | 至少两个真实外部测试 consumer；否则留在 owning package `./testing`         |
| content package           | Skill、模板、静态资源和 package metadata                                  | 无 TypeScript runtime；由打包/资源 owner 显式消费                          |

`types` 不再作为新增 package role；类型必须属于 contracts、domain、application 或 adapter 的语义
owner。`contracts` 可以包含纯 codec/validator，但不得包含状态、文件 IO、UI formatting 或业务选择
策略。是否单独拆包以 runtime dependency closure、consumer 和独立测试/发布边界为依据，不能只看目录
名字或代码行数。

备选方案是为每个领域生成固定五包模板。该方案会制造大量单消费者空壳、跨包跳转和无真实变化点的
接口，因此拒绝。

### 4. 目标拓扑按基础层与领域 family 收敛

基础设施继续使用 `@neko/*`；同一领域存在多个独立 runtime package 时统一使用
`@neko-<domain>/*`。目录名必须能直接映射 package identity，不能再出现 `neko-types -> @neko/shared`
或 `neko-cut-webview -> @neko-cut/webview` 这类隐式关系。

| 当前边界                               | 目标边界                                                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@neko/shared`                         | 只保留真正跨领域、host-neutral、无 React/Node 的最小值对象、错误、日志 contract、路径和稳定 utility；所有 feature contract 回 owning family                                           |
| `@neko/shared/components`              | 迁入 `@neko/ui`，删除 legacy compatibility export                                                                                                                                     |
| shared local metadata / project IO     | 通用 storage/IO port 与 Node/SQLite adapter 使用明确 runtime entry；领域 binding、migration、projection schema 回 owning package；是否建立窄 `@neko/local-metadata` 由 inventory 决定 |
| `@neko/platform`                       | 最终不存在；config 回 Agent/Host settings，provider 回 AI adapter，generated-output lifecycle 回 Generation，files 回 Host/Content                                                    |
| AI family                              | `@neko-ai/contracts` 提供 provider/model L0 contract；`@neko-ai/sdk` 提供 provider adapter                                                                                            |
| Agent family                           | `@neko-agent/contracts`、`@neko-agent/runtime`、`@neko-agent/webview`；无外部 consumer 的 test-utils 并入 runtime/testing                                                             |
| Canvas family                          | 保留 domain/webview，把 app-owned authoring、material action、Media Library handoff 拆到 domain/application 与必要的 node adapter                                                     |
| Cut family                             | 保留 domain/node/webview，只修正 `@neko-cut/webview` identity 并收紧 exports                                                                                                          |
| Assets family                          | 建立 domain/application、node、webview 三个 dependency closure，Desktop 只保留 native selection/trash/path authorization adapter                                                      |
| Preview family                         | 将现有 contracts 中的 MIME、staging 和状态策略识别为 domain；保留 browser Webview，Node 内容解析按真实依赖建立 entry/package                                                          |
| Tools family                           | 由现有 media comparison OpenSpec 建立 domain/contracts、Node/Media adapter 和 Webview 的真实 producer/consumer；未接通前不宣称产品能力                                                |
| Media                                  | 保留单 package 的 root contract + `./node` + `./browser` 模式；规模小、无 feature dependency，不为形式拆包                                                                            |
| Content                                | 保留一个 owner，但用显式 core/document/node entries 隔离 Node reader，删除 wildcard export                                                                                            |
| Entity/Generation/Chara/Search/Quality | 同依赖闭包的 core/application/provider 继续用单 package 显式 subpath；无 Desktop consumer 的包标记 retained kernel，不创建空 node/webview package                                     |
| Skills                                 | 保留 content-only package，无 TypeScript runtime export                                                                                                                               |

目标拓扑不会通过 `@neko/desktop-core`、新 Platform 或新 Shared manager bag 收纳暂时无法判断的职责。
owner 未决时先记录 decision gate，不写代码。

### 5. 每次迁移都收敛为 package core + concrete Desktop adapter

目标路径为：

```text
Desktop IPC / native event
  -> sender/path/security validation
  -> thin Desktop adapter
  -> owning package public application port
  -> package-owned domain state / policy / transaction
  -> injected Host/Node ports
```

contract、业务测试和 application service 先落到 owning package；Desktop adapter 只实现 Electron 或
本地产品绑定。迁移必须一次性切换本次边界内调用方，并删除、poison 或 fail-closed 隔离旧 app-owned
path。禁止 compatibility shim、双写、fallback 或 adapter 套 adapter 长期维持两份事实来源。

### 6. Public entry 是依赖边界的一部分

所有 package 使用显式 `exports`；禁止新的 `./*` 和跨 package `src/*` import。Vite/Vitest 可以把公开
package specifier解析到 workspace source，但 alias key 必须是已声明 public entry，且不能把消费者绑定
到未经 exports 声明的具体内部文件。

workspace manifest 必须声明所有实际 runtime dependency，package name、目录 family、README 和
quality ownership 保持一致。内部 prelaunch rename 必须在同一批次更新全部调用方、配置、脚本、文档和
lockfile，不保留兼容 alias/re-export。

### 7. 当前漂移通过活跃 OpenSpec 管理，不写成稳定架构事实

稳定架构文档声明目标边界；本设计记录当前抽样证据，后续任务维护完整 inventory。每个迁移条目至少
记录 current path、owning responsibility、target package/public entry、调用方、数据与资源生命周期、
旧路径删除条件、验证命令和用户数据处置。

新增或实质修改命中候选文件时执行“触碰即收敛”：先判断能否在同一变更内下沉；不能时必须在活跃
OpenSpec 中记录 owner、阻塞和迁移任务，且不得继续扩大 app-owned 业务 API。

### 8. 门禁同时检查拓扑、职责和路径

现有 import topology 检查继续阻止 package-to-app、renderer-to-Node/Electron 和 Main-to-React。后续
门禁还需要维护 Application root 的允许职责/例外清单，识别新增 host-neutral service、领域 contract
副本和业务状态 owner。自动静态检查不能替代语义审计，因此 PR/OpenSpec 必须给出五层分析。

迁移验收既断言 package-owned service 的业务结果，也断言 Desktop adapter 命中该 public port；将旧
app path poison 成抛错，证明 canonical path 没有 fallback。涉及 IPC、窗口或用户路径时继续运行真实
Electron 验收。

dependency-cruiser、strict tsconfig、Webview、application、exports 和 unused dependency 检查必须从
workspace/package manifests 自动发现目标，不能维护遗漏新 package 的手写 source-root 列表。门禁还要
区分三种状态：可执行产品 consumer、已保留但未接入的 domain kernel、content-only package；只有第一种
可以宣称 Desktop capability。

### 9. 本变更治理拓扑，领域 OpenSpec 治理业务迁移

本变更拥有 package taxonomy、目标 owner matrix、public exports、命名、全量边界 gate 和 Desktop 薄
adapter 验收。现有领域变更继续拥有具体 contract、数据、运行行为和真实场景，例如 Generation Job、
Tools media comparison、Desktop Agent evaluation、Media resource gateway。

若领域变更触及 `apps/neko-desktop`、Shared 或 Platform 漂移，必须采用本设计的目标 package 和
no-fallback gate；本变更不复制其 case、provider、codec 或 UI 任务。这样避免一个巨型迁移 PR，同时保持
唯一目标拓扑。

## Risks / Trade-offs

- **[过度拆包或为单一函数制造抽象]** → 以稳定领域 owner、生命周期和错误模型为前提；优先增强现有
  package，不因少量代码重复新建 package。
- **[Shared 解体导致 23 个消费者大范围震荡]** → 先建立显式 target entry 和 consumer inventory，按
  domain slice 迁移；每批删除一个旧 export，不做一次性全仓重写。
- **[Package rename 产生大量无语义 diff]** → rename 与对应 ownership/exports 切换同批完成，最后更新
  lockfile 和脚本；不在业务边界未确定前先做 cosmetic rename。
- **[Platform 解体与活跃 Generation/Agent 变更冲突]** → 领域 OpenSpec 拥有实现，本变更只维护 target
  mapping 和 gate；按 dependency 顺序协调，不建立临时 facade。
- **[把 Electron IO 与业务事务一起机械移动]** → 先拆 contract 和 port；Electron 授权、sender 和
  native handle 留在 app，host-neutral transaction 下沉。
- **[迁移期间出现双路径]** → 每批定义唯一 canonical path，旧路径 poison/delete，不保留成功 fallback。
- **[现有活跃变更继续修改候选文件]** → 触碰即审计并把 owner 决策写入对应 OpenSpec，避免大爆炸迁移。
- **[用户本地数据受影响]** → persistence schema、settings、workspace 和 credential 迁移必须单独定义
  迁移/重建/保留策略；本治理变更不直接移动数据。

## Migration Plan

1. 冻结向 Desktop、Shared 和 Platform 新增业务 owner；让 package/gate discovery 覆盖全部 workspace。
2. 建立 `apps/neko-desktop` 与迁移前 28 个 package 的责任、public entry、runtime、consumer、用户数据和目标
   owner inventory。
3. 先建立目标 package entry 和 contract，把无 Electron import、依赖闭包清晰的低风险 service 按
   domain slice 迁出 Desktop/Shared/Platform。
4. 按顺序完成 Generation/Agent config、Canvas/Assets、Preview/Tools 等 family；每批切换全部调用方并
   poison/delete 旧 path，不保留成功 fallback。
5. 在各 family ownership 稳定后统一 package/目录名称、显式 exports、Vite aliases、workspace
   manifests、quality ownership 和 lockfile。
6. 删除 `@neko/platform`、Shared legacy UI/feature exports、无消费者 test-utils 和临时 gate exception。
7. 运行全量 package producer/consumer、dependency、strict、unused、build 和受影响真实 Electron 场景；
   inventory 清零后把长期结论提升到稳定架构文档。

回滚只允许回滚某批新 package path，并恢复明确失败状态；不得让旧 app-owned 业务实现作为 fallback
继续成功。任何用户数据格式变化必须使用该领域单独批准的迁移方案。

## Resolved Decisions

- Application settings contract/service 归 `@neko/host`；Desktop 只实现原子文件 repository、凭据和
  Electron 投影。
- 通用 storage classification、workspace identity 与 SQLite store 归 `@neko/local-metadata`；Media、
  Search、Entity 的 binding/migration 由各自 local-metadata/node owner 持有。
- Canvas material action、authoring 与 handoff 归 Canvas domain/node，Desktop 只注入授权资源与 native
  adapter。
- provider/model L0 contract 与 provider adapter 分别归 `@neko-ai/contracts`、`@neko-ai/sdk`，Generation
  可直接消费而不依赖 Agent runtime。
- package role catalog、manifest explicit exports 与 source boundary rules 共同作为静态门禁；临时 surface
  freeze 和 transfer ledger 已在 inventory 清零后删除。
