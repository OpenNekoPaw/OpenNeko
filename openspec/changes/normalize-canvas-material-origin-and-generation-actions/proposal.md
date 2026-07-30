## Why

Canvas 目前把渲染类型、内容来源和生成生命周期混在节点动作投影中：普通引用节点会得到无合法目标的快速生成入口，生成素材依赖路径和旧 provenance 启发式识别，Desktop authoring 又只接受 `workspace-file`。这使工作区文件、已链接媒体库、外部导入、全局资源和 AI 结果无法沿同一 ContentLocator/Job canonical path 进入画布，并让旧 AssetLibrary 提升路径重新进入正常创作流程。

## What Changes

- 将 Canvas 素材模型收敛为“canonical 节点类型 × 内容来源 × 生命周期”三个正交维度；保持 `media`/`file`/`job` 等现有节点类型，不为引用或生成变体增加平行节点枚举。
- 明确四条素材进入路径：工作区与已链接媒体库直接引用；全局媒体库先关联或显式复制；工作区外文件先复制到项目拥有位置；AI 输出由 Generation owner 提交后再投影到 Canvas。
- 以 `ContentLocator` 作为素材身份唯一事实源：普通内容使用 owner 对应 locator，生成内容只由 `generated-output` 判定；删除基于路径、旧 ResourceRef 或自由 provenance 字符串的正常运行时分类 fallback。
- 将“空 AI 素材节点”表达为 Job/generation draft，而不是无持久来源的空 `media`；Job 完成后投影新的生成 Media/File 节点并保留 `derived-from` lineage。
- 普通引用节点不显示生成上下文或重新生成入口；裁剪、擦除、去噪、补帧、重绘等修改通过 owner capability 创建派生内容和新节点，不覆盖原始素材。
- 生成节点保留不可变的历史生成摘要，并通过稳定 Generation Job/recipe identity 支持重新生成、修改参数生成和变体；每次运行产生新的 output/revision，不覆盖既有结果。
- **BREAKING** 删除 Canvas 正常创作路径中的旧 AssetLibrary promotion/import 调用和模糊“存为资产”动作，替换为显式“复制到项目媒体库”或“保存到全局媒体库”目的地操作。
- 让图片、音频、视频、文档、模型和 Cut/Preview 等 owning package 通过稳定 capability descriptor 贡献可执行动作；Canvas 只投影可用动作，不重新实现 viewer、editor 或媒体处理逻辑。

## Capabilities

### New Capabilities

- `canvas-material-origin-and-generation-actions`: 定义 Canvas 素材来源、四条进入路径、Job/生成结果投影、非破坏派生、来源感知动作和稳定重新生成行为。

### Modified Capabilities

- `media-library-resource-entry`: 明确 Canvas 对已链接媒体库直接引用、对目标媒体库显式复制，以及全局媒体库关联/复制的边界。
- `legacy-asset-catalog-retirement`: 禁止 Canvas normal authoring 继续调用旧 AssetLibrary promotion/import API 或产生 Asset membership。

## Impact

- `packages/neko-types`: Canvas 素材来源/生成引用的最小共享契约、严格验证和 NKC codec。
- `packages/neko-canvas/packages/domain`: ContentLocator authoring、Job/result projection、派生关系和 capability action contract。
- `packages/neko-canvas/packages/webview`: 来源感知工具栏、生成上下文/Job surface、导入与操作 dispatch。
- `packages/neko-canvas/packages/extension` 与 `apps/neko-desktop`: Host-owned 外部导入、ContentLocator 解析、媒体库复制/关联、Generation/Agent 路由及可见 diagnostic。
- `packages/neko-assets`: 复用 Media Library link/copy service；不恢复 Asset catalog 或 membership。
- `packages/neko-generation`、Preview、Cut 及媒体/模型 owner：复用既有 Job、ContentRead 和编辑/预览 capability，不由 Canvas 复制实现。
- 现有旧 NKC/投影中依赖路径或 provenance 推断生成来源的记录需要显式检查/迁移或 fail-closed diagnostic；不保留正常运行时 fallback。
