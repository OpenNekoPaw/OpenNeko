## Scope

Entry Assistant Draft 与 Workspace Draft 的 `/` command、`$` Skill、`@` mention 菜单，以及首次提交后的 Conversation/DSH Session identity。该变更恢复用户可见交互，`neko-ui-validation` 适用。

## Acceptance Inventory

- Entry Draft：无 `conversationId` 时输入 `/` 显示 DSH command catalog。
- Entry Draft：无 `conversationId` 时输入 `$` 显示当前 preset/cwd 的 DSH Skill catalog。
- Entry Draft：`@` 不伪造 Workspace authority。
- Workspace Draft：`/` 与 `$` 使用精确 Workspace cwd，`@` 继续使用精确 Workspace mention authority。
- 打开三个菜单不会创建 Conversation 或持久 DSH Session。
- 首次执行 command/Skill 或发送普通 Prompt 时，沿 canonical submit path 原子创建一个 Conversation 和一个精确 DSH Session。
- 已有 Conversation 使用 `{ sessionId }` 读取 live Session catalog，不回退 Draft scope。
- wide 与 narrow 下菜单不溢出、不遮挡 composer，command/Skill/mention 三种 surface 可区分。

## Deterministic Evidence

- Agent Webview Draft test：显式 `conversationId={undefined}` 时 `/permission` 与 `$storyboard` 菜单可见并能形成 canonical submit intent。
- Desktop composer tests：Entry Draft 与 Workspace Draft 分别解析 product cwd 和 exact Workspace cwd；已有 Conversation 只调用 bound Session client；catalog failure fail-visible。
- DSH Q0 focused qualification：真实 DSH subprocess 在首次 turn 前返回 command/Skill catalog，前后持久 Session 数均为 0，且 provider 未被调用。
- `desktop-agent-entry-workspace-skill` 场景已更新，包含 Entry/Workspace Draft 的 `/`、`$`、`@`、pre-submit zero Conversation 与 first-submit exact identity 断言。

## Visible Runtime Evidence

未取得。隔离 Development Electron runner 检测到 PID 29293 持有当前 checkout 的 Vite bundle；为保护用户正在运行的实例，没有终止该进程。随后使用 Computer Use 只读检查两次均返回 Mac locked，无法读取或操作当前 OpenNeko 窗口，也无法进行 direct image-capable review。

## Result

`blocked`。确定性 functional contracts 通过，但 authoritative visible Electron scenario、wide/narrow screenshots 和真实 composer/provider 首次提交没有在本轮执行；不能用单元测试或现有进程替代图形/Agent 行为验收。

## Residual Risk

- HMR 下当前用户实例是否已加载最新 DSH bridge bundle 未验证。
- wide/narrow 菜单的像素位置、滚动和遮挡未直接检查。
- first-submit 的真实 provider 完成态和 UI transcript 投影未在可见 Electron 中验证。
