## Why

Agent、Canvas 等产品子包当前直接构造 ResourceCache providers、manifest、root、GC 和 lifecycle，使缓存成为跨包业务协议。产品子包只需要表达 thumbnail、proxy、waveform 或 raster page 等表现语义，物理存储、复用和清理应由共享 Host 内容实现独占。

## What Changes

- 新增 storage-neutral `ContentRepresentationService`，产品子包只请求 thumbnail、proxy、preview、waveform、loudness、raster-page、fov-crop、semantic sidecar 或 processor output ownership。
- **BREAKING**：Agent、Assets、Canvas、Cut、Preview 和 Tools 生产代码不再导入、构造或持有 `ResourceCacheService/Provider`、manifest store、cache root、GC、retention 或 missing-cache status。
- 将 ResourceCache runtime、provider wrapping、LocalMetadata cache ledger、startup GC 和维护入口移动到共享 Host content composition；保留现有 key、freshness、in-flight deduplication、quota 和 lifecycle 行为。
- package-local cache provider 改为 storage-neutral representation generator/processor，由 Host 包装为内部 derived provider。
- workspace/media-library 原始 source、文档原文件和 EPUB/DOCX/CBZ 原生 entry 直接读取，不创建 document-entry cache artifact。
- PDF/Office raster page、document thumbnail 和其他实际生成内容继续使用内部 derived storage。
- External Processor 用 `intermediate | debug | candidate | promoted` ownership 取代公开 `resourceCache` input/output/cwd root。
- 正式 Asset、creator-visible generated output、accepted candidate、项目文件和用户 export 保持 durable ownership，不受 derived GC 管理。
- 本变更保持现有 ContentAccess intent/target/materialization matrix 为 source/runtime canonical API；其简化由 `simplify-workspace-content-io` 独立处理。

## Capabilities

### New Capabilities

- `derived-content-representations`: 产品包的语义表现请求、Host-private derived storage、native source/entry 直读、processor ownership 和 durable promotion 边界。

### Modified Capabilities

无。当前 `openspec/specs/` 没有覆盖派生表现和 ResourceCache package visibility 的已归档 capability。

## Impact

- Host content runtime、ResourceCache providers/service、LocalMetadata cache tables 和 startup maintenance。
- Agent、Assets、Canvas、Cut、Preview、Tools 的 extension composition、resource projection 和 dependency guards。
- `@neko/content/document`、ReadDocument/ReadImage 和 document-entry projection。
- External Processor manifests、host adapter、resource port 和 candidate promotion。
- 与 `simplify-workspace-content-io` 的顺序关系：本变更先让缓存退出产品包，后者再删除公共 ContentAccess cache/materialization 词汇。
