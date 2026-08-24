## Context

Canvas Webview 的编辑交互先更新 package-owned Zustand presentation/document projection。`CanvasApp` 随后发送 `canvasStatus`，`createCanvasWebviewHost` 将其放入单一 operation queue，并通过 `replace-document` intent 更新 `CanvasHostRuntimeSession` 的权威 Canvas。复制实现会深拷贝完整节点，只替换节点、容器和连接 identity，因此 `ContentLocator` 已经被保留。

资源读取存在两条未排序的入口：

- `preview:resolveResource` 直接转发 Desktop delegate，绕过 operation queue；
- `readTextFilePreview` 直接调用 runtime，也未等待 queue。

这两条入口都要求 runtime 对当前权威节点执行授权。在复制后的首次 render 中，新节点只存在于 Webview，而此前的 `canvasStatus` 仍可能正在提交，于是授权正确地拒绝 stale node。重新打开文档会从已提交 Canvas 重建 runtime，因此现象消失。

### Five-layer analysis

| Layer          | Decision                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Responsibility | Canvas Webview Host adapter 拥有同一 Webview producer 的消息顺序；Canvas Host runtime 继续拥有权威节点/locator 授权；Desktop delegate 只投影已授权资源。                 |
| Dependency     | 改动限定在 `@neko/canvas-webview` L2 的 host-neutral adapter 和测试，不引入 Electron、Node API 或 app-root 业务逻辑。                                                    |
| Interface      | 不新增 public contract。复用现有 operation queue，把 node-bound read 作为队列消费者；`ContentLocator`、preview IPC 和 runtime request shape 均不变。                     |
| Extension      | 后续新增依赖当前节点身份的读取能力时，应复用同一 queue-settle 约束；不建立通用 scheduler、版本字段或 fallback registry。                                                 |
| Test           | Host adapter 测试阻塞 `replace-document`，证明 preview delegate 与 text preview 在提交完成前均未调用，完成后收到新节点；既有 runtime 测试继续证明 stale locator 被拒绝。 |

## Goals / Non-Goals

**Goals:**

- 复制/粘贴引用节点首次显示时即可解析图片和文件内容，无需关闭重开 Canvas。
- 保持节点级授权 fail-closed，Renderer 不能仅凭 locator 请求任意 Workspace 内容。
- 保持一个 canonical document mutation path，避免复制操作引入第二套 Host 提交语义。

**Non-Goals:**

- 不复制、缓存或重新导入引用资源 bytes。
- 不修改 `ContentLocator` shape、持久化格式或 Desktop IPC。
- 不改变普通 Canvas 乐观编辑、保存或历史记录语义。
- 不通过 timeout、retry、重新挂载或放宽授权修复竞态。

## Decisions

### 1. 节点绑定读取服从现有 operation queue

`canvasStatus` 已按产生顺序进入 `operationTail`。`preview:resolveResource` 也通过 `queueOperation` 延迟 delegate 转发，因此此前的 `replace-document` 完成后才发送 Desktop IPC。`preview:releaseResource` 继续直接转发，因为释放只依赖 descriptor identity，不读取当前 Canvas authority，强制排队会无意义地延长资源生命周期。

`readTextFilePreview` 在调用 runtime 前使用 `waitForOperationQueueToSettle`。该 helper 会观察 queue 在等待期间追加的 operation，直到稳定，避免同 turn 的 Canvas 状态仍在尾部。

### 2. 不把 locator 当成独立授权凭据

复制节点保留原 `ContentLocator`，但新的节点 identity 必须先进入当前 session 的权威 Canvas。图片预览继续校验 `nodeId + outputId + locator + kind`，文件预览继续校验 `nodeId + locator`。提交失败时读取针对旧权威快照失败可见，不读取旧 projection、不回退原节点，也不单独按 locator 放行。

### 3. 保持 canonical document mutation path

本变更不新增 `duplicate-node`、`paste-node` 或通用 `replaceCanvas` Webview port。复制/粘贴与其他浏览器内编辑继续通过 `canvasStatus -> replace-document` 提交。新增复制专用 intent 会让同一 Canvas mutation 同时存在状态同步和直接 command 两条成功路径，并要求重复处理 history、selection 与外部 projection，和本次局部排序缺陷不成比例。

## Boundary inventory

| Owner / role                            | Canonical path                           | Producer -> consumer                                    | Runtime boundary                     | Replaced path / user-data impact                     |
| --------------------------------------- | ---------------------------------------- | ------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------- |
| `@neko/canvas-webview` Host adapter     | `canvas-webview-host.ts` operation queue | `canvasStatus` / node-bound read -> runtime or delegate | Browser package adapter              | 替换 preview/text read 绕过 queue；无数据 shape 变化 |
| `@neko/canvas-domain` runtime authority | existing runtime session methods         | exact node + locator -> authorization                   | Host-neutral runtime                 | 不变；继续 fail-closed                               |
| Desktop Canvas delegate                 | existing preview bridge                  | authorized request -> Desktop resource projection       | Renderer/preload/Main trust boundary | 不变；不保留 locator-only path                       |

## Risks / Trade-offs

- [预览稍晚出现]：只等待同一 producer 已经排队的文档操作，通常为单次本地提交；这是建立正确 authority 的必要顺序，不增加人为延迟。
- [排队操作失败]：现有 queue 会报告 load diagnostic 并继续保持可用；后续读取仍按实际权威快照校验并失败可见，不伪装成功。
- [资源释放被提交阻塞]：release 不进入 queue，避免延长 descriptor 生命周期。
- [仅覆盖图片而遗漏文件]：测试同时覆盖 delegate preview 与 runtime text preview，两者共享相同提交前置条件。

## Migration Plan

1. 为两个 node-bound read 入口增加排序测试，并确认测试在旧实现下暴露提前调用。
2. 将 preview resolve 排入 operation queue，将 text preview 改为等待 queue 稳定。
3. 运行 Canvas Webview 测试、构建、OpenSpec 与 package/Webview/content boundary checks。
4. 使用真实 Electron Canvas 场景验证复制图片与文件节点无需重开即可恢复预览；无法启动时保留 fail-visible blocked 证据。

不改变 durable data，无需迁移或兼容路径；回退代码即恢复旧消息时序。

## Open Questions

无 apply-blocking open question。
