# Design: DSH terminal artifact delivery

## Five-layer analysis

- **职责：** DSH projection 是本轮消息与 Tool 终态事实；Agent Runtime collector 决定哪些事实构成
  creator-visible batch；Canvas projector 决定节点/关系与去重；Desktop 只解析精确 Workspace authority
  并提供 Host adapter。
- **依赖：** collector 只依赖 canonical DSH projection、`ContentLocator` 和窄 delivery port；不依赖
  Electron、文件系统或 renderer。Desktop adapter 注入 LocalMetadata、Workspace registry、Host file port
  和 Canvas mutation coordinator。
- **接口：** producer 在 `turn/end` 后提交 `{workspace, conversation, session turn, target, artifacts}`；
  consumer 转换为一个 `CanvasWorkspaceProjectionRequest` 并返回 typed outcome。
- **扩展：** 新 Tool 只有在返回稳定 locator 或 owning-domain durable artifact identity 后才可增加 collector；
  不使用 Tool 名 wildcard、模型自由判断或 transcript heuristic。
- **测试：** collector contract 测试覆盖成功、失败、取消、重复 Tool、locator identity 和 Markdown identity；
  Desktop 测试覆盖 exact Workspace、一次 batch、ledger receipt 和重复 terminal notification；Canvas 既有测试
  继续覆盖 fenced writer、atomic save 与 locator-backed node reuse。

## Canonical path

1. DSH ACP application client 接受并投影 `turn/end`。
2. Desktop 的 session-event composition 在发布 renderer changed event 前调用 package-owned terminal collector。
3. collector 只读取该 turn 的 final assistant messages 和 completed content Tool events。Document source
   来自完成结果中的 canonical `ContentLocator`，并与 Content-owned decoder 解析出的请求 locator 严格
   比对；Content image source 使用同一 decoder 验证已成功消费的输入。内部 ACP envelope 不参与 DSH
   event decoding。
4. collector 按 `contentLocatorKey` 合并 source；存在 source 且存在非空 final Markdown 时创建一个 analysis
   artifact，并通过 `sourceArtifactIds` 关联全部 source。
   对 exact document-entry 结果，collector 同时读取 Content-owned `excerpt.contentKind` 与
   `imageInfo[].contentLocator` 关系；只有 image-only wrapper 的已声明图片在同一 turn 被成功消费时，才以
   图片 source 取代 wrapper 的可见 file-reference。文本、mixed、文件级 source 和未消费图片保持原 source，
   不按 EPUB 内部文件名或扩展名猜测。
5. Desktop delivery adapter 解析 Conversation 的精确 Workspace binding，生成稳定 `deliveryId`，先恢复
   ledger 中已有 pending delivery；仅对新的 delivery 读取 source fingerprint 并入账，再在 Canvas runtime
   的 Workspace Board mutation queue 中 load-plan-save。
6. Canvas projector 按 locator 复用资源节点、按 artifact identity + Markdown fingerprint 复用分析节点，
   原子创建缺失关系并保存 receipt。

## Identity and deduplication

- `ContentLocator` 保持纯定位 contract；不得新增 fingerprint、mtime、absolute path 或 runtime URL。
- locator-backed source node identity 是 `contentLocatorKey(locator)`；同一资源位置的重复读取只对应一个节点。
- source `artifactId`/`sourceId` 从 canonical locator key 稳定派生；collector 的 `locator:` observation 只用于
  Host 前的稳定批次。Desktop 在首次入账前以 Content Read authority 返回的真实 fingerprint 替换该值。
- source fingerprint 只表达内容新鲜度，不参与 locator-backed Canvas node identity。指纹变化时 planner 只
  更新节点 provenance，保持 node id、locator、位置、尺寸与用户编辑；已打开的文本和媒体预览把该值作为
  重新读取信号。
- analysis `artifactId` 从排序后的 source artifact identities、分析类别和 canonical final Markdown 派生；
  `contentFingerprint` 只由 Markdown 内容派生。
- `deliveryId` 从 Workspace、Conversation、DSH Session、turn 和精确 Canvas target 派生；时间戳不参与。
- 同一 turn 的重复 terminal notification 命中同一 ledger task/receipt；同一 batch 内重复 Tool locator 在
  collector 中先合并；不同 turn 产生完全相同的 source/analysis graph 时 Canvas planner 返回 node/connection
  reuse 或 noop。
- locator 去重与文档语义折叠分层处理：前者只比较完整 `ContentLocator`；后者只消费 Document result 已声明
  的 image-only wrapper → embedded image 关系。Canvas 不渲染或执行原始 EPUB HTML，Content owner 继续负责
  文档解析和安全的文本/图片投影。
- completed content Tool 的 projection decode 以单个 tool-call 为最小失败边界。参数、结果 JSON、canonical
  source 或请求/结果 locator 不一致时，collector 记录包含 `toolCallId` 与 Tool 名的 diagnostic 并排除该
  source；有效 sibling 仍参与同一 terminal batch。该行为不是把非法结果伪装为成功，transcript 和 Host
  diagnostic 都保留失败事实。
- Board 是内容索引而不是 Tool 调用日志。collector 只按完整 `ContentLocator` 去重，不得因为多个 locator
  共享同一个 `file` 就把不同 page、entry 或 text-range selector 收敛成根文件；否则跨应用定位信息会丢失，
  Board 也无法展示 Agent 实际消费的内容位置。唯一允许的语义折叠是 Content result 明确声明的
  image-only wrapper → embedded image 关系，且对应图片必须已在同轮成功读取。该规则不猜测 EPUB 内部
  `page`/`moe` 文件名，也不执行 HTML。

## Commit timing and failure semantics

Tool 调用期间不写 Canvas。只有成功的 `turn/end` 且存在可审阅 source+analysis batch 时提交一次。
`interrupted`、`max-tokens`、未完成 assistant stream、只有 source、只有普通聊天文本或没有任何成功 source
都不提交。单个 content Tool 失败或 completed projection 无法通过 canonical decode 时只排除该 Tool；同轮
已有成功 source 和最终分析时继续提交，失败记录仍在 transcript 与 Host diagnostic 中 fail-visible，不能
伪装为 Canvas source。
Canvas delivery 失败只记录当前 delivery 的 blocked/conflict diagnostic，不改变已保存 transcript、源文件或
其他 Workspace。不得回退到 active/recent Workspace、另一个 Canvas、renderer mutation 或 raw `.nkc` 写入。

## Runtime boundary and replaced path

- **Producer:** `packages/agent/runtime/src/application` DSH terminal collector。
- **Consumer:** Canvas Domain `WorkspaceBoardDeliveryCoordinator` public path。
- **Runtime adapter:** `apps/neko-desktop/src/main` exact Workspace/SQLite/file wiring；保留在 Desktop 的原因仅为
  Electron Host authority 与 live Canvas session coordination。它组合 Content-owned workspace/document-entry
  reader，所有跨应用 source 仍为 `ContentLocator`。
- **Replaced path:** 无平行旧实现；Pi creator-visible collector 不恢复，DSH session event 是唯一 production
  producer。

## Agent Evaluation disposition

`blocked`：现有可见 Desktop Agent Evaluation evidence boundary 只公开 DSH session facts，不公开 Canvas
Workspace Board projection；把 `workspace-board-projection` assertion 加到真实 Desktop case 会在配置阶段失败，
不能作为行为证据。本 change 以 collector、Desktop adapter、Canvas planner 和 Webview freshness 测试作为可执行
证据；真实可见 Electron 的 Board 投影/重放断言必须在 Evaluation 通过公开产品 projection 取得 Canvas facts 后补齐。
