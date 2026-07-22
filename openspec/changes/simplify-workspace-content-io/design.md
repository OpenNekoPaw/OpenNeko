## Context

本变更在 `adopt-workspace-linked-media-libraries` 已将媒体库收敛为普通 workspace locator、`internalize-derived-content-storage` 已移除产品包 cache ownership 后执行。当前剩余问题是 ContentAccess/ContentIngest 自身：独立 intent、target、materialization、qualityMode、mode 与 destination 形成大量非法组合，result 又将多个 transport 和 Host path并列暴露。

五层边界如下：职责上 read/project、representation、authorized writer 和 domain owner 分离；依赖上 consumer 获得 capability-scoped port；接口上 operation/result 都是 discriminated union；扩展上新 consumer 增加 projection adapter；测试 poison 旧 API 并验证最终用户路径。

## Goals / Non-Goals

**Goals:**

- 用 stable locator 和窄 stat/read/project 操作替换 ContentAccess 组合矩阵。
- 用 authorized writer primitive 取代 broad ContentIngest routing，同时保留领域写入 ownership。
- 删除公共 localPath、cache/materialization 和 provider-private error。
- 一次迁移全部生产者/消费者，不保留双接口或 fallback。

**Non-Goals:**

- 修改媒体库 link、legacy NK path migration 或 workspace guard。
- 移动 ResourceCache providers、manifest、GC 或 representation ownership。
- 合并 ProjectFileStore、Media Library file copy、generated output、package 和 export 为单一写服务。
- 改变 Engine/Webview/Preview runtime token 的实际 owner。

## Decisions

### 1. Stable locator 取代 source-kind 路由细节

公共 locator 是 closed union：workspace file、document entry、generated output 和 package resource。linked media 已是 workspace file，不存在 media-library kind/libraryId；Asset catalog 不再是 locator 分支。普通 workspace source 不必先包装为 ResourceRef。

### 2. Read API 使用窄操作

```ts
interface ContentReadService {
  stat(locator: ContentLocator, options?: ReadOptions): Promise<ContentStat>;
  read(locator: ContentLocator, options?: ReadOptions): Promise<ContentBytes>;
}
```

ReadOptions 只包含 range、maxBytes、signal 和必要 fingerprint precondition。Projection 最终采用三个 consumer-specific injected ports：Webview port 只返回 opaque URI，Engine port 只返回 token，processor port 只返回 handle。调用方不会获得一个可自行选择未授权 target 的通用 `project(locator, target)` 方法。

删除公共 intent、materialization、qualityMode、role duplication 和任意 caller string。权限来自 Host 注入的 capability-scoped service instance，而不是 request 自报用途。

### 3. Host physical path 不进入公共 result

`local-path` 只存在于 Host adapter 内部，不是 public target。公共 result 不含 raw error/providerId/并列 optional bytes/URI/engine/stream。diagnostic 使用 stable code + safe workspace locator；绝对 path、link target 和原始 `ENOENT` 只进入受限 Logger metadata。

### 4. Representation 保持独立语义端口

本变更复用 `internalize-derived-content-storage` 已建立的 ContentRepresentationService。Read API 不加入 cache/materialization 参数，也不根据 preview intent透明替换 source。consumer 明确请求 source 或 representation。

### 5. Writer 是安全 primitive，不决定领域 ownership

共享层只提供 bounded、atomic、authorized workspace write 和 owner-requested scratch/output allocation。ProjectFileStore、Media Library 显式文件复制、generated output、package 与 export 继续拥有 schema、destination、overwrite、backup 和 user intent。

删除公共 ContentIngest `cache-artifact`、pathVariable、mediaLibraryId、allowAbsolutePath 和 generic destination/mode branches。领域 service 直接组合 writer，不通过宽泛 provider competition 猜测操作。

### 6. DocumentAccess 只依赖 read port

DocumentAccess 保持 format、manifest、range、locator、cursor 和 adapter；底层 source/entry 通过 ContentReadService。Preview Node transport 是 Host projection detail；Agent 不感知 archive或 physical path。

### 7. Provider order 由显式 composition 替代

旧 HostContentAccessService 的 first-supports provider list 被 source locator handler 与 projection adapter 的显式 closed dispatch取代。未知 locator/operation fail-visible，不捕获 supports() exception 后静默尝试下一 provider。

### 8. 破坏性迁移只有一个 canonical path

先增加新 contracts 和 producer/consumer compile fixtures，再垂直迁移所有调用链。旧 ContentAccess/ContentIngest types、validators、providers、exports 和 tests 被 poison 后删除，不发布 adapter、alias、dual-read 或 feature flag fallback。

## Risks / Trade-offs

- **[共享契约编译面大]** → producer/consumer 分组迁移、路径级 tests、最终一次删除 legacy，不混入路径/cache ownership 变更。
- **[capability-scoped ports 增加 composition]** → 每个 port 只绑定 caller 权限和 adapter，不拥有业务状态。
- **[projection union 仍可能变宽]** → target closed union + discriminated result；若 consumer 差异扩大再拆窄 port。
- **[generic writer 越权]** → destination root/policy由 Host composition固定，领域 owner不能传 arbitrary absolute path。

## Migration Plan

1. 冻结 locator、read/project result、writer 和 diagnostic contracts；添加 old API poison fixtures。
2. 实现 explicit source handlers、projection adapters 和 Host-only physical resolver。
3. 迁移 DocumentAccess、Engine/Webview/processor projection 和 package/export reads。
4. 迁移 Agent、Assets、Canvas、Cut、Preview、Tools consumers。
5. 迁移 ProjectFileStore/Media Library copy/generated/package/export 到 authorized writer primitive。
6. 删除旧 ContentAccess/ContentIngest matrix、provider competition、exports 和 compatibility tests。
7. 运行全消费者 build/test/check、dependency、legacy 和真实 Extension 场景。

## Open Questions

None. Runtime projection uses consumer-specific injected ports rather than a shared target selector.
