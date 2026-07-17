# Agent Evaluation v2 测试设计指南

本文说明如何把 Prompt、Skill、Capability/Tool、Provider/Model、
`AgentSession`、任务恢复、产物或 TUI 行为变更转成可执行 Evaluation。
严格字段与 evaluator 以 `schemas/contracts.mjs` 和 runner 实现为准；本文不作为
平行 schema。

## 1. 先做 New Evaluation 决策

每个可能改变模型驱动行为的变更，对每项受影响行为只能选择一种决策：

| 决策       | 使用条件                                         | 必须记录                           |
| ---------- | ------------------------------------------------ | ---------------------------------- |
| `reuse`    | 既有 suite/case 已完整覆盖新行为                 | suite、覆盖证据、无需修改的原因    |
| `update`   | owner 未变，但行为、证据、fixture 或矩阵需要调整 | suite、coverage delta、更新内容    |
| `create`   | 没有正确 owner 或独立行为边界                    | 新 suite id、owner、最小首批 cases |
| `excluded` | 变更不会改变真实 Agent 行为                      | 确定性验证命令及排除理由           |

先用 `authoring/change-selector.mjs` 检查 changed path 的确定性 owner。selector
无法映射时应补充 ownership/coverage，而不是选择最接近的默认 suite。

Authoring decision 使用 `neko.agent-eval.authoring-decision.v2`，并包含：

- `behaviorId` 与 target；
- `decision` 以及既有或拟建 suite id；
- user behavior；
- evidence contract；
- 覆盖全部 case group 的 coverage delta；
- `excluded` 时的 deterministic validation。

Skill target 必须使用完整 Host identity：portable `name`、`source`、
`provenance`、`rootId`、`relativePath` 和 Host-computed `fingerprint`。同名 Skill
不能只靠名称或隐藏优先级选择。fingerprint 表示当前开发内容快照，不得用 Market
package id、semver、发布或安装状态替代。

## 2. Evidence contract 先于提示词

每个 case 在编写 prompt/steps 前先回答：

1. 用户能观察到什么行为？
2. 哪条 canonical runtime path 必须执行？
3. 哪些 legacy、默认值、替代 Skill/Tool/model 或 fallback 禁止参与？
4. 哪些 runtime facts、post-check、artifact validator 或 output contract 能证明路径？
5. 成功结果是什么？
6. 失败时应如何 fail-visible？

至少一个 observable 必须是 required。仅有最终回答文本、退出码、Judge 分数或
人工判断不构成 path evidence。需要的 facts 或公开 validator 不存在时，case 状态是
blocked by missing observability；不要把弱文本匹配改写成通过。

## 3. 测试范围

每项行为都要审阅下列范围，适用项进入 case，不适用项在 coverage delta 中写明原因。

| 范围            | 应验证的问题                                                                   | 主要证据                             |
| --------------- | ------------------------------------------------------------------------------ | ------------------------------------ |
| 输入规范        | 空值、边界、歧义、locale、多轮顺序、非法配置是否明确处理                       | schema、diagnostic、workflow trace   |
| 输出规范        | 格式、字段、表格、引用、locale、禁止字段是否满足                               | structured-output hard gate          |
| Skill 激活      | 正向、改写、邻近负向请求是否触发正确 Host identity                             | Skill trigger/injection facts        |
| Tool/capability | 正确 Tool、参数/结果状态、错误路径、无 fallback                                | Tool facts、task facts、no-fallback  |
| 模型与开关      | requested profile 是否等于 effective provider/model/runtime config             | configuration digest、model facts    |
| 流程进度        | queue、turn、task、continuation、cancel/resume/recovery 是否有序并最终 idle    | workflow/process assertions          |
| 产物规范        | 稳定 identity、格式、digest/revision、provenance、delivery、validator 是否成立 | artifact facts、contained post-check |
| 输出质量        | 相关性、完整性、具体性、一致性、恢复建议是否达到领域要求                       | hard gates 后的领域 rubric/Judge     |
| 产物质量        | Canvas/Storyboard/图片/视频等真实文件是否通过 owning validator                 | domain QualityEvidence               |
| 审美规范        | 构图、节奏、连续性、风格等主观标准是否基于可见证据                             | domain rubric、多样本 Judge          |
| 稳定性          | 多次采样的通过率、方差、延迟、token、重试是否可接受                            | aggregate report                     |
| 安全与隐私      | 权限、路径 containment、secret、隐藏 prompt、未授权内容是否泄露                | redaction/adversarial assertions     |

运行时配置矩阵只能声明 canonical TUI 已支持的 session-scoped immutable
setting。每个 variant 都必须从 facts 证明 effective config。Evaluation 不向生产
runtime 添加测试专用开关。需要移除某个内部实现的消融实验，应由外部 Evaluation
比较隔离 revision/build；Agent 内置代码只拥有正常产品配置和中立指标。

“模型性能/质量对比”如果用于描述回答好坏，必须指真实输出内容的语义评估，而不是
格式通过率。必须明确分开：hard gates 证明 correctness；latency/token/cost/iteration
等证明执行效率；suite-owned rubric/Judge 评价相关性、约束满足、推理、具体性、
一致性以及适用的创作或审美质量。`hard-gates-only` 只能报告内容质量未评估，不能
生成 quality score。只有真实 Judge 样本可以进入 score distribution 和
`qualityMean`。

### Ablation authoring

Ablation plan 使用严格 `neko.agent-eval.ablation-plan.v1`，默认只允许一个 baseline
和单维 variants，最多 20 个 variant。多维 interaction 必须附证据；未知字段、笛卡尔积、
`__ablation`/eval-only flag、缺失 expected config/build identity 会在启动 TUI 前失败。

- configuration variant 只能选择 suite 已声明的 `temperature`、`maxTokens`、
  `thinkingBudget`、`outputFormat` 或 model profile，并同时绑定 profile id/hash；每个
  sample 必须观察到 matching effective digest。
- implementation variant 必须绑定 source revision/fingerprint、可选 patch/fingerprint、
  build recipe、executable、launcher 和 development checkpoint。Skill variants 保持相同
  Host identity，base/variant package fingerprints 必须不同；不得使用 Market semver 或
  publication state。
- 每个 variant 复用同一 indexed suite/case、fixture、model、budget、hard gates、validator
  和 quality policy。implementation 只允许 target fingerprint/revision/build identity
  发生计划内差异；其余漂移返回 `non-comparable`。
- `scenario-rubric` 的 plan ref 必须与 scenario ref 完全一致，并由 suite 声明 Judge
  profile 和 rubric 文件；mismatch 在 TUI 启动前失败。消融 Prompt/Skill 指导时，用户
  prompt 和 invariant hard gates 不得重新注入被移除的内容；该维度的差异由 rubric
  评价。
- blind Judge 不接收 candidate label、revision、patch、build identity 或 Skill variant
  fingerprint。完整身份只进入外部 report/hard-gate evidence。

执行入口为 `node scripts/agent-eval/ablation/run.mjs --plan <id>`；`--dry-run` 只验证
authoring 与 selection，不是行为验收。每个 sample 继续生成标准报告，matrix 只增加
`variant-delta.json`，汇总 pass/hard gates、tokens/cost、p50/p95 latency、iterations、
Tool/retry/task 和适用的真实输出内容 quality，不得用效率收益覆盖 correctness failure，
也不得把 hard-gate/格式通过映射成 content quality。

## 4. Case group 选择

| Group        | 目的                                                  |
| ------------ | ----------------------------------------------------- |
| `canonical`  | 最小正向主路径                                        |
| `paraphrase` | 同一意图的不同表达仍稳定触发                          |
| `boundary`   | 相邻但不应触发，或输入/配置边界                       |
| `failure`    | 缺依赖、拒绝、非法、provider/Tool 失败时 fail-visible |
| `workflow`   | 多轮、queue、feedback、task、cancel/resume/recovery   |
| `artifact`   | durable artifact 与 owning validator                  |
| `quality`    | hard gates 通过后的领域质量或审美                     |
| `regression` | 已知缺陷、旧路径或错误路由不得回归                    |
| `holdout`    | 不暴露给候选优化过程的独立验证样本                    |

最小新增行为通常需要一个 canonical case 和一个 failure/boundary case。会写入持久
产物的 Skill 还需要 artifact case 和适用 regression。修改 Prompt/Skill 时应至少
考虑 paraphrase、邻近负向触发和 holdout，避免只优化一个公开 prompt。

## 5. Suite 与 Scenario v2

`suite.json` 声明 owner、target identity/hash、repository revision、runtime/model
profiles、Judge profiles、isolated fixtures、case index、rubric refs、baseline policy
和 report policy。Skill suites 位于 `suites/skills/<skill-id>/`；其他 Prompt、
Capability、Tool、Model、Runtime、Workflow suites 位于
`suites/agent-runtime/<owner>/`。新增 suite 后必须同步对应严格 index 和
`coverage-index.json`。

每个 case 文件使用 `neko.agent-eval.scenario.v2`，并声明：

- suite/case id、case group 与 public/holdout visibility；
- evidence contract；
- 一个隔离 fixture、runtime profile 和当前 runner 支持的一个 model profile；
- 有序 steps；
- hard assertions 与 artifact checks；
- timeout/repetition budget；
- 可选的 domain rubric。

当前 controller 支持 `submit`、延迟 `submit`、`queue`、`wait-for-idle`、`cancel`、`resume`、
closed-loop `feedback` 和 terminal `resize`。活跃 turn 中的新用户输入必须使用
`queue`；case 必须以 terminal idle 收敛。每条消息都通过 TUI input queue，不能直接
注入 Agent turn 或 history。

当前 hard gates 覆盖 runtime error、fully idle、canonical turn、final answer、
Skill identity/status、prompt composition、Markdown path、model/no-fallback、Tool call、
task terminal、process order、queue state、cancellation、recovery、retry、terminal
concerns、structured output、artifact 和 forbidden refs。新增 assertion kind 前必须先
实现 evaluator 与 key-free 失败测试；metadata-only 字段会被 strict validation 拒绝。

Artifact check 只能访问隔离 fixture 内的相对路径或稳定 runtime ref。路径 traversal、
symlink escape、cache/Webview/temp identity、secret-bearing content 和 target package
内部业务 import 必须被拒绝。validator 使用公开 allowlist，不能在通用 runner 中复制
领域业务规则。

## 6. Judge、重复采样与 Baseline

Judge 只评价主观质量，并且仅在 hard gates 通过后执行。输入限制为 user intent、
公开 target contract、assistant output、批准的 artifact summary、domain
QualityEvidence 与 hard-gate result；不得读取 hidden prompt、credential、raw log、
未授权文件、candidate label 或 repository diff。

报告必须记录 Judge provider/model/profile、rubric/version、prompt hash、sampling、
evidence refs、评分理由与 uncertainty。Judge 不可用或响应非法属于 infrastructure
failure；高分不能覆盖 path、权限、schema、任务终态、产物或 no-fallback 失败。

重复采样保留全部 sample，并汇总 pass rate、hard gates、score distribution/variance、
token、cost availability、mean/p50/p95 latency、iterations、Tool calls/success、retries 和
task terminal metrics。禁止选择最好的一次作为结论。

Approved baseline 只能使用脱敏证据，并绑定 target identity/fingerprint、repository
revision、fixture digest、runtime/model profile、sampling/budget、validator/Judge
policy、hard gates、score distribution、approver 与时间。输入维度不一致时返回
`non-comparable`，不能计算“提升百分比”。

## 7. 当前 Suite Catalog

Skill suites：

- `skill.skill-creator`、`skill.storyboard`、`skill.image`、`skill.video`、
  `skill.media-production`、`skill.media-quality-review`；
- `skill.scene-to-music`、`skill.video-editing`、`skill.color-grading`、
  `skill.audio-mixing`、`skill.subtitle-assistant`、`skill.script-generation`、
  `skill.script-to-timeline`；
- `skill.evaluation-artifact-author` 用于平台自身的 Skill/artifact pilot。

Agent-runtime suites：

- `agent-runtime.single-message-tui`；
- `agent-runtime.prompt-composition`、`agent-runtime.skill-runtime`；
- `agent-runtime.model-binding`、`agent-runtime.perception-routing`；
- `agent-runtime.workflow-controller`、`agent-runtime.stream-delivery`、
  `agent-runtime.tui-markdown`；
- `agent-runtime.creative-media-workflow`。

`suites/coverage-index.json` 是 builtin Skill、Prompt layer、Agent runtime capability
以及全部 v1 case 的覆盖台账。schema/ephemeral prompt layer 等无法由通用 TUI 控制
设置的状态采用显式 deterministic exclusion；私有 EPUB 等不可提交 fixture 的旧
case 也必须记录排除原因，不能假装已迁移。

## 8. 渐进验证与报告判读

先运行 key-free 全量 harness：

```bash
pnpm test:agent:eval
```

再 dry-run 一个选中的 indexed case：

```bash
node scripts/agent-eval/protocol-smoke.mjs \
  --suite agent-runtime.workflow-controller \
  --case cancel-resume-recovery \
  --dry-run
```

具备真实 provider/model/config/fixture 时，移除 `--dry-run` 执行同一 case。修改多个
owner 时逐 suite 运行；稳定性或质量结论使用 repeated run，而不是单次样本。

每次 sample 的标准文件是 `result.json`、`evidence.json`、
`artifact-manifest.json`、`quality-report.md` 和 `summary.json`；执行相应阶段时增加
`judge.json`、`baseline-diff.json`，重复采样增加 `aggregate.json`。

判读顺序：

1. outcome 和 failure classification；
2. requested/effective model 与 configuration identity；
3. assertion-level status、evidence refs 与 dropped counts；
4. forbidden fallback、artifact validator 和 terminal task/process evidence；
5. Judge/aggregate/baseline comparability；
6. skipped stages、cost availability 与 residual risk。

`pass` 只表示当前已执行契约通过。`case-fail` 表示目标行为或质量失败；
`infrastructure-fail`/`infrastructure-blocked` 表示凭据、网络、模型、配置文件或 runner
基础设施不可用；`configuration-invalid` 表示 suite/scenario/profile/effective config
不合法；`non-comparable` 表示不能对 baseline 声称改善。

## 9. CI、脱敏与交付证据

默认 PR CI 只运行 key-free harness 和 all-suite dry-run。可信 focused/nightly workflow
只在 `main` push、schedule 或 manual dispatch 执行，不在 fork PR 或
`pull_request_target` 上读取 secrets。缺少 credential/config 时应生成 blocked summary
并返回 exit 2，不能切换 mock lane。

原始报告写入 gitignored `reports/agent-eval/`。本地保留策略为 14 天，由开发者负责清理；trusted-CI artifact 自动保留 14 天。
提交或分享的 OpenSpec/PR 摘要只保留：

- suite/case/run id 与命令；
- target Host identity/fingerprint 或 contract hash；
- provider/model/effective config 与 fixture digest；
- outcome、hard-gate/evidence/artifact refs；
- Judge identity/rubric、usage/cost availability；
- blocked/unexecuted stages 和 residual risk。

必须删除 secret/token、hidden prompt body、raw provider config、absolute user path、
cache/temp/Webview/runtime handle、raw logs、未授权文件和非 fixture 内容。key-free test
或 dry-run 通过只能表述为 harness/schema evidence，不能表述为真实 Agent 行为验收。

## 10. Skill / Prompt 优化 Debug Functional

优化只能从已验证的 v2 report、evidence、failure attribution 和适用 Judge 结果开始。
输入必须保留 observed failure、suspected owner、confidence、evidence refs 和 missing
evidence 的区别。只有 Skill content、公开 description、Prompt-owned guidance 或有独立
证据确认的 Prompt routing 可以进入候选；Tool/Capability、runtime/session、provider、
artifact 与 Evaluation infrastructure 缺陷生成 owning OpenSpec handoff 或 blocker。

Skill 目标必须使用完整 Host identity 与 Host package fingerprint。同名 project、personal、
builtin、plugin 和 Marketplace source 不得合并。开发历史只在 baseline、candidate、
evaluated、accepted、rejected、superseded 等显式事件追加 checkpoint；rename/move 必须有
显式 lineage。该历史位于 `quality/skill-development-history/`，不写 `SKILL.md`、
`agents/neko.yaml`，也不拥有 Market package id、semver、publication、installation 或
distribution。

候选产物位于外部 Evaluation report 目录，包含 reviewable plan、candidate metadata 与
限定目标文件的 patch。approval 必须绑定 identity、base/candidate fingerprints、scope、
budget 和 required matrix；任何变化都使 approval 失效。优化器只能返回正常 OpenSpec
apply handoff，不能编辑或提交 canonical Skill/Prompt。

required matrix 包含 optimizer-visible development cases、protected regressions 和只暴露
policy id/digest/count 的 holdout policy。holdout case ids、输入和结果在候选冻结前不得进入
optimizer context。候选批准后，Evaluation 才解析 trusted selection，并让 baseline 与
candidate 使用一致的 fixture、runtime/model、sampling、budget、validator 和 Judge policy
走真实 TUI。blind A/B 只投影 allowlisted output/artifact/hard-gate evidence，不投影
checkpoint label、report/revision/build identity、fingerprint 或 diff。

最终 acceptance 必须同时满足：canonical hard gates、holdout、protected regression 和
真实输出内容 Judge 质量阈值。格式、字段命中、latency、token、cost 或 visible-case 平均分
不能覆盖 protected failure。缺 Judge 或不可比 policy 返回 non-comparable；行为失败不自动
重试成绿色。accepted/rejected 都追加 evidence-linked checkpoint，并记录 blind order、
报告、approver、usage/cost availability 与偏差/过拟合残余风险。
