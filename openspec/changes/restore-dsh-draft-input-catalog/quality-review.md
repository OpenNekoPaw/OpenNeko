## Findings

No scoped blocking code finding.

## Risk And Architecture

- Risk level: L3（AI workflow、DSH runtime 与跨 runtime ACP contract）。
- Responsibility：DSH bridge 是 command/Skill catalog 的唯一 owner；Desktop 只选择精确 Draft cwd 或 live Session identity，Webview 只渲染 composer snapshot。
- Dependency：Draft discovery 复用 DSH Agent factory 的 unpublished setup boundary 与同一 product preset；没有把 DSH package-private command registry 搬入 Desktop，也没有 Renderer 到 Node/Electron 的新依赖。
- Interface：input-catalog request 是精确 discriminated target：Draft `{ cwd }`，Conversation `{ sessionId }`。非法、混合或缺失 target fail-visible，不回退 active/recent identity。
- Extension：Workspace cwd 与 product cwd 通过既有 authoritative resolver 提供；未来 preset/Skill 扩展仍由 DSH catalog 自动反映，不需要在 OpenNeko 维护第二份列表。
- Testing：覆盖 producer/consumer、malformed request、discovery teardown、persisted Session non-leakage、exact Conversation delegation、Draft React surface 与 real DSH subprocess；visible Electron evidence 明确 blocked。

路径级审计确认：`@` 仍由 Workspace mention authority 独立拥有；`/` 与 `$` 都来自同一 DSH catalog owner。预对话 discovery 在 Agent publication 前终止并释放 scope，不发送 `session/created`，不写持久 Session；首次提交继续使用现有 atomic Conversation/DSH Session creation。没有新增 hidden Conversation、durable probe Session、fallback provider/source、active identity fallback、feature flag 或兼容并行路径。

## Verification

通过项、工作树级无关门禁失败和完整 Q0 的相邻并发 lane 失败见 `verification.md`。`neko-agent-evaluation` 的 focused real-DSH path 通过，但没有 real visible Desktop complete-session 证据；`neko-ui-validation` 因锁屏与 Vite owner 为 blocked。

## Residual Risk

- 需要在用户解锁 Mac 并释放当前 Development Vite owner 后，执行 `desktop-agent-entry-workspace-skill` 的隔离可见 Electron 场景。
- 完整 DSH Q0 的 standard Prompt admission release timeout 应由其 owning change 独立修复；本变更 focused lane 不应隐藏该失败。
- 当前工作树的 internal-versioning、package-boundary 和 Agent inventory 门禁需要各并行 owner 清理后再做全局 release gate。
