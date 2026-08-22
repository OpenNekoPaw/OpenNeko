# Design: DSH completed-tool and terminal artifact delivery

## Five-layer analysis

- **职责：** DSH projection 是本轮消息与 Tool 终态事实；Agent Runtime collector 决定哪些事实构成
  creator-visible batch；Canvas projector 决定节点/关系与去重；Desktop 只解析精确 Workspace authority
  并提供 Host adapter。
- **依赖：** collector 只依赖 canonical DSH projection、`ContentLocator` 和窄 delivery port；不依赖
  Electron、文件系统或 renderer。Desktop adapter 注入 LocalMetadata、Workspace registry、Host file port
  和 Canvas mutation coordinator。
- **接口：** producer 在受支持内容 Tool 的 completed update 后提交 source-only delivery；Workspace 模式成功
  `turn/end` 后先经授权 publication port 写入 Markdown 文件，再提交 locator-backed analysis delivery。每个请求
  携带 admission 时选择并绑定到真实 turn 的 `CanvasWorkspaceTurnTarget`；consumer 转换为一个
  `CanvasWorkspaceProjectionRequest` 并返回 typed outcome。
- **扩展：** 新 Tool 只有在返回稳定 locator 或 owning-domain durable artifact identity 后才可增加 source
  collector；成功 Workspace 终轮的 final Markdown 本身是该模式的 canonical durable text output，不使用长度、
  标题或措辞 heuristic 判断“价值”。
- **测试：** collector contract 测试覆盖成功、失败、取消、重复 Tool、locator identity 和 Markdown identity；
  Desktop 测试覆盖 exact Workspace、一次 batch、ledger receipt 和重复 terminal notification；Canvas 既有测试
  继续覆盖 fenced writer、atomic save 与 locator-backed node reuse。

## Canonical path

1. DSH ACP application client 先接受并投影 `tool_call_update(status=completed)` 或 `turn/end`。
   每条 Tool projection 携带其已知的稳定 `turnStartedAt`；即使有界 event window 已淘汰较早的
   `turn/start`，成功 Tool delivery 仍不依赖加载顺序或当前窗口残留事件。
2. Desktop Session Host 在提交 message/Skill 或 inbox message 前把 Canvas target 进入 DSH Session 的 FIFO admission；
   `turn/start` 把队首 target 绑定到该真实 turn。Tool completion 与 `turn/end` 只读取该 turn target，绝不读取当前 UI。
3. Desktop composition 分别调用 package-owned completed-tool collector 或 terminal collector。
4. completed-tool collector 只读取精确 `toolCallId` 对应的 completed content Tool。terminal collector 读取该
   turn 的 final assistant messages 和 completed content Tool events。Document source
   来自完成结果中的 canonical `ContentLocator`，并与 Content-owned decoder 解析出的请求 locator 严格
   比对；Content image source 使用同一 decoder 验证已成功消费的输入。内部 ACP envelope 不参与 DSH
   event decoding。
5. collector 按 `contentLocatorKey` 合并 source；completed-tool delivery 立即提交 source-only batch。Workspace
   成功终轮存在非空 final Markdown 时，application workflow 先用内容 hash 派生稳定的
   `neko/generated/file/<title>-<hash>.md` locator，经 Content writer 原子发布；已存在路径只有在 bytes 完全一致时
   才视为同一幂等发布。随后创建 file-reference analysis artifact；若本轮消费了来源，则通过
   `sourceArtifactIds` 关联全部 source。若本轮没有 Content Tool，计划、文案等 source-free final Markdown
   仍作为一个独立 durable file node 投影；若本轮尝试了 Content Tool 但没有任何 canonical successful source，
   则不把失败说明伪装成完成的分析产物。
   对 exact document-entry 结果，collector 同时读取 Content-owned `excerpt.contentKind` 与
   `imageInfo[].contentLocator` 关系；image-only wrapper 直接以其已声明图片 source 取代可见
   file-reference，后续成功的 Content Image Tool 对相同完整 locator 只会复用。文本、mixed 和文件级 source，
   不按 EPUB 内部文件名或扩展名猜测。
6. Desktop delivery adapter 解析 Conversation 的精确 Workspace binding 与 turn target，生成稳定 `deliveryId`，先恢复
   ledger 中已有 pending delivery；仅对新的 delivery 读取 source fingerprint 并入账，再在 Canvas runtime
   的 Workspace Board mutation queue 中 load-plan-save。
7. Canvas projector 按 locator 复用资源节点；analysis 使用 `text/markdown` file-reference，`.nkc` 只保存 locator、
   provenance、布局与关系。Webview 通过既有 Host text-preview port 授权读取文件并默认按 Markdown 渲染；用户手工
   创建的 inline Markdown 节点仍保留正文与编辑语义。ledger 不复制 Markdown body。

## Identity and deduplication

- `ContentLocator` 保持纯定位 contract；不得新增 fingerprint、mtime、absolute path 或 runtime URL。
- locator-backed source node identity 是 `contentLocatorKey(locator)`；同一资源位置的重复读取只对应一个节点。
- source `artifactId`/`sourceId` 从 canonical locator key 稳定派生；collector 的 `locator:` observation 只用于
  Host 前的稳定批次。Desktop 在首次入账前以 Content Read authority 返回的真实 fingerprint 替换该值。
- source fingerprint 只表达内容新鲜度，不参与 locator-backed Canvas node identity。指纹变化时 planner 只
  更新节点 provenance，保持 node id、locator、位置、尺寸与用户编辑；已打开的文本和媒体预览把该值作为
  重新读取信号。
- analysis `artifactId` 与稳定文件 locator 从排序后的 source artifact identities、分析类别和 canonical final
  Markdown 派生；`contentFingerprint` 只由 Markdown bytes 派生，正文不进入 Canvas request 或 ledger。
- completed-tool `deliveryId` 从 Workspace、Conversation、DSH Session、turn、精确 `toolCallId` 和 Canvas target
  派生；terminal `deliveryId` 从 Workspace、Conversation、DSH Session、turn 和 target 派生；时间戳不参与。
- 同一 turn 的重复 terminal notification 命中同一 ledger task/receipt；同一 batch 内重复 Tool locator 在
  collector 中先合并；不同 turn 产生完全相同的 source/analysis graph 时 Canvas planner 返回 node/connection
  reuse 或 noop。
- locator 去重与文档语义折叠分层处理：前者只比较完整 `ContentLocator`；后者只使用 Document result 已声明
  的 image-only wrapper → embedded image 关系。Canvas 不渲染或执行原始 EPUB HTML，Content owner 继续负责
  文档解析和安全的文本/图片投影。
- completed content Tool 的 projection decode 以单个 tool-call 为最小失败边界。参数、结果 JSON、canonical
  source 或请求/结果 locator 不一致时，collector 记录包含 `toolCallId` 与 Tool 名的 diagnostic 并排除该
  source；有效 sibling 仍参与同一 terminal batch。该行为不是把非法结果伪装为成功，transcript 和 Host
  diagnostic 都保留失败事实。
- Board 是内容索引而不是 Tool 调用日志。collector 只按完整 `ContentLocator` 去重，不得因为多个 locator
  共享同一个 `file` 就把不同 page、entry 或 text-range selector 收敛成根文件；否则跨应用定位信息会丢失，
  Board 也无法展示 Agent 实际消费的内容位置。唯一允许的语义折叠是 Content result 明确声明的
  image-only wrapper → embedded image 关系。该规则不猜测 EPUB 内部
  `page`/`moe` 文件名，也不执行 HTML。

## Commit timing and failure semantics

受支持的 content Tool 只有在 completed projection 可通过 canonical decode 时才立即提交 source-only batch；
pending、in-progress、failed 或非法 projection 不提交。成功 `turn/end` 再提交一次包含最终 Markdown 与关系的
terminal batch。`interrupted`、`max-tokens` 或未完成 assistant stream 不提交分析，但先前已成功 Tool 的 source
保持可见。单个 content Tool 失败只排除该 Tool，失败记录仍在 transcript 与 Host diagnostic 中 fail-visible，
不能伪装为 Canvas source。
Markdown publication 失败时不得提交 analysis Canvas delivery；Canvas delivery 失败只记录当前 delivery 的
blocked/conflict diagnostic，不改变已发布 Markdown、已保存 transcript、源文件或
其他 Workspace。不得回退到 active/recent Workspace、另一个 Canvas、renderer mutation 或 raw `.nkc` 写入。

## Runtime boundary and replaced path

- **Producer:** `packages/agent/runtime/src/application` DSH completed-tool/terminal collector、turn target owner 与
  durable Markdown publication workflow。
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
