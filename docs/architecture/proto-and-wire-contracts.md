# Wire 与运行时契约

状态：Accepted

更新日期：2026-07-27

OpenNeko 当前没有需要 Protobuf 生成的跨语言或持久 wire contract。
原 `timeline.proto`、`diff.proto` 只生成 TypeScript interface，没有编码、解码、
producer、consumer 或版本协商，已经连同 `@neko/proto` 包和生成器删除。

## 当前契约层级

```text
owning domain schema/codec
  -> Canvas NKC / Cut OTIO

domain media port
  -> @neko/media host-neutral contract
  -> @neko/media/node process + loopback session
  -> package-owned Host/Webview message

package-owned L0 contract
  -> Desktop Main
  -> preload
  -> renderer
```

| 类型                  | 例子                                            | 权威                       | 持久化                       |
| --------------------- | ----------------------------------------------- | -------------------------- | ---------------------------- |
| Project format        | Canvas `.nkc`、Cut OTIO                         | owning domain schema/codec | 是                           |
| 媒体 port             | probe、frame、waveform、preview、PCM descriptor | `@neko/media`              | 否                           |
| Host/renderer message | intent、status、diagnostic、session identity    | owning package L0 contract | 仅可恢复 UI state 可短期保存 |
| Resource identity     | `ContentLocator`、Asset/Entity ID                  | shared/domain service      | 是                           |

## 不变量

- 普通共享 TypeScript shape 不得以 `*.proto -> interface` 生成链伪装为 wire contract。
- 功能包通过窄领域 port 消费 `@neko/media`，不得重建万能 client 或旧 Engine DTO。
- runtime handle、token、端口、URL、blob、renderer URI 和 stream id 不写入项目格式。
- 未知 message、schema/version、缺失字段和陈旧 session identity 必须明确失败。
- UI projection 可以裁剪字段，但不能改变 identity、error、cancel 或 lifecycle 语义。
- 新路径测试同时断言结果与 adapter/handler 路径，并证明退休 route 未参与。

## Proto 重新准入条件

只有同时满足以下条件，才能通过新的 OpenSpec 重新建立 Proto 包：

1. 存在两个明确的 runtime、语言或持久化边界；
2. 有真实序列化 producer 与 consumer，而非只生成 TypeScript interface；
3. 定义 schema version、兼容策略、未知字段行为和迁移/拒绝语义；
4. 生成物有明确 owner、发布方式和漂移门禁；
5. owning domain 的直接 TypeScript contract 或 codec 无法更清晰地表达该边界。

Node 子进程参数、loopback URL/token、Desktop IPC message、package-local DTO 和单语言
Host 内部类型不满足准入条件。

## 验证

- `pnpm check:application-boundaries` 阻止已删除 Proto 包、生成器和 Engine Timeline/Diff
  生成物回流；
- media port、Node adapter、browser client 与 owning package message 测试；
- token、Range、PCM、session identity、dispose/cancel 路径测试；
- project-format 测试证明 runtime 字段未被持久化；
- `pnpm check:engine-retirement-boundary` 证明旧 client/DTO/route 不会返回。
