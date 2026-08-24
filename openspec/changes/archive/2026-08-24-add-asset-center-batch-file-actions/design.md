## Context

资源中心由 `@neko/assets-webview` 展示，由 `@neko/assets-domain` 的 `AssetCenterManagementRuntime` 定义浏览器侧 contract，并经 package-owned Host request 进入 Desktop Main。`AssetCenterNodeRuntime` 负责会话与当前 catalog identity，`ResourceBrowserNodeRuntime` 负责全局 Asset 根和 Media Library 连接的路径授权与具体 Node 文件能力。

当前只有一个 authoritative preview selection，Webview 条目只能单击选择；Asset 移除使用单条 request，Media Library 文件没有移动命令。右上角三点菜单只覆盖 Media Library 根连接管理，不支持条目右键。Asset Library membership 持有稳定 membership identity 和 package-relative source path；Media Library 文件 identity 由 library identity 与 relative path 投影，可在移动后重建。

本变更与进行中的 manifest-backed Asset Library 设计保持边界一致：选择和移动不创建第二个 Asset identity；当前 membership path 仍由 owning metadata repository 原子更新，未来 immutable Asset revision 的内容移动必须由该 change 的 package lifecycle 取代，而不能沿用普通文件 mover。

## Goals / Non-Goals

**Goals:**

- 提供符合桌面文件管理器预期的点击、范围、切换、全选和框选模型。
- 为同一选择提供批量工具栏、键盘删除和右键菜单入口。
- 通过一个 canonical batch request 完成批量移除或文件移动。
- 将文件移动限制在同一 authorized owner root，预检冲突并在失败时回滚。
- 保持单条 preview selection 与多选 presentation state 解耦。

**Non-Goals:**

- 不实现跨 Media Library 连接移动、跨 owner 移动、复制、重命名、拖放上传或文件夹移动。
- 不让 Renderer 接收绝对路径、Electron dialog、Node filesystem API 或 membership persistence API。
- 不改变“移除 Asset Library 记录会保留源文件”的既有语义。
- 不把普通 Media Library 文件注册为 Asset，也不修改 immutable Asset package revision 内容。

## Decisions

### Webview owns transient multi-selection

`AssetManagementRoot` 使用 `Set<itemId>` 保存当前可见集合的多选状态，并保存 anchor identity 支持 Shift 连选。点击无修饰键设为唯一选择，Cmd/Ctrl 点击切换，Shift 点击按当前排序结果选择连续范围，Cmd/Ctrl+A 选择当前可见且可操作的文件，Escape 清空。

框选在 collection 空白区域开始，以 collection-local 坐标显示矩形，并根据每个 `[data-library-item-id]` 的 bounding rect 计算交集。拖动超过稳定阈值才进入框选；Cmd/Ctrl/Shift 保留已有选择，否则替换。框选结束或取消时释放 pointer capture，组件卸载时不保留监听器。

多选是非 authoritative、可恢复的展示状态。catalog、directory 或 filter identity 变化后只保留仍存在且同 owner 的可操作 item；单条选择时继续调用现有 `runtime.select` 驱动 preview，多条或空选择不伪造 preview，批量 mutation 后显式清空选择并刷新。

备选方案是把多选写入 `AssetCenterSessionProjection`。拒绝原因是多选只服务当前集合交互，不是跨 runtime 事实；把它加入 Host projection 会扩大 IPC 与 preview lifecycle 耦合。

### Shared context menu and one action model

条目使用 `@neko/ui/primitives` 的 `ContextMenu` 包裹现有 article，菜单 action 由当前 selection capabilities 计算。右键未选条目时将其设为唯一选择；右键已选条目时保留整组。批量工具栏和右键菜单调用同一 Webview action handlers，三点按钮继续作为 Media Library 根操作的键盘可达入口。

选择集合仅在全部条目都是可移动文件且属于同一 owner 时启用“移动到”；Media Library 还要求同一 `libraryId`。只有全部选择为 Asset Library item 时启用“移除记录”。不支持的混合选择直接禁用并说明，而不是只操作可兼容子集。

备选方案是复制 `details` 菜单 CSS。拒绝原因是仓库已有 canonical keyboard/focus/outside-click menu primitive。

### Domain owns canonical batch commands

`GlobalLibraryBrowserRuntime` 与 `AssetCenterManagementRuntime` 增加 `moveItems(items)` 和 `removeAssets(items)`，Host contract 使用单一 `items.move` / `assets.remove` route 并只传递 opaque item IDs。旧 `asset.remove` route 在本次边界内原子替换，不保留单条并行 contract；单条右键操作也发送长度为一的 canonical batch request。

`GlobalLibraryController` 验证 item 来自当前 owner projection、无重复、owner 一致且 kind 可操作。`AssetCenterNodeRuntime` 再从当前 session catalog 解析 exact items，之后委托 `ResourceBrowserNodeRuntime`。Desktop AppHost 只做 sender/window/scene identity 校验与 wiring，不解释文件移动规则。

### Node preflights and rolls back the complete move

`ResourceBrowserNodeRuntime` 根据 exact items 决定 allowed root：Asset items 使用 OpenNeko global Asset root；Media Library file items必须来自同一 connection，并使用该 connection 的 real target。它调用注入的 Main dialog port 取得 destination directory，然后验证 real destination 位于 allowed root 内。

Node 在写入前构造完整 plan：每个 source 必须是 root 内非 symlink regular file；destination 不能等于 source；basename 在批次内唯一；目标不存在；所有条目仍与当前投影一致。任何预检失败都拒绝整批。

执行阶段按 plan 使用 rename；失败时按相反顺序移回。Media Library 不写第二份事实，刷新后由当前 relative locator 重建 identity。Asset Library 在文件 rename 完成后调用 membership repository 的 `relocateMany`，该方法在一个 SQLite transaction 中验证现有 source path 并更新全部 package-relative path/label；metadata 失败时回滚文件 rename。若 filesystem rollback 本身失败，返回包含受影响项的明确 diagnostic，不把操作报告为成功。

目标选择与 `dialog.showOpenDialog` 保留在 `apps/neko-desktop`，因为它需要 BrowserWindow owner 与 Electron 原生 dialog；路径授权、冲突、计划和回滚都在 `@neko/assets-node`，不保留 app-local 业务规则。

### Batch removal is metadata-atomic and preserves bytes

Asset membership repository 增加 `removeMany`，在一个 state-write transaction 中要求所有 identity 当前 active 后再统一标记 removed。`ResourceBrowserNodeRuntime.removeHomeAssets` 只接受当前 catalog 中的 Asset items，不删除 global Asset root 文件。任何 stale/non-Asset item 使整批失败。

## Ownership And Runtime Path

| Responsibility                  | Package role                                             | Canonical public path                                   | Producer                                         | Consumer                       | Runtime boundary       | Replaced path                                       |
| ------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------ | ------------------------------ | ---------------------- | --------------------------------------------------- |
| Selection and menu presentation | `@neko/assets-webview`, L2 browser UI                    | `@neko/assets-webview/asset-management/root`            | Current visible catalog                          | User interaction               | Renderer only          | Single selected boolean and asset trash-only action |
| Batch intent and validation     | `@neko/assets-domain`, host-neutral contract/application | `@neko/assets-domain/asset-center` and `global-library` | Webview/runtime adapters                         | Assets Node/Desktop bridge     | Typed package contract | Single `asset.remove` request                       |
| File move plan and rollback     | `@neko/assets-node`, Node runtime                        | `ResourceBrowserNodeRuntime` public package entry       | Current exact catalog items + dialog destination | Filesystem and membership port | Node/Main              | None                                                |
| Membership atomic mutation      | `@neko/local-metadata`, infrastructure authority         | `AssetLibraryMembershipRepository`                      | Assets Node batch request                        | SQLite repository              | Node SQLite            | Repeated single-record removal                      |
| Native destination picker       | `apps/neko-desktop`, Electron adapter                    | App composition wiring                                  | `BrowserWindow` + allowed default root           | Assets Node injected port      | Electron Main          | None                                                |

## User Data Impact

- Move is an explicit destructive location change, restricted to the same authorized root and never overwrites an existing target.
- Asset membership identity is preserved while its package-relative path and label change atomically.
- Media Library file identity is a rebuildable locator projection and changes after move; source bytes remain in the same external library.
- Batch record removal preserves Asset source files exactly as the existing single-item command does.
- There is no old persisted selection state, migration, compatibility reader, or silent default rewrite.

## Risks / Trade-offs

- [Pointer selection conflicts with entry activation or scrolling] → Start only from collection background with the primary button, require a movement threshold, capture/release the pointer, and test interactive descendants and cancellation.
- [Large selection causes layout or render cost] → Store only item IDs, calculate rectangles only during an active drag, and cap operations to the current bounded catalog projection.
- [Destination becomes stale after dialog opens] → Revalidate root containment, source metadata and target conflicts after dialog returns and immediately before rename.
- [Filesystem and SQLite cannot share one transaction] → Use full filesystem preflight, atomic metadata transaction, reverse-order rename rollback, and fail-visible recovery diagnostic if rollback itself fails.
- [Active Asset Library redesign changes membership ownership] → Keep movement behind package-owned batch ports and document that immutable revision bytes are not ordinary movable files; the future owner can replace the Node implementation without retaining a second Renderer route.

## Migration Plan

1. Add repository batch mutation contracts and tests before exposing Host routes.
2. Add Node move planning, destination authorization, rollback and batch removal tests.
3. Atomically replace the single asset remove Host route and update Desktop/preload/renderer fixtures.
4. Add Webview selection, toolbar and context-menu behavior with deterministic DOM geometry tests.
5. Validate package builds, application boundaries and a visible Electron fixture with real files.

Rollback removes the new UI and typed routes together. A successful user-initiated move is user data and is not automatically undone by code rollback.

## Open Questions

无。
