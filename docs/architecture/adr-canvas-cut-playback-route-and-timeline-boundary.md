# ADR: Canvas 播放路线与 Cut 时间线边界

状态：Accepted

更新日期：2026-08-01

范围：Canvas、Cut、Preview、Agent、OTIO、Desktop authoring port 与媒体运行时。

## 决策

Canvas 和 Cut 是两个独立领域。Canvas 拥有空间布局、节点、连接和播放顺序；Cut 拥有 OTIO
时间线、轨道、trim、速度、音量、转场意图和导出。两者不共享可变 document，也不持续双向同步。

```text
Canvas document + explicit playback route
  -> immutable ordered media/gap draft
  -> Desktop authoring port
  -> create new Cut document or apply to explicit Cut revision
  -> Cut-owned OTIO timeline
```

## Canvas 权威

Canvas 播放路线只引用 Canvas 节点和稳定资源 identity。路线顺序来自显式 route/selection，
不得由 DOM 顺序、坐标扫描、当前 selection 或最近打开项隐式推断。Canvas 可以预览路线，但
不保存 Cut track、trim、transition、playhead 或导出状态。

## Cut 权威

Cut document/session identity 与 revision 必须显式。导入 Canvas draft 时只允许：

- 创建新的 Cut document；或
- 用户明确选择目标 Cut document，并携带 expected revision 原子应用。

不存在 active/recent Cut fallback。revision 不匹配返回 typed conflict，不覆盖用户已编辑时间线。
导入完成后，Cut 独立拥有新时间线；Canvas 后续变化不会自动改写 Cut。

## 媒体与宿主

Renderer/Webview 拥有高频交互、playhead、selection 和局部预览状态。Desktop Main 只负责
文件授权、typed authoring command、资源 registration、Node/FFmpeg session 与生命周期，
不代理每一帧或每次拖拽。媒体路径遵守 [`media-runtime.md`](media-runtime.md)：原生
`<video>`/Range、Cut-owned clock、Host 混合 PCM 和明确取消/释放。

Agent 只能调用 Canvas/Cut 公共 capability。它可以读取 route、构造 draft 或请求 apply，
但不能直接写项目文件、猜测目标 document、绕过 revision 或持有 UI selection。

## 验证

- Canvas route determinism、资源缺失和无效节点使用 package test；
- draft producer/consumer、create/apply、revision conflict 和 OTIO round-trip 使用集成测试；
- 断言 Desktop authoring port 与 Cut canonical handler 被命中；
- 播放、seek、音频、窗口关闭和资源释放使用真实 Electron fixture。

相关边界见 [`adr-cut-html-video-node-ffmpeg-media-runtime-boundary.md`](adr-cut-html-video-node-ffmpeg-media-runtime-boundary.md)、
[`package-boundaries.md`](package-boundaries.md) 和 [`headless-project-authoring.md`](headless-project-authoring.md)。
