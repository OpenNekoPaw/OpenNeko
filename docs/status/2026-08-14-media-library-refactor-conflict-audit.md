# 媒体库改造冲突审计（2026-08-14）

> 本文是当前工作树的状态快照，不是长期架构事实。修复约束与任务以
> [`restore-workspace-linked-media-access`](../../openspec/changes/restore-workspace-linked-media-access/)
> 为准。

## 结论

当前改造不是局部 UI 回归，而是把“Workspace 软链接访问投影”错误提升为媒体库业务 authority，
完整替换了原有的 Media Library identity → 项目本机 binding → 用户全局 connection → Content handler
路径。受影响的不只是添加入口，而是所有持久引用、授权、恢复、读取、同步和打包消费者。

正确方向是恢复既有路径，并在其末端增加 binding-derived `neko/assets/<libraryName>` 受管链接：

```text
MediaLibraryContentLocator
  -> target-free project binding
  -> exact global Media Library connection
  -> matching managed Workspace link
  -> contained bytes
```

Agent 是特殊的 Workspace-restricted consumer：Assets 在 handoff 时把已授权媒体投影为
`workspace-file:neko/assets/...`。该投影不得写回 Canvas、Cut、Entity、Search 或 package facts。

## 原设计拥有的功能

| 能力 | 原 owner / 路径 | 当前改造结果 |
| --- | --- | --- |
| 便携媒体身份 | `MediaLibraryContentLocator` | 从 closed union 删除，项目 facts 被改写为 Workspace path |
| 项目本机授权 | `.neko/media-libraries` target-free binding | repository/service/contract 被删除 |
| 全局目录复用 | `~/.neko/media-libraries` connection | 降级成可选目录选择器，不再参与项目解析 authority |
| 显式恢复 | immutable plan/confirm/apply + fingerprint | 被 link create/replace 取代 |
| 可用性诊断 | required-unlinked、connection-missing、binding-invalid、content-incomplete 等 | 状态被合并或丢失，无法区分故障 owner |
| 内容读取 | exact binding → exact connection → contained target handler | handler 被删除，所有消费者改走 Workspace reader |
| 用户操作 | 关联已有全局库；添加目录后全局注册 | 合并为 native directory picker，现有全局库入口丢失 |
| 便携快照 | 按权威 media locator 收集、校验、staging rewrite | 改为按 Workspace path 读取，丢失媒体 owner 语义 |
| Agent | media contributor + Host-owned content resolution | 改造后既发 Workspace locator，又做普通 realpath containment，合法链接被拒绝 |
| Resource Browser | library root + logical child identity | 直接子项父 ID 与 root ID 不同，触发 right-dock Surface error |

## 代码冲突范围

### 被删除的核心 owner

- `packages/assets/domain/src/contracts/project-media-library-binding.ts`
- `packages/assets/node/src/project-media-library-binding-repository.ts`
- `packages/assets/node/src/project-media-library-binding-service.ts`
- `packages/assets/node/src/project-media-library-content-handler.ts`
- `packages/assets/node/src/project-content-read-service.ts`

这些文件不是可替换的“复杂度”，分别拥有本机授权 contract、持久化、恢复状态机、物理 containment
和多 owner Content composition。删除后没有其他单一 owner 接住其职责。

### 被迫改写的消费者

- Content contract/read/write 与 document-entry；
- Resource Browser domain/node/webview；
- Canvas 媒体 copy/authoring、NKC codec 与 preview；
- Cut codec/session；
- Entity representation/availability；
- Search、Text Editor Markdown、Project dependency/usage；
- Agent mention、attachment、tool protocol、display projection；
- portable snapshot、sync/portability 与 Desktop wiring/evaluation fixtures。

这证明问题无法通过修正 Agent guard 或 Resource Browser parent ID 单独收敛。若继续在 symlink-only
shape 上补丁，会保留错误的事实来源并形成更多双路径。

## 已观察到的失败

1. `Resource Browser hierarchy parent 'content:…' is missing`：media root 使用 library-root identity，
   直接子项却按 root locator 计算 content identity；projection 不闭合，Renderer render 中抛错并击穿面板。
2. `Desktop content locator resolves outside its sender-bound workspace grant`：Agent 获得合法 managed-link
   Workspace locator，但 content effect 在 link guard 之后再次按普通 Workspace realpath containment 判断，
   把合法外部 target 当成逃逸。
3. 添加媒体库只显示 native directory 操作：原 `linkGlobalLibrary` 与 `addDirectoryLibrary` 两个明确 intent
   被替换为 `linkExternalFolder`。这不是主因，但证明全局 catalog/project binding 路径已断开。

## 数据判断

当前错误不能首先归因于“残留数据”：

- `content:*` 父 ID 是运行时由 locator 计算，不是旧 JSON 保存的层级记录；
- Agent 报错来自当前 realpath containment 代码，与旧 binding 内容无关；
- 即便存在旧 presentation snapshot，也只应清除对应选择/展开状态，不应让整个 Surface 崩溃。

需要保护的现有数据包括项目 `media-library` facts、`.neko` bindings、全局 connections、当前软链接和外部
字节。恢复过程不得批量重写或删除；只能在精确匹配时重建非 authoritative local state。

## 修复原子边界

以下内容必须作为一个 contract replacement 完成，不能分批留下两个成功路径：

1. 恢复 locator、binding、recovery、content-handler contract；
2. 将 managed link 纳入 binding apply/remove/reinitialize；
3. 原子恢复 Canvas/Cut/Entity/Search/Text/portable producers 与 consumers；
4. 仅在 Agent handoff 生成 Workspace link locator；
5. 恢复两个用户 intent，并修复 Resource Browser hierarchy contract；
6. 删除 symlink-only project-fact path 和 direct-target bypass；
7. 重新运行路径级测试、可见 Electron 验收与 Agent Evaluation。

在上述边界完成前，当前改造不能视为可发布，也不应继续以局部兼容分支维持。
