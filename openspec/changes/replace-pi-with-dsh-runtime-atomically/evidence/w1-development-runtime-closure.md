# W1 Development DSH Runtime Closure Evidence

日期：2026-08-19

## Ownership And Path

- 职责：`scripts/prepare-dsh-development-runtime.mjs` 只拥有开发期 runtime artifact 构建、cache freshness、完整 qualification 和原子替换；Desktop Main 继续只解析 verified resource 并监督子进程，不拥有依赖安装或 Agent 规则。
- 依赖：第三方 runtime 输入只来自 `scripts/dsh-development-runtime/package.json` 与独立 lockfile；Node 使用锁定的 `node-bin-darwin-arm64@24.18.0`。系统 Node 只执行 builder，global DSH、`PATH`、workspace `node_modules` 与 Q0 fixture 均不是 runtime authority。
- 接口：开发启动器只向 Forge 子进程注入绝对 `NEKO_DSH_RUNTIME_ROOT`。显式配置只验证并原样使用，非法配置在 spawn 前失败；未配置时才调用 builder。
- 扩展：四个官方 OpenNeko DSH bundle 由各 package 的 build/files contract 提供。新增 bundle 需要同时更新 canonical profile/closure contract，而不是增加 fallback registry。
- 测试：builder、启动器、closure、Q0 exclusion/release isolation、package build/typecheck、架构边界和真实 Electron startup 分别验证 producer、consumer 与运行边界。

开发 cache 位于 `apps/neko-desktop/.dsh-development-runtime/darwin-arm64`。它与 Forge 管理并会清理的 `.vite` 分离，属于可丢弃、可从锁定输入重建的非 authoritative artifact。发布 `build`/`package`/`make` 不调用该 builder，仍要求外部显式 release closure 并受 integration-only guard 阻断。

## Runtime Evidence

- closure qualification：Node `v24.18.0`，DSH `0.1.0-rc.7`，32,531 files，340,261,997 bytes，526 license inventory entries，payload 内无 symlink。
- cache reuse：第二次 prepare 直接验证并复用同一 content-fresh root，没有重建 package tree。
- Desktop：`pnpm dev:desktop` 完成 Electron runtime、Host ports、resource/workspace registry、AppHost/IPC、Shell Window 和 renderer 初始化。
- process path：运行中的 DSH executable 与 `@deepseek-ai/dsh/lib/bin.js` entrypoint 均位于 `.dsh-development-runtime/darwin-arm64/payload`；未命中系统/global runtime。
- fail-visible：相对显式 root、损坏显式 closure、重复 Desktop launcher 和损坏 generated cache 均由 focused tests 覆盖；显式失败不会触发自动 builder 覆盖。

## Evaluation Scope

- 变更行为：开发 Desktop 的 DSH profile/runtime 启动 authority。
- 决策：`reuse` 现有 `agent-runtime.workflow-controller` suite；bridge build 仍消费同一 source/contract，没有改变 Session、queue、permission 或 Tool 语义。
- canonical path：development builder → verified closure → `NEKO_DSH_RUNTIME_ROOT` → Desktop resource resolver → profile materializer → DSH subprocess。禁止 global DSH、系统 Node runtime、Q0、Pi、SDK 或 Remote API fallback。
- key-free 验证：`pnpm test:agent:eval` 通过 45 files / 314 tests；all-suite dry-run 通过 27 suites / 80 cases。
- 真实行为：按用户指示跳过真实 API/provider 验证，未执行 visible/hidden provider-backed case；key-free 与启动 smoke 不是 Agent 行为或发布证据。

## Verification

- `node --test scripts/test-orchestration/desktop-development-bundle-owner.test.mjs scripts/test-orchestration/dsh-development-runtime.test.mjs scripts/test-orchestration/dsh-runtime-closure.test.mjs scripts/test-orchestration/dsh-cutover-release-guard.test.mjs`
- `pnpm --filter @neko/app-desktop typecheck`
- `pnpm --filter @neko/dsh-bridge build`
- `pnpm --filter @neko/dsh-bridge typecheck`
- `pnpm check:application-boundaries`
- `pnpm check:package-boundaries`
- `pnpm check:agent-boundaries`
- `pnpm check:legacy-debt`
- `pnpm test:agent:eval`
- `node scripts/agent-eval/all-suite-dry-run.mjs`
- `pnpm exec openspec validate replace-pi-with-dsh-runtime-atomically --strict`
- `pnpm dev:desktop`

`pnpm check:unused` 仍因当前工作树既有的 7 个 unused files 与既有 unused exports 失败；本变更新增但不需要公开的两个导出已删除。UI presentation 未变化，因此 `neko-ui-validation` 不适用。

## Residual Risk

- 真实 provider/API、可见 Agent UI、Session/Tool/permission 行为与完整 foundational matrix 尚未执行，继续阻塞 release evidence。
- 当前只生成并验证 `darwin-arm64` development closure；其他目标必须由独立 target artifact 和平台验证支持，不能复用该 root。
- release closure 仍由外部发布输入拥有；本证据不能完成 4.1 或打开 release guard。
