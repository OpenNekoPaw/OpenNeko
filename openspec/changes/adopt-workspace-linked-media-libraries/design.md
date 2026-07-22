## Context

当前媒体库同时存在 `${VAR}/path`、shared variable/original path、local override、runtime absolute root 和 media-library source kind。路径扩张/收缩散布在 Assets、PathResolver、Agent、Search、NK codec 和 package/export 中，而本产品实际只需要把几个本机目录作为工作区可见素材来源。

五层边界如下：职责上 OS 拥有 link target 跟随，Host 只拥有创建 helper 与安全 guard；依赖上所有消费者复用普通 workspace path；接口上 source 是 `neko/assets/<libraryName>/...`；扩展上平台差异只在 link helper；测试覆盖真实文件系统、数据迁移和最终用户路径。

## Goals / Non-Goals

**Goals:**

- 用 `neko/assets/<libraryName>` symlink/junction 取代媒体库路径变量和 target mapping。
- 让 Agent、Search、Assets、Canvas、Cut、Preview、Engine 和 package/export 使用同一 workspace-relative path。
- 保留最小 symlink 信任边界，不建立 mount 管理服务。
- 让 NKC/NKV 与 Asset source 可安全迁移并在 workspace 移动后保持稳定。

**Non-Goals:**

- 修改 ContentAccess/ContentIngest 公共契约。
- 移动或重构 ResourceCache、thumbnail、proxy 或 document-entry 缓存。
- 建立 mount registry、target database、background repair daemon 或虚拟文件系统。
- 删除其他非媒体库 `${VAR}` 用途。

## Decisions

### 1. OS link 是唯一映射事实

macOS/Linux 创建目录 symlink，Windows 创建 junction。link filename 是 `libraryName`，按共享 portable segment policy 校验，并拒绝 `library.json`、平台保留名和大小写冲突。

添加、relink 和移除分别是创建、原子替换和删除 link。运行时通过 `readdir/lstat/stat` 枚举与判断可用性，不保存 target、accessible/remapped 状态或 repair metadata。删除 link 绝不删除 target。

### 2. Git ignore 属于一次性 helper

创建 link 时写精确 local ignore，防止 Git index 记录 symlink target string。不得对 `neko/assets/` 使用会吞掉 `library.json` 或真实项目 Asset 的宽泛规则。ignore 只服务 source-control hygiene，不参与 runtime discovery。

### 3. PathResolver 只处理普通 workspace path

新媒体库 source 统一为 `neko/assets/<libraryName>/<relativePath>`。PathResolver 做既有 normalization/join；Node、Engine input adapter 或 package reader 在 open 时由 OS 跟随 link。正常 runtime 不读取 media-library settings、variable map 或 library ID。

### 4. Workspace guard 增加窄 symlink 规则

所有请求先拒绝 absolute path、URI、NUL、空 segment 和 `..`。普通 path 使用既有 workspace containment。只有 `neko/assets` 的 direct symlink/junction 可穿越 physical workspace root；guard 动态读取顶层 target realpath，并要求 final realpath 保持为 descendant，拒绝 unmanaged 或 nested escape。

guard 不保存 target、不修复 link，也不向 consumer 返回 physical path。这是本地文件信任检查，不是第二套 resolver。

### 5. Agent 感知真实工作区路径

Workspace tree、Search 和文件工具输出 exact `neko/assets/...` path。Agent 不接收 `${VAR}`、library ID 或 target。broken/misspelt path 返回 safe diagnostic，并可以返回同目录候选以减少猜测。

大型库的遍历继续使用现有 search/list budget、取消和 root-boundary 规则，不增加媒体库索引服务。

### 6. NK 与 Asset source 使用同一 grammar

NKC/NKV、AssetFile、Search projection 和跨包 source 保存普通 workspace-relative string。新 writer 拒绝媒体库 `${VAR}`、absolute path、file URI、runtime URL 和 cache path。

Engine registration、Preview、Agent 和 package/export 继续通过现有 ContentAccess 路径消费该字符串；本变更不顺便更换 ContentAccess API。

### 7. Legacy 只存在于 migration reader

migration reader 只读解析旧 variable/original path/local override。用户选择 target 后，系统验证 source identity/fingerprint，创建 link，生成引用改写 plan，并只在确认保存时原子写新 revision和删除 retired settings。

未知 variable、missing target、名称冲突、fingerprint mismatch 或未知 schema 时保留原字节。正常 read/authoring path 不加载旧 mapping，不提供 compatibility fallback。

### 8. Package/export 解引用字节

package/export 通过现有 Host 内容读取入口打开 workspace-relative link descendant，并写入实际 bytes 与 portable provenance。不得打包 symlink object、target string、retired settings 或 resolved absolute path。

### 9. 派生搜索投影按当前路径 grammar 整体失效

本地元数据中的 media-library 搜索文档是可重建投影，不是项目事实。加载时只要任一 `fileKey` 不符合当前 `neko/assets/<libraryName>/...` grammar，整个 media-library partition 即视为不兼容并从已挂载 link 重建；不得逐条混用旧 `${VAR}` 与新 workspace path，也不得把失效当作 warmup 致命错误。写入边界继续严格拒绝非 portable key。

### 10. 媒体树打开 URI 与 Git decoration URI 解耦

VS Code 内置 Git decoration 会对 TreeItem `resourceUri` 执行 `git check-ignore`；Git 对 symlink descendant pathspec 会以 `beyond a symbolic link` 失败。媒体库、Asset 管理与最近 Asset 中的文件 TreeItem 因此只在打开命令和显式图标读取中携带 URI，不声明 `resourceUri`，从而不把 Git-ignored link target 的后代交给 Git decoration。该限制不改变文件访问、拖拽或预览 path。

### 11. Git decoration 兼容由显式工作区设置承担

Git 在 pathspec 校验阶段拒绝 symlink descendant，VS Code 内置 Git decoration 又会把普通 Explorer 和已打开 editor 的绝对 `file:` path 交给 `git check-ignore`。Git ignore 规则、Neko TreeItem 投影和普通内容读取都无法拦截该 Host-owned 调用。

本变更保留 direct link，并提供显式命令把 VS Code 的 `git.decorations.enabled` 写为当前 workspace 的 `false`。存在 linked library 且该设置仍启用时，Assets 只显示一次带影响说明的选择：用户确认后才修改 workspace setting；拒绝或关闭提示不改变设置。不得静默修改全局设置、吞掉 Git rejected promise、泄露 target，或引入非 `file:` 虚拟文件系统。

该选择会关闭当前 workspace 全部 Git file decorations，而不影响 Source Control、Git status 或普通文件访问。命令保持可发现，便于先前拒绝的用户稍后执行。

### 12. Relink 使派生投影失效，不重写项目事实

同一 `libraryName` 的 relink 保留所有 workspace-relative project refs，因此替换 target 必须具有相同的相对目录语义。UI 在确认前明确说明该约束；系统不得猜测目录层级、自动改写 NK/Asset facts 或搜索相似文件。

媒体搜索索引是派生数据。任何 link add/remove/relink 事件都使当前内存与持久 media-library partition 整体失效，并从事件后的 link tree 重建；搜索不得在事件后重新加载旧 partition。活动 Preview token 若在 relink 后指向不再存在的 source，HTTP transport 返回安全的 source-unavailable 响应，不得把每个 archive entry 请求升级为未分类 500。

## Risks / Trade-offs

- **[Extension Host 不是 OS sandbox]** → direct-link + final-realpath guard，拒绝其他 symlink escape。
- **[Git 泄露 target]** → 精确 ignore 和 index/package assertions。
- **[新机器缺少 Git-ignored link]** → 项目 path 提供 libraryName，missing diagnostic 引导创建同名 link。
- **[Windows junction 行为不同]** → 薄平台 helper 和真实 fixture；消费者只见普通 path。
- **[旧项目映射不明确]** → 显式选择、fingerprint 校验、保留原字节，不猜测。
- **[Git decoration 不支持 symlink descendant pathspec]** → Neko TreeItem 不声明 `resourceUri`；普通 Explorer/editor 由用户显式关闭当前 workspace 的 Git decorations，并保留影响说明和可发现命令。
- **[Relink 改变目录语义]** → relink 前明确要求相同内部结构；项目事实不猜测迁移，派生搜索投影立即按新 target 重建。

## Migration Plan

1. 冻结 link name、workspace path、guard diagnostic 和 legacy inspection contract。
2. 实现 link helper、精确 Git ignore、enumeration 和 workspace guard。
3. 删除 media-library settings/variable runtime 与 libraryId path lookup。
4. 迁移 Assets/Search/Agent 和其他 source producers 到普通 workspace path。
5. 更新 NKC/NKV validator/writer、legacy inspection/relink 和 package/export。
6. poison 正常 runtime 的旧 mapping，运行路径、数据和真实 Extension 验证。

## Resolved Questions

- 已决议：扩展现有 Git hygiene owner，通过 `git rev-parse --git-path info/exclude` 写入仓库本地的精确 `/neko/assets/<libraryName>` 规则。共享 `.gitignore` 不记录本机挂载状态，ignore 也不参与 runtime mapping。
- 已决议：Git 2.51 在 `check-ignore --no-index <symlink-descendant>` 的 pathspec 校验阶段直接返回 `beyond a symbolic link`，因此 exact exclude、忽略整个 `neko/assets/`，以及在 ignored real parent 下嵌套 link 都不能避免 VS Code Git decoration 错误。保留 direct link 与普通 `file:` URI；通过用户显式确认把 `git.decorations.enabled=false` 写入当前 workspace。不得静默修改设置、吞 rejected promise、投影 physical target 或增加 VFS。
