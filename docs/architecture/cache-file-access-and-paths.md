# 内容读写、工作区路径与派生存储

状态：Accepted

更新日期：2026-07-22

目标实现拆分为 [`adopt-workspace-linked-media-libraries`](../../openspec/changes/adopt-workspace-linked-media-libraries/proposal.md)、[`internalize-derived-content-storage`](../../openspec/changes/internalize-derived-content-storage/proposal.md) 和 [`simplify-workspace-content-io`](../../openspec/changes/simplify-workspace-content-io/proposal.md)。前两个可独立推进，Content I/O 简化在两者完成后实施。本文记录最终目标架构；旧媒体库 `${VAR}` 和旧 ContentAccess cache contract 只可作为 migration/cleanup 输入。

本文定义 TUI/VS Code 产品中的工作区路径、内容读写、文档访问、runtime 投影和可重建派生物边界。Creative Entity 与 Media Library 的业务语义分别见 [`unified-entity.md`](unified-entity.md) 和 [`asset-library.md`](asset-library.md)。

## 核心原则

- 媒体库通过本机 Git-ignored `neko/assets/<libraryName>` symlink/junction 进入工作区；link 本身是 target 映射的唯一事实。
- 媒体库文件与普通文件使用同一 workspace-relative path；PathResolver 不理解 library ID、target setting 或媒体库变量。
- OS 负责 link target 跟随；Host 只做 absolute/traversal 拒绝和 `neko/assets` 直接 link 的最小 realpath 安全校验。
- 公共内容接口只表达 source read、runtime projection、authorized write 和 semantic representation；不暴露 cache、materialization、manifest、root、GC 或 physical path。
- 产品子包不感知 ResourceCache。thumbnail、proxy、waveform、raster page 等是表现语义，是否生成、复用或存储由 Host 内容实现决定。
- Cache 只保存可重建派生物，不能成为项目、Asset、Entity、Agent memory、原始 source 或 accepted output 的事实来源。
- 未知 locator、越界路径、broken link、失效 token、缺失 representation generator 和未知 schema/version 必须 fail-visible。

## Locator 分类

| 形态 | 是否可持久化 | 用途 |
| --- | --- | --- |
| workspace-relative path | 是 | 工作区 source 与项目文件 |
| `neko/assets/<libraryName>/path` | 是 | linked media-library source；仍是普通 workspace path |
| document source + locator/entryPath | 是 | PDF/EPUB/DOCX/CBZ 等文档定位 |
| stable `ContentLocator` / Asset / Entity identity | 是 | workspace、document entry、generated output、package 与领域事实的跨包身份 |
| `${VAR}/path` | 有条件 | 其他非媒体库既有配置 root；不得用于新媒体库 source |
| 本机绝对路径或 link target | 否 | Host 打开文件时的内部结果 |
| Engine/Webview/Node token 或 stream URL | 否 | 当前 runtime projection |
| derived/cache/temp/materialized path | 否 | Host 内部可重建表现或 scratch |

普通 workspace source 不需要为了读取先包装为 ResourceRef。`Downloads`、Desktop、temp 和任意外部绝对目录也不是隐式授权来源；用户必须显式导入、放入 workspace，或创建 `neko/assets/<libraryName>` link。

## 服务职责

| 服务 | 负责 | 不负责 |
| --- | --- | --- |
| `PathResolver` | 普通 workspace-relative path 和其他保留 portable path 的 normalization/resolution | 媒体库 registry、target lookup、cache、Webview |
| workspace file guard | absolute/traversal 拒绝、普通 workspace containment、`neko/assets` direct link 与 final realpath containment | 保存 target、修复 link、维护 library state |
| `ContentReadService` | locator stat、bounded bytes/Range、Webview/Engine/processor opaque projection | cache policy、项目写入 ownership、公开 localPath |
| `ContentRepresentationService` | thumbnail/proxy/waveform/raster 等语义表现请求 | 向调用方公开存储方式、cache status 或 root |
| Host derived store (`ResourceCacheService` internal) | fingerprint、生成复用、in-flight 去重、freshness、retention、quota、GC | 产品子包协议、source identity、正式 Asset/输出 |
| `@neko/content/document` | 文档 format、manifest/range/locator/cursor、native entry 读取语义 | cache root、Webview URI、Agent 解包协议 |
| authorized workspace writer | 有界、原子、安全的 workspace bytes 写入 primitive | 决定 project/Asset/generated/export/cache ownership |
| `ProjectFileStore` + domain codec | NK/JSON 项目事实 schema、诊断、原子保存和迁移 | 二进制表现、Engine token、cache lifecycle |
| Domain import/save service | Asset、generated output、package、export 的用户意图与 durable ownership | 透明 cache destination、任意 absolute write |

Host 为不同 consumer 注入 capability-scoped port。调用方不能通过 `caller` 或 `intent` 字符串自行提升权限；公共 result 使用 discriminated union，只返回该操作的 bytes、metadata 或 opaque projection。

## 数据路由

| 数据或动作 | Canonical path |
| --- | --- |
| 纯文本、Markdown、JSON/TOML/YAML、NKC/NKV 项目事实 | `ProjectFileStore`、领域 codec、authorized writer |
| workspace/linked 原始图片、音视频、文档文件 | `ContentReadService` source read；不先创建 representation |
| EPUB/DOCX/CBZ 原生 archive entry | DocumentAccess + bounded entry read；不持久物化 |
| PDF/CBZ Range、DOCX bounded full read、EPUB entry transport | DocumentAccess + Preview Node adapter |
| thumbnail、proxy、preview transcode、waveform/loudness、raster page、OCR/ASR/embedding | `ContentRepresentationService`；Host 内部 derived store |
| 播放、seek、probe、decode、export encode | Content projection + Engine |
| Webview 展示 | Content projection + LocalResourceAccess/Node/Engine adapter |
| Asset import、generated output、package、用户 export | owning domain service + authorized writer |

## 内容接口

公共接口不再使用独立 `intent × target × materialization × qualityMode` 组合，也不返回并列 optional `bytes/localPath/uri/engineSource/runtimeStream`。目标接口分为：

- `stat(locator, constraints)`；
- `read(locator, range/maxBytes/signal)`；
- capability-scoped `WebviewContentProjectionPort` / `EngineContentProjectionPort` / `ProcessorContentProjectionPort`；
- `getRepresentation(locator, representationSpec)`；
- Host/领域 owner 注入的 authorized writer。

公共请求和结果不得出现 `cache-materialize`、`missing-cache`、`cache-path`、`cache-artifact`、cache destination、manifest path、root、GC 或 storage provider ID。Host-only physical path resolver 不作为跨包 service target。

## 工作区 Link 安全边界

`neko/assets/<libraryName>` link 的创建、替换和移除是一次性文件系统 helper，不是运行时 registry 或 lifecycle service：

- `libraryName` 必须是 portable single segment，并与退休 catalog 保留名 `library.json`、平台保留名和现有名称无冲突。
- 创建 link 时写精确 Git ignore；不得把 target string 提交或打包，也不得宽泛忽略 unrelated real asset。
- 枚举与 availability 即时来自 `readdir/lstat/stat`，不保存 target、accessible/remapped state 或 background repair metadata。
- 只允许 `neko/assets` 直接 link 穿越 workspace physical root；其他 unmanaged symlink 继续按普通 containment 拒绝。
- 最终 realpath 必须位于动态解析的顶层 link target 内，阻止 nested symlink escape。
- workspace 移动不会改变 absolute-target link；target 移动时 broken link fail-visible，用户 relink 只替换 link。

Extension Host 并非真正 OS sandbox，因此仍需上述 guard；但 guard 不负责路径映射，OS 才是映射 owner。

## 子包边界

| 子包 | 可以感知 | 不得感知 |
| --- | --- | --- |
| Assets | source locator、thumbnail spec、Asset ownership | ResourceCache provider/root/manifest/GC |
| Canvas | source locator、thumbnail/preview/raster spec | cache status、materialized path、startup GC |
| Cut | source locator、proxy/waveform/loudness spec | cache provider、quota、retention、root |
| Preview | source/document locator、runtime projection | document-entry cache、physical path |
| Agent | exact workspace path、document entry、safe bytes/metadata | `${VAR}`、library ID、cache path、archive implementation |
| Tools | stable diagnostics、maintenance command result | 任意 cache path 或 provider-private payload |

产品包可以提供 storage-neutral generator/processor adapter，但 Host 内容 composition 负责把它包装为内部 derived provider。External Processor 使用 `intermediate | debug | candidate | promoted` ownership，不使用公共 `resourceCache` root。

## 文档与 Agent

ReadDocument 输出 stable document locator，ReadImage 原样交回 ContentReadService。Agent 不感知 EPUB/DOCX/CBZ 解包，也不需要为原生 entry 构造 ResourceRef 或 cache variant。

- 已存在的 archive image entry 是 source content，直接有界读取。
- PDF/Office raster page、document thumbnail 是实际生成的 representation。
- 打开期 ZIP index/parser state 可以在 document session 内存中复用，随 session 释放，不写 derived ledger。
- Preview 的 Node token 只属于 panel/runtime，不是 cache 或持久 identity。

## 写入与持久事实

- 新媒体库 source 保存 `neko/assets/<libraryName>/...`，与普通 workspace path 使用相同 grammar。
- NKC/NKV 写入拒绝媒体库 `${VAR}`、absolute path、file URI、cache/materialized path、Webview/Engine URL。
- 项目、Asset、generated output、package 和 export 的 ownership 由原有领域 owner 决定；共享 writer 不根据 mode 猜测 destination。
- package/export 通过 ContentReadService 读取 link descendant 字节，不复制 symlink object 或序列化 target。
- legacy variable/original path/local override 仅由 migration reader 使用；正常读取和 authoring 不保留 fallback。

## 派生物不变量

- source/original/native document-entry 不进入派生物存储。
- thumbnail、proxy、preview transcode、waveform/loudness、fov-crop、raster page、OCR/ASR/embedding、semantic/search projection 和 rebuildable processor intermediate 可以内部复用和 GC。
- key 来自 source identity/fingerprint、representation spec、generator/profile/runtime revision，不能来自 absolute path、link target、Webview URL 或 temp path。
- derived failure 不能阻止可授权 source read；缺失 representation 也不能回退 source 后伪装成功。
- GC 不能删除项目文件、正式 Asset、creator-visible generated output、accepted candidate、用户 export 或 Entity facts。
- 产品子包 production code 不得 import ResourceCache contracts 或实现 package-local cache manager。

## 验证

- link helper/guard 测试覆盖 Git ignore、workspace move、broken/relink、junction、unmanaged/nested escape 和 target non-disclosure；
- content contract 测试覆盖 discriminated read/projection、Range/maxBytes/cancel、authorized writer 和无 cache/localPath public fields；
- dependency guard 证明产品包不 import ResourceCache、manifest、root、GC 或 materialization protocol；
- source/representation 路径测试证明原始文件和 native entry 直读，thumbnail/proxy/raster 命中内部 representation path；
- NK/package 测试覆盖 save/reopen/workspace move/relink、legacy migrate/reject、link dereference 和无 fallback；
- Webview/Agent protocol 测试证明 payload 不含 absolute target、cache path、raw filesystem error、Engine/Webview runtime identity 持久化。
