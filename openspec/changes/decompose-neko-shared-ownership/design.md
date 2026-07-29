## Context

`@neko/shared` 当前公开 36 个 package export（含根入口和通配入口），并通过
`"./*"` 暴露任意
源码子路径。源码约 4.6 MB，其中 `types`、VS Code、local metadata、React/UI、
project IO/authoring 和 NKC 远大于真正的基础内核。当前生产源码对 shared
根入口约有 947 处引用，不能通过一次目录移动安全完成。

本变更按本地 VS Code + Desktop/TUI 产品边界设计，不引入远程服务治理、通用
IoC 或多租户抽象。迁移目标是唯一 owner 和直接依赖，而不是把 `shared` 改名。

## Goals / Non-Goals

**Goals:**

- 为每个 public export/symbol、生产 consumer、runtime layer 和目标 owner
  建立唯一、可验证记录。
- 把 L0、L1、L2 和 Node 实现分开，阻止反向依赖。
- 以小批次迁移生产者与消费者，并在每批删除旧成功路径。
- 保护 workspace 文件、SQLite、设置、secret 和用户素材。
- 最终删除通配 export 和领域聚合根 barrel。

**Non-Goals:**

- 在 proposal 创建阶段立即移动代码或新增 package。
- 设计云端服务、远程 metadata service 或通用 Host framework。
- 借迁移重写所有领域模型、wire schema 或用户文件格式。
- 把所有共享代码迁入 `@neko/host`。
- 保留长期 compatibility package、alias 或双入口。

## Five-layer analysis

| Layer          | Decision                                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | stable cross-domain primitives 留在小型 shared kernel；领域、UI、Host、metadata 和 project 能力进入真实 owner                           |
| Dependency     | `apps → adapters/features → domain/UI packages → shared L0`; Node/browser/VS Code entry 显式隔离，owner 不经 shared barrel 反向依赖自己 |
| Interface      | 每个目标 package 只公开真实消费者需要的窄 entry；移除通配 export、万能 DTO barrel 和 universal Host                                     |
| Extension      | 新领域 contract 默认进入 owning package；只有职责、生命周期、错误模型和变化方向均一致的 primitive 才进入 shared                         |
| Testing        | inventory 完整性、producer/consumer、cycle、runtime layer、旧路径 poison、持久数据 fixture 和全量 quality gates                         |

## Decisions

### 1. Inventory 是迁移前置契约

实施开始前生成并提交机器可读 inventory，至少记录：

- 当前 package export key 与源入口；
- 根 barrel 导出的每个 symbol；
- deep import 和通配 export 实际使用；
- 每个生产 consumer、runtime layer 与是否持久/wire/API contract；
- proposed owner、迁移批次、删除或保留结论；
- cycle 风险、数据迁移要求和验证命令。

任何 `unknown`、多 owner 或存在未解释 cycle 的条目不得进入迁移批次。CI
比较源码/public export 与 inventory，新增未分类 surface 必须失败。

### 2. 目标 owner 按职责而不是代码形状决定

| 当前 surface                                                                         | 目标 owner                                                               |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| core async/concurrency、logger contract、errors、path、i18n core、少量通用 primitive | 收缩后的 `@neko/shared` L0                                               |
| React components、React i18n、icons、UI theme consumption                            | `@neko/ui`                                                               |
| VS Code logger/error/resource/keyboard/project adapters                              | `apps/neko-vscode/src/adapters` 或 owning feature                        |
| SQLite/local metadata contract、repository、migration、Node store                    | 新顶层 `@neko/local-metadata`，以 contract/node/testing entry 分层       |
| project-file IO、authoring、workspace project schema/codec                           | 新顶层 `@neko/project` 或经 inventory 证明的 Canvas owner                |
| NKC-only codec/schema                                                                | `@neko-canvas/domain` 或 `@neko/project`，不得继续由 generic shared 聚合 |
| Agent/Skill/Tool/Prompt contract                                                     | `@neko-agent/types` / `@neko/agent`                                      |
| Canvas、Media、Entity、Content、Chara、Quality contract                              | 对应 owning package 的 L0 entry                                          |
| 无生产 consumer、旧产品或重复 contract                                               | 删除                                                                     |

若两个以上 owner 都需要同一 DTO，优先寻找语义 owner 并让其他包依赖其 L0
contract；“很多包使用”本身不证明它属于 shared。

### 3. 迁移按依赖叶子分批，不做大爆炸

推荐顺序：

1. inventory、门禁和无 consumer 删除；
2. L2 React/UI 与 icons；
3. L1 VS Code adapters；
4. 已有明确 owner 的领域 contract；
5. local metadata；
6. project IO/authoring/NKC；
7. shared 根 barrel 与 package export 收口。

每批必须先定义目标 entry 和依赖方向，再同批迁移全部调用方并删除旧 export。
尚未进入批次的 surface 可暂留 shared，但不得获得新 consumer。

### 4. 不保留兼容成功路径

项目处于预发布阶段。一个 surface 完成迁移后：

- 删除 shared export 和旧 deep path；
- 不增加 re-export、path alias、proxy package、dual write/read 或 fallback；
- 路径级测试 poison 旧入口并证明 canonical owner 被命中；
- 如果外部发布契约或有价值本地数据要求临时兼容，必须另行定义 owner、
  到期条件、diagnostic 和移除任务。

### 5. 数据与 schema 变更必须独立显式

纯 import relocation 不改变序列化名称、文件路径、SQLite namespace、setting
key、secret key 或 wire version。若 owner 迁移需要改变其中任一项，所在批次
必须：

- 定义 versioned、idempotent migration；
- marker 最后提交，失败保留源数据；
- 覆盖 clean、existing、conflict、malformed、interrupted 和 retry fixture；
- 不把空数据/default/no-op 当作迁移成功。

没有迁移证明时保持现有 durable identity，即使 TypeScript owner 已改变。

### 6. L0/L1/L2 和 runtime entry 必须可机械验证

- shared 根入口及 L0 owners 不得导入 VS Code、Electron、Node 实现、React、
  DOM 或产品领域实现。
- UI entry 可依赖 React/DOM 和 L0，但不得导入 VS Code/Node。
- VS Code adapter 只存在于 App；Webview 不得导入 adapter。
- Node implementation 使用显式 `/node` entry，browser bundle 不解析它。
- owning package 不得通过 shared root re-export 反向导入自己的 contract。

### 7. `@neko/host` 不接收被迁出的领域能力

`@neko/host` 只保留多个宿主共同实现的稳定、host-neutral primitive。领域 DTO、
SQLite、project IO、React 和 VS Code adapter 不得迁入该包。需要 Host 操作的
领域在 consumer package 定义窄 port，由 App 实现 adapter。

## Risks / Trade-offs

- [947 个根入口 consumer 造成迁移面过大] → 先生成 symbol/consumer inventory，
  按 owner 和依赖叶子分批，每批全量迁移但不一次处理全部 shared。
- [移动 contract 形成循环依赖] → owner entry 必须是 L0；无法消除循环时先调整
  contract ownership，不通过 shared re-export 绕回。
- [UI/theme 拆分破坏 Webview build] → UI batch 同时验证所有 Webview producer
  和 consumer build，不把 VS Code Host 测试替代 browser build。
- [metadata/project owner 移动损坏用户数据] → 默认保持 durable identity；任何
  schema/path 变化必须有 versioned migration fixture。
- [shared 重新膨胀] → inventory drift 和 forbidden-import gate 阻止未分类 export
  与 domain/UI/Host surface 回流。

## Migration Plan

1. 生成 export/symbol/consumer inventory，补齐 proposed owner、layer 和数据影响。
2. 建立 inventory drift、通配 export、runtime layer、app reverse import 和
   owner cycle 门禁。
3. 依次实施 UI、VS Code adapter、领域 contract、local metadata、project/NKC
   批次；每批独立更新 proposal/tasks/verification。
4. 每批迁移所有生产者/消费者，删除旧路径并运行 producer/consumer、build、
   test、check、unused 和 legacy-debt 门禁。
5. 最后移除 `"./*"` 与领域根 barrel，只保留审计通过的 L0 exports。
