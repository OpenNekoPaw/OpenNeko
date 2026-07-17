# Proto 与 Wire Contract

状态：Accepted

更新日期：2026-07-17

Proto 与 Rust Host API 是跨语言通信的契约来源；Canvas `.nkc`、Cut `.nkv` 等项目格式是持久领域事实来源。两者不能混用，也不能由 Webview/Extension 各自维护平行 DTO。

## 契约层级

```text
Proto / Rust Host API media contracts
  -> generated TypeScript / Rust DTOs
  -> @neko/neko-client wire normalizers
  -> Extension / Webview / Agent projections
  -> owning domain project formats (.nkc / .nkv)
```

当前 Engine wire surface 只覆盖保留媒体能力：文件授权与 Range、probe/capture、audio/video、timeline、stream、effect、color、preview/export 和 task/health。Scene、Puppet、Model、ML、Device、Live 和 panoramic contract 已移除，不能作为兼容字段、路由或成功 no-op 保留。

## Contract 类型

| 类型 | 例子 | 权威 | 持久化 |
| --- | --- | --- | --- |
| Engine wire | media action、file token、Range response、stream descriptor、timeline operation | Proto / Rust Host API 与生成类型 | 否 |
| Client projection | normalized Engine response、stream/session handle | `@neko/neko-client` | 否 |
| Host/Webview message | package-owned typed intent、status、diagnostic | owning package contract | 仅可恢复 UI state 可短期保存 |
| Project format | `.nkc`、`.nkv` | Canvas/Cut codec 与 schema | 是 |
| Resource identity | `ResourceRef`、document source ref、Asset/Entity ID | shared/domain service | 是 |

## 不变量

- 功能包不得手写与 Proto/Host API 平行的 Engine request/response parser。
- `@neko/neko-client` 负责 wire normalization，不拥有权限、项目事实或 UI fallback。
- UI projection 可以裁剪字段，但不能改变 action、identity、error 或 lifecycle 语义。
- runtime handle、token、端口、URL、blob、Webview URI 和 stream id 不写入项目格式。
- 未知 action、schema/version、缺失字段和陈旧 instance identity 必须明确失败。
- 新路径测试同时断言结果与 handler/adapter 路径，并证明旧 route 未参与。

## 变更顺序

1. 定义或更新 Proto/Host API/descriptor 与错误 contract；
2. 生成 TypeScript/Rust 类型并检查生成物一致性；
3. 在 Engine Kernel/runtime 实现 canonical handler；
4. 更新 HTTP/N-API/CLI 中适用的 host surface；
5. 更新 `@neko/neko-client` normalizer 和窄接口；
6. 在 Extension/Agent/Webview 消费最小投影；
7. 确需持久化时，再更新 owning domain schema/migrator。

涉及只在 TypeScript Host 内运行的项目文件或 UI intent，不需要为了形式创建 Proto；只有真实跨语言/跨进程 wire 边界才进入 Proto/Host API。

## 验证

- Proto/生成物一致性与 Rust/TypeScript compile；
- Engine Host API unknown-action、invalid-payload 和 removed-action 测试；
- HTTP/N-API/CLI 生产者测试与 `EngineClient` 消费者契约测试；
- token、Range、stream/session identity 和 dispose/cancel 路径测试；
- project-format 测试证明 runtime 字段未被持久化。
