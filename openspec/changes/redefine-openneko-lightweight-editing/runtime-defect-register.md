# Cut OTIO Desktop 运行态缺陷登记

更新日期：2026-08-03

本文是活跃 OpenSpec change 的当前实施输入，只记录 Desktop-only 组合后仍未关闭的 Cut
运行态缺口。迁移前的 Extension Host、Engine adapter、Custom Editor 和状态栏证据保留在
`validation.md` 作为历史记录，不再定义实现或验收入口。

## 当前边界

Cut 当前唯一运行路径是：

```text
Desktop renderer/Webview
  -> preload typed Cut port
  -> Desktop Main DesktopCutRuntime
  -> package-owned Cut document/session contract
  -> NodeFfmpegCutMediaAdapter
  -> Desktop media descriptor protocol
```

不得回退到已删除宿主、Engine Cut adapter、Webview-owned writable project snapshot、
active/recent view 推断或 package-local 平行 save lifecycle。

## Open Defects

### 1. P2 运行态验收仍需扩展

P0/P1 隔离 Electron fixture 已覆盖 new-target create、explicit-target append、edit → dirty →
export、later edit、save → reopen、multi-document isolation、跨 Clip playback/seek、mixed audio、
不可变 export source revision、OpenNeko resource generation replacement 与旧 generation release。

仍需作为最终资格而非 P0/P1 阻塞项继续验证：

- 高频 Playhead 连续拖动、取消与再次拖动；
- light/dark Neko theme 下 Preview workspace 与项目 Canvas 颜色职责；
- ExportJob restart restore/cancel 与关闭 view 后的进程、PCM、descriptor 和临时输出释放；
- save-as、backup、revert 的完整产品入口。

验收必须使用生产 package 或受控 Electron app runtime、隔离 fixture 和 Desktop public
ports。普通浏览器、Vite 页面或测试专用成功入口不能替代该证据。

## Closed Historical Defects

OTIO normal save 已切换到共享 `NodeAuthorizedWorkspaceWriter`，package producer 和 Desktop consumer
测试覆盖精确 document identity、版本冲突与 fail-if-exists；隔离 Electron fixture 证明保存后重建
Renderer/session 会从磁盘恢复已接受 revision。New-target create 与 explicit append 也通过 package-owned
`CutApplicationRuntime` 完成，Desktop 只保留授权与 writer adapter。

延迟音频 Clip 的 export mix 已用完整 timeline silence anchor 修复，并由 Node 回归测试与真实 Electron
dirty export 共同验证。导出失败通过 Host diagnostics fail-visible，不把 FFmpeg 错误伪装为成功。

timeline end overrun、跨 Clip activation、Playhead capture、Preview 背景和 raw error message 等迁移前
问题已有历史实现与测试记录。当前验收只认可 Desktop Main、Node/FFmpeg 和 renderer canonical path。
