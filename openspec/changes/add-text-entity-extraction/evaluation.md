# Evaluation Plan

## Evaluation Scope

- **Change/feature:** Agent 通过 VS Code Webview `@` 搜索选中 Entity 后，在 turn 边界读取 canonical `CreativeEntity` 项目事实，而不是只把搜索 label/summary 发给 provider。
- **Authoring decision:** `create` 一个 Entity context grounding 的真实行为 case 目前被 Evaluation ownership 与输入可观测性阻塞。`change-selector.mjs` 对 `packages/neko-agent/packages/agent/src/runtime/turn/message-runtime.ts` 返回 `unmapped-coverage`，且 canonical TUI controller 没有等价的 VS Code Webview Entity attachment 输入操作；不得把普通文本、direct turn injection 或 mock provider 当作替代证据。
- **User behavior:** 用户选择 Entity 引用后，Agent turn 能看到该 workspace 中该 Entity 的 canonical name、kind、aliases、status 和 metadata。
- **Canonical path:** Project Search thin projection → Webview `AgentContextPayload(type = "entity")` → Extension conversation/workspace resolution → Entity facade `getEntity` → strict resolved Entity context → Agent turn formatter → provider prompt。
- **Forbidden fallback:** Webview 自报的 resolved snapshot、薄 label/summary、active workspace、多根目录猜测、kind 不匹配结果、缺失 Entity 和未确认 Entity 均不得作为成功上下文进入 provider。

## Coverage Delta

- **canonical / regression:** Extension 集成测试断言 Entity facade 被命中，provider prompt 包含 facade 返回的 canonical facts，并证明 Webview 伪造 metadata 不参与。
- **failure / boundary:** 确定性测试覆盖 Entity 缺失、kind 不匹配和 multi-root conversation 无法绑定 workspace；这些路径均在 provider dispatch 前失败。
- **paraphrase / workflow / artifact / quality / holdout:** 本次不新增模型判断、异步工作流或持久产物；真实模型对 Entity facts 的主观使用质量未评估。若未来新增 Entity 专用推理指导、Tool 路由或 TUI attachment 输入，必须先补 selector owner、一个 canonical case 和一个 failure case。
- **Expected fail-visible behavior:** 不可信或无法解析的 Entity context 抛出明确错误，并且 provider turn 不启动；Agent runtime 单独收到 unresolved Entity context 时同样拒绝格式化。

## Verification

- `pnpm test:agent:eval`：通过，39 个文件、278 个测试；all-suite dry-run 发现 23 个 suite、47 个 case。该结果只证明 Evaluation harness/schema 完整，不是 Entity 行为验收。
- 聚焦 shared/runtime/Extension 测试验证 resolved contract、formatter、Host facade 路径和 forbidden fallback。
- VS Code Extension Development Host 已验证普通 `@小` 菜单选中小橘后，textarea query 清空、菜单关闭，并生成一个 `data-agent-context-type="entity"` / `data-reference-kind="entity"` 的 removable attached reference token。脱敏截图位于 gitignored `reports/webview-functional/entity-mention-attached.png`；该 UI 证据不替代 provider-backed Agent Evaluation，fixture 中仅有 Candidate，因此未发送 provider turn。

## Residual Risk

- 尚无可由 canonical TUI input queue 表达的 Entity attachment operation，因此没有 provider-backed real Agent case，也不能评价不同模型是否稳定利用 metadata。
- Evaluation selector 尚未拥有 generic turn context formatter 路径；在补齐 owner 与可观测输入前，相关真实 case必须保持 blocked，不能归入方便但不准确的现有 suite。

## Character Dialogue Stable Entity Handoff

### Evaluation Scope

- **Change/feature:** 角色扮演选择器提交 confirmed character Entity 的稳定 ID 后，Character Dialogue 直接形成 `CreativeEntityRef` 并启动 canonical profile assembly。
- **Authoring decision:** `create`，但被 Evaluation ownership 与 canonical input 阻塞。`change-selector.mjs` 对 `packages/neko-agent/packages/extension/src/chat/characterDialogueController.ts` 返回 `unmapped-coverage`；canonical TUI controller 也没有等价的 VS Code roleplay Entity selection operation。
- **Canonical path:** Project Search confirmed Entity → Webview roleplay selection → `startCharacterDialogueFromSlash(entity:<id>)` → Webview router → Character Dialogue explicit `CreativeEntityRef` → canonical profile assembler。
- **Forbidden fallback:** 把 stable ID 当名称交给 `resolveByName()`、Quick Pick、active Entity、projected label、其他 workspace 或 direct/mock turn injection。

### Cases and Evidence

- **canonical / regression:** 确定性 Search、Webview、router 与 controller 测试证明 canonical `entityId` 原样到达 profile assembler，且名称 resolver/picker 未参与。
- **failure / boundary:** unresolved explicit Entity 由 assembler 返回明确 missing-entity diagnostic；名称 resolver/picker 不参与，也不改写成“未选择角色”。
- **paraphrase / artifact / quality / holdout:** 不适用。本次不改变 prompt、provider/model、角色回复内容或持久产物。
- **Missing observability:** 当前外部 Evaluation 无法通过 canonical TUI input queue 发起 VS Code Character Dialogue Entity selection，也没有该 Extension workflow 的 owner suite/runtime facts。

### Verification and Residual Risk

- `pnpm test:agent:eval` 只验证 key-free Evaluation harness、schema、runner 和 indexed suites，不作为 Character Dialogue 真实行为验收。
- provider-backed Character Dialogue case 未运行；在 selector owner、canonical roleplay input 与 runtime facts 补齐前保持 blocked。
- Extension Development Host 的最终 UI/Agent 行为仍需在 Agent Webview 成功激活后验证，不能由确定性测试替代。

## Removed Dashboard Surface Cleanup

### Evaluation Scope

- **Change/feature:** 删除无 UI owner 的 Dashboard creative-entity 聚合、命令、Search/Inspector/Canvas/Agent fallback，并将仍存活的异步任务镜像改为宿主中立的 `TaskProjection`。
- **Authoring decision:** `extend` 现有 Character Dialogue handoff disposition，不新增 provider-backed case。该清理改变 capability/search routing 与 Character Dialogue 输入资格，但不改变角色回复 prompt 或模型评分标准。
- **Canonical path:** confirmed Entity registry → canonical Entity Search adapter → stable `CreativeEntityRef` → Character Dialogue assembler；Inspector refresh 使用同一 `VSCodeEntityRuntimeRegistry` change event；Agent/Chat 异步恢复使用 `TaskProjection`。
- **Forbidden fallback:** Dashboard DTO/source/state command、Dashboard row projection、Candidate/script-role 直接进入 dialogue、source-specific ID conversion、`DashboardTask`/`DashboardProject` alias、Dashboard-named Agent work-item source。

### Cases and Evidence

- Agent Extension 全包通过：83 个文件、629 个测试通过、6 个跳过；包含 confirmed-only roleplay query、explicit Entity handoff、Inspector canonical refresh、TaskProjection replay/cancel/retry 路径。
- Agent Webview 全包通过：96 个文件、783 个测试；生产构建生成内容哈希 asset manifest。
- Entity 全包通过：18 个文件、80 个测试；canonical service/evidence/Inspector projection 路径通过。
- `pnpm test:agent:eval` 通过 39 个文件、278 个 harness 测试及 23 suite/47 case dry-run；它仅证明评估基础设施未回退，不是 provider-backed Character Dialogue 质量证据。
- Extension Development Host/CDP 可正常激活 Agent Webview并打开角色扮演菜单；当前 `neko-test` workspace 没有 confirmed character，菜单按 contract 显示“未找到已确认的可扮演角色”，console 只有 Chromium `local-network-access` feature warning。脱敏截图位于 gitignored `reports/webview-functional/dashboard-removal-roleplay-empty.png`。

### Residual Risk

- 当前 Development Host fixture 没有 confirmed character，因此本轮运行态只验收了 removed-Dashboard 后的激活、菜单和 fail-visible empty state；confirmed Entity 选择、profile assembly 和首轮角色回复仍由确定性 Webview/Extension 测试覆盖，尚未完成同一 Host 中的端到端点击验收。
- provider-backed Character Dialogue case 仍受 canonical TUI input/selector owner 缺失阻塞；不能用 direct turn injection 或 mock provider 替代。

## Explicit Roleplay Candidate Confirmation

### Evaluation Scope

- **Change/feature:** 普通 `@` 菜单中的 open semantic Candidate 或具名 context-script Candidate 可通过用户显式“确认并扮演”进入 Character Dialogue，同时 UI 不再把 Candidate 伪装成已确认 Entity。
- **Authoring decision:** `excluded` from provider-backed Agent Evaluation。该路径是确定性的 VS Code Webview → Host Search re-resolution → Entity facade mutation → Character Dialogue handoff，不改变 prompt、Skill、Tool routing、provider/model 或角色回复语义；现有 Evaluation coverage index 也没有 VS Code Candidate selection owner。
- **Canonical path:** canonical Entity adapter combines Entity facts + compact automatic-candidate projection → stable Project Search item identity → Host exact re-resolution → verified open automatic or named context-script Candidate → Entity facade propose/confirm → returned confirmed `CreativeEntityRef` → Character Dialogue assembler。
- **Forbidden fallback:** Webview label/kind/metadata 直接写事实、Candidate 直接进入 dialogue、自动 analyzer 写 `candidates.json`、名称猜测、active Entity、Dashboard command 或 stale Search projection。

### Evidence and Verification

- Development Host 已捕获普通 `@小` payload：小橘/小灰是 `candidate:auto:character:*`、`status=open`、来源为 `workspace:cases/test.fountain`；项目中不存在 confirmed character fact。该证据复现了“能搜索但无法扮演”的真实症状。
- 以 deterministic protocol/Search/router/controller/Webview tests 证明 selected Search identity 被 Host 重新解析，facade propose/confirm 被命中，返回 stable Entity ref 后才启动 Character Dialogue；stale/wrong-kind/facade failure 均不启动。
- 隔离 Extension Development Host fixture 已完成端到端点击：automatic Candidate 经显式确认后只显示一条 confirmed 小橘，进入 `Character Dialogue: 小橘`；捕获的 Host → Webview 消息仅包含角色 session started、tab state 与 projection snapshot，不再出现 `unknown-conversation`。角色 tab 恢复回归测试同时断言不会用 role session ID 请求普通 conversation snapshot/settings。脱敏截图位于 gitignored `reports/webview-functional/roleplay-confirm-and-launch.png`。
- 质量审查发现并消除了展示分页耦合：Host 现在以 stable item identity 做 Project Search 精确重查询，Search normalization 将 item ID 纳入匹配，确认操作不再依赖空查询前 30 条。Search normalization 4 项与 roleplay Search 9 项回归通过；最终 Extension bundle 编译通过。该分页加固在确定性 Search/Host 路径验证，未再次重复已完成的 Dev Host 点击。
- 聚焦 Extension 5 个文件 120 项（另 6 项跳过）、Webview 角色路径 4 个文件 127 项、Candidate label 1 项、Agent protocol 36 项、Entity 全包 82 项均通过。`openspec validate add-text-entity-extraction --strict` 与 `git diff --check` 通过。
- `pnpm test:agent:eval` 通过 39 个文件、278 项及 23 suite/47 case dry-run；它仅作为 key-free harness 回归门禁，不描述为 provider-backed roleplay 验收。

### Quality Gate Residuals

- Webview 全包当前为 782/786 通过；4 项失败来自同一工作树中未收口的 account SSO/model group 与 removed Sketch transfer 迁移，不命中 roleplay 文件或路径。Agent Extension 全包此前也被同一批 removed plugin transfer 路径阻塞，聚焦 roleplay 路径通过。
- 受影响包 typecheck 仍被工作树中的 `neko-types` NKA/project/canvas headless、Agent capability/config/generated-output/semantic 与 `neko-client` AudioStreamClient 既有错误阻塞；raw Agent Extension 与 Webview Vite 构建通过。
- `pnpm check:legacy-debt` 被 Canvas `GroupNode.tsx` 两处 `legacyDefault` 阻塞；`pnpm check:unused` 被已删除 Webview functional scripts 的 knip entry 及 root `ws` devDependency 阻塞。这些均不在本次角色确认实现中，未用兼容分支绕过。
- Neko quality review 按跨 Extension/Webview/persistent Entity mutation 的高风险路径检查了身份重解析、写入 owner、失败可见性、tab 生命周期和 Dashboard 旁路；未发现本次范围内剩余阻断性问题。provider-backed 角色回复质量仍受 canonical Evaluation input/owner 缺失阻塞。
