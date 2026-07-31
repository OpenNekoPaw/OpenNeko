## Context

Desktop Home 的 `HomeAssetCenter` 当前直接位于应用组合根，只渲染固定卡片网格。Home
Management v5 为 Media Library 暴露 search/children/add/remove/reveal，为 Asset Library 只暴露
search；item 没有 revisioned thumbnail descriptor，资产也没有 owned mutation。底层
content-tree traversal 只按 exact directory set 排除目录，因此 `.DS_Store` 等点号文件仍会进入
投影。

项目内 `neko-assets` Resource Browser 已拥有列表/网格、懒加载缩略图、目录层级和 transient
hover preview 的生产路径。全局 Media Library 与 Asset Library 仍是不同 bounded context：
Media Library 的文件 authority 是外部连接目录，Asset Library 的 authority 是
`~/.neko/assets` owned bytes。设计必须复用 UI/媒体能力但不能合并身份、路径 resolver 或删除
语义。

五层分析：

- 职责：`neko-assets` 拥有 global library contract、projection 和 browser Root；Desktop Main
  拥有 native picker、路径解析、系统 trash、Electron thumbnail adapter 和 sender authorization；
  Renderer 只拥有交互与可恢复显示状态。
- 依赖：Assets browser-safe Root 依赖 package-owned L0 contract 与 `@neko/ui` primitive；Main
  依赖 `@neko/media/node` 和 Host ports；preload 只投影固定 typed methods。
- 接口：查询返回 opaque owner/item identity、catalog revision 和 thumbnail descriptor；mutation
  携带 expected revision，不携带绝对路径。
- 扩展：thumbnail variant 是固定 enum；asset import/remove 是独立 operation。未来 rename、move、
  folder import、version/share 可增加独立契约，不扩大当前通用文件管理接口。
- 测试：从 content visibility、contract parser、Host path/ownership、thumbnail fencing、Renderer
  interaction到真实 Electron fixture 验证完整路径。

实现审计（2026-07-31）：

- 复用 `neko-assets` Resource Browser 的 viewport thumbnail、view-mode 和请求 fencing 模式，但
  global identity 不复用 Project/Workspace identity。
- `@neko/ui` 当前只有通用 menu/popover primitive，没有可直接承载 Assets 目录语义的 collection
  owner；Global Library Root 保留在 `neko-assets`。
- 复用 application settings 的 `resourceBrowserView`，不新增 Home-only preference。
- 图片缩略图复用 Desktop native adapter；视频静态帧进入 `@neko/media/node` 的窄 FFmpeg port。
- 并行 `clarify-desktop-capability-catalog` 已将 Home contract 升级到 v6；本变更在其上升级到
  v7 并组合 global-library payload，不回退 extension 字段，也不建立平行 parser。

## Goals / Non-Goals

**Goals:**

- 在全局 Media Library 与 Asset Library 提供一致的列表/网格、缩略图和静态 hover preview。
- 使用一条 canonical visibility policy 隐藏所有点号文件和目录。
- 用双击/Enter 导航目录，移除重复的浏览/打开目录按钮。
- 为 Asset Library 增加多文件 owned import 和系统废纸篓 remove。
- 保持 Media Library 外部目标、Asset Library owned bytes、项目 Resource Browser 和 Home scope
  的 identity、授权与生命周期隔离。
- 升级 exact contract 并证明旧 payload、陈旧 identity 和跨 owner mutation 不能成功。

**Non-Goals:**

- 不实现媒体库文件删除、新建目录、移动、重命名或写入外部目标。
- 不实现 Asset Library 目录导入、目录删除、重命名、移动、标签、版本、授权、发布或共享。
- 不自动播放 hover 音频/视频，不打开 Workbench Preview View。
- 不引入 thumbnail cache manager、Asset manifest/catalog、数据库、watcher 或第二套 path resolver。
- 不识别 macOS Finder hidden flag、Windows hidden attribute 或任意用户配置的 ignore glob；本次
  hidden 的规范含义是 basename 以 `.` 开头。

## Decisions

### 1. Global Library browser 由 `neko-assets` package 拥有

新增 package-owned global-library contract/controller/Root public entry。Desktop Shell 只注入
Home host runtime、locale 和现有 Resource Browser view preference，不再直接实现 Asset/Media
item、thumbnail 和 mutation 状态机。Desktop Home channel 名与 sender/endpoint 校验仍由应用
组合根拥有，payload 类型从 Assets public contract 组合，不复制 DTO。

选择 package owner 是因为项目 Resource Browser 与全局 browser 共享同一 Assets 领域、缩略图
展示和媒体分类语义。直接继续扩展 `DesktopShell.tsx` 会让应用根拥有第二套 Assets UI；把整个
Root 提升到 `@neko/ui` 又会把目录、asset identity 和 mutation 业务塞入无业务 UI 层，因此均不
采用。只有纯展示 primitive 在出现真实复用时进入 `@neko/ui`。

### 2. 两个 source adapter 共享 presentation，不共享 ownership

controller 组合两个窄 source：

```text
GlobalLibraryBrowserRoot
  -> MediaLibrarySource -> managed link -> external directory (read-only browsing)
  -> AssetLibrarySource -> ~/.neko/assets (owned import/remove)
  -> ThumbnailPort -> image adapter / @neko/media/node video frame
```

Media Library item 使用 connection identity 与 library-relative locator；Asset item 使用 opaque
asset identity。缩略图请求携带 item identity 与 descriptor revision，由 Main 重新从当前
projection 解析物理路径。不存在把两个 source 聚合成统一资产 membership、用 label 查找路径或
回退 active Project 的路径。

Media Library item 额外携带浏览器安全的 `libraryLabel`，供搜索结果激活目录后恢复所属连接的
面包屑显示；Root 不解析 opaque `libraryId`，也不把当前目录名猜作连接名。

### 3. 点号可见性是 content-tree 的 canonical policy

在 `neko-assets` content-tree source 中先判断 `entry.name.startsWith('.')`，再进行目录递归、
stat、classification 或 metadata projection。root search、children 和 global Asset traversal
全部复用该逻辑；现有 exact excluded-directory set 继续处理 `node_modules`、build output 等
非点号目录。

显式连接的 root 必须始终可管理，因此 add/relink 在创建 managed link 前拒绝 basename 以 `.`
开头的目标。只在 Renderer 隐藏 `.DS_Store` 会让搜索、thumbnail 和 mutation 仍可访问隐藏 item；
给每个 caller 增加独立 filter 又会产生策略漂移，因此均不采用。

### 4. 目录导航使用明确 activation contract

单击只更新 selection，原生 `dblclick` 和键盘 Enter 执行 `children`，面包屑负责返回祖先目录。
搜索结果中的目录 activation 清除查询并进入该目录。普通 collection 不渲染 browse/open-folder
按钮；reveal、relink、remove 仍位于显式 overflow menu 并保持各自确认与错误语义。

使用 `event.detail` 推断双击会把 selection 和 activation 时序揉进一个 handler，因此不采用。
列表与网格共享同一 selection/directory state，切换 mode 不重新请求或重排 owner projection。
现有 `resourceBrowserView` application preference 是唯一默认视图事实，不增加 Home-only setting。

### 5. Thumbnail 使用 revisioned descriptor 与两个固定 variant

projection 只为 image/video content 生成：

```text
descriptorId = stable(owner identity + item identity)
revision = modifiedAt + byteLength
variant = icon | hover
icon = 160x100
hover = 640x400
```

image 复用 Desktop native image adapter；video 通过 `@neko/media/node` 新增窄的 deterministic
frame extraction contract，Main/Electron 只负责组合。audio、document、model、directory 和
unsupported format 使用稳定 typed icon，不伪造成功缩略图。缩略图是 transient result，不写
catalog、不暴露 cache path，也不新增持久 cache manager。

Root 使用 IntersectionObserver 懒加载 icon variant；hover/focus 经过 180ms 后请求 hover variant。
generation fence/AbortSignal 防止迟到结果覆盖新 item。pointer leave、focus move、facet/query/
directory change 和 unmount 都取消或 fence 请求。静态 hover 不创建 Preview session，也不自动
播放媒体；若未来需要 live preview，应另行修改 Preview 生命周期规格。

Main 允许同一 item 的 icon/hover 在固定并发上限内并行，按 Window 跟踪 AbortController，并在
Window detach/runtime disposal 时统一取消。Renderer generation fence 负责忽略离开、查询切换或
revision 变化后的迟到结果，正常 icon/hover 竞态不会被 Electron 记录成 IPC handler error。

### 6. Asset import 使用 operation-owned staging 和 no-replace publish

Renderer 发送无路径 import intent；Electron Main 打开支持多选的 native file picker。Host 对每个
选择项执行 regular-file、symlink、supported material 和 source availability 检查，复制到
`~/.neko/assets/.imports/<operationId>/` 的 operation-owned staging file，再使用同文件系统
no-replace publish primitive发布到 asset root。若平台无法保证 no-replace，操作必须 fail-visible，
不能退化成 check-then-overwrite。

每个文件独立产生 `added | conflict | rejected` outcome；当前 operation 失败或结束时只清理该
operation 创建且尚未发布的 staging bytes。异常退出留下的 staging 不进入 catalog；本次不静默
扫描或删除旧 staging。Asset mutation 在 runtime 内串行化，但 Media Library read-only browse
不共享该锁。

只支持 regular file import 是有意的最小边界。目录递归导入涉及冲突策略、取消、进度和部分提交，
不能被“选择文件”路径隐式实现。

### 7. Asset remove 只操作当前 owned regular file

remove request 携带 opaque asset identity 与 expected catalog revision。Main 从当前 projection
解析 asset root 内的 exact entry，使用 `lstat` 与 real containment guard 拒绝目录、symlink、
hidden staging、missing/stale、cross-owner 和 escaping target，再调用系统 trash。确认取消时
Renderer 不发送 request；trash 失败时保留 catalog 和文件，不回退永久删除。

Asset remove 与 Media Library removeConnection 使用不同 route、request 和 result。一个 item
identity 不能在另一 operation 中解析成功。这样危险操作不依赖按钮位置或前端 facet 来保证安全。

### 8. Home Management v7 直接替换 v6

v7 引入 catalog revision、explicit owner/item identity、thumbnail descriptor/variant、
asset import/remove outcome 和固定 thumbnail resolve route。所有 request/result parser 使用
exact shape；每个 request 还携带当前 Window endpoint identity，preload、IPC、AppHost、runtime
和 package Root 同步迁移。v6 payload、未知字段和缺失 revision 在任何副作用前失败，不保留
dual parser、fallback 或 no-op success。

已有 Media Library managed links 和 `~/.neko/assets` bytes 不需要数据迁移。只改变 runtime
projection 与 UI contract，不将现有 assets 复制、重命名或建立 manifest。

### 9. Root 生命周期与 Desktop 工作台密度

`GlobalLibraryBrowserRoot` 拥有 controller，但 React 18 StrictMode 会对同一次开发期挂载执行
effect setup、cleanup、setup 重放。Root 必须把永久 dispose 延迟到 microtask，并由同一
instance-scoped lifetime 标记判断组件是否已重新激活；真实 unmount 仍只 dispose 一次，controller
本身的 disposed guard 保持 fail-visible。不得把 controller 提升成共享单例，也不得为 StrictMode
保留第二套运行路径。

Global Library 是 Desktop Home 工作台内的操作面，不是独立落地页。package-owned Root 继续拥有
可复用的列表/网格结构，但采用与 Desktop 相邻面板一致的紧凑标题、12px 控件文字、28px 控件高度
和 16px 内容边距。容器保持全高、无外层浮动卡片；搜索占据剩余宽度，命令组与视图切换保持固定
尺寸，窄宽度下工具栏可换行且不重叠。

## Risks / Trade-offs

- [大目录与大量 thumbnail 造成 I/O 峰值] → 保持 bounded scan/result limit、viewport lazy load、
  固定并发和固定尺寸；不预生成整库 thumbnail。
- [视频首帧为黑帧或不可解码] → 使用 owning media adapter 的 deterministic seek policy；失败显示
  typed video icon和 bounded unavailable state，不让 catalog 失败。
- [多文件导入出现部分成功] → 每文件原子发布和显式 outcome，刷新后再声明最终状态。
- [进程退出遗留 hidden staging] → staging 永不投影；本次只清理当前 operation，后续 recovery
  必须有独立 owner/manifest 后才能自动删除。
- [系统 trash 在网络卷或受限目录失败] → Asset root 是用户级本地 owned root；失败保留文件并显示
  diagnostic，不永久删除。
- [重用项目 Resource Browser 造成 identity 混淆] → 只复用 package presentation/thumbnail
  primitives；global contract 不伪造 Project/Workspace identity。
- [当前 Settings/Shell 有并行改动] → 实现时基于最新 owner contract 合并，不回退用户改动，并用
  package public Root 缩小 `DesktopShell.tsx` 冲突面。

## Migration Plan

1. 建立 package-owned global library contract、visibility policy 与 red producer/consumer tests，
   poison Home v6 payload。
2. 实现 Media/Asset source、thumbnail port、video frame adapter、asset import/remove 与
   Electron native effects。
3. 将 preload/IPC/AppHost 切换到 v7，确保绝对路径与跨 owner item 无法进入 Renderer。
4. 提取并挂载 package-owned Global Library Browser Root，接入现有 view preference、i18n 和
   Home navigation，删除旧卡片按钮路径。
5. 运行 package/Desktop tests、typecheck/build/quality gates 和隔离真实 Electron fixture。

回滚时整体回退 v7 contract 与 UI/runtime 代码，不保留 v6/v7 双路。回滚不得删除已经成功导入的
owned assets、现有 Asset Library bytes、Media Library managed links 或外部目标。

## Open Questions

无阻塞问题。目录导入、Asset folder management、音频 waveform、live hover playback 和 Asset
rename/move/version/share 均需后续独立变更。
