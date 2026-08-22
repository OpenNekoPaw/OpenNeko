## Evaluation intent

验证 Agent 在 Workspace 中保持普通 Markdown 回复，同时只为明确的长期文档输出 Host marker；验证 Skill 能收紧文档结构而不复制运行时工具、路径或 marker 协议。

## Coverage

- ordinary-answer：普通分析/问答不输出 marker，不产生 artifact。
- reviewable-document：明确请求长期命名文档时输出简短总结、唯一 marker、H1 开始的完整 Markdown 文档。
- durable-document-reference：发布成功后会话只保留简短总结和可打开的持久 `ContentLocator` 引用；完整 owner 重开后引用仍可重建。
- skill-refined-document：激活领域 Skill 后，artifact 满足 Skill 语义模板并继续使用同一 marker。
- invalid-contract：缺 H1、重复 marker 或把 marker 放在 fenced code 中时，确定性 parser 按规范处理。

## Evidence boundary

- Pure parser、prompt poison、context admission 和 dry-run 只证明 contract/harness readiness。
- 真实 Agent 行为必须通过 provider-backed evaluation；最终 Desktop acceptance 需要可见 Electron UI，从普通 composer 发起，并验证总结、可打开文档引用、Workspace 文件、Canvas 节点和 exact conversation/turn identity，随后完整重开 owner 验证引用不依赖 preview session 或内存回执。
- 未执行的 provider/UI evidence 必须记录为 residual risk，不得用 fixture final text 替代。

## Verification record

- `pnpm --filter @neko/agent-contracts test -- dsh-session-host.test.ts`：通过，17 files / 105 tests。
- `pnpm --filter @neko/agent-runtime test -- dsh-workspace-board-artifact-delivery.test.ts`：通过，51 files / 356 tests。
- `pnpm --filter @neko/agent-webview test -- dsh-session/root.test.tsx`：通过，5 files / 49 tests。
- `pnpm exec vitest run src/main/desktop-text-editor-runtime.test.ts src/main/desktop-dsh-session-host.test.ts src/main/desktop-dsh-workspace-board-delivery.test.ts src/preload/dsh-session-bridge.test.ts src/renderer/DesktopAgentSurface.test.tsx`（`apps/neko-desktop`）：通过，5 files / 81 tests。
- `pnpm --dir packages/agent/contracts run typecheck`、`pnpm --dir packages/agent/runtime run typecheck`、`pnpm --dir packages/agent/webview run typecheck`：通过。
- 变更文件 focused ESLint：通过。
- `pnpm exec vitest run scripts/agent-eval/all-suite-dry-run.test.mjs`：通过，1 file / 3 tests。
- `pnpm exec openspec validate persist-explicit-agent-markdown-artifacts --strict`：通过。
- `pnpm check:application-boundaries`：通过，1343 files。
- `pnpm check:content-access-boundaries`：通过，328 files。
- Desktop 全包测试已通过，98 files / 612 tests；定向 Desktop 测试再次通过，5 files / 81 tests。
- Desktop 全包 typecheck 仍被并行工作区中的一个无关错误阻断：旧 fixture 使用已删除的 `executeWorkspaceDocumentTool` 字段；本变更相关错误已清零。
- Desktop package build 未进入编译阶段：当前 checkout 的运行中 Desktop 进程占用 Vite bundle；未终止用户正在运行的应用。
- `pnpm check:agent-boundaries` 被并行工作区删除的 `packages/agent/contracts/src/tool-names.ts` fixture 阻断；此前阶段通过的检查项保持通过，本变更未恢复退休 Agent surface。
- `pnpm check:no-internal-versioning` 被并行工作区的 stale allowances 与 81 个无关新增基线项阻断；本变更文件未出现在 finding 列表中。

## Residual evidence

- 未运行 provider-backed Agent case，因此当前证据证明 suite、prompt、parser 与 Host workflow readiness，不宣称真实模型遵循率。
- 未运行可见 Electron UI acceptance，因此尚未人工确认同一 Workspace turn 中总结展示、文件出现和 exact Canvas 节点投影的端到端体验。
