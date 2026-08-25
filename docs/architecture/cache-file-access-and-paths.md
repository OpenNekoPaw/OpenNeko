# 内容读写、工作区路径与派生存储

状态：Accepted

更新日期：2026-08-13

项目媒体身份、本机授权、受管链接投影、派生内容私有存储与 Content I/O 的当前收敛结果由本文记录。
旧媒体库 `${VAR}`、旧 ContentAccess cache contract 和旧 locator 分支不进入新产品读取、启动或自动 cleanup 路径。
canonical 内容地址只由文件 authority、规范化路径和可选文件内 selector 组成。

本文定义 Desktop 产品中的工作区路径、内容读写、文档访问、runtime 投影和可重建派生物边界。Creative Entity 与 Media Library 的业务语义分别见 [`unified-entity.md`](unified-entity.md) 和 [`asset-library.md`](asset-library.md)。`neko/assets/<libraryName>` 受管软链接是 binding 派生的 Workspace 访问路径，不是媒体身份或授权 authority。

## 核心原则

- 所有跨包内容事实使用 package-owned `ContentLocator`；workspace 媒体库链接仍由 Assets owner 维护 binding，
  但不会引入第二种 locator identity。
- 项目 `.neko` 保存 target-free binding，全局 connection 保存物理授权，`neko/assets/<libraryName>`
  直接软链接（Windows junction）是两者派生的 Workspace 访问投影。
- Host 校验 exact binding、connection 与 managed link 一致后，才允许链接跨越 Workspace 边界，并做
  relative/traversal 与最终 realpath containment 校验。
- 公共内容接口只表达 source read、runtime projection、authorized write 和 semantic representation；不暴露 cache、materialization、manifest、root、GC 或 physical path。
- 产品子包不感知 ResourceCache。thumbnail、proxy、waveform、raster page 等是表现语义，是否生成、复用或存储由 Host 内容实现决定。
- Cache 只保存可重建派生物，不能成为项目、Asset、Entity、Agent memory、原始 source 或 accepted output 的事实来源。
- 未知 locator、越界路径、broken link、失效 token、缺失 representation generator、未知字段和
  非 canonical shape 必须 fail-visible。

## Locator 分类

| 形态                                              | 是否可持久化  | 用途                                                        |
| ------------------------------------------------- | ------------- | ----------------------------------------------------------- |
| workspace-relative path                           | 是            | 工作区 source 与项目文件                                    |
| package authority + packageId/revision/path       | 是            | package-owned resource                                      |
| `neko/assets/<name>/<descendant>`                 | 仅 Agent 投影 | sender-bound Workspace 访问，不写回项目领域事实             |
| document source + locator/entryPath               | 是            | PDF/EPUB/DOCX/CBZ 等文档定位                                |
| stable `ContentLocator` / Asset / Entity identity | 是            | workspace/package file、document entry 与领域事实的跨包身份 |
| `${VAR}/path`                                     | 有条件        | 其他非媒体库既有配置 root；不得用于新媒体库 source          |
| 本机绝对路径或 link target                        | 否            | Host 打开文件时的内部结果                                   |
| Host/Renderer/Node token 或 stream URL            | 否            | 当前 runtime projection                                     |
| derived/cache/temp/materialized path              | 否            | Host 内部可重建表现或 scratch                               |

普通 workspace source 和受管媒体链接都使用 `WorkspaceFileContentLocator`；package 资源使用
`PackageResourceContentLocator`。它们都不把 cache、物理 target 或 runtime projection 写入内容身份。
`Downloads`、Desktop、temp 和任意外部绝对目录不是隐式授权来源；用户必须显式导入或建立受管链接投影。

## 服务职责

| 服务                                                 | 负责                                                                          | 不负责                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| `PathResolver`                                       | 普通 workspace-relative path 和 portable relative descendant 的 normalization | 媒体库授权策略、cache、Webview                      |
| workspace file guard                                 | absolute/traversal 拒绝、普通 containment、exact managed-link containment     | link 生命周期、fallback target、Asset membership    |
| Assets binding/managed-link service                  | binding、global connection 校验、link 投影、名称冲突与 target containment     | 项目事实、fallback target、target 内容              |
| `ContentReadService`                                 | locator stat、bounded bytes/Range、Renderer/media/processor opaque projection | cache policy、项目写入 ownership、公开 localPath    |
| `ContentRepresentationService`                       | thumbnail/proxy/waveform/raster 等语义表现请求                                | 向调用方公开存储方式、cache status 或 root          |
| Host derived store (`ResourceCacheService` internal) | fingerprint、生成复用、in-flight 去重、freshness、retention、quota、GC        | 产品子包协议、source identity、正式 Asset/输出      |
| `@neko/content-domain/document`                             | 文档 format、manifest/range/locator/cursor、native entry 读取语义             | cache root、Webview URI、Agent 解包协议             |
| authorized workspace writer                          | 有界、原子、安全的 workspace bytes 写入 primitive                             | 决定 project/Asset/generated/export/cache ownership |
| `ProjectFileStore` + domain codec                    | NK/JSON 项目事实 canonical shape、诊断与原子保存                              | 二进制表现、runtime token、cache lifecycle          |
| Domain import/save service                           | Asset、generated output、package、export 的用户意图与 durable ownership       | 透明 cache destination、任意 absolute write         |

Host 为不同 consumer 注入 capability-scoped port。调用方不能通过 `caller` 或 `intent` 字符串自行提升权限；公共 result 使用 discriminated union，只返回该操作的 bytes、metadata 或 opaque projection。

## 数据路由

| 数据或动作                                                                             | Canonical path                                                            |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 纯文本、Markdown、Fountain、普通 JSON/TOML/YAML 内容源                                 | Agent/Editor scoped authorized file writer                                |
| Canvas NKC、Cut OTIO 等结构化项目事实                                                  | owning `ProjectFileStore`、领域 codec 与 authoring service                |
| workspace/managed-link 原始图片、音视频、文档文件                                      | owner-qualified `ContentReadService` source read；不先创建 representation |
| EPUB/DOCX/CBZ 原生 archive entry                                                       | DocumentAccess + bounded entry read；不持久物化                           |
| PDF/CBZ Range、DOCX bounded full read、EPUB entry transport                            | DocumentAccess + Preview Node adapter                                     |
| thumbnail、proxy、preview transcode、waveform/loudness、raster page、OCR/ASR/embedding | `ContentRepresentationService`；Host 内部 derived store                   |
| 播放、seek、probe、decode、export encode                                               | Content projection + `@neko/media`                                        |
| Renderer 展示                                                                          | Content projection + Desktop/Node adapter                                 |
| Asset import、generated output、package、用户 export                                   | owning domain service + authorized writer                                 |

## 内容接口

公共接口不再使用独立 `intent × target × materialization × qualityMode` 组合，也不返回并列 optional `bytes/localPath/uri/engineSource/runtimeStream`。目标接口分为：

- `stat(locator, constraints)`；
- `read(locator, range/maxBytes/signal)`；
- capability-scoped Renderer/media/processor content projection port；
- `getRepresentation(locator, representationSpec)`；
- Host/领域 owner 注入的 authorized writer。

公共请求和结果不得出现 `cache-materialize`、`missing-cache`、`cache-path`、`cache-artifact`、cache destination、manifest path、root、GC 或 storage provider ID。Host-only physical path resolver 不作为跨包 service target。

## 项目媒体受管链接安全边界

- `libraryName` 必须是 portable single segment，`relativePath` 必须 normalized、relative 且无 dot segment。
- 项目 `.neko` 保存 target-free binding；软链接入口是由 binding 与 exact global connection 派生的访问投影。
- link 只有在用户确认 binding，或本地初始化能证明 existing link 精确匹配唯一 global connection 时创建/替换。
- Content guard 检查 exact binding、global connection 与 `neko/assets/<libraryName>` 直接链接，不尝试
  active/recent Workspace、同名 connection、cache 或 alternate provider。
- 最终 realpath 必须位于当前 managed link target 内，阻止 nested symlink escape。
- 项目 codec、Renderer、Agent、log、sync 与 package 都拒绝 `.neko` path、connection identity 和 target。

Electron Main 并非真正 OS sandbox，因此仍需上述 guard；Desktop 只拥有 sender/Workspace/native path
授权 adapter，link lifecycle、resolution 和 recovery policy 由 Assets/Content owning package 决定。

## 子包边界

| 子包    | 可以感知                                                                                                    | 不得感知                                                                           |
| ------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Assets  | source locator、thumbnail spec、Asset ownership                                                             | ResourceCache provider/root/manifest/GC                                            |
| Canvas  | source locator、thumbnail/preview/raster spec                                                               | cache status、materialized path、startup GC                                        |
| Cut     | source locator、proxy/waveform/loudness spec                                                                | cache provider、quota、retention、root                                             |
| Preview | canonical content locator、runtime representation handle/projection                                         | selected-content cache、physical path                                              |
| Agent   | owner-qualified content locator、document entry、safe bytes/metadata；结构化项目的 owning-domain projection | `.neko`、connection/target、cache path、archive implementation、NKC/OTIO raw bytes |
| Tools   | stable diagnostics、maintenance command result                                                              | 任意 cache path 或 provider-private payload                                        |

产品包可以提供 storage-neutral generator/processor adapter，但 Host 内容 composition 负责把它包装为内部 derived provider。External Processor 使用 `intermediate | debug | candidate | promoted` ownership，不使用公共 `resourceCache` root。

## 文档与 Agent

DSH document operation 使用 canonical `ContentLocator`；文档 entry 通过 locator selector 表达，
read-images 将同一 source locator 交回 ContentReadService。Agent 不感知 EPUB/DOCX/CBZ 解包，也不构造 cache variant。

- 已存在的 archive image entry 是 source content，直接有界读取。
- PDF/Office raster page、document thumbnail 是实际生成的 representation。
- 打开期 ZIP index/parser state 可以在 document session 内存中复用，随 session 释放，不写 derived ledger。
- Preview 的 Node token 只属于 panel/runtime，不是 cache 或持久 identity。

## 写入与持久事实

- 媒体库 source、普通项目文件和导入结果保存 `WorkspaceFileContentLocator`；package 内容保存
  `PackageResourceContentLocator`。
- NKC/OTIO 写入拒绝 `.neko`、媒体库 `${VAR}`、`neko/assets` Agent 投影、absolute path、file URI、
  connection identity、cache/materialized path、Renderer/runtime URL。
- Agent generic file read/write 额外拒绝 NKC/OTIO；Agent 只能通过 Canvas/Cut owning-domain
  query/authoring capability 访问其结构与 mutation。
- 项目、Asset、generated output、package 和 export 的 ownership 由原有领域 owner 决定；共享 writer 不根据 mode 猜测 destination。
- package/export 通过 ContentReadService 读取 exact locator 字节，不复制 binding/link 或序列化 target。
- 产品普通 sync 不包含 `.neko`、binding、managed link 或 external bytes；独立便携快照只复制权威引用的 bytes，并在
  sibling staging 中重写项目文档后 atomic publish，不修改 source workspace 或 external target。
- legacy variable/original path/local override 不由产品 runtime 读取、分类或转换；正常读取和 authoring
  只有 canonical locator path。

## 派生物不变量

- source/original/native selected content 不进入派生物存储。
- thumbnail、proxy、preview transcode、waveform/loudness、fov-crop、raster page、OCR/ASR/embedding、semantic/search projection 和 rebuildable processor intermediate 可以内部复用和 GC。
- key 来自 source identity/fingerprint、representation spec、generator/profile identity 与影响输出的
  外部 runtime fingerprint，不能来自 absolute path、link target、Webview URL、temp path 或内部数据代次。
- derived failure 不能阻止可授权 source read；缺失 representation 也不能回退 source 后伪装成功。
- GC 不能删除项目文件、正式 Asset、creator-visible generated output、accepted candidate、用户 export 或 Entity facts。
- 产品子包 production code 不得 import ResourceCache contracts 或实现 package-local cache manager。

## 验证

- binding/link/guard 测试覆盖 `.neko` deletion、create/rebind/remove、invalid sibling、workspace move、unavailable target、
  unmanaged/nested escape 和 target non-disclosure；
- content contract 测试覆盖 discriminated read/projection、Range/maxBytes/cancel、authorized writer 和无 cache/localPath public fields；
- dependency guard 证明产品包不 import ResourceCache、manifest、root、GC 或 materialization protocol；
- source/representation 路径测试证明原始文件和 native entry 直读，thumbnail/proxy/raster 命中内部 representation path；
- NK/package 测试覆盖 save/reopen/workspace move/rebind、非 canonical record 局部拒绝、binding + managed-link resolution
  和 canonical path 唯一性；
- Renderer/Agent protocol 测试证明 payload 不含 absolute target、cache path、raw filesystem error 或 runtime identity 持久化。
