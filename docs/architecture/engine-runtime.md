# Rust Media Engine 运行时

状态：Accepted

更新日期：2026-07-17
对应变更：`align-pruned-workspace-build`

`packages/neko-engine` 是 OpenNeko 保留的本地媒体计算和二进制访问权威。它通过 Rust workspace、统一 Host API、HTTP、N-API 和 CLI 提供媒体能力，不是通用 Scene、角色、设备、直播或 ML runtime。

## 保留职责

- 文件授权、二进制访问和有界 HTTP Range；
- 媒体 probe、缩略图/帧捕获、代理文件和预览；
- FFmpeg 音视频解码、seek、复用、编码和导出；
- PCM/audio processing、响度、波形和保留效果；
- GPU 媒体处理、effect 与 color pipeline；
- timeline、stream、task、health 和生命周期诊断；
- 为 Extension Host 提供 N-API/HTTP surface，为诊断和自动化提供 CLI。

Scene、Puppet、Model、ML、Device、Live、panoramic 与麦克风/设备采集不属于保留 Engine contract。未知 action、旧路由、旧 DTO 或缺失 handler 必须明确失败，不能返回兼容成功或空结果。

## Rust workspace 分层

| Crate | 职责 |
| --- | --- |
| `engine-types` | 保留媒体 DTO、错误与共享 contract |
| `engine-codec` | FFmpeg codec、probe、decode/encode 和媒体格式边界 |
| `engine-audio` | 音频处理、分析和效果 |
| `engine-gpu` | GPU 设备与媒体计算原语 |
| `runtime-media` | 媒体 session、seek/stream/runtime 生命周期 |
| `engine-kernel` | 保留媒体能力的统一组合与资源 owner |
| `host-api` | host-neutral action contract、validation 和 dispatch |
| `host-http` | HTTP/WebSocket、文件 Range、stream 和 health host |
| `host-napi` | VS Code Extension 使用的 Node native binding |
| `host-cli` | 本地诊断、自动化和 smoke host |

依赖方向从 host 指向 Host API/Kernel，再指向 runtime、codec、audio、GPU 和 types。底层 crate 不得反向依赖 host，也不得重新引入已裁剪 runtime。

## Host 与 client 路径

```text
VS Code Extension
  -> neko-engine N-API wrapper
  -> one process-wide Engine API
  -> Host API / Kernel
  -> media runtime / codec / audio / GPU

Authorized Webview
  -> Engine HTTP/WebSocket descriptor
  -> file Range / media stream

TUI or diagnostics
  -> Engine CLI or host-neutral client contract
```

- Extension Host 负责启动、发现、端口/token 授权、取消、dispose 和诊断。
- Webview 只消费已授权 descriptor，不直接读取任意本地路径，也不拥有 Engine 进程。
- 高频视频帧和 PCM 不经 Extension Host `postMessage` 中继。
- `@neko/neko-client` 是 TypeScript Engine HTTP/WebSocket 和 stream client 的公共边界；功能包不得拼接私有路由或复制 wire normalizer。

## 文件访问与安全

- 持久项目事实只保存 workspace-relative path、`${VAR}/path` 或 stable resource ref，不保存 Engine token、Webview URI、blob URL 或临时绝对路径。
- Extension Host 将明确文件或受控 root 授权给 Engine；Engine 对 token、root、Range 和生命周期做校验。
- 需要 seek 的大型媒体走 Engine file access/HTTP Range；纯文本、配置和 JSON 项目事实仍由 Host 文件服务与领域 codec 管理。
- 非法 token、越界路径、无效 Range、未知 action 和已释放 session 都应返回可诊断错误。

## 生命周期与并发

- 进程内只组合一个 Engine API owner；各 media session、stream、task 和 frame server 保持显式 identity。
- session 可变状态、取消句柄、解码器、GPU/FFmpeg 资源和消息队列不得通过 active selection 共享。
- decoder reuse、seek 与 stream replacement 必须保持确定的所有权和释放顺序。
- Engine shutdown、Extension deactivation 和测试 teardown 必须显式释放 N-API、HTTP、WebSocket、task 与原生资源。

## Contract 演进

新增 Engine 能力按以下顺序进入 canonical path：

1. 定义或更新 Host API/Proto/descriptor；
2. 在 Kernel/runtime 实现并覆盖错误语义；
3. 更新 N-API、HTTP、CLI 中适用的 host surface；
4. 更新 `@neko/neko-client` 与保留消费者；
5. 添加执行路径断言，证明旧路由或已移除 handler 未参与。

不得在 TypeScript 中平行实现 Rust 已拥有的媒体计算，也不得为了旧调用方恢复被移除 runtime。

## 验证

最低验证按改动范围组合：

```bash
cd packages/neko-engine
cargo fmt --all -- --check
cargo clippy --workspace --all-targets
cargo test --workspace
pnpm test
pnpm build
```

涉及跨层行为时还必须覆盖：Cargo dependency closure、N-API build/test、CLI smoke、授权文件与 Range、probe/capture、seek/stream、proxy/export，以及保留 `EngineClient` 的生产者/消费者契约测试。
