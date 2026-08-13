## Context

OpenNeko 已经具备 standalone/project-local Character file authoring、精确 AuthoringTarget、Workspace target switching、Chara-owned Character authoring surface、`character-creator`、immutable CharacterVersion、Storyline 和 canonical Character Agent runtime，但产品表面仍有两处错位：Character Management 的 Secondary Main 直接复用完整 `CharacterPanel`，管理与创作没有真正分开；CharacterVersion 只按时间显示，不能表达从历史版本继续创作产生的多分支关系。

“Character Studio 是 Workspace 创作能力”在本设计中的精确定义是：Host 授权一个 exact directory root 并签发 sender-bound Workspace grant，canonical Workspace Authoring 选择该 root 下的 exact CharacterProject target，再组合 Chara-owned authoring surface；Chara 不创建独立 Workspace、Scene、target switcher 或 controller，Renderer/surface 不直接读取 raw path。standalone Character library authority 与 Content Project Workspace 是同一 authoring contract 的不同 authority，不是两个 Studio，也不把 standalone Character 建模成 Content Project。

### 五层分析

| 层面 | 结论                                                                                                                                                                                                                                                                                                             |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | Chara 拥有角色草稿、版本、lineage、比较、删除保护和 Character authoring surface；Workspace Authoring 拥有 target switching 与 Workbench composition；Agent 拥有 Character Creator 的模型/Skill/Tool 生命周期；Host 拥有目录 grant 与 Scene；Project 只拥有 membership/dependency；Desktop 只做可见 composition。 |
| 依赖 | Chara application 依赖注入的 repository、reference reader 和 exact binding，不依赖 Electron；Renderer 只依赖 Chara/Agent/Host public contracts；Project/Agent 通过精确 version ref 协作，不读取 Character payload。                                                                                              |
| 接口 | 目录 authority、CharacterProject binding、quick-create handoff、lineage command、graph projection、reference inventory 和 Conversation launch 分别使用窄接口，不用 active/current/recent identity。                                                                                                              |
| 扩展 | 第一阶段支持一个工作草稿和多分支 immutable graph；命名分支、多工作草稿、merge workflow 只有出现真实需求后再扩展，不提前建立通用 VCS。                                                                                                                                                                            |
| 测试 | Chara producer tests 验证 lineage/草稿基线/引用；Webview 验证页面职责与图形；Host/Desktop 验证 exact delegation/Root 卸载；Agent Evaluation 和真实 Electron 验证 quick create 与 handoff。                                                                                                                       |

## Goals / Non-Goals

**Goals:**

- 将 Character Management、quick creation、Workspace Character Authoring capability 和 Character Interaction 的 owner、identity、入口与生命周期分开。
- 让 standalone 与 project-local Character 直接复用目录授权 Authoring Workspace、target switching、Workbench composition 和同一个 Chara surface/service/repository path。
- 让 Workspace live records 与 `.neko-character` 可移植 ZIP 各有单一职责：前者是唯一 authoring/runtime authority，后者只是在用户显式操作期间存在的 import/export transport，并对素材 ownership、依赖和敏感数据建立可验证边界。
- 让用户无需进入 Studio 即可通过 canonical Character Creator 创建草稿。
- 将 CharacterVersion 表达为本地可用快照，并提供明确、可测试的多分支 lineage 图。
- 保持所有 Storyline、Conversation、Room、memory 和 Project dependency 对 exact CharacterVersion 的稳定引用。
- 保留既有无 lineage 版本并使缺失关系可见，不推断或重写历史。

**Non-Goals:**

- 不实现服务端发布、云同步、角色市场、协作编辑或远程权限。
- 不实现多个并行 working draft、自动 merge、三方冲突解决、rebase、tag 或通用 Git/VCS。
- 不把 CharacterVersion lineage、Storyline graph 和 Conversation branch 合并。
- 不在 Character Management 复制 Agent Composer、provider/model selector 或 Character authoring surface。
- 不建立独立 Character Studio application、Workspace kind、Scene、Workbench、controller 或 target registry。
- 不挂载、监听、同步、回读或从 ZIP 原地编辑/运行角色，不把 portable package identity、文件位置或打开状态变成 durable fact、第二 repository 或 runtime authority，不在包内携带 Conversation、Room、memory、模型配置、凭据或运行状态。
- 不改变 Character Dialogue/Room 的 exact-version runtime owner，不引入 Character 全局模型配置。

## Decisions

### 1. Character authoring 是 Workspace capability，不是独立 Studio runtime

Canonical composition：

```text
Host-authorized directory Workspace
  + exact CharacterProject binding
  + canonical Workspace target switching/Workbench
  + Chara-owned authoring/tool surfaces
  = Character Authoring Workbench
```

- standalone：Host 将配置的 Character library root 投影为一个 library-managed Workspace authority 并签发 grant；Workspace Authoring 选择 exact target，Chara repository 使用 `neko/characters/<characterProjectId>/...` 相对布局。
- project-local：Host 授权 Content Project Workspace，Project application 先验证 exact local membership，Workspace Authoring 复用同一 target switch 和 slots，Chara 使用同一相对布局和 service。
- Renderer 只得到 workspaceId、workspaceGrantId、可显示 label 和 CharacterProject identity，不得到 absolute path。
- canonical Workspace target switching 执行 outgoing presentation snapshot、Root unload、incoming authority validation、Root mount；Chara 只提供 target surface/commands/projection，目录和 Chara surface 都不成为 Workspace lifecycle owner。

未采用“standalone Character 自动创建 Content Project”，因为 Content Project membership 与 Character fact owner 不同，且会污染项目目录与导航。未采用任意 folder picker 直接打开 Character surface，因为 raw path 不能成为 Renderer authority，也会绕过 library/project placement。未采用独立 Character Studio Scene/Workbench/controller，因为会复制 Workspace authoring 的 target、layout、Agent、资源、snapshot 和 Root lifecycle。

### 2. Character Management detail 与 Studio 使用不同 Root

`@neko/chara-webview` 将当前大而混合的 `CharacterPanel` 拆为可复用字段/展示 primitives 以及三个明确 Root：

```text
CharacterCatalogSurface             management Main
CharacterManagementDetailSurface    read-only Secondary Main
CharacterAuthoringSurface            Workspace authoring Secondary Main target
```

Management detail 只读 owner projection，允许 lifecycle/navigation commands，不持有 draft form state。它默认只回答“这是谁、是否有可用版本、下一步是开始对话还是编辑”，并把创建方式收敛为一个入口、把导出等次要操作收进更多菜单。完整 lineage、Storyline、reference inventory、内部 identity 和破坏性管理只在 Workspace Authoring 的高级区域按需展示。只有 Workspace Authoring 内挂载的 Chara surface 才能执行 CharacterProject、Storyline、representation、voice、testing 和 usable-version commands。离开管理页或切换 authoring target 时对应 Root 卸载，durable facts 与 protected runtime 不受影响。

Workspace 的 primary Main 始终保持 canonical Board 或显式空状态。Character/World 只作为带精确 target identity 的 Secondary Main authoring surface 出现；关闭后恢复原 primary Main，不把特殊创作目标提升为 Workspace 默认页面或新的 Workspace 类型。

Character catalog 固定使用与其他管理入口一致的响应式对象卡片，不提供表达同一信息的列表/网格双模式。卡片用于选择 Character 对象；详情内部使用连续分区和分隔线，不再用多层圆角卡片表达同一对象的内部结构。

未采用“同一个 CharacterPanel 用 authoringOnly/creating flag 切换”，因为同一个 mutable component 已经让管理 slot 成为第二个编辑器，并让新建、详情、发布和 Storyline state 共享不正确的生命周期。

### 3. 快速生成从管理页 handoff 到 canonical Agent Entry

Character Management 的“快速生成”只发出 typed intent：打开/focus 一个 canonical Agent Entry Draft、激活 exact builtin `character-creator`，并保存一个最小的 management return presentation identity。用户在标准 Composer 中输入 prompt/mentions，使用既有 destination chooser 选择 standalone/project-local target，并使用标准 Tool approval 确认填充。

Tool result 投影提供 `View Character` 与 `Open Studio` 两个 exact handoff；它不自动导航、发布或启动 Conversation。手动创建直接授权 fresh target 后打开 Studio；导入走独立 Chara import workflow。

未采用管理页内嵌 prompt/model panel，因为这会复制 Agent Composer、附件、Skill、Approval 和 provider lifecycle。未采用 Chara provider 调用，因为 Agent 是唯一模型执行 owner。

### 4. 用户文案将 publication 收敛为本地 usable version

Contract/application 可以继续使用 `CharacterVersion`/`publish`，但用户界面统一使用“创建可用版本 / 定稿 / 可用版本”。Remote export/share/marketplace 不复用该 command、identity 或确认。

“定稿并开始对话”是两个显式阶段的组合动作：先创建 immutable exact CharacterVersion，再调用 existing Character launch transaction。如果第二阶段失败，版本保留且 launch diagnostic 可见；不得回滚或把失败描述成远程发布失败。

### 5. Workspace live directory 与 portable ZIP 是两种不同生命周期

Workspace 内的 authoritative Character 目录保持可直接审计的 package-owned records：

```text
neko/characters/<characterProjectId>/
  project.json
  lineage.json
  versions/<characterVersionId>.json
  storylines/<characterStorylineId>/...
  authoring-tests/<authoringTestSnapshotId>.json
  localized-assets.json                       # exact opaque-ref/representation -> owned file inventory
  assets/...                                  # only explicitly localized Character-owned copies
```

`project.json` 持有 mutable metadata/draft 与 opaque representation refs；immutable version、lineage、Storyline 和 tests 各自保持 owner-qualified record。`localized-assets.json` 只持有 exact `representationId + kind + resourceRef`、入口相对路径和所属文件 inventory，不复制角色定义、raw path 或 ZIP identity。`assets/` 不是所有引用素材的镜像，只保存用户显式本地化且 Host 已授权复制的角色自有副本。Asset library、Content Project 或第三方 provider 仍拥有其原始 bytes；普通 Character record 只保留 `asset:`、`voice:` 等非 file opaque ref。Chara 只有在 exact binding 存在且完整时才把本地副本作为该 opaque ref 的 canonical realization；不得按文件存在、目录名、representationId 猜测或回退。Renderer 不接收 raw path。

`.neko-character` 是 ZIP transport，而不是 live Workspace：

```text
manifest.json
character/
  project.json
  lineage.json
  versions/...
  storylines/...
  authoring-tests/...
assets/...                                    # declared embedded files only
```

它只有两条一次性数据流：

```text
export: canonical Workspace records + explicitly authorized asset bytes
        -> bounded ZIP bytes -> user-selected destination

import: user-selected ZIP bytes -> bounded validation/preview
        -> explicit commit into canonical Workspace records -> release ZIP resources
```

ZIP 文件名、文件位置、打开状态和归档 entry 不成为 Character identity 或持久引用。导入成功后，即使原 ZIP 被移动或删除，已安装 Character 仍必须只依赖 Workspace records 正常管理、创作和运行；源 ZIP 后续变化也不得同步到已安装 Character。导出完成后的 ZIP 同样只是当时所选 facts 的快照，Workspace 后续修改不会反向改写它。

manifest 只承担包入口、所含用户领域 identity、record inventory、embedded asset inventory、external dependency inventory、media metadata、byte length 和 integrity digest；角色内容不在 manifest 重复成为第二事实源。manifest 不含 `schemaVersion`/`formatVersion` 或等价内部代际字段。CharacterVersion 与 StorylineVersion 的 identity 是允许且必须保留的用户领域版本；VRM、Live2D 等第三方格式版本只保留在对应 asset/provider metadata 中。

导出必须显式选择 record scope 与素材策略。未内嵌的表示素材保留为 external opaque dependency，并在预览中标记“非自包含”；不得静默复制全局库或项目 sibling 素材。Conversation/Room transcript、Companion memory/continuity、narrative run、provider/model selection、Skill/Tool grant、approval、credential、cache 和 presentation snapshot 永不进入包。

导入在 Host/Node trust boundary 先做 ZIP containment、entry/expanded-size 上限、duplicate/symlink、manifest/codec、identity 和 digest 校验；Chara application 再展示 placement、branches、Storylines、assets、missing dependency 与 identity conflict preview。用户授权 exact destination 后才写入 canonical repository；内嵌素材必须先落入角色自有 assets 范围，再提交独立 canonical localized binding，部分失败保留已写入 bytes 但不得把未绑定副本报告为可用。完成或取消后都释放归档 reader/bytes，不建立 watcher、mount、recent-package binding 或同步任务。ZIP manifest 不得在导入后充当本地 binding。ZIP 不原地执行，冲突不覆盖、不自动 merge、不静默 remap，也不回退 active/recent Workspace。

未采用“一个 JSON 内嵌所有 base64 素材”，因为它破坏大媒体流式处理、差异审计和局部失败隔离。未采用“把所有外部引用自动复制进 ZIP”，因为素材 ownership、许可、体积和依赖可用性需要用户显式判断。未采用“直接挂载 ZIP 为 Studio”，因为归档会成为第二事实源并复制 repository/runtime path。

### 6. Lineage 是 Chara-owned 用户领域 aggregate，不修改 immutable version payload

为避免根据时间推断关系，也避免为了关系展示重写现有 immutable CharacterVersion，新增 package-owned `CharacterVersionLineage` aggregate，代表一个 CharacterProject 下已声明的关系：

```ts
interface CharacterVersionLineage {
  readonly characterProjectId: string;
  readonly relations: readonly CharacterVersionRelation[];
}

interface CharacterVersionRelation {
  readonly characterVersionId: string;
  readonly parentCharacterVersionIds: readonly string[];
  readonly changeSummary?: string;
}
```

`relations` 是用户管理的领域历史，不是 internal schema generation。一个 version 没有 relation 时是合法的 unlinked node；空 parents 是用户明确声明的 root。Graph projector 从 exact versions + relations 计算 roots、heads、paths、cycles/missing refs diagnostics，不将 projection 写回。

Canonical relative path 由 `@neko/chara-node` 固定为：

```text
neko/characters/<characterProjectId>/lineage.json
```

文件缺失表示当前没有任何已声明 lineage，这是该独立领域记录的正常 fresh state；文件存在但无法解析时必须返回 record-local diagnostic，禁止替换为空图。新 version publication 成功而 lineage 写失败时保留 immutable version 为 unlinked node，返回明确 partial-commit diagnostic 和 exact retry-link action；不得伪造 edge、删除 version 或报告完整成功。

未把 parent ids 写入现有 CharacterVersion bytes，因为历史 publication 不应为新增关系被重写。未建立通用 graph registry，因为关系只服务一个 CharacterProject 的用户可见版本历史。

### 7. 一个工作草稿通过稳定可选 basis 表达派生来源

CharacterProject 继续只有一个 draft，并增加稳定领域语义 `draftBasisCharacterVersionId?`：存在时表示用户明确从该 exact version 继续创作；永久缺省语义表示 unbased draft，而不是旧 shape dispatch 或 migration marker。`continueFromVersion` 在一个 Chara authoring operation 中将 exact version definition 复制到 draft 并设置 basis；普通字段编辑保留 basis；创建 usable version 后 relation 使用该 basis 作为 parent，随后草稿仍可继续基于新 version 或由用户显式选择其他 basis。

第一阶段不持久化 branch name/head。Heads 是 graph projection；label/changeSummary 为 version/relation 的用户事实。第一阶段 codec 与 command 均拒绝多个 parents；只有未来出现显式 merge workflow、真实消费者和独立 OpenSpec 后，才可原子放宽为多个 parents。普通 publication 接受零或一个 parent。

### 8. 引用 inventory 由 owner ports 聚合，删除决定留在 Chara

`@neko/chara/application` 定义窄 `CharacterVersionReferenceReader` ports；Chara 自身提供 Storyline、Room/run 与 memory provenance refs，Agent/Project owning packages 提供 Conversation 和 dependency refs。Desktop composition 只注入 concrete readers，不解释引用或决定删除。

Chara deletion service 在删除前读取 exact inventory。存在 durable ref 时拒绝删除或执行另行定义的 archive/hide；不得自动重绑到 graph head。单个 reader 失败只阻止该 version 的 destructive operation并给出 owner diagnostic，不使 catalogs 或 sibling versions unavailable。

### 9. 三种图使用独立 projection 和 UI

- CharacterVersion graph：Studio version tab；Management detail 显示 bounded summary。
- CharacterStoryline graph/timeline：Storyline authoring 与 Narrative context/timeline。
- Agent Conversation branch：Agent transcript/navigation owner。

任何 UI 可通过 exact ref 显示交叉引用，但不能把一类 edge 写成另一类 authority。Character launch 在多个 heads 时必须显式选择 exact version；不提供 latest/head fallback。若未来增加 user-managed preferred version，它必须是独立明确领域事实和 exact consumer，本变更不包含该能力。

### 10. Package ownership 与 canonical paths

| Responsibility                  | Owner/public path                                                      | Producer                                  | Consumer                                    | Replaced path                                    |
| ------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| Character facts/version/lineage | `@neko/chara/contracts`, `@neko/chara/application`                     | Chara authoring services                  | Chara Webview, Agent context, Project refs  | flat time-only version semantics                 |
| Directory persistence           | `@neko/chara-node`                                                     | Chara repository adapter                  | Chara application ports                     | any SQLite/global/active-root authoring fallback |
| Portable package/inventory      | `@neko/chara/contracts`, `@neko/chara/application`, `@neko/chara-node` | Chara export/import + bounded ZIP adapter | Chara Webview and authorized Host file port | ZIP-as-runtime, raw-path or auto-copy path       |
| Management/authoring UI         | `@neko/chara-webview`                                                  | Chara read models/surface                 | Workspace/Desktop Root composition          | full `CharacterPanel` in management detail       |
| Quick-create Agent path         | `@neko/agent-contracts`, `@neko/agent-runtime`, `@neko/agent-webview`  | Agent Entry/Turn/Tool lifecycle           | User and Chara capability                   | management-owned Composer/provider path          |
| Directory grant/Scene           | `@neko/host`                                                           | Host authorization/scene service          | Desktop Main/preload/renderer               | raw path or current/recent Workspace inference   |
| Desktop wiring                  | `apps/neko-desktop` public composition root                            | Electron sender-bound adapters            | package public Roots/ports                  | app-owned Character rules or graph computation   |

Desktop 保留的逻辑仅包括 Electron sender/window identity、directory grant concrete adapter、typed IPC、Scene transition 和 Root wiring；这些依赖真实 Electron trust boundary，不能下沉为 host-neutral Chara behavior。

## Risks / Trade-offs

- [Lineage 与 immutable publication 分文件写入可能部分提交] → publication 保留为可用 unlinked node，返回 exact partial diagnostic 和 retry-link；不删除用户版本或伪造关系。
- [版本图增加普通用户认知负担] → 管理页默认只显示可用版本数量和是否可开始对话，完整图、compare、Storyline 与 reference inventory 放入 Workspace Authoring 的高级区域；普通 quick-create 仍保持单草稿/单定稿动作。
- [可选 draft basis 被误当兼容字段] → 文档与 poison tests 固定其永久领域语义：缺省永远是 unbased，不参与 shape dispatch。
- [从历史版本继续会覆盖当前草稿] → 必须先显式 save/finalize/discard，禁止隐藏第二草稿。
- [跨 owner reference inventory 不完整] → destructive action fail-closed 于当前 version，reader failure 不影响非破坏性使用和 sibling records。
- [active changes 重复定义 quick create/Workspace/Conversation] → 本 change 只消费现有 canonical public ports，并在任务开始时对三个相邻 change 做 spec reconciliation 和 source poison audit。
- [图形布局在大量版本时性能或可读性下降] → 默认 bounded heads/recent viewport、按需展开祖先，图 projection 保持可重建且不保留业务 Root；不引入跨领域 cache manager。
- [ZIP bomb、路径穿越或伪造 manifest 破坏本地数据] → 在 Node trust boundary 完整预检 containment、entry/size、duplicate/symlink、codec 和 digest，任何失败在写入前拒绝当前 import。
- [包外素材让接收方误以为角色完整可运行] → export/import preview 明确区分 embedded 与 external dependency；缺失依赖只使对应 representation 失效并提供修复入口，不伪造占位素材或禁用整个角色目录。
- [导入 identity 与现有不可变记录冲突] → exact conflict fail-visible，首轮禁止覆盖/自动 merge/静默改名；显式 fork/remap 只有另有 owner-defined workflow 和引用重写验证后才能加入。

## Migration Plan

1. 先增加 lineage/draft basis canonical contracts、repository 和 producer tests，但不改变现有 CharacterVersion bytes。
2. 读取既有有效 CharacterVersions 为 graph nodes；没有 `lineage.json` 或 relation 的版本显示 unlinked，保持所有精确引用和 runtime eligibility。
3. 原子切换 publication producer，使新版本在成功写入后声明 root/parent relation；删除任何按时间排序充当 lineage 的成功语义。
4. 收敛 Character live directory record inventory，补齐 Storyline/本地化 asset 的 package-owned relative layout，同时保持所有既有有效 records 可见且不移动用户数据。
5. 增加 strict portable manifest 与 bounded ZIP import/export adapter；先实现 preview/validation 和 conflict fail-visible，再开放 explicit commit，禁止 ZIP-as-runtime。
6. 拆分 Chara Webview management detail 与 Character authoring surface，Workspace/Desktop 同步切换 target consumer，并删除管理 detail 中完整编辑器挂载和任何独立 Studio Scene/controller。
7. 接通 management → Agent Entry Character Creator → exact result handoff，以及 manual create/import → Workspace Character authoring。
8. 更新本地 usable-version 文案、graph/compare/reference/package preview UI，再接通 explicit finalize-and-launch。
9. 在真实 Electron 与 packaged app 验证 standalone/project-local directory authority、Root unload、portable import/export、lineage branches、旧 unlinked versions 和 exact runtime binding。

Rollback 只能撤回尚未写入用户数据的 UI/composition commit。已经创建的 CharacterVersion、lineage relation 或 draft basis 是用户领域事实，不能通过代码回滚删除；回滚前必须保留新记录可读能力或提供显式 owner-owned export，不得恢复 flat/latest 成功路径。

## Open Questions

- version archive/hide 是否已有真实产品需求；没有时首轮只实现引用阻止删除，不新增 archive 状态。
