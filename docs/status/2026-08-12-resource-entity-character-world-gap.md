# 资源、Entity、Character 与 World Gap（2026-08-12）

本文是当前实现与目标架构之间的审计快照，不是长期架构事实。目标边界见
[`creative-resource-semantic-boundaries.md`](../architecture/creative-resource-semantic-boundaries.md)，实施任务见
the accepted [`unified-entity-representation-bindings`](../../openspec/specs/unified-entity-representation-bindings/spec.md)
与后续存储切换
[`separate-project-facts-local-state-and-media-bindings`](../../openspec/changes/separate-project-facts-local-state-and-media-bindings/)。

## 已有基础

| 领域            | 已有基础                                                                                | 不能据此宣称                                 |
| --------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| Content / Media | `ContentLocator`、直接文件读取、媒体库连接与投影边界                                    | 普通文件已成为 Asset 或 Entity               |
| Asset           | 本地 manifest/revision/digest 方向与部分管理投影                                        | 完整本地 package 安装闭环已可用              |
| Entity          | 最小项目 identity/names/lifecycle/binding、candidate/occurrence、Inspector 基础操作     | Entity Asset 或角色互动是生产能力            |
| Chara           | CharacterProject/Version、Storyline、Companion/Narrative、Dialogue/Room 的 owning model | 全部 Desktop 路径与真实 provider 验收已完成  |
| World           | Foundation project/version/run/save/branch 模型                                         | Story/Gameplay/Experience/实时生成已完成     |
| Project         | Character/World membership、精确外部引用、Entity-to-Character 关联及可重试多步编排      | 所有 Character seed 来源均已完成真实产品验收 |

截至 2026-08-13，Project 已提供 Project Content 只读聚合与 sender-bound Desktop 路径；Resources 已收窄为
Files、Media、Assets 三个 source。Project Content 独立展示角色、世界、其他元素与待确认，关联角色不重复
显示为元素，scene/location Entity 不会被提升为 World。

## 主要 Gap

### P0：authority 冲突

- creative Entity asset-composition 仍有公共导出与真实类型消费者，尚未完成
  producer/consumer/registration 级切换；legacy Character Registry 公共入口已删除。
- `neko/project-composition.json` 仍把 Project identity、local membership、dependency 与
  Entity-to-Character association 绑定为一个严格 root；单个字段失效会阻断 Workspace transition。
  新提案将 association 拆为 Project-owned facts，并从 Chara/World/consumer owner 重建 membership、
  dependency 与 Project Content。
- 项目 Media Library 仍以 `workspace-file: neko/assets/...` 和工作区 OS link 运行，机器本地映射位于
  同步项目 namespace。新提案将 durable 引用改为 owner-qualified Media Library locator，并把 target-free
  本机 binding 放入可删除项目 `.neko`。

### P0：用户数据保护

- 未获得 sender-bound 用户 Workspace 授权，因此尚不能断言真实用户项目不存在旧 `facts` 或 Entity Asset
  provenance；现有资格化只覆盖 contract、默认 metadata root、测试夹具和生产可达性。
- 严格 codec 已将旧字段隔离为 record-local unsupported diagnostic；Node repository 测试证明原始 bytes
  保持不变、合法 sibling 仍可见且 mutation 被阻止，但 inspect/export/repair UI 仍未完成。

### P1：产品和 contract 收敛

- Resource Browser 已将唯一展示 contract 从 peer `facet` 原子收敛为 Files、Media、Assets 三个
  owner-preserving `source`；Entity handler、intent、UI 与测试已从 Assets-owned 路径删除。Project-owned
  Project Content 通过现有 Project bridge 聚合角色、世界、其他元素和待确认内容，保留 owner-qualified
  identity、availability 与局部 diagnostic，不复制领域 payload 或提供 Entity 通用 mutation。Search 已定义 owner-qualified usage projection，local metadata 已提供按
  owner/source 原子替换、精确 target 查询和坏行局部 diagnostic，Project composition 已能投影 Entity、
  CharacterProject 与 CharacterVersion 的 occurrence、usage、dependency 和 availability；其他 owner 的
  producer 与 recent-use 通知仍需按真实 authoritative record 逐项接入。
- Chara 已增加统一创建来源审查服务：手动/Prompt 草案、授权 Content locator、精确 Asset/resource 和
  ContentProject/ProjectEntity identity 先经各 owner 最小读取端口确认，再生成既有
  `CharacterCreationSeed` 并命中同一个 CharacterProject 创建端口；owner 拒绝时不会写 repository。Host
  contract 已删除原始 `seed` 输入，手动创建显式提交空 `sources`，直接在 fresh draft 填表现资源会被
  拒绝；Content/Entity 来源已有 sender-grant-aware Desktop adapter。Asset 来源已收紧为包含 package、
  revision 和 member path 的 `package-resource` locator，当前缺少 manifest-backed resolver 时明确失败，
  不会把平面文件冒充 Live2D package。Resource Browser 已为精确 Content 与已确认且未关联的 Project
  Entity 接入显式项目目标/角色名确认，创建成功后进入同一工作区的 Character Studio；candidate、已关联
  Entity 与只有平面 membership 的 Asset 不显示该入口。项目内创建已统一为 CharacterProject、membership、
  Entity create/select、exact association 四步；typed IPC 与 UI 会保留 partial receipt，partial 状态下不
  允许取消，只允许显式重试缺失后缀。Character Studio 内的来源 picker 与 manifest-backed Asset resolver
  仍未完成，因此统一创建任务尚未关闭。
- Entity-owned Dialogue/Room/embody contract、handler 与 UI action 已移除；Chara 已拥有 Open Character、
  Open Studio 与 Start Interaction 的 handoff contract，Project 仅从精确关联投影这些动作，且互动入口
  缺少精确 CharacterVersion 时不会出现。Project Element 已展示关联卡片和版本选择要求；实际
  Open Character/Open Studio 点击路由、精确版本选择与 Desktop 启动 UI 仍待接入。
- usage/recent/occurrence 的基础 contract、bounded reconciliation、SQLite repository 和 Project producer
  已完成，且不复制 Entity/Character/Asset payload。Entity merge/delete contract 强制六个 typed owner
  participant 全部准备并以 poison test 证明不会查询 usage projection；production Inspector 未配置完整
  participant 时保持 fail-visible。当前 Asset `Remove` 仅移除本地 membership 并保留源文件，不是 uninstall；
  Chara 也没有 CharacterVersion removal command，因此两者没有可被投影绕过的 destructive success path。
  Canvas、Agent、Chara、Document 和 portability 的 owner producer/reader 矩阵仍是后续产品接线工作。
- World 尚缺精确 CharacterVersion actor binding 与可选 ProjectEntity world-object association 的完整
  contract、持久化和 UI 验证。

### P1：实现可达性和删除证据

- Entity Asset 与 legacy Character Registry 的 public exports/未装配实现已删除；仍需审计并收敛
  creative composition 以及泛化 projection 命名。
- 旧路径退出必须证明 canonical owner、contract、repository、handler 和 adapter 各只有一个；不能保留
  hidden service、compat reader、feature flag 或 test-only 成功捷径。

### P2：体验与文档一致性

- Resources 三源与 Project Content 四组、空态和局部无效诊断已接入；修复入口以及
  standalone/project-local/external placement 的跨页面一致展示仍未统一。
- 全局角色与项目角色需要明确展示 standalone、project-local、external dependency，而不是制造两类
  Character aggregate。
- Character Studio 应复用创作工作区组合能力；快速创建应可跳过 Studio，但后续进入同一个项目记录。
- 英文 Entity/Assets 文档以及受影响活跃 OpenSpec 仍需在实现任务中同步收敛。

## 当前不可用或延后

- 通用 Entity Asset 的发布、实例化、更新与共享服务端操作退出当前 canonical 方案。
- Asset 当前只处理本地 package；远端 provider、发布与同步需未来独立 OpenSpec。本地完整 package runtime
  尚未完成真实 Electron 验收。
- 完整 World Story、Gameplay、Experience、实时生成与生产级 Presentation 不属于 Foundation 完成事实。
- 自动把文件/素材识别成 Entity、自动创建 Character、自动选 latest CharacterVersion、自动修复旧记录均不支持。

## 实施顺序

1. 已完成可执行范围内的数据/可达性资格化、Entity contract 收窄、Project association 与 Entity Asset
   孤立路径删除。
2. 统一 Character 创建 seed、项目内 partial receipt 和 Chara-owned interaction handoff。
3. 扩展各 owner 的 usage producer，并仅在对应 owner 提供真实 read/rewrite commit 后开放 destructive
   operation。
4. 删除 legacy registry/creative composition 的剩余公共可达路径并重命名泛化 projection。
5. 原子切换项目 `.neko`、Media Library locator/binding、Project association facts 与同步/便携快照，
   删除 `neko/assets` 和 `project-composition.json` 成功路径。
6. Project Content Desktop delegation、路径级 poison tests 与真实可见 Electron UI 验收已完成；World
   精确绑定仍由未来 World 变更处理。

完成定义不以“类型存在”或“单测通过”为准；必须覆盖真实 producer、consumer、repository、Desktop
delegation、用户可见 failure 和相关 Electron 路径。
