## Why

Canvas 复制或粘贴图片、文件引用节点时，Webview 会先乐观展示新节点，再通过现有 `canvasStatus -> replace-document` 链异步提交权威 Canvas document。节点挂载后的图片资源解析和文件文本预览却可以绕过这条提交队列，导致 Desktop Host 仍按旧快照校验新 `nodeId`，显示 stale node / 文件引用已变化。重新打开后权威文档已经包含副本，因此相同 `ContentLocator` 又能正常解析。

## What Changes

- 保持 Canvas document 的唯一提交路径不变，不增加复制专用 intent 或 Renderer 资源授权旁路。
- 让图片、音视频资源解析等待此前已经入队的 Canvas document/presentation 操作完成，再进入 Desktop delegate。
- 让文件文本预览等待同一操作队列稳定，再由 Canvas Host runtime 按精确 `nodeId + ContentLocator` 校验。
- 增加复制引用节点同 turn 提交与读取的回归测试，证明读取命中更新后的权威快照，并保留 stale locator 的 fail-closed 行为。

## Capabilities

### New Capabilities

- `canvas-node-bound-resource-read-ordering`: 定义 Canvas 节点绑定资源读取与权威文档提交之间的顺序和授权语义。

### Modified Capabilities

- 无。

## Impact

- `@neko/canvas-webview` L2 Host adapter：拥有 Webview 消息排序，将节点绑定读取串行化到现有 Canvas Host operation queue。
- `@neko/canvas-domain` L0/L1：公共 contract、runtime session 和授权规则不变；继续按权威快照校验精确节点与 locator。
- `apps/neko-desktop`：无生产代码变化；Desktop delegate、preload 和 Main 继续只执行 sender/session-bound 资源投影。
- 用户数据：`.nkc` shape、`ContentLocator` 和图片文件不改变；引用副本继续共享同一持久 locator，不复制源文件 bytes。
