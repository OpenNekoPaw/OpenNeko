# 缓存、文件访问与路径变量

状态：Accepted

更新日期：2026-07-17

本文定义保留 TUI/VS Code 产品中路径、文件读写、内容访问、Webview 投影和派生缓存的横切边界。Entity 与 Asset 业务语义分别见 [`unified-entity.md`](unified-entity.md) 和 [`asset-library.md`](asset-library.md)。

## 核心原则

- 持久事实只保存 workspace-relative path、`${VAR}/path`、stable source/`ResourceRef`、asset/entity ID 和 provenance。
- 绝对路径、Engine token、Webview URI、blob URL、stream id、preview URL 和 cache materialized path 只能是本机短生命周期状态。
- Cache 只保存可重建派生物，不能成为项目、Asset、Entity、Agent memory 或原始 source 的事实来源。
- Webview 不直接扫描文件系统、媒体库或缓存目录；Extension/Node host 负责授权和投影。
- 大型二进制、需要 Range/seek/probe/decode 的媒体走 Rust Media Engine；纯文本、配置和 JSON 项目事实走 Host IO 与领域 codec。
- 未知路径变量、越界访问、失效 token、缺失 provider 和不支持的 source kind 必须 fail-visible。

## 路径分类

| 形态 | 是否可持久化 | 用途 |
| --- | --- | --- |
| workspace-relative path | 是 | 项目内 source 与项目文件 |
| `${VAR}/path` | 是 | 用户配置 root 下的 portable source |
| stable `ResourceRef` / document source ref | 是 | 跨包、Agent、Canvas、Asset/Entity 交接 |
| Asset/Entity ID + provenance | 是 | 领域事实与绑定 |
| 本机绝对路径 | 否 | host adapter 内的解析结果或用户级设置 |
| Engine token/Range URL/stream descriptor | 否 | 已授权媒体 runtime |
| Webview URI/blob/object URL | 否 | 当前 Webview projection |
| cache/temp/materialized path | 否 | 可重建派生物或单次任务 scratch |

`Downloads`、系统 Desktop、temp 和任意未纳管绝对目录不是隐式导入来源。用户必须显式选择文件、移入 workspace/素材库，或配置允许的路径变量；拒绝时返回 unauthorized/non-portable diagnostic。

## 服务职责

| 服务 | 负责 | 不负责 |
| --- | --- | --- |
| `PathResolver` | `${VAR}/path`、workspace-relative 与 runtime absolute path 的转换 | 缓存选择、Webview 投影、领域导入语义 |
| `ProjectFileStore` + `ProjectFormatCodec` | JSON 项目事实的 schema、诊断、原子读写和路径收缩 | 大型媒体、preview、cache、Engine token |
| `ContentAccessService` | 按 intent 选择 source、bytes、Engine registration、cache variant 或 Webview projection | 创建领域事实、决定 UI workflow |
| `@neko/content/document` | 文档 format、manifest/range/locator、entry ref 和图片元数据语义 | cache root、Webview URI、Engine 生命周期 |
| `ResourceCacheService` | variant key、fingerprint、派生物 materialize、失效和 GC | 原始 source identity、项目事实、用户正式导出 |
| `LocalResourceAccessService` | 小型受控资源的 Webview URI 投影 | 大文件 Range server、持久身份 |
| Engine file access | 授权后的二进制读取、Range、probe、decode、preview/proxy/thumbnail | 项目路径变量、cache ledger、Webview UI |
| Domain import/save service | 用户确认的导入、保存、导出和领域事实更新 | 透明缓存目录、临时 URL |

`ContentAccessService` 是上层统一编排入口。调用方提供 caller、intent、source/ref 和 target；Host 侧决定是否直接读取、注册 Engine、生成/复用 cache variant 或投影 Webview URI。领域包不能根据 cache 目录结构或 token 格式自行分支。

## 数据类型路由

| 数据或动作 | Canonical path |
| --- | --- |
| 纯文本、Markdown、JSON/TOML/YAML、`.nkc`、`.nkv` 项目事实 | `ProjectFileStore`、领域 codec、Host text/fs adapter |
| PDF/EPUB/CBZ/Office 等文档语义 | `@neko/content/document` + 注入的 Host runtime deps |
| 图片、音频、视频等二进制或容器 source | `ContentAccessService` + Engine file access/领域 provider |
| 缩略图、文档页图、preview/proxy、OCR/ASR/metadata sidecar | `ResourceCacheService` provider |
| 播放、Range/seek、媒体 probe/decode、waveform、导出编码 | `@neko/neko-client` / Engine，由 Host 授权 source |
| Webview 展示 URI | `LocalResourceAccessService` 或 cache projection |
| 用户选择的正式导入/导出路径 | owning domain import/save service + content ingest |

## 保留领域分工

| 领域 | 统一内容访问 | 直接 Engine 场景 | 不进入资源缓存 |
| --- | --- | --- | --- |
| Canvas | node source、document image、generated asset、thumbnail/preview 走 content/cache service | 音视频播放、probe 和 Engine-backed preview | `.nkc` 节点、布局、文本和持久 source ref |
| Cut | source ingest、proxy/thumbnail/preview variant 与 export source resolution | 播放、seek、frame extraction、waveform、proxy、export/transcode | `.nkv` timeline、subtitle cue 和最终导出文件 |
| Preview | 打开前 source 授权、document entry/page image 和轻量 projection | 视频/音频 Range、seek、probe/decode | 原始 source identity 与 Webview UI state |
| Agent | attachment、document image、perception 和 generated media projection | provider 需要已授权 bytes、media probe 或预处理 | prompt、Skill metadata、稳定 ref/text summary |
| Assets/Entity | thumbnail、metadata sidecar 和 media visual | thumbnail/probe/extract metadata | Asset/Entity/library facts 和正式导入 source 记录 |

Tools 只消费授权后的文档/媒体诊断输入，不拥有第二套 cache、path resolver 或 Engine source policy。

## 项目文件与 source policy

当前保留项目写入重点是 Canvas `.nkc` 与 Cut `.nkv`。领域 codec 拥有 schema、validation、migration 和 serialization；Extension/Node host 通过 `ProjectFileStore` 调用 codec，并在写入前应用 `PortableSourcePathPolicy`。

- Host-originated authoring 不要求打开 Webview；详见 [`headless-project-authoring.md`](headless-project-authoring.md)。
- 新 source 必须先 canonicalize 为 workspace-relative、`${VAR}/path` 或 stable ref。
- 无法 portable 化的绝对路径必须拒绝或走显式用户导入，不得静默复制到未知 temp/cache。
- 保存成功只表示项目事实已原子写入；reveal、preview 和 cache materialize 是独立结果。

## Agent 与 Canvas 资源交接

Agent tool/result、Canvas node、Cut import 和跨包 artifact 使用结构化引用：

| 引用 | 生命周期 | 规则 |
| --- | --- | --- |
| `ResourceRef`、document/source ref、Asset/Entity ID | durable | 可以进入 session、Canvas/Cut request 和项目事实 |
| `renderUri`、Engine URL/token、blob URL | runtime | 只能存在于当前投影，跨包发送前剥离 |
| temp/cache/materialized path | derived | 只能由 owner 读取；长期使用前晋升为正式 source/ref |

生成的二进制媒体要进入持久项目，必须先提交到项目拥有的稳定生成目录或正式 Asset，并取得 durable identity。只有 cache/temp 路径的旧结果必须显示诊断，不能伪装成可持久引用。

## Webview 投影

- Extension 静态 bundle、小图、字体和 CSS 可以通过 `webview.asWebviewUri()` 与最小 `localResourceRoots` 投影。
- 大型媒体、需 seek 的资源和不兼容 codec 走 Engine Range/stream/proxy；`asWebviewUri()` 不是通用文件服务器。
- Webview message 只携带 typed projection，不能泄露 root、绝对路径、SecretStorage 或任意文件读取能力。
- panel dispose、editor close、task cancel 和 Extension deactivate 必须撤销 token、URL、blob 与 provider lease。

媒体细节见 [`webview-media-security.md`](webview-media-security.md)。

## 缓存不变量

- cache key 来自 canonical source identity、variant、版本和必要参数，不能来自 Webview URL 或临时绝对路径。
- cache miss 可以重建；provider 缺失、source 未授权或 schema/version 未知必须报告错误。
- GC 不能删除正式项目文件、正式导入 Asset、用户导出或 Entity facts。
- metadata ledger 可以记录派生物状态和诊断，但不能替代 source provenance。
- 测试使用隔离临时 root 和合成 fixture，不读取开发机用户缓存或凭据。

## 验证

- path resolver 测试覆盖 workspace、变量、未知变量、越界和 portable 收缩；
- project-file 测试覆盖 schema diagnostic、原子写入、save/reopen 和 source policy；
- Engine file access 测试覆盖授权、token 失效、合法/非法 Range、seek 和释放；
- cache provider 测试覆盖 key、reuse、invalidation、GC 与 source 删除；
- Webview protocol 测试证明持久 payload 不含绝对路径、cache path、Engine token、Webview URI 或 blob URL；
- 路径级测试证明调用方经过公共 content/cache/Engine adapter，未命中 package-local fallback。
