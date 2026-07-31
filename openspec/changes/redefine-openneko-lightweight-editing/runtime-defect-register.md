# Cut OTIO Desktop 运行态缺陷登记

更新日期：2026-07-31

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

### 1. Desktop 组合运行态验收未完整

对应任务：`24.7`

自动化已经覆盖 document/session/revision identity、OTIO-to-export 投影、Clip 顺序和范围、
Video 内嵌音频、独立 Audio Track、mute/enabled、导出参数、Playhead generation/cancel 和
Desktop media descriptor 边界。仍需在隔离合成 fixture 中通过真实 Electron Desktop 验证：

- dirty revision 导出使用已接受的不可变内存 revision，不隐式读取磁盘旧版本；
- mixed audio、多个 Clip 输入边界和精确 timeline stop；
- 高频 Playhead 拖动、取消与再次拖动不会卡住；
- light/dark Neko theme 下 Preview workspace 与项目 Canvas 颜色职责正确；
- preview/export 完成、取消和关闭 view 后，Node/FFmpeg、PCM、media descriptor 与临时输出
  均被释放。

验收必须使用生产 package 或受控 Electron app runtime、隔离 fixture 和 Desktop public
ports。普通浏览器、Vite 页面或测试专用成功入口不能替代该证据。

### 2. OTIO save lifecycle 尚未接入共享 writer

对应任务：`24.8`

当前 Desktop Cut document storage 通过 `NekoHostPorts` 写入文档，但尚未证明 normal save、
save-as、backup 和 revert 全部复用共享 project-file save/authorized writer lifecycle。

目标契约：

- normal save 保持精确 document URI、view identity、session identity 和 view epoch；
- save 成功后只更新磁盘版本与 dirty projection，不销毁或重建 Desktop view；
- version conflict、writer failure 或非法路径 fail-visible，且不得清除 dirty；
- save-as 显式创建新 identity，normal save 不得借 save-as/reopen 模拟成功；
- Webview 不持有可回写 OTIO snapshot，Desktop Main document session 仍是唯一 owner。

最低验证：

- package-owned document/session 单元测试；
- Desktop Main producer/consumer 和 writer path tests；
- 正常保存、冲突、失败、save-as 的 identity/path 断言；
- 隔离 Electron Desktop 的 edit -> save -> reopen 场景；
- `pnpm check:content-access-boundaries`、受影响 build/test 和 strict OpenSpec。

## Closed Historical Defects

导出音频缺失、timeline end overrun、跨 Clip activation、Playhead capture、Preview 背景和 raw
error message 等迁移前问题已有历史实现与测试记录。当前验收只认可 Desktop Main、
Node/FFmpeg 和 renderer canonical path；旧宿主结果不能关闭 `24.7` 或 `24.8`。
