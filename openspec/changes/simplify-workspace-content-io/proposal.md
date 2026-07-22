## Why

当前 ContentAccess/ContentIngest 通过 intent、target、variant、materialization、qualityMode、mode 和 destination 的组合路由本地内容，结果同时暴露 bytes、localPath、URI、Engine source、stream、cache status 与 provider error。媒体库已经收敛为普通 workspace path、派生存储也已进入 Host 后，可以用窄操作和领域 owner 取代这套组合矩阵。

本变更依赖 `adopt-workspace-linked-media-libraries` 和 `internalize-derived-content-storage` 完成，不承担媒体库数据迁移或缓存 ownership 搬迁。

## What Changes

- **BREAKING**：以 stable locator + `stat/read/project` 窄操作替换公共 ContentAccess intent × target × materialization × qualityMode matrix。
- Runtime projection 使用闭合、discriminated Webview/Engine/processor result；公共 result 不再暴露 Host `localPath`、raw error、provider ID 或并列 optional transport 字段。
- 权限由 Host 注入 capability-scoped port 决定，不允许调用方通过任意 `caller`/`intent` string 自我声明权限。
- **BREAKING**：删除公共 cache-materialize intent、missing-cache status、cache-path runtime ref、cache-artifact ingest/destination 和 public materialization metadata；表现继续通过既有 `ContentRepresentationService` 请求。
- **BREAKING**：用 authorized atomic workspace writer primitive 取代 broad ContentIngest mode/destination matrix。
- ProjectFileStore、Media Library 显式文件复制、generated output、package 和 export 继续决定各自 durable ownership、目标与 overwrite policy；不保留 Asset import/promote owner。
- DocumentAccess 继续拥有 format/manifest/range/locator/cursor，只依赖窄 ContentRead port；Preview Node transport 和 Engine opaque token 不改变所有权。
- 一次迁移全部生产者/消费者并 poison 旧 matrix；不保留 compatibility adapter、双接口或 fallback。

## Capabilities

### New Capabilities

- `workspace-content-io`: stable locator、bounded stat/read、runtime projection、authorized writer、safe diagnostics 和 domain-owned writes。

### Modified Capabilities

无。当前 `openspec/specs/` 没有覆盖公共 ContentAccess/ContentIngest 行为的已归档 capability。

## Impact

- `@neko/shared` ContentAccess/ContentIngest types、validators、Host services/providers 和 public exports。
- Agent、Media Library、Canvas、Cut、Preview、Tools、Engine client、DocumentAccess、package/export 和 processor consumers。
- ProjectFileStore 与领域 import/save services 的调用边界，但不改变其 schema/ownership。
- 公共编译面较大，但不包含媒体库路径迁移、ResourceCache provider 搬迁或 derived GC 重构。
