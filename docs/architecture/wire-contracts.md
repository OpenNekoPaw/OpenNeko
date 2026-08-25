# Wire 与运行时契约

OpenNeko 的跨层 contract 由 owning package 的 L0 contract 或真实项目 codec 拥有。

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
| Resource identity     | `ContentLocator`、Asset/Entity ID               | shared/domain service      | 是                           |

## 不变量

- 普通共享 TypeScript shape 直接由 owning package 定义，不建立无真实序列化边界的生成链。
- 功能包通过窄领域 port 消费 `@neko/media`，不得重建万能 media client 或平行 DTO。
- runtime handle、token、端口、URL、blob、renderer URI 和 stream id 不写入项目格式。
- 未知 message、未知字段、缺失字段和陈旧 session identity 必须明确失败；内部契约不得用
  schema/version 字段选择 shape。
- UI projection 可以裁剪字段，但不能改变 identity、error、cancel 或 lifecycle 语义。
- 路径测试同时断言结果与唯一 canonical adapter/handler。

## 序列化边界

只有存在明确的跨 runtime、跨语言或持久格式 producer/consumer 时才建立序列化 schema。Schema 必须有
唯一 owner、明确生成物、未知字段行为和拒绝语义。第三方协议或文件格式版本封闭在对应 adapter 或 codec
内，不用于内部 contract 分发。Node 子进程参数、loopback URL/token、Desktop IPC message、
package-local DTO 和单语言 Host 内部类型继续使用 owning package contract。

## 验证

- `pnpm check:application-boundaries` 验证 contract ownership、依赖方向和生成边界；
- media port、Node adapter、browser client 与 owning package message 测试；
- token、Range、PCM、session identity、dispose/cancel 路径测试；
- project-format 测试证明 runtime 字段未被持久化；
- application boundary 与路径测试证明未注册 client/DTO/route 不会返回成功。
