# Proto 与 Wire Contract

更新日期：2026-06-15

本文定义 OpenNeko 的跨层类型契约、Engine wire contract、生成类型和项目格式之间的关系。Proto 是跨语言通信的单一事实来源；nk\* 文件格式是持久项目数据的领域事实来源。

## 设计目标

- 避免 TypeScript、Rust、Webview 和 Extension 各自手写平行协议。
- 让 Engine action、stream descriptor、scene command、timeline diff 等跨语言结构从一个契约源演化。
- 区分 wire contract、持久项目格式和 UI projection。

## 契约层级

```text
neko-proto
  diff.proto
  scene.proto
  timeline.proto
        |
        v
generated TypeScript / Rust DTOs
        |
        v
EngineClient wire normalizers
        |
        v
Extension/Webview/Agent projected DTOs
        |
        v
domain project formats
  .nkv .nkc .nkm .nks .nkp .nka .fountain
```

## 不变量

- 涉及 Engine 通信、Scene、Timeline、Viewport、stream descriptor 或跨语言结构时，优先从 proto 生成类型或复用已有生成类型。
- `@neko/neko-client` 负责 wire normalization；功能包不重复写解析器。
- UI projection 可以裁剪字段，但不能改变 wire contract 的语义。
- 持久项目格式保存可移植事实和引用，不保存 runtime handle。
- nk\* 项目格式使用 JSON 文本、schema/validator/migrator 和显式版本迁移。
- `.fountain` 作为行业标准剧本格式保留，结构化扩展通过兼容语法和 Story 层投影。

## Wire Contract 与项目格式

| 类型              | 例子                                                 | 权威                               | 是否持久             |
| ----------------- | ---------------------------------------------------- | ---------------------------------- | -------------------- |
| Wire contract     | Scene command、RenderStreamDescriptor、Timeline diff | `neko-proto` / generated types     | 否                   |
| Client projection | normalized Engine response、stream handle            | `@neko/neko-client`                | 否                   |
| UI projection     | Webview message DTO、presenter view model            | package contract                   | 仅 UI 状态可短期保存 |
| Project format    | `.nkv`, `.nkc`, `.nkm`, `.nks`, `.nkp`, `.nka`       | Format SDK / domain package        | 是                   |
| Resource identity | `ResourceRef`, asset/entity ID, locator              | `@neko/shared` and domain services | 是                   |

## 变更顺序

跨层能力的推荐顺序：

1. 定义或扩展 proto / shared contract。
2. 生成类型并补 wire normalizer。
3. 在 Engine client 暴露窄接口。
4. 在 Extension Host 接权限、资源和生命周期。
5. 在 Webview 或 Agent 中消费投影。
6. 如需持久化，再进入领域格式和迁移器。

## 与创作领域的关系

领域文档不定义 wire contract，只描述如何消费契约。例如模型创作可以说明 Route A 使用哪些 stream/control descriptor，但具体 descriptor 语义归本文和 Engine runtime 文档。

## 吸收的稳定主题

本设计吸收以下历史主题的稳定部分：

- format strategy
- proto generated scene/timeline/diff contracts
- EngineClient wire normalization
- unified viewport protocol
- viewport stream control boundary
- structured data persistence
