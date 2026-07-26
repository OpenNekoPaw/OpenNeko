# Proto 与运行时契约

状态：Accepted

更新日期：2026-07-26

`@neko/proto` 当前只拥有 Timeline 与 Diff 的结构化 IDL；它不是媒体进程
协议，也不定义 Webview transport。`packages/neko-engine`、`packages/neko-client`
及其 HTTP/WebSocket/N-API DTO 已删除。

## 契约层级

```text
timeline.proto / diff.proto
  -> @neko/shared/src/generated
  -> owning domain projection

domain media port
  -> @neko/media host-neutral descriptor
  -> @neko/media/node process + loopback session
  -> package-owned Host/Webview message
```

| 类型 | 例子 | 权威 | 持久化 |
| --- | --- | --- | --- |
| 结构化 IDL | Timeline、Track、Diff result | `@neko/proto` | 由 owning project codec 决定 |
| 生成类型 | Timeline/Diff TypeScript projection | `@neko/shared/src/generated` | 否 |
| 媒体 port | probe、frame、waveform、preview、PCM descriptor | `@neko/media` | 否 |
| Host/Webview message | package-owned intent、status、diagnostic、session identity | owning package contract | 仅可恢复 UI state 可短期保存 |
| Project format | Canvas `.nkc`、Cut OTIO | owning domain schema/codec | 是 |
| Resource identity | `ResourceRef`、Asset/Entity ID | shared/domain service | 是 |

## 不变量

- 仅真实的共享结构化数据变化才更新 Proto；Node 子进程参数、loopback URL、
  token、PCM framing 和浏览器 client 不进入 Proto。
- 功能包通过窄领域 port 消费 `@neko/media`，不得重建万能 client 或旧 Engine DTO。
- runtime handle、token、端口、URL、blob、Webview URI 和 stream id 不写入项目格式。
- 未知 message、schema/version、缺失字段和陈旧 session identity 必须明确失败。
- UI projection 可以裁剪字段，但不能改变 identity、error、cancel 或 lifecycle 语义。
- 新路径测试同时断言结果与 adapter/handler 路径，并证明退休 route 未参与。

## 变更顺序

1. 判断变更属于共享结构 IDL、媒体 port、Host/Webview message 还是项目格式；
2. 共享 Timeline/Diff 结构先更新 Proto，再运行生成器；
3. 媒体能力先更新 `@neko/media` 契约，再实现 Node/browser adapter；
4. 在 owning Extension controller 投影最小 Webview descriptor；
5. 确需持久化时，才更新 owning domain schema、codec 和 migration。

只在 TypeScript Host 内运行的项目文件或 UI intent 不应为了形式创建 Proto。

## 验证

- `pnpm generate:types` 后生成物无漂移；
- Proto 生产者与 `@neko/shared` 生成类型消费者测试；
- media port、Node adapter、browser client 与 owning package message 测试；
- token、Range、PCM、session identity、dispose/cancel 路径测试；
- project-format 测试证明 runtime 字段未被持久化；
- `pnpm check:engine-retirement-boundary` 证明旧 client/DTO/route 不会返回。
