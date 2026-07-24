## Context

ResourceCache contract 和 composition 当前跨越共享层、Agent、Canvas、Assets 和 processor：产品包知道 provider、variant cache status、manifest、root、GC 和 lifecycle。与此同时，DocumentEntry provider 已能直接读取 EPUB/DOCX/CBZ entry，但部分调用链仍先写 cache 再读。

五层边界如下：职责上产品包拥有表现语义/generator，Host 内容层拥有存储/lifecycle；依赖上子包只依赖 representation port；接口上 request 是 semantic spec；扩展上新表现增加 generator 而非 cache provider；测试同时断言结果和 cache/source 执行路径。

## Goals / Non-Goals

**Goals:**

- 让产品子包完全不感知 ResourceCache 实现与物理存储。
- 保留 thumbnail/proxy/waveform/raster 等派生物的复用、freshness、quota 和 GC。
- 让原始 source 和 native document entry 直接读取。
- 用 storage-neutral ownership 表达 processor intermediate/candidate/promotion。

**Non-Goals:**

- 删除 ResourceCache 内部实现或 LocalMetadata cache ledger。
- 删除 ContentAccess intent/target/materialization matrix；它在本变更中仍是 source/runtime canonical API。
- 修改媒体库路径、NKC/NKV source 或 link migration。
- 改写 generated output、Asset 或 export 的 durable ownership。

## Decisions

### 1. Representation 是公共语义，cache 是内部策略

L0 的 `@neko/shared/content-access` 定义 `ContentRepresentationService` 和 closed `RepresentationSpec`，避免让 `@neko/shared/vscode/extension` 反向依赖已经依赖 shared 的 `@neko/content`。`@neko/content` 只提供文档语义和 storage-neutral generator。Assets 请求 thumbnail，Cut 请求 proxy/waveform/loudness，Canvas 请求 preview/raster，Agent/Preview 请求必要表现。返回 stable representation locator 或 safe unavailable diagnostic，不返回 cache path/status/provider。

同一 service 必须提供 bounded representation read：consumer 用刚获得的 locator 请求 range/maxBytes，Host 在内部验证 locator identity、解析 derived entry 并返回 bytes/metadata 或 safe unavailable diagnostic。locator 携带 source/spec/generator identity 以便稳定校验，但不携带 cache root、物理路径、provider 或 manifest。Webview/Engine/processor 的窄 projection 由 `simplify-workspace-content-io` 基于此 Host read 能力组合；产品包不得为消费 locator 再回到 ResourceCache API。

### 2. Host composition 独占 derived storage

`@neko/shared/vscode/extension` 的 Host adapter/应用 bootstrap 组合 ResourceCacheService、LocalMetadata ledger、provider wrapping、root、startup GC 和 maintenance。产品 extension 不创建 package-local runtime，也不持有 manifest store。

产品包可以提供 storage-neutral generator：输入 source locator + semantic spec，输出 bytes/metadata。Host 将 generator 包装为内部 cache provider并拥有 cancellation、atomic write、record 与 cleanup。

### 3. 保留现有 lifecycle 能力

内部 key 继续由 source fingerprint、representation spec、generator/profile/runtime revision 组成。保留 in-flight deduplication、bounded concurrency、freshness、invalidation、retention、quota、GC 和 lifecycle metadata。

正式 Asset、`neko/generated/<kind>/` source、accepted candidate、项目文件和用户 export 不进入可清理 derived storage；promotion 通过 owning domain service 转移 ownership。

### 4. Native document entry 是 source

EPUB/DOCX/CBZ 中已存在的 entry 通过 DocumentEntryContentAccessProvider bounded read，Agent/Canvas 不再注册 DocumentResourceCacheProvider 来复制 entry。PDF/Office raster page 和 document thumbnail 因实际生成而继续走 representation path。

ReadDocument 输出 stable document entry ref，ReadImage 通过现有文档图片输入契约消费。打开期 ZIP/parser index 可以 session-owned 内存复用，但不写 derived ledger。

### 5. External Processor 不感知 cache root

Processor manifest/host adapter 使用 `intermediate | debug | candidate | promoted` ownership。Host writer分配 storage 并返回 stable locator；processor contract 不包含 `resourceCache` cwd/input/output root。accepted candidate 进入 durable owner 后脱离 GC。

### 6. Source read 独立于 derived failure

现有 ContentAccess provider routing被收窄：source/original/document-entry 不因 ResourceRef 或 preview intent 自动物化；明确 representation 请求才进入内部 store。derived 初始化或 provider failure 不阻止可授权 source read。

### 7. 依赖门禁固定边界

生产代码门禁禁止 Agent、Assets、Canvas、Cut、Preview、Tools import ResourceCache service/provider/manifest/root/GC/materialization/missing-cache protocol。维护测试和共享 Host implementation 进入明确 allowlist。

## Risks / Trade-offs

- **[Host composition 成为新集中点]** → 只拥有 storage/lifecycle，generator 语义仍归领域，不创建 god service。
- **[迁移期间双 cache runtime]** → 契约先行、逐 consumer 垂直迁移并 poison package-local runtime，不保留 fallback。
- **[source 与 representation 路由错误]** → spy/poison assertions 同时证明 source 未命中 cache、representation 命中内部 store。
- **[processor 输出被错误 GC]** → typed ownership、显式 promotion 和 lifecycle tests。

## Migration Plan

1. 冻结 representation spec、generator、locator、ownership 和依赖门禁。
2. 建立共享 Host derived composition并迁移现有 providers/manifest/GC。
3. 迁移 Assets、Canvas、Cut、Preview、Agent、Tools 到 semantic requests/generators。
4. 迁移 native document entry 到直接 read，保留 raster representation。
5. 迁移 External Processor storage-neutral ownership 和 promotion。
6. 删除 package-local cache composition/imports，运行 lifecycle、dependency 和真实场景验证。

## Open Questions

无。公共 ContentAccess matrix 的删除明确留给 `simplify-workspace-content-io`。
