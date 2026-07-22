# Evaluation Plan

## Evaluation Scope

- Change/feature: `unify-agent-workspace-board-delivery`，覆盖 TUI/VS Code/后台 Host 的 typed artifact delivery、实际素材证据、Markdown/生成结果投影、持久恢复和禁止 fallback。
- Decision and owning suite: `update` `agent-runtime.creative-media-workflow`；更新 `generated-output-workspace-board` 并新增 `workspace-board-material-analysis`。`update/create` `agent-runtime.workflow-controller` 的 `workspace-board-delivery-resume`。双 Host并发、SQLite状态机、explicit target no-mirror和 Canvas planner为 `excluded` real Agent behavior，使用 deterministic integration验证。
- Why real Evaluation is required: 变更影响 TUI session owner、后台 Task terminal delivery、artifact result projection、跨重启恢复和 TUI debug facts；key-free contract tests不能证明真实 Agent通过 canonical TUI产生并投递正确 artifact。
- Canonical path and forbidden fallback: TUI input queue → Agent/Pi turn或background Task → durable source/artifact evidence → Canvas-owned delivery ledger → fenced coordinator → `neko/boards/workspace.nkc`。禁止 direct turn runner、VS Code-only API、旧 `NodeWorkspaceBoardProjector`/`projectGeneratedAssets`、AssetLibrary前置、active/recent Canvas、generic Send to Canvas、direct `.nkc` fallback和SQLite重建 Board。

## Cases

- Reused, updated, created, or excluded:
  - `update` `agent-runtime.creative-media-workflow/generated-output-workspace-board`，保留真实生成正例并增加 ledger、writer epoch、顶层内容节点、receipt与legacy writer/visual Group poison。
  - `create` `agent-runtime.creative-media-workflow/workspace-board-material-analysis`，使用隔离 fixture中的已选/未选素材，要求真实读取已选素材、生成命名reviewable Markdown artifact，并自动投影去重的 source+analysis 顶层节点和 `derived-from` connection。
  - `create` `agent-runtime.workflow-controller/workspace-board-delivery-resume`，在delivery持久化后终止首个TUI owner，由第二 owner接管并完成一次投影。
  - `excluded` multi-Agent file race、stale epoch、crash-after-save-before-receipt、explicit Canvas no-mirror、SQLite corrupt/unsupported runtime；这些不依赖模型判断，由双 store/双 coordinator、poison adapter和revision tests确定性证明。
- Evidence and coverage:
  - canonical: Tool/task/turn终态、stable ResourceRef/artifact snapshot、delivery ledger status、writer epoch、Canvas revision/node IDs、terminal idle。
  - artifact: owning ResourceRef validator、Markdown artifact digest、`.nkc` codec/Canvas validator、canonical content node identity、connection identity及role/provenance路径断言；`workspace-inbox`/`workspace-process-*` 作为禁用路径。
  - workflow: enqueue → claim → save → receipt顺序，以及restart/takeover后同一delivery identity。
  - boundary/failure: 未使用fixture素材不投影；无workspace、blocked ledger、stale epoch、active Canvas fallback、AssetLibrary/legacy writer参与均失败。
  - regression: current generated image delivery、task continuation、conversation persistence resume保持通过。
  - quality/paraphrase/holdout: 不适用；本变更验证确定性artifact delivery，不评价内容审美或Prompt触发质量。
- Missing observability:
  - TUI facts需增加脱敏的delivery identity hash、status、artifact role counts、target kind、writer epoch、result revision/node IDs与diagnostic codes。
  - facts不得包含Markdown正文、绝对路径、DB path/table、lease holder原值、token、SQL或原始异常。

## Verification

- Key-free validation: `pnpm test:agent:eval`；对新增/更新case运行 `protocol-smoke --dry-run`；更新all-suite count和change-selector/coverage-index tests。
- Real cases and reports:
  - `agent-runtime.creative-media-workflow/generated-output-workspace-board`
  - `agent-runtime.creative-media-workflow/workspace-board-material-analysis`
  - `agent-runtime.workflow-controller/workspace-board-delivery-resume`
  - 报告保存在gitignored `reports/agent-eval/<suite>/<case>/<run-id>/`，交付仅记录脱敏summary、artifact manifest和residual risk。
- Blocked or unexecuted cases: provider credential、network/model、TUI build或fixture不可用时记录`infrastructure-blocked`；不得使用mock/direct runner替代，也不得把dry-run描述为真实Agent验收。

## Interpretation

- Result and quality comparison: 只解释assertion-level canonical path、artifact、workflow、failure与no-fallback hard gates；content quality标记为`hard-gates-only/not-evaluated`。
- Confirmed failures vs attribution hypotheses: 缺stable artifact、错误target、ledger未持久、lease fencing缺失、`.nkc` artifact无效或legacy fallback参与是确定性失败；Provider输出内容偏差与基础设施故障分开记录，不归因给Board delivery owner，除非证据证明。

## Residual Risk

- 真实TUI case不能完全覆盖VS Code打开且dirty的Canvas editor竞争；该路径必须由Extension Development Host功能场景和deterministic revision/lease integration共同验证。
- 本地SQLite和文件系统崩溃窗口依赖实现后的fault injection测试；单次真实Agent成功不能证明并发安全。
- 若新增facts在bounded collection中被截断，case应blocked而不是用最终回答或`.nkc`结果反推canonical path。

## Native Image Analysis Refinement (2026-07-22)

- Authoring disposition: `update` existing `agent-runtime.creative-media-workflow/workspace-board-material-analysis`; the case now owns native `ReadImage.analysis=storyboard` finalization instead of requiring the model to explicitly author a composite artifact.
- Canonical evidence: one successful `ReadImage` call with a stable selected-image locator, a `source` ResourceRef fact, one `native-image-analysis` composite fact derived from the terminal Markdown, projected Workspace Board node/connection facts, zero fallback counters, and terminal idle.
- Key-free evidence: `pnpm test:agent:eval` passed 39 files / 281 tests; the focused protocol dry-run passed with the updated exact locator and six hard assertions.
- Real behavior evidence: run `board-native-image-analysis-20260722-r4` passed all six hard assertions with effective model `nekoapi-chat/gpt-5.6-luna`. The report is gitignored under `reports/agent-eval/agent-runtime.creative-media-workflow/workspace-board-material-analysis/board-native-image-analysis-20260722-r4/`.
- Attribution: an earlier run used a stale pre-build TUI bundle, and another returned an external provider `Service temporarily unavailable` response with no final content. Neither was accepted as Board success; the succeeding rebuilt run is the acceptance evidence.
- Content quality remains `hard-gates-only/not-evaluated`; this case proves routing, durable evidence, finalization, and projection rather than judging the prose.
