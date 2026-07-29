# P1.4 implementation audit

本审计限定 `integrate-desktop-assets-canvas` 的 canonical path。`reuse` 表示保留 owner 与
事实源；`extract` 表示把稳定逻辑从宿主 adapter 中移到 owner 的 host-neutral 层；
`replace` 表示调用方迁移到新契约；`poison` 表示旧路径不得再为 production 请求返回成功。

| Production path | Current owner / runtime | Disposition | P1.4 canonical path |
| --- | --- | --- | --- |
| Desktop Window、ProjectTab、View attachment、revision/CAS | `apps/neko-desktop` Shell service/repository | reuse + extend | Window projection增加受控 workbench layout；ProjectTab 只保留运行 identity，不再渲染顶部项目 Tab |
| Desktop 项目一级导航 | Renderer `ProjectTitleBar` + `WorkbenchActivityBar` | replace | `@neko/ui` primary-sidebar slot + Desktop catalog/projection adapter |
| 通用 editor/sidebar/bottom slot | `@neko/ui` `EditorWorkbenchShell` | reuse + extend | 受控 primary sidebar、Main、左右 Dock、bottom Timeline 和 compact overlay primitive |
| Agent conversation/session/lease/timeline projection | `neko-agent` + Desktop Agent composition | reuse | Agent Root 继续消费显式 Project/View identity；只改变 main/dock presentation |
| Workspace content read/search/reveal/write | `@neko/content` + Desktop sender-bound content effects | reuse | Assets/Canvas Main adapters调用同一授权 service，不在 Renderer 创建 IO |
| Linked Media Library catalog 与 link facts | `WorkspaceLinkedMediaLibraryService` | extract | Assets-owned host-neutral linked-library reader/controller；VS Code watcher/dialog 留在 host adapter |
| Media Library search/index | `MediaLibrarySearchService` | extract | 搜索算法与 index ports 进入 host-neutral service；VS Code storage/URI 进入 adapter |
| Media metadata/thumbnail | `MediaMetadataCache`、`ThumbnailService` | extract | host-neutral presenter + Host metadata/thumbnail effects；Renderer 只接收 opaque descriptor |
| Media Library TreeView rows/identity | `MediaLibraryTreeProvider` | replace | TreeProvider 与 Desktop `ResourceBrowserRoot` 同时消费 Assets presenter/projection |
| Entity catalog/query/detail | `@neko/entity` + `EntityFacadeReaders` | reuse + extract | Assets presenter消费 facade port；Character 只投影 Entity ref 与 representation binding |
| Entity VS Code TreeView | `EntityBrowserTreeProvider` | replace | VS Code adapter消费同一 Resource Browser presenter，不保留第二套筛选/identity |
| Canvas `.nkc` codec、node/connection model | `@neko-canvas/domain` / shared Canvas types | reuse | Canvas document session与 runtime snapshot继续使用 owning domain |
| Canvas authoring、candidate/accept、Workspace Board delivery | Canvas extension services/coordinator | reuse + extract | 显式 document/revision authoring port；不使用 active editor fallback |
| Canvas Webview UI | `CanvasWebviewRoot` / `CanvasApp` | replace | Root 必须注入 versioned `CanvasHostRuntime` |
| VS Code Custom Editor message/window listener | Canvas extension + Webview global message | replace | VS Code adapter实现同一 runtime contract |
| Module-global `getGlobalVSCodeApi()` | Canvas production Root、preview、toolbar/store | poison | production Root dependency guard；只有 VS Code adapter 可获取 API |
| Desktop `CanvasHostAdapterSurface` fixed nodes | Canvas demo host adapter | poison | Desktop ready path仅挂载完整 `CanvasWebviewRoot` |
| Resource → Canvas drag/add | VS Code command/URI payload | replace | stable `ContentLocator`/Entity representation + explicit target document/revision intent |
| Active/recent Canvas selection | VS Code active editor helpers | poison | Main View identity指定唯一 document session；缺失或陈旧时 fail-visible |
| Cut、通用 Preview、Chara runtime | owning P1.5/P1.6 packages | defer | P1.4 只保留 slot/unavailable projection，不创建替代实现 |

## Reuse boundaries

- `@neko/shared` 继续拥有 `ContentLocator`、Canvas 数据模型与 Creative Entity identity。
- `@neko/ui` 只拥有无领域语义的布局 primitive；preset、Project catalog 和功能 ready gate
  由 Desktop 组合。
- Assets 拥有 Resource Browser contract/controller/presenter；Desktop 不复制 catalog、search
  index、thumbnail cache 或 Entity facts。
- Canvas 拥有 Host runtime contract、document session与 Root；Desktop 只实现 host effects 和
  identity fencing。
- Renderer payload 禁止绝对路径、`file://`、Electron/VS Code object、credential 和 cache
  路径。

## Replacement proof

完成 P1.4 前必须有 path-level test 或 poison guard 证明：

1. Desktop renderer 不导入 Node/Electron/VS Code。
2. Assets browser entry 不导入 VS Code。
3. production Canvas Root 不调用全局 VS Code API。
4. Desktop ready Canvas 不挂载 `CanvasHostAdapterSurface`。
5. Resource/Canvas mutation 不查询 active workspace/editor/document。

## Implemented P1.4 Assets Path

- `neko-assets/resource-browser` owns the versioned projection, stable resource/thumbnail
  descriptor identity, controller and browser-safe React Root.
- Desktop Main resolves Project/Workspace/Window/View identity from the Shell projection, performs
  containment checks, invokes the native source picker/reveal/open effects, and resolves thumbnails
  through Electron `nativeImage.createThumbnailFromPath`.
- Preload exposes only fixed snapshot/search/intent/thumbnail routes. Thumbnail responses are
  bounded `data:image/*` projections; Resource rows never receive absolute paths, `file://` URLs,
  cache paths or bearer tokens.
- The Desktop media facet scans only conventional project media roots and explicitly linked
  libraries. It does not classify project TypeScript or coverage/build output as media.
- Resource and layout toolbar actions use icon buttons with localized accessible names/tooltips;
  facet selectors retain text because they are navigation tabs rather than opaque commands.
6. VS Code Tree/Custom Editor adapter 与 Electron adapter消费同一 owner contract。
