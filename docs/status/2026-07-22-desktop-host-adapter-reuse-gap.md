# Desktop Host Adapter 复用 Gap

日期：2026-07-22

范围：拟议 `apps/neko-desktop` 对当前 OpenNeko for VS Code 子包、Agent Webview、Canvas、Cut、Preview、Assets、Host ports 和 Engine client 的复用成熟度。

本文是代码审计快照，不是实施计划或长期架构事实。目标架构见 [`../architecture/adr-neko-desktop-composition-and-open-source-reference-boundary.md`](../architecture/adr-neko-desktop-composition-and-open-source-reference-boundary.md)。

## 结论

当前代码与 Desktop 方向在契约和依赖分层上兼容，但尚未达到“增加一个 Electron bridge 即可运行全部 VS Code 子包”的程度：

- Host、Agent core、Asset core、Entity/Search、Engine client 和 Proto 可以跨宿主复用；
- Agent Webview 已有可注入 transport，是最接近 Desktop 直接复用的完整 UI；
- Canvas、Cut 和 Preview 的 `host-adapter` 当前是展示投影，不是完整功能 runtime adapter；
- VS Code Extension、TreeView、Custom Editor 和直接 `vscode` 副作用不能进入 Desktop；
- Desktop application identity、Electron Host ports、Electron Agent routes 和领域 UI adapter 尚未实现。

因此正确目标不是“Desktop 复用 VS Code Extension”，而是“VS Code Extension 与 Desktop Host 同时适配并复用 host-neutral core、公共 UI root 和协议”。

## 证据与成熟度

| 能力 | 当前证据 | 复用成熟度 | 缺口 |
| --- | --- | --- | --- |
| Application identity | `NEKO_APPLICATION_IDS` 仍只有 `neko-home`、`neko-tui`、`neko-vscode` | 阻塞 | 通过实施 OpenSpec 删除或 poison `neko-home`，新增唯一 `neko-desktop`；不得保留别名 fallback |
| 通用 Host ports | `NekoHostKind` 已包含 `electron`；`NekoHostPorts` 已覆盖 environment、workspace、files、paths、policy、secrets、external、diagnostics | 契约可复用 | 尚无正式 `ElectronNekoHostPorts`；Node adapter 在 TUI application 内，需审计后把稳定 Node 基础能力提升到中立 owner |
| Agent core/platform | Agent session、Pi、Skill、tool、task、memory 和 capability 位于 host-neutral 包，TUI 已有真实消费者 | 高 | Desktop 需要自己的 application composition、storage/secret/content ports 和生命周期 |
| Agent Webview | `AgentHostKind` 已包含 `electron`；`AgentWebviewRoot` 接受 `hostRuntimeAdapter`；Webview 有边界测试阻止直接 VS Code transport 扩散 | 中高 | 只有 VS Code transport 和 Electron 测试替身；缺正式 Electron adapter、route classification 和 Host controller |
| Agent Host router | Extension router 覆盖全部 VS Code Webview message | 中低 | router 仍依赖 `vscode.env`、`vscode.Webview`、Extension services；需拆为 host-neutral controller 与 VS Code effects，不得复制一份 Electron router |
| Canvas | `./root` 和 `./host-adapter` 均有公共导出，`.nkc` 与 authoring contract 可保留 | 中低 | 完整 Root 不接收 adapter；代码扫描发现 27 个 Webview 源文件直接或间接使用 VS Code message transport；现有 HostAdapterSurface 只渲染简化节点投影 |
| Cut | `./root` 和 `./host-adapter` 均有公共导出，`.nkv` 与时间线领域能力可保留 | 中低 | 完整 Root 不接收 adapter；代码扫描发现 29 个 Webview 源文件使用 VS Code message transport；现有 HostAdapterSurface 包含固定演示时间线，不是编辑 runtime |
| Preview | 格式渲染组件、Three.js 和媒体消费能力可选择复用 | 低到中 | 包只导出简化 `./host-adapter`，没有统一完整 Root；代码扫描发现 16 个 Webview 源文件使用 VS Code message transport；不同格式仍由独立入口启动 |
| Assets/Entity/Search | `@neko/asset`、`@neko/entity`、`@neko/search` 是可复用 core/service | 中高 | `neko-assets` 产品面仍是 VS Code Extension，代码扫描发现 20 个源文件直接导入 `vscode`；TreeProvider、DecorationProvider 和 VS Code Webview 不能复用于 Desktop |
| Engine | Rust Engine、`EngineClient` 和 Proto 已有清晰权威边界 | 高 | Electron main/AppHost 需要负责 Engine 发现、token、descriptor、取消和退出清理；renderer 仍只能消费授权投影 |

文件计数来自 2026-07-22 对生产目录的 `rg` 静态扫描，只用于描述耦合规模，不代表独立迁移任务数量。

## Host Adapter 不是单一接口

当前和目标设计中至少存在三类不同 adapter，不能压成万能 bridge：

| 层级 | 职责 | 示例 |
| --- | --- | --- |
| Host capability port | 文件、路径、workspace、trust、secret、external、diagnostic | `NekoHostPorts`、未来 `ElectronNekoHostPorts` |
| Domain application adapter | 把宿主能力组合成 Agent、Canvas、Cut、Preview、Assets 的 operation 和 lifecycle | `AgentHostController`、`CanvasHostAdapter` 等目标边界 |
| UI transport adapter | 在 renderer/Webview 与 Host controller 间传递版本化消息和可恢复展示状态 | `AgentHostRuntimeAdapter`、未来领域 UI adapter |

VS Code 和 Desktop 的目标调用链为：

```text
VS Code Webview ----VS Code UI transport----+
                                              -> domain host controller -> domain core / EngineClient
Desktop renderer ---Electron UI transport---+

VS Code Extension ----VS Code Host ports----+
Desktop AppHost -------Electron Host ports--+
```

Extension 和 Electron adapter 可以不同，但 domain controller、项目事实、operation contract 和 UI state projection 必须唯一。

## 必要收敛工作

1. 先定义 `neko-desktop` application identity、存储处置、Electron IPC schema/version、sender validation 和实例 identity。
2. 实现 Electron Host ports；复用 Node 文件/路径算法时先提升到中立包，不从 `apps/neko-tui` 导入应用内部代码。
3. 把 Agent Extension router 中的 runtime orchestration 提升为 host-neutral controller，VS Code 与 Electron 只提供副作用 ports。
4. 为 Agent Electron transport 建立完整 route coverage；每条 route 明确为 implemented、unsupported 或 host-inapplicable，缺失分类 fail-visible。
5. Canvas、Cut、Preview 分别定义最小领域 UI adapter；现有 VS Code Webview 使用 VS Code 实现，Desktop Root 注入 Electron 实现。
6. Assets Desktop 管理面基于 `@neko/asset`、Entity/Search 和公共 DTO 新建 React 组合，不包装或模拟 VS Code TreeProvider。
7. 保持 `apps/neko-vscode` 和各 Extension 作为现行发布路径；迁移测试同时证明 VS Code 旧行为未回退、Desktop 新路径没有命中 VS Code transport。

## 验收边界

- Desktop renderer 不导入 `vscode`、`electron`、Node API 或 Extension 内部实现；
- Electron main/preload 不导入 React 或 Webview implementation；
- VS Code 与 Desktop 对同一 domain operation 使用相同 contract 和事实 owner；
- 关闭 Project Tab 不释放 project/runtime owner；关闭窗口、取消或项目卸载必须释放所属 subscription、task 和 Engine handle；
- Desktop 路径缺少 adapter、route 或 capability 时返回明确 diagnostic，不能回退 `neko-home`、VS Code message 或空成功结果；
- VS Code Webview 行为继续通过 Extension Development Host 验收，Desktop 行为通过 Electron 真实运行态验收，两者不能互相替代。

## 证据入口

- [`../architecture/package-boundaries.md`](../architecture/package-boundaries.md)
- [`../architecture/application-composition.md`](../architecture/application-composition.md)
- [`../architecture/adr-neko-desktop-composition-and-open-source-reference-boundary.md`](../architecture/adr-neko-desktop-composition-and-open-source-reference-boundary.md)
- `packages/neko-host/src/ports.ts`
- `packages/neko-host/src/application.ts`
- `packages/neko-agent/packages/agent-types/src/agent-host-runtime-adapter.ts`
- `packages/neko-agent/packages/webview/src/root.tsx`
- `packages/neko-agent/packages/extension/src/chat/router/`
- `packages/neko-canvas/packages/webview/src/root.tsx`
- `packages/neko-cut/packages/webview/src/root.tsx`
- `packages/neko-preview/packages/webview/`
- `packages/neko-assets/packages/asset/`
- `packages/neko-assets/src/providers/`
