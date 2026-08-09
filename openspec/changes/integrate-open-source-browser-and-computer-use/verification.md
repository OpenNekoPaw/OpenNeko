# Verification

更新日期：2026-08-10

## Passed

- `pnpm --filter @neko/automation-contracts typecheck`
- `pnpm --filter @neko/automation-contracts test`：4 tests
- `pnpm --filter @neko/automation-node typecheck`
- `pnpm --filter @neko/automation-node test`：24 tests
- Desktop Browser Use contained client factory：4 tests
- Desktop Cua Driver contained bounded client factory：2 tests
- Agent Automation Capability adapter：2 tests
- Extension unavailable-artifact catalog projection：1 test
- official SDK MCP client focused suite：4 tests
- `pnpm --filter @neko/app-desktop typecheck`
- Desktop artifact Host：10 tests；覆盖真实 tar.gz/ZIP、streaming size/digest/progress、AbortSignal cancel、Ed25519、
  license/provenance、redirect、modified bytes、path/case collision、link、unknown key、atomic commit/discard
- `pnpm --filter @neko/agent-contracts typecheck`
- `pnpm --filter @neko/agent-runtime typecheck`
- `pnpm --filter @neko/agent-runtime test`：116 files，1110 tests
- `pnpm --filter @neko/agent-runtime exec vitest run src/extensions/extension-manager.test.ts`：17 tests；覆盖
  reviewed platform artifact install、旧 marketplace-directory copy poison、host allowlist、digest、signature、
  provenance、license inventory、失败 discard、atomic commit gate、installed-without-grant、exact
  `updatesFrom` update projection、disabled-only atomic update、same-operation pre-commit idle recheck、permission expansion
  grant revoke、commit rollback、invalid-candidate fail-local、exact Agent/Automation ownership gate、Main-owned
  progress/cancel 与 restart staging cleanup
- `pnpm --filter @neko/agent-contracts test`：42 files，273 tests；覆盖 `canUpdate` / `updatePackageRelease`
  producer-consumer consistency
- `pnpm --filter @neko/agent-webview build`
- `pnpm --filter @neko/agent-webview exec vitest run src/extension-management/root.test.tsx`：7 tests
- `pnpm --filter @neko/app-desktop exec vitest run src/main/app-host.test.ts src/renderer/desktop-extension-management-runtime.test.ts`：
  2 files，45 tests
- Desktop artifact/Main/preload/Renderer management focused suite：4 files，57 tests
- Desktop Browser/Cua/artifact/management/preload focused suite：6 files，62 tests
- Agent Runtime MCP/extension focused suite：7 files，89 tests
- Agent Contracts extension management focused suite：3 tests
- `pnpm check:quality`：passed，包含 package/application/Agent/Webview boundary、strict tsconfig、storage、
  internal-versioning、legacy-debt、test orchestration 与 OpenSpec 门禁
- `pnpm check:openspec`：70 items
- `pnpm check:package-roles`
- `pnpm check:package-product-status`：`@neko/automation-contracts` 与 `@neko/automation-node` 由 Desktop
  composition 真实可达并登记为 `active-product`；这只激活 exact session ownership gate，不表示已有可启动
  Browser/Cua profile
- `pnpm check:package-boundaries`
- `pnpm check:application-boundaries`
- `pnpm check:agent-boundaries`
- `pnpm check:strict-tsconfig`
- `pnpm check:test-orchestration`：100 tests and both ownership audits
- scoped ESLint and Prettier checks
- `pnpm check:legacy-debt`
- `pnpm check:unused`：仅 configuration hints，无 unused finding
- `pnpm check:deps`：1527 modules / 5162 dependencies，无 violation
- `git diff --check`
- `pnpm test:agent:eval`：44 files，294 tests；key-free harness only
- `node scripts/agent-eval/all-suite-dry-run.mjs`：24 suites，64 cases；未包含 blocked external automation suite
- 开发态真实 Electron UI：Extensions 页显示 Browser Use `0.13.7`、Computer Use `0.19.2`、声明权限与
  artifact unavailable diagnostic，且不存在安装入口；直接图像检查未见裁切、重叠或不可读状态。active operation
  视觉态因正式 catalog 不可安装而 blocked

## Blocked Or Unrelated

- `pnpm check:no-internal-versioning` 已通过：本变更的 extension package release 登记为用户可见的 package
  release，Cua bounded policy format 登记为第三方 external fact；0 个新增 occurrence。仓库仍有 1 个既有
  Agent Runtime baseline occurrence。
- packaged Desktop、真实 Browser Use/Cua Driver、OS permission、target/session UI 和 provider-backed Agent
  Evaluation 尚未运行。Browser/Cua contained MCP client factory、Agent Automation Capability adapter 与
  transient screenshot receipt 已实现；reviewed artifact application-service contract 和 concrete Desktop artifact
  downloader/archiver、Main-owned progress/cancel 与 restart staging cleanup 已实现，但发布公钥/signed artifact、
  bounded resume、production registration、首次授权与 target/domain UI、Timeline control 和 packaged qualification
  仍未实现。Browser Use fixed upstream 还没有
  证明 direct MCP 空白 session 与授权 exact origin/tab 的无隐藏导航绑定；redirect/new-tab 是加载/创建后处置，
  因而不满足 `browse-read` / `interact` 的 pre-content domain gate。

## Quality Review

- 职责：artifact lifecycle、enable/update policy、Automation session/action semantics 留在 owning packages；Desktop
  只拥有 download/archive/process/Window/IPC 等 Host boundary。
- 依赖：L0 contracts -> L1 application service -> Desktop adapter 方向保持单向；package/application/Agent/Webview
  boundary gates 全部通过。
- 接口：management、artifact receipt、runtime readiness、session/target/action/evidence 均为单一 strict canonical
  shape；非法输入在当前 extension/session/action fail-local。
- 扩展：Browser/Cua 使用明确 provider identity 和 reviewed operation schema；generic raw MCP 对 adapter-only server
  保持拒绝，不存在 provider/source/handler fallback。
- 测试：contracts、runtime、Webview、Desktop adapter、poison/rollback 和完整质量门禁均通过；真实 artifact、OS
  permission、packaged Desktop 和 provider-backed Evaluation 未执行项在本文与 `evaluation.md` 保持 fail-visible。
