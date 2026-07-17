## Why

Canvas 素材节点目前只投影少量通用节点动作，引用素材缺少预览、全屏和显式保存到素材库的完整入口，生成素材也没有展示其提示词与模型来源，更不能从素材上下文快速回到既有生成流程。需要按素材来源和真实能力组织动作，避免所有节点共享一组含义模糊或不可执行的按钮。

## What Changes

- 为可解析的引用素材提供统一的顶部素材动作栏，支持全屏查看、系统预览、复制节点、进入真实可用的编辑入口以及显式保存到素材库。
- 由 Extension Host 解析稳定资源身份并调用现有 AssetLibrary API；Webview 不接触本地文件系统、缓存路径或临时路径。
- 为带有持久生成来源的素材显示生成上下文，展示生成提示词、模型及可用参数摘要，并通过既有 Canvas creative AI action / GenerationPromptPanel 快速再次生成或编辑。
- 将素材动作按节点描述符、素材来源与当前能力进行投影；能力缺失时不渲染伪按钮，非法或无法解析的资源操作返回可见诊断。
- 保持素材内容本身低干扰、无额外内框；动作浮层和生成上下文只在选中素材时出现，不写入 `.nkc` 布局事实。

## Capabilities

### New Capabilities

- `canvas-material-action-surfaces`: 定义引用素材与生成素材的来源感知动作、素材库提升、生成来源展示和快速生成入口。

### Modified Capabilities

<!-- None. The change composes the existing fullscreen, preview, AssetLibrary, and Canvas creative-AI capabilities without changing their owning contracts. -->

## Impact

- `packages/neko-canvas/packages/webview`: selection toolbar、节点能力解析、生成上下文 UI、typed Webview message 与相关测试。
- `packages/neko-canvas/packages/extension`: 素材库提升消息处理、稳定资源解析、结果诊断与路径级测试。
- `packages/neko-types`: 仅在现有生成素材元数据不足以表达稳定来源时最小化扩展共享类型；不新增 provider/model SDK 依赖。
- `packages/neko-assets`: 复用现有 `NekoAssetsAPI.importFile()`，不改变其资产事实所有权。
