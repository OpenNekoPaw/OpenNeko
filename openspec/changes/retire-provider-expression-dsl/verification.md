# Verification

更新日期：2026-08-17

## 结果

- ProviderCard/provider-expression DSL 已从 Agent contracts、Capability contribution、AI/Host 配置、Desktop/Agent 投影、Assets profile manifest 与 Agent Evaluation canonical shape 中删除。
- `image`、`video`、`media-production` 继续作为普通 Pi Skills 提供 provider-neutral 表达方法；Skill 不选择 provider/model，不声明 Tool schema，也不获得运行时权限。
- 媒体 generation intent 仅保留为 Agent media Tool 私有解析结构；实际执行仍要求 immutable Turn purpose policy 提供精确 provider/model。
- 旧 `provider_expression_profile_id` 不迁移、不忽略、不写回：Host 仅隔离受影响 model，返回精确 diagnostic，并保留 sibling model 与原 TOML bytes。

## 架构自审

- 职责：Skill 只拥有可移植创作方法；Turn purpose policy 拥有 provider/model；Host TOML decoder 拥有旧字段拒绝；provider adapter 拥有第三方请求格式。
- 依赖：未新增 Desktop 业务逻辑或 Renderer Host 依赖；`ProviderInputModalities` 从被删 DSL 文件迁入现有 multimodal L0 contract。
- 接口：删除无消费者 profile/router/config identity，仅保留真实 artifact profile 与真实 provider/model identity。
- 扩展：新增 provider 或模型不需要新 expression profile；adapter capability 与 ordinary Skill 可独立演进。
- 测试：覆盖文件/符号缺失、strict schema 拒绝、Host fail-local、Skill exact activation、immutable model target、media Tool 成功与 capability 缺失失败。

## 通过的验证

- `pnpm --filter @neko/agent-contracts typecheck`
- `pnpm --filter @neko/agent-contracts test -- src/__tests__/agent-profile.test.ts`：42 files / 253 tests
- `pnpm --filter @neko/assets-domain typecheck`
- `pnpm --filter @neko/assets-domain test -- src/contracts/asset/__tests__/manifest-contract.test.ts`：18 files / 146 tests
- `pnpm --filter @neko/host test:run -- src/settings/__tests__/config-reader.test.ts src/settings/__tests__/chat-model-service.test.ts`：38 files / 319 tests
- `pnpm --filter @neko/ai-contracts typecheck`
- `pnpm --filter @neko/agent-webview build`
- Agent runtime focused：media Tool、builtin Skills、multimodal projection/boundary，4 files / 48 tests
- Agent architecture poison：1 file / 41 tests
- Agent Evaluation schema/workflow/hard-gate focused：3 files / 68 tests；strict obsolete-field case：1 file / 24 tests
- `pnpm test:agent:eval`：45 files / 311 tests；all-suite dry-run 27 suites / 81 cases
- `pnpm check:agent-boundaries`
- `pnpm check:legacy-debt`
- `pnpm check:unused`
- `pnpm check:openspec`：109 items passed
- `pnpm exec openspec validate retire-provider-expression-dsl --strict`
- `git diff --check` 与生产成功路径 poison scan

## 未通过或未执行

- DSH Web 先进行了全仓死代码审计，随后在同一会话发起限定本 change diff 的只读复核；两轮均卡在长时间源代码扫描且未返回最终 findings，已显式中止并释放临时 UI。其过程证据不计为独立 review pass。
- `@neko/agent-runtime` 全包 typecheck 被并行 `fix-agent-prompt-skill-composition` 工作树中的 `src/prompt/builtin-prompts.ts` 未转义模板字符串反引号阻塞；本变更的首次缺失 `ProviderInputModalities` 已迁入 multimodal contract，相关 focused tests 通过。
- Host 全包 `tsc -p packages/host/tsconfig.json --noEmit` 被并行 Desktop workbench contract tests 的 `agentSurfaceId` narrowing 错误阻塞；Host settings 全量测试通过。
- `pnpm check:no-internal-versioning` 的脚本自身 11 tests 通过，repository audit 因并行 `legacy-skill-activation-retirement.test.ts`、entity document test 新 occurrence 与两个 stale allowance 非零；未修改共享 baseline 掩盖问题。
- visible/hidden complete Desktop-session real-provider cases 未执行：本任务没有显式 provider/model/cost authorization。结果记为 `infrastructure-blocked`；key-free 与 dry-run 只证明 harness/schema/path readiness。

## 用户数据

- 不读取、修改或写回 `~/.neko/config.toml`。
- 旧字段只在读取当前 model record 时产生 diagnostic；原文件 bytes、无关 provider/model、Conversation、Workspace、Skill 和用户内容不被迁移、默认化或删除。

## 剩余风险

- 真实 Pi Skill 选择与 effective model identity 尚缺 visible/hidden provider-backed evidence。
- 当前 dirty worktree 的并行 prompt 与 workbench 类型错误阻止 Agent Runtime/Host 全包 typecheck；合并前需由对应 active change 修复后重跑。
- 旧字段用户需手动从 TOML 删除；这是预发布 canonical break，不提供兼容读取或自动迁移。
