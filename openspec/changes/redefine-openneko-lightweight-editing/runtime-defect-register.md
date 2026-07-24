# Cut OTIO 运行态缺陷登记

更新日期：2026-07-24

本文记录当前 Extension Development Host 中已观察到、但尚未完成根因诊断和修复验收的 Cut 基础功能缺口。它是活跃 OpenSpec change 的实施输入，不是长期架构事实；修复完成后应把验证证据写入 `validation.md`，并关闭 `tasks.md` 中对应任务。

## 当前处置状态

以下状态只描述 24.x 当前实现和证据，不替代 `tasks.md` 的完成门禁：

| 缺陷边界                  | 当前实现/自动化证据                                                                                                                                                                                                                                                                                                               | 尚缺验收                                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 导出 revision 与保存策略  | 已明确为 Host 在接受匹配 identity 时、Save Dialog 前冻结内存 `TimelineView`；不隐式保存。job 绑定 `documentUri/sessionId/revision/settings`，identity、范围和深冻结有聚焦测试。                                                                                                                                                   | dirty 文档经原生 Save Dialog 导出，并证明磁盘旧 revision 未参与。                                                                                                  |
| OTIO-to-export 与输出校验 | adapter 已投影 Gap、Clip start/duration/trim/speed、Video 内嵌音频、独立 Audio、enabled/mute/gain/fade 和 job settings；成品时长误差超过一帧或预期音频缺失时 fail-visible。                                                                                                                                                       | 使用 mixed fixture 生成真实文件，核对切换边界、静音区间和音频流。                                                                                                  |
| 导出配置、i18n 与状态     | Webview 已提供 job-scoped output name、MP4/MOV、width/height、FPS、video bitrate、audio inclusion/bitrate/sample-rate；当前 Extension Development Host 已验证完整表单、无 Canvas/DaVinci 入口、无弹窗溢出，任务历史、进度/终态和原生状态栏使用现有 i18n/l10n 路径。                                                               | 成功/失败/取消的真实 Engine 全路径复验仍归入 24.7。                                                                                                                |
| Playhead 手势             | Ruler 已覆盖 pointer owner、capture、cancel、lost capture、blur、visibility change 和 unmount cleanup；preview request 使用单调 generation 与 AbortController。                                                                                                                                                                   | 真实 Webview 高频拖动、丢失 capture 后立即再次拖动。                                                                                                               |
| Timeline end              | runtime fixture 的 `TimelineView` presentation extent 为 `50.89s`，最后启用 Video/Audio Clip end 为 `26.30s`。Host descriptor 的 `playbackEndSeconds` 是播放终点；真实播放最终稳定停在 `26.29s` 帧边界，transport 回到 stopped，未继续向 `50.89s` 推进。                                                                          | 24.7 的组合场景仍需补充 Video/PCM session 释放 trace；精确停止本身已通过聚焦运行态验收。                                                                           |
| 跨 Clip 连续播放          | Preview session 复用用户手势启动的 AudioContext；Host 按 `resume -> publish activated -> retire old` 激活；Engine shutdown 先释放有界 frame receiver 再 join producer；共享 client lifecycle 以 generation 隔离被替换 client 的延迟回调。真实边界激活延迟从约 `5.506s` 降至约 `475ms`，播放头跨过 `21.26s` 并到真实媒体末端停止。 | 24.7 仍需连续多 Clip、Video/Audio 输入集合变化和组合资源 trace；当前两段 fixture 的 canonical path 已验收。                                                        |
| Preview 主题              | 外围 workspace 使用 VS Code theme token，项目 Canvas 保持黑色；浅色宿主 DOM/CSS 与截图已验证。                                                                                                                                                                                                                                    | macOS 锁屏阻塞深色和高对比宿主验收。                                                                                                                               |
| OTIO 保存生命周期         | 已定位 Cut 保存仍走 package-local `CutDocumentSession -> VSCodeCutDocumentStorage`，并以临时文件覆盖 rename 替换目标 URI；未使用共享 `ProjectFileSaveSession/ProjectFileStore`。                                                                                                                                                  | 建立 save 前后 document/panel identity 的运行态测试，迁移到共享 project-file save/authorized writer 边界，并证明保存不再关闭重开 Tab 且版本冲突继续 fail-visible。 |

## 1. 导出配置、国际化与状态投影

### 原始现象

- 导出面板未完整提供画布尺寸、输出分辨率和帧率等基础参数的可编辑入口，当前展示值与实际导出请求之间缺少可核对的单一映射。
- 导出面板、进度/终态提示与原生 VS Code 状态栏仍存在未国际化或语言不一致的用户可见文本。
- 状态栏必须继续投影明确 `jobId/documentUri` 所属的后台任务，不能退回 active/recent editor 推断。

### 待诊断边界

- `ExportPanel` / `ExportConfigView` 的表单状态和提交 payload。
- Extension Host export job snapshot、用户导出偏好与 OTIO project profile 的职责边界。
- Webview i18n、Extension l10n 与共享 `StatusBarGroup` 的 canonical path。

### 验收要求

- 尺寸、分辨率、帧率的含义、默认值、合法范围和最终 Engine 请求可逐项追踪；不得在 Webview、Host 与 Engine adapter 中维护互相漂移的默认值。
- 项目画布尺寸继续来自已接受的 OTIO profile。若允许输出分辨率覆盖，必须把它定义为当前 export job 的显式参数，不能写成第二份项目事实。
- 导出面板、后台进度、成功/失败/取消状态、状态栏文本、tooltip、命令标题和用户可恢复错误全部通过现有共享国际化入口。
- 增加 Webview 表单/消息测试、Extension job/status 测试和 Extension Development Host 运行态验证。

## 2. 导出结果与 OTIO 不一致

### 已观察现象

- 导出成品与编辑器中当前 OTIO 的时长、Clip 内容或排列不一致。
- 导出音频可能缺失，或者没有遵循 Video 内嵌音频、独立 Audio Clip、Clip/Track enabled 与 mute 的当前 OTIO 状态。
- 当前尚未证明后台任务绑定并导出了用户点击“开始导出”时的准确 document/session/revision。

### 待决策：导出是否自动保存

需要在实现前明确并测试以下契约：

1. 导出是否隐式触发 VS Code 文档保存；
2. 或者导出是否冻结 Host 中已经接受、但可能尚未写盘的 OTIO revision，并直接从该不可变快照生成 typed media inputs。

在决策完成前，禁止静默选择磁盘旧版本、Webview 快照或 active editor 内容，也禁止以自动保存掩盖 revision/投影错误。无论选择哪种方案，导出任务都必须记录明确的 `documentUri/sessionId/revision`，并让面板和状态栏可核对任务所使用的版本。

### 待诊断边界

- Webview `start export` intent 到 Host session revision 的绑定。
- OTIO Track/Clip/Gap、source range、constant speed、enabled/mute/gain/fade 到 export inputs 的投影。
- Video 内嵌音频与独立 Audio Clip 的混音输入，以及 expected stream presence 的成品验证。
- timeline duration、staging output、Engine terminal state 和原子发布。

### 验收要求

- 使用包含多个 Video Clip、Gap、内嵌音频、独立 Audio Clip、mute/disabled、trim 和 speed 的固定 OTIO fixture，逐项断言投影输入。
- 导出成品的总时长、切换边界、画面顺序、音频流存在性和静音区间必须与绑定 revision 一致。
- 输出验证不能只检查正时长；预期有音频时缺失音频流必须 fail-visible。
- 导出开始后继续编辑文档时，运行中的任务仍使用其冻结 revision，新的编辑只影响下一次导出。
- 保存策略必须有 Extension Development Host 场景覆盖，明确 dirty 状态、磁盘文件和导出 revision 三者关系。

## 3. Playhead 与连续播放

### 3.1 Playhead 拖动偶发卡住

#### 已观察现象

移动 Playhead 时偶尔无法继续移动，表现为 pointer gesture 卡住或后续位置更新不再生效。

#### 待诊断边界

- pointer capture、move/up/cancel/lost-capture/window blur 的完整生命周期。
- Playhead 本地临时状态、Zustand selector 更新、timeline viewport follow 与 preview seek intent 的职责分离。
- 高频 seek 时 preview generation/cancellation 是否反向阻塞输入手势。

#### 验收要求

- Playhead 手势期间位置更新不依赖 Host/Engine 往返。
- pointer release/cancel/lost capture 后必须清除 gesture owner，下一次拖动可立即开始。
- 高频连续拖动只保留最新 preview generation，旧请求不得覆盖或锁死新位置。
- 增加可在修复前稳定失败的 pointer 生命周期与高频 seek 回归测试，并在真实 Webview 中验证。

### 3.2 Timeline 结束后继续播放

#### 已观察现象

所有片段播放完成后，transport/playhead 仍继续向 Timeline 末尾之后推进。

#### 当前根因结论

- OTIO `TimelineView.durationSeconds=50.89s` 是保留编辑视口宽度的 presentation extent，不是媒体播放终点；当前 revision 最后一个启用 Video/Audio Clip 的 canonical end 是 `26.299999999999997s`。
- Host `resolvePreviewSelection()` 单独投影 `playbackEndSeconds`。Webview transport 由真实 Audio PTS 或 Video frame PTS 推进，timer 与 primary stream EOF 共享同一个 segment transition，并以 `playbackEndSeconds` 作为唯一终点。
- 真实运行中 transport 显示 `26.29s` 是帧边界/显示截断；随后按钮恢复为播放，多次采样保持不变，未向 `50.89s` presentation extent 空跑。

#### 验收要求

- 播放只允许推进到当前绑定 revision 最后一个启用 Video/Audio Clip 的结束点；内部 Gap 可推进到后续媒体，尾 Gap 与用于保持编辑视口宽度的 presentation extent 不得成为播放时长。
- 到达末尾时只执行一次 stop，Playhead clamp 到精确末帧，transport 进入 paused/stopped，Video/PCM session 全部释放。
- audio-only 尾段仍计入播放终点；最后一个启用媒体之后的 streamless Gap 不再空跑。

### 3.3 Clip 边界切换卡顿或中断

#### 已观察现象

一个片段播放结束并切换到下一片段时会发生可感知卡顿或中断；部分场景需等待数秒后下一片段才恢复。

#### 待诊断边界

- Host 返回的 `segmentEndSeconds` 与 Webview clock 的边界精度。
- 下一段 probe/preview/PCM session 的创建时机、旧 session 释放顺序和 generation ownership。
- Engine 首帧/首个 PCM buffer ready 与 transport clock 是否存在串行等待或竞态。

### 当前根因结论

- 第一处失约是 Webview 资源所有权：generation 1 的 `AudioStreamClient` 销毁了用户手势启动的 `AudioContext`，generation 2 又从 timer/EOF 回调创建 context，触发 autoplay policy 挂起。Preview session 现在独立拥有并复用同一个 context；切换开始即移交旧 segment 的 Playhead ownership，无新 PTS 时保持当前边界。
- 修复 AudioContext 后，generation 2 已能在边界前 prepared，但实测 activated 仍延迟约 `5.506s`。Host 原激活顺序是 `resume prepared -> await stop old -> publish activated`，所以旧 generation 清理延迟会直接阻塞新 generation 的用户可见激活。
- 旧 Video stream 的 pacing thread 停止消费后，encode thread 可能阻塞在满 `sync_channel.send()`；outer thread 保留 receiver 并等待 join，形成 shutdown deadlock，最后只靠 5 秒 stop timeout 返回。Engine 现在先 drop bounded receiver，再 join frame producer，使阻塞 send 以 disconnected 退出。
- Host canonical 顺序收敛为 `resume prepared -> set active -> publish activated -> retire old`。当前构建的真实 fixture 中 generation 2 从 prepared 到 activated 为 `475.3ms`，Playhead 连续经过 `21.51s/22.01s/25.56s/26.06s`，最终停在 canonical media end。
- 运行态还观察到已销毁 H.264 client 的延迟 WebSocket error 能进入当前 transport。共享 `EngineAvStreamLifecycle` 现在给每次 start 分配 generation；stop、dispose 或 replacement 会使旧 error/end/connection/frame callback 失效，旧 frame 会显式 close，pending start 被替换时 fail-visible。

#### 验收要求

- 相邻 Clip、Gap、Video 切换和 Audio 输入集合变化均在准确 timeline boundary 触发。
- 旧段结束不能先把全局播放状态置为 stopped；新段失败必须显示明确 diagnostic，而不是无反馈等待。
- 记录边界请求、ready、首帧/首音频和旧 session dispose 的 document/session/generation trace，以定位实际延迟来源。
- 增加连续多 Clip、Video+Audio 输入变化和快速 seek 穿越边界的回归测试与真实播放验收。

## 4. Preview 非内容区域主题不一致

### 已观察现象

Preview 内容画布之外的剩余背景区域使用了与当前 VS Code 主题不一致的固定浅色，深色内容两侧出现明显白色空白。

### 设计边界

- 项目 Canvas 仍按项目画幅显示内容，并可使用既定的黑色 letterbox/pillarbox 语义。
- Preview 容器中不属于项目 Canvas 的剩余工作区背景必须使用现有 VS Code/Workbench 主题 token；不得新增 Cut 私有主题色或改变项目内容本身的颜色。

### 验收要求

- 浅色、深色和高对比主题下，Preview 外围背景跟随共享主题 token。
- Inspector 展开/折叠、横向 resize、纵向 resize、全屏和 TV/电影/短视频/方形 profile 下均不暴露硬编码白色背景。
- 增加主题 class/token 断言，并在 Extension Development Host 中对至少浅色和深色主题进行视觉验证。

## 5. 保存时 Custom Editor 关闭并重新打开

### 当前根因结论

- Cut 当前没有使用共享 `ProjectFileSaveSession/ProjectFileStore`。`VSCodeCutDocumentStorage.write()` 总是先写同目录临时文件，再调用 `workspace.fs.rename(temporary, uri, { overwrite: true })` 替换已打开的 `.otio`。
- VS Code 文件服务会把目标 URI 的替换投影为文件生命周期变化；当前 Custom Editor 没有保存期 identity/lifecycle 抑制契约，因此旧 document/Webview 被销毁后按同一 URI 重新创建，表现为 Tab 先关闭再重新打开。
- 不能通过重开 Tab、吞掉文件事件或恢复 Webview 快照掩盖问题。OTIO codec 和 Host-owned `CutDocumentSession` 仍是领域事实，持久化应接入共享 project-file save/authorized writer 边界。

### 验收要求

- 增加 Extension Development Host 与路径测试，记录保存前后 exact document URI、session identity、panel identity、dirty state 和磁盘版本；普通保存不得销毁并重建 Custom Editor。
- 保存、另存为、backup 与 revert 使用同一共享 project-file save lifecycle，同时保留 OTIO domain codec、版本冲突检查、诊断和 fail-visible 行为。
- 保存失败不得清除 dirty、重开编辑器或返回成功；不得恢复 Webview-owned writable snapshot、package-local 平行 save session 或 legacy codec。

## 修复顺序

1. P0：冻结导出 revision/保存契约并修复 OTIO-to-export 投影、时长和音频正确性。
2. P0：修复 Timeline 结束条件与跨 Clip 连续播放。
3. P1：修复 Playhead pointer/seek 竞态。
4. P1：补齐导出参数、国际化和状态栏投影。
5. P1：修复 Preview 外围主题背景。
6. P1：迁移 OTIO 保存到共享 project-file save lifecycle，并消除保存触发的 Custom Editor 重建。
7. P1：修复 Timeline 历史 extent、移动模式和媒体插入落点契约。

每项修复都必须先获得稳定复现或失败测试，再沿 Webview → message/controller → Host session/job → media adapter/Engine 的完整路径定位第一个契约违背点；不得通过重试、延时或静默 fallback 掩盖竞态和 revision 漂移。

## 6. 报错文案未国际化且展示位置不统一

### 已观察现象

- `place-clip(overlapPolicy=reject)` 被 Domain 拒绝后，Extension 通过 `cut:error.message` 把英文 `Error.message` 原样发给 Webview。
- `CutOtioController` 把原始字符串写入 Presentation Store，`App` 再通过 Preview 上方 `.cut-basic-error` 展示；Timeline 的少量本地错误则使用右下角 Toast。
- Preview stream、AudioContext 与 export task 失败也保存原始异常字符串，因此问题覆盖全部 Host/媒体失败，而不只是 overlap 文案。

### 根因结论

- 跨层消息把展示文案误当成错误契约，没有稳定 diagnostic code，也没有在最终展示 runtime 执行本地化。
- Presentation Store 同时承担原始 diagnostic 存储和 Preview banner 展示状态，绕开了已存在的 `ToastProvider` canonical path。
- Export task snapshot 的 `error?: string` 又形成一条原始英文路径，并被 Webview 与原生状态栏分别消费。

### 目标边界与验收要求

- Domain 提供可穷举的 user diagnostic code；Extension 只发送结构化 diagnostic，未知内部错误经共享 ErrorHandler 记录后映射为明确的本地化失败类别。
- Webview Host、Preview、AudioContext、本地交互和 Export 失败统一进入现有 Toast；删除 Preview 顶部 error/notice banner，不新增 Cut 私有通知系统。
- 中英文 locale 覆盖完整 diagnostic catalog；overlap 使用专用 code，中文显示“片段不能与目标轨道上的其他片段重叠”。
- 回归测试必须 poison 旧 `message: string` 协议，断言未知 code fail-visible，并证明 Export task/状态栏不再消费原始异常字符串。
- Extension Development Host 验收必须触发真实 overlap，确认 DOM 只有一个右下角 Toast、无 `.cut-basic-error`、无英文原文或重复 `role=alert`。

### 修复与验收状态（2026-07-24）

- 已完成：Domain 结构化 diagnostic、Extension 映射、Webview 中英文完整 catalog、Export snapshot/status 投影和 ErrorBoundary 国际化均已接入 canonical path；旧 raw-message、Preview banner 和 `window.alert` 路径已删除。
- 聚焦测试通过：Domain `39`、Cut Extension `105`、Cut Webview `221`、共享 UI `150`；受影响 typecheck、Cut compile、全仓 build/check、unused、legacy-debt、strict OpenSpec 与 `git diff --check` 通过。
- 真实 Extension Development Host 从 Inspector 提交重叠位置后只显示右下中文 Toast。CDP 断言 `role=alert` 恰好一个，父容器为 `fixed bottom-4 right-4`，`.cut-basic-error=0`、`.cut-basic-notice=0`，且 DOM 不包含旧英文 overlap 文案。
- 运行态 console 只有 VS Code 已知的 `local-network-access` warning；脱敏截图位于 gitignored `reports/webview-functional/cut-runtime-2026-07-24/diagnostic-toast-zh-cn.png`。
- 全仓相关套件均通过；此前阻塞 aggregate 的 Canvas `Video Project` 旧文案断言已对齐 canonical `Project` 投影。后续完整 `pnpm ci:local` 以退出码 0 通过，该仓库基线阻塞已关闭，但不替代 24.7 的 Extension Development Host 组合场景。

## 7. 删除末尾 Clip 后出现长空白，移动与媒体插入语义不明确

### 稳定复现与根因

- 四个约 `21.27s` Clip 的 Timeline 从 `85.07s` 删除末尾两个后，Domain 投影已变为两个 Clip、`duration=42.53s`，但 Webview `canvasDuration` 仍为历史 `85.07s`。该长空白不是 OTIO Gap，而是 `retainTimelineCanvasDuration()` 对所有缩短都保留历史最大值。
- Extension Development Host 当前 fixture 的 Video Track 实际包含约 `42.53s` Clip 内容和约 `528.73s` trailing Gap，因此 `projectDuration=571.27s`；这不是历史 canvas extent，而是投影出的真实 OTIO Gap。旧 `ripple-delete` 只删除 Clip、不压实该 Track，导致删除末尾 Clip 后真实 trailing Gap 继续扩展 Timeline。
- `place-clip` 只有目标 overlap policy，没有源位置策略，因此“移动后是否闭合源位置”只能隐含在实现中。
- 外部媒体 drop 只发送 `trackId + uris`，文件选择器只发送 `trackId`；Host `link-media` 无条件 append，丢失 pointer/playhead 时间语义。

### 目标边界与验收要求

- Timeline 使用与 Minimap 一致的单个 icon-only `ToolbarButton` 提供“顺序 / 定位”模式；初次投影含 Gap 时显示定位模式。用户显式进入顺序模式会通过 revisioned `trim-trailing-gaps` 删除所有 Track 的尾部 Gap，但保留内部 Gap 以免改变音画同步；后续顺序移动压实被修改 Track 的全部 Gap 并在最近顺序边界插入。定位模式保留等长 Gap、使用精确 frame 时间并拒绝重叠。`ripple-delete` 同样压实实际删除 Clip 或 linked Clip 的 Track，未受影响 Track 不变。
- `place-clip` 必须携带 `sourcePolicy` 与 `overlapPolicy`；同轨顺序向后移动必须在删除源区间后校正目标时间。Inspector 精确起点继续使用 preserve-gap/reject。
- `link-media` 必须携带 `timelineStartFrames` 与 `overlapPolicy`。外部 drop 使用 pointer Track/time；picker 使用播放头和所选兼容 Track，无选择时使用固定 Video 或第一个兼容 Track；多文件按实际插入结束点串行。
- Canvas route 的显式目标追加语义保持不变，不能被交互式 picker/drop 的时间策略改写。
- Webview 只在 Track/item identity 与顺序不变的 duration/source/speed 修改时保留 extent；删除、移动、重排或 Gap 结构改变后收缩到当前投影。定位模式与显式 Canvas route 可保留真实 Gap，并使用明确视觉；顺序移动和 ripple delete 则按命令语义移除受影响 Track 的 Gap。普通轨道背景和历史 presentation extent 不得伪装为 Gap。
- 回归测试必须证明缺少新增 placement 字段会 fail-visible，不能通过旧 append fallback 成功；运行态必须覆盖尾部删除、两种移动模式、真实 Gap、pointer drop 和 picker-at-playhead。

### 2026-07-24 follow-up

- 红灯运行态证明当前默认顺序按钮与持久结构脱钩：执行“定位 -> 顺序”后按钮已选中顺序，但 Video Track 的真实 trailing Gap 仍为 `41769.9px`，Timeline 仍显示 `09:31.26`。
- 同一 bundle 通过最后 Clip 的 `ripple-delete` 能把 Gap 清零并收缩至 `00:31.60`，排除 Core 删除实现与陈旧 bundle；根因是 placement mode 只更新 Zustand，未产生任何 OTIO command。
- 修复必须用 typed command 删除真实 trailing Gap，不能只隐藏条纹或修改 Webview canvas extent。内部 Gap 仍有显式同步语义，不得在模式切换时一并删除。
