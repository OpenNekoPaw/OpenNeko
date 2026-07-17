# components/

UI 组件库，提供视频编辑器的所有 React 组件。

## 职责

实现视频编辑器的 UI 组件，包括时间线、属性面板、特效编辑等。

## 结构

```
components/
├── index.ts              # 组件导出
├── PreviewPanel.tsx      # 预览面板
├── Toolbar.tsx           # 工具栏
├── Timeline/             # 时间线组件
│   └── TimelineMinimap/  # 时间线缩略图
├── PropertyPanel/        # 属性面板
├── AudioWaveform/        # 音频波形
├── ColorCorrection/      # 色彩校正
├── Effects/              # 特效编辑
├── Mask/                 # 遮罩编辑
├── Subtitles/            # 字幕编辑
├── SpeedControl/         # 速度控制
├── TransitionPicker/     # 转场选择
├── Toast/                # 消息提示
└── ErrorBoundary/        # 错误边界
```

## 主要组件

| 组件 | 用途 |
|------|------|
| `Timeline` | 多轨道时间线编辑器 |
| `PreviewPanel` | 视频预览画布（见下方说明） |
| `PropertyPanel` | 元素属性编辑 |
| `Effects` | 特效参数编辑 |
| `Subtitles` | 字幕编辑器 |
| `TransitionPicker` | 转场效果选择 |

### PreviewPanel 播放/Seek 设计

`App.tsx` 的 rAF tick 在播放期间每帧（~33ms）调用 `seek(newTime)` 来推进播放头显示。
`PreviewPanel` 监听 `currentTime` 变化：

- **小幅正向增量**（`delta > 0 && delta ≤ 0.5s`，播放中）→ 跳过解码器重置和流重启，服务器已在按 PTS 推送帧
- **实际 Seek**（后退、大幅前进 >0.5s、或暂停时任意变化）→ `resetDecoder()` + 向服务器发送 `resume`/`seek` 消息

不遵守此规则会导致每帧触发解码器重置和流重启（30fps Seek 循环），视频永远无法播放。

## 依赖

```
→ hooks/          # 自定义 Hooks
→ stores/         # 状态管理
→ utils/          # 工具函数
→ types/          # 类型定义
← App.tsx         # 主应用组件
```
