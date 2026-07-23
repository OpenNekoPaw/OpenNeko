# Final validation evidence

Date: 2026-07-23

## Implemented boundary

- VS Code Cut keeps its Webview package, root/app shell, Host adapter, basic preview/timeline/transport, contextual Inspector, error boundary and Toast support.
- Deprecated professional features, the legacy NKV Minimap, writable Webview project state, NKV/NKC persistence, implicit Cut targeting, the old ingest/catalog/copy pipeline and advanced unused controls are deleted vertically with their tests, locale entries, exports and styles. A narrow Host-owned copy step exists only for explicitly imported workspace-external files.
- `.otio` is the sole durable Cut project authority. Media references are normalized document-relative links and are projected to workspace-relative runtime sources only after containment checks.
- “Separate audio” creates a same-source Audio Clip without WAV extraction. Video and Audio Clip mute state remains independent; preview/export do not suppress duplicate unmuted inputs.
- Canvas sends an ordered media/gap route only to a new or explicitly identified `.otio` target/revision.

## Automated validation

| Command                                              | Result                                     | Coverage                                                                                                                                                                    |
| ---------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --dir packages/neko-cut/packages/domain test`  | passed: 2 files / 35 tests                 | OTIO codec, identity/link metadata, atomic command batches, direct absolute-time clone, session/revision, integer-frame trim and projection                                   |
| `pnpm --dir packages/neko-cut test -- --run`         | passed: 18 files / 89 tests                | Extension registration, path/rebase, controlled external copy, Host-owned clipboard planning, derived representation boundary, media adapter, export jobs and retained services |
| `pnpm --dir packages/neko-cut/packages/webview test` | passed: 20 files / 186 tests               | retained components, Zustand selection/clipboard adapter, batch movement, box selection, playhead follow, multi-file drop, preview, resize, keyboard/context-menu and export UI |
| `pnpm --dir packages/neko-canvas test --run`         | passed: 23 files / 290 tests               | Canvas behavior plus explicit Cut route producer/consumer contract                                                                                                          |
| `pnpm --dir packages/neko-ui test --run`             | passed: 35 files / 150 tests               | shared UI primitives and current OTIO-editor native status boundary                                                                                                         |
| `pnpm build`                                         | passed: 9/9 tasks                          | all configured monorepo build targets, including Cut Extension and Webview                                                                                                  |
| `pnpm check:legacy-debt`                             | passed                                     | no blocking legacy-debt surface                                                                                                                                             |
| `pnpm check:unused`                                  | passed                                     | no unused dependency/export finding                                                                                                                                         |
| `pnpm check`                                         | passed: 1,413 modules / 4,966 dependencies | unused and dependency-direction gates                                                                                                                                       |
| `pnpm exec openspec validate redefine-openneko-lightweight-editing --strict` | passed | strict OpenSpec consistency                                                                                                                               |
| `git diff --check`                                   | passed                                     | patch whitespace integrity                                                                                                                                                  |

`pnpm test` was executed but is not green: `@neko-agent/extension` has 2 failing assertions in `agentStreamProcessor.test.ts` that still expect a `loadProviderAsset({ variant })` request while production sends the existing `{ source, mimeTypeHint }` contract. The affected Cut, Canvas, shared route and Agent plugin-transfer tests pass; this change does not modify `agentStreamProcessor` or that content-access request path. The full test task therefore remains unchecked rather than being reported as successful.

## Extension Development Host evidence

An isolated synthetic workspace at `/Users/feng/Git/neko-test` was used. The current Cut Extension and Webview build was reloaded in an Extension Development Host. Target discovery observed the main VS Code page, the Development Host page and the Cut Webview iframe on port 9222. Webview console inspection reported only VS Code's documented benign `local-network-access` warning; no Cut CSP, resource or JavaScript error was observed.

The `.otio` editor visibly showed the retained transport, global volume/mute, fullscreen, link/split/delete, undo/redo, export, zoom/fit-all, basic tracks and contextual Inspector. The legacy NKV Minimap and professional controls were absent. The following current-build scenarios passed:

- linking `cases/720P.mp4` added a Video Clip and persisted `../cases/720P.mp4`; no media copy or derived file was created;
- separating AAC-bearing `cases/1080P.mp4` added an Audio Clip on `A2` with the same `../cases/1080P.mp4` ExternalReference and reciprocal link metadata; no WAV was created;
- Video and Audio Clip mute controls changed independently. The project was saved as Video muted and Audio unmuted, then closed and reopened with both states and both tracks preserved;
- selecting the Video Clip and starting preview advanced the transport from `00:00.00` to `00:00.45` through the connected Neko Engine;
- Save As created `cut-second.otio`. Muting only its Audio Clip and adding another media link left `cut-basic.otio` unchanged, proving document/session isolation and Save As session rekeying in the host.

Media export completed and produced `/Users/feng/Git/neko-test/cut-basic-export.mp4`. Frame inspection showed the expected video content, and `ffprobe` reported H.264, 1920×1080, 30fps and 3 seconds. However, the output had no audio stream even though the separated Audio Clip was unmuted. The adapter projected the Audio track, but its post-export validation checks only positive duration, so the missing required audio stream was incorrectly accepted as success. This is a fail-visible correctness gap in the current Engine export path; section 9.2 remains unchecked.

Canvas new-target creation and explicit-target append were not exercised through the Extension Development Host, so section 8.3 remains unchecked.

## Residual risk

- Engine export can silently produce video-only output when the timeline contains an unmuted audio input. Export acceptance must validate expected stream presence, and the underlying audio export failure must become diagnostic rather than a successful downgrade.
- Canvas new-target creation and explicit-target append still require Extension Development Host evidence.
- Linked Clip split remains fail-visible rather than implementing a coupled split; fully independent linked audio editing remains outside this change.
- Workspace-internal links can produce missing-media diagnostics after partial/raw project moves; controlled Save As rebases links, while raw filesystem copies do not. Explicit workspace-external imports are copied beside the OTIO document but still require moving the document and its relative `media/` tree together.
- 视频缩略图和音频波形保持 Host/Engine 派生、Webview revision-scoped 内存态且不进入 OTIO；重新打开编辑器或文档 revision 变化后会按可见范围重新生成，不提供磁盘缓存。
- Clip 首尾 trim 已可在 Host 投影的 `available_range` 内双向恢复；仍不会越过真实媒体可用范围，Webview 不猜测源媒体边界。

## Bounded multi-track follow-up (2026-07-23)

- OTIO/Core now enforces exactly one Video Track, at most three Audio Tracks, at most one Subtitle Track and at most five Tracks total. Track metadata carries stable `trackId`; link, optional Track removal, Gap placement and Clip move no longer select the first Track by kind.
- The retained Webview adds Audio/Subtitle Track controls, target-specific media entry and HTML drag/drop for compatible Track moves while preserving preview, transport, Inspector and the revisioned command boundary.
- Subtitle entry links SRT/VTT and derives its Clip duration from explicit timestamps. The selected VS Code media adapter cannot render or burn subtitles yet; export with a non-empty Subtitle Track fails before Engine enqueue and is covered by a focused adapter test.
- Follow-up validation passed: `pnpm --dir packages/neko-cut compile`; `pnpm --dir packages/neko-cut test --run` (6 files / 48 tests); `pnpm --filter @neko-cut/domain test` (2 files / 21 tests); `pnpm --filter @neko-cut/domain typecheck`; `pnpm --filter @neko/webview test` (1 file / 7 tests); `pnpm --filter @neko/webview build`; `pnpm check`; `pnpm check:legacy-debt`; `openspec validate redefine-openneko-lightweight-editing --strict`; `git diff --check`.
- Extension Development Host black-box evidence: on the isolated `neko-test/.functional/cut-second.otio` fixture, adding two optional Audio Tracks and one Subtitle Track produced `V + A + A + A + S`; both add buttons then became disabled. The retained preview, transport, Inspector and timeline remained visible.
- CDP Webview evidence: the current iframe exposed five typed Track rows, draggable Clip elements, disabled add controls at the limit, no legacy NKV Minimap and no professional-mode text. A synthetic HTML drag moved the Audio Clip from Audio 1 to Audio 2 through the revisioned Host command; attempting Audio-to-Subtitle produced an explicit incompatible-Track error and left the Clip on Audio 2. Console inspection reported only VS Code's known benign `local-network-access` warning. The synthetic fixture was restored through undo after the scenario.
- SRT/VTT file-dialog selection was not exercised in the Development Host because the existing isolated fixture has no subtitle file; timestamp parsing and non-silent export rejection remain covered at Extension/unit level.

## Retained component-boundary correction (2026-07-23)

- `App.tsx` 已恢复使用独立的 `PreviewPanel`、`PreviewControls`、`PropertyPanel`、`TimelineControls`、`TimelineRuler`、`Playhead`、`TimelineTrack` 和 `TimelineElementContent`；组件只接收 `TimelineView` 与 intent callback。
- 组件复用审计：继续使用 `@neko/ui` 的 `CreativeWorkbenchShell`、`IconButton` 与共享图标；未复用 `neko-preview` 的播放器控件，因为 Cut 需要 revisioned OTIO timeline-time intent 和多音轨会话语义；Timeline 组件保留在 Cut 包内，因为它们直接消费 Cut `TimelineView` 与 command callback，未复制通用设计系统或跨包私有实现。
- 基础时间线恢复固定轨道头、自适应刻度、点击/拖动播放头、水平滚动、缩放滑杆、fit-all、指定轨道媒体入口和按落点计算插入边界的 Clip 拖放；旧 NKV Minimap、专业模式和 writable Webview project Store 未恢复。
- 预览控制消息改为 revisioned `timelineTimeSeconds`。Extension 在该绝对时间解析活动 Video Clip 和所有未静音 Audio Clips，不再依赖 Webview 当前选中的 Clip。
- 聚焦验证已通过：`pnpm --dir packages/neko-cut/packages/webview test`（3 files / 13 tests）、`pnpm --dir packages/neko-cut/packages/webview build`、`pnpm --dir packages/neko-cut test`（7 files / 51 tests）以及 `pnpm --dir packages/neko-cut compile`。

## Derived media visuals and basic Clip editing (2026-07-23)

- Webview 通过 revisioned `cut:request-representations` 仅请求可见 Video/Audio Clip；Extension 校验最多 24 个请求、每个 Video Clip 最多 8 帧、waveform 每秒最多 100 peaks，并在新请求、document mutation 或 panel dispose 时取消旧任务。
- Extension 从 `.otio` 文档目录解析并执行 workspace containment 后，通过 `NekoEngineCutMediaAdapter` 生成 160×90 JPEG 缩略图与真实 waveform peaks。Audio waveform 按 Clip `sourceStartSeconds`/`durationSeconds` 裁切；data URL、peaks、loading/unavailable 状态只存在于 Webview 内存，不写入 OTIO。
- 时间线 seek、兼容 Track 插入位置和首尾 trim 共享 project-frame 量化与 8px screen-space snapping。选中 Clip 显示 start/end trim handles，pointer gesture 本地预览，释放后只提交 revisioned `trim` command；Core 拒绝非整数 frame delta 与非正时长。
- 自动验证通过：`pnpm --dir packages/neko-cut/packages/webview test`（4 files / 17 tests）、`pnpm --dir packages/neko-cut test`（8 files / 56 tests，含同 revision 旧派生请求取消后不得回发的路径断言）、`pnpm --dir packages/neko-cut/packages/domain test`（2 files / 21 tests）、Extension `tsc --noEmit`、`pnpm --dir packages/neko-cut compile`、`pnpm build`、`pnpm check`、`pnpm check:legacy-debt`、`pnpm check:openspec`、`git diff --check`。
- Extension Development Host 在隔离 fixture `neko-test/.functional/cut-second.otio` 上加载当前构建：DOM 显示独立 Preview/Controls/Toolbar/Ruler/Track/Clip/Playhead 组件、V1/A1、无旧 NKV Minimap/专业模式；两个 Video Clip 分别显示 3/8 张 160×90 Engine JPEG，Audio Clip 显示真实 waveform，全部 derived state 为 `ready`。
- CDP pointer 场景将选中 Video Clip 从 `02:06.53` start-trim 到 `02:06.03`，证明 trim handle → snap/frame math → revisioned Host command → OTIO projection 路径；随后执行 File Revert 将合成 fixture 恢复到 `02:06.53`。Webview console 只有 VS Code 已知 benign `local-network-access` warning，无 Cut JavaScript/CSP/resource error。
- 脱敏运行态截图：`reports/webview-functional/cut-derived-timeline.png`（gitignored）。

## Resizable Workbench and retained interaction correction (2026-07-23)

- Cut 重新使用 `CreativeWorkbenchShell.rightDock`、共享 `ResizeHandle`、`useResizable`/`usePersistedResize` 和共享属性行组件；Preview/Timeline 默认 50/50、限制 20%–80%，Inspector 默认 280px、限制 200–400px，并仅持久化到 VS Code Webview state。Cut Webview 显式加载共享 Workbench stylesheet，并用两列 Cut adapter grid 表达“无左侧 Rail”的主区 + Right Dock 布局。
- `PropertyPanel` 已验证 Project、Video Clip 与 Audio Clip 上下文；Audio Clip 显示 mute、gain、fade-in、fade-out，Video Clip 保留独立 mute 与显式分离/取消分离入口。音频更新合并现有设置，单独切换 mute 不会擦除 gain/fade。
- Clip 移动改为 pointer-owned session。CDP 场景验证了跨 kind 目标的 incompatible 高亮、同 kind 的吸附位置线与插入线、`blur`/`pointercancel` 清理，以及有效同轨移动只产生一次 `cut:view` revision 更新；随后 Undo 产生下一 revision 并恢复 fixture 原顺序。
- 运行态首先暴露并修复了一个测试未发现的布局回归：Cut CSS 曾覆盖共享 Workbench grid，使 280px Inspector 实际压缩为约 36px。修复后当前 Webview 的 Preview/Timeline 为约 35%/65%、Inspector 为 340px；重新加载 Extension Development Host 后两项尺寸均保持，Inspector 仍与主区并排。
- 最终验证通过：`pnpm --dir packages/neko-cut/packages/webview test --run`（4 files / 20 tests）、`pnpm --dir packages/neko-cut/packages/domain test`（2 files / 21 tests）、`pnpm --dir packages/neko-cut test --run`（8 files / 56 tests）、`pnpm --dir packages/neko-cut compile`、`pnpm build`（9/9 tasks）、`pnpm check`、`pnpm check:unused`、`pnpm check:legacy-debt`、`pnpm check:openspec`、`pnpm smoke:webview:targets` 和 `git diff --check`。
- Extension Development Host 使用隔离的 `/Users/feng/Git/neko-test/.functional/cut-second.otio` fixture。Cut Webview console 仅出现 VS Code 已知 benign `local-network-access` warning，无 Cut JavaScript、CSP 或资源错误。脱敏截图：`reports/webview-functional/cut-resizable-inspector.png`（gitignored）。
- 本轮没有恢复 multi-select/batch drag、copy/paste、自由绝对时间放置、旧 NKV Minimap 或专业 Inspector；这些能力缺少当前 OTIO typed command，若直接恢复会重新引入 Webview writable timeline 或伪能力。Gap Inspector 当前只读，因为现有 command 只覆盖 Clip trim/delete 与顺序移动。

## Preview, Overview and Inspector regression correction (2026-07-23)

- 预览舞台现在占满 Preview 分区剩余空间，在黑色 stage 内按 OTIO profile 保持画幅；transport 移到舞台下方。CDP 实测 Preview 高 410px、stage 为 680×382（1.78）、transport 为 42px 且位于 stage 下方，不再出现黑色细条和大块空白。
- 保留入口后改接的 `TimelineMinimap` 仅消费 revisioned `TimelineView`、playhead、zoom 与真实 timeline viewport，按 Track kind 投影结构条。它不导入 `ProjectData`、旧 Store、媒体表示请求或 `postMessage`；点击只改变时间线滚动。Extension Development Host 实测从 `scrollLeft=0` 导航到 `4083/8898`。
- 旧 NKV `TimelineMinimap/**` 与 `useMinimapInteraction` 仍保持删除；当前 Overview 不请求缩略图/波形，不形成第二份项目或媒体状态。
- Inspector 显隐入口已收敛到 Preview controls 最右侧；折叠后不再保留 36px reveal rail，也不在 Timeline toolbar 重复展示。展开时仍恢复原来的 persisted width。
- 组件复用审计继续复用 `CreativeWorkbenchShell.rightDock`、`IconButton`、共享图标和 persisted resize hook；未复活旧 Minimap，因为其依赖已删除的 `ProjectData`、thumbnail generator 与 store-coupled interaction。新的 Overview 是 Cut `TimelineView` 专属投影，不适合进入无领域语义的共享 UI primitive。
- 验证通过：Webview 5 files / 23 tests，Cut 8 files / 56 tests，`pnpm build` 9/9，`pnpm check`（1,356 modules / 4,802 dependencies）、`pnpm check:legacy-debt`、`pnpm check:unused`、strict OpenSpec 和 `git diff --check`。Extension Development Host console 只有 VS Code 已知 benign `local-network-access` warning；截图为 `reports/webview-functional/cut-preview-overview-inspector.png`（gitignored）。

## Canonical component reuse and background export correction (2026-07-23)

- 删除了与旧组件边界平行的命名和入口：`BasicInspector`、`TimelineToolbar`、`TimelineOverview`、`TimelineClip`、`useCutKeyboardShortcuts` 与 `useTimelinePointerDrag` 不再是生产实现。当前 canonical path 为 `PreviewPanel`、`PreviewControls`、`PropertyPanel`、`TimelineControls`、`TimelineMinimap`、`TimelineElementContent`、`useKeyboardShortcuts`、`useTimelineDragDrop` 与 `useTimelineContextMenu`。
- 旧组件只替换数据适配：展示层消费 revisioned `TimelineView` 并发出 typed intent，不恢复 writable Store、snapshot save 或 Webview IO。i18n、主题、ErrorBoundary、Logger、Toast、Dialog、ContextMenu、Property primitive、resize 和 keyboard dispatcher 均继续复用现有共享入口。
- 导出继续由 `ExportPanel` 组合 `ExportConfigView` 与 `ExportProgressView`；共享 Dialog 的 Tailwind source 恢复到 Cut 构建扫描范围，不再为 Cut 复制 modal 实现。Extension Host 中的 document/session/job registry 拥有任务生命周期，Webview 只查询、取消和转入后台。
- 状态栏恢复原 `views/statusBar.ts` 边界并复用共享 `StatusBarGroup`。状态投影只使用任务携带的显式 `documentUri`，不回退到 active/recent Cut。
- 聚焦自动验证通过：Webview `12 files / 42 tests`，Cut Extension `12 files / 66 tests`，Cut Domain `2 files / 23 tests`，Domain typecheck、Cut compile、`pnpm check`、`pnpm check:legacy-debt`、strict OpenSpec、`git diff --check` 与全仓 `pnpm build` `9/9` tasks。
- Extension Development Host 实测当前构建：Inspector 位于 Preview 右侧，Timeline 位于下方整宽；复用的导出 Dialog 在 Webview 视口水平/垂直居中。任务转入后台后 VS Code 原生状态栏从 `Exporting cut-status-reuse.mp4` 更新为 `Export completed`；切换到 `cut-basic.otio` 后点击该状态项，精确导航回任务所属 `cut-second.otio`。

## External media import and cross-Clip runtime correction (2026-07-23)

- 文件选择器与 Explorer/系统 drop 共用 `CutOtioEditorProvider.linkMediaUri`。Host 新增 `CutWorkspaceMediaImporter`：workspace 内普通文件原地链接；workspace 外普通文件使用同目录 staging、排他 hard-link 发布和冲突后缀复制到 `<otio-directory>/media/`，随后才进入 containment、probe 与 revisioned `link-media` command。复制/发布失败会清理 staging；command 未提交时回滚已发布副本。
- 聚焦测试覆盖 workspace 内 no-copy、外部 copy、名称冲突不覆盖、目录与 symlink escape 拒绝、发布/清理失败回滚，以及 picker/drop 两个入口命中同一 canonical path。最新结果：Cut Extension `14 files / 74 tests`，Webview `18 files / 170 tests`，Domain `2 files / 23 tests`；Cut compile、Extension/Webview typecheck、`pnpm build`（9/9）、`pnpm check`（1,405 modules / 4,936 dependencies）、`pnpm check:legacy-debt` 与 `pnpm check:unused` 通过。
- Extension Development Host 从 workspace 外 `/tmp/.../external-test.mp4` 导入后生成 `.functional/media/external-test.mp4`，OTIO 持久化 `media/external-test.mp4`；Clip 时长为 5.03 秒，文档进入 dirty，`Cmd+S` 后保存并清除 dirty。原 workspace 内 `720P.mp4` 仍保持 `../cases/720P.mp4`，证明 no-copy 分支未改变。
- 修复了 Engine stream EOF 在下一段请求前无条件停止 playback 的竞态。timer 与 stream-end 现在共享一个 segment transition，Video 存在时由 Video EOF 作为主边界；运行态从第一段 38.00 秒播放跨过 39.20 秒边界，自动切换到 `external-test.mp4` 并在 44.23 秒项目末尾停止。边界处仍有 Engine 新流启动延迟，但不再功能性停播。
- 当前构建同时验证了 Inspector 的 duration/speed/gain 编辑与 undo、Timeline 右键菜单、无音频视频的 fail-visible 分离诊断、有音频视频同源分离且不自动静音/不生成 WAV，以及复用 Export Dialog 在 Webview 视口几何中心。Console 只有 VS Code benign `local-network-access` 与浏览器 AudioContext autoplay warning，无 Cut JavaScript/CSP/resource error。
- 本轮黑盒坐标自动化未稳定覆盖真实指针 trim 与从 VS Code Explorer 拖入；对应 pointer ownership/snapping/cancellation、drop parser/provider canonical path 已由行为与路径测试覆盖。P1 clipboard/multi-selection productivity 仍按 tasks 16.5/17.5 保持未完成，不作为本轮完成声明。

## Serialization, revision stability and media-independent preview correction (2026-07-23)

- 根因是 linked Video/Audio Clip 的 source range 只修改一侧，导致 reciprocal link 校验失败；`set-clip-duration`、`trim`、`set-playback-rate` 与 `relink-media` 现在原子更新互相链接的两个 Clip，而 mute/gain/fade 仍保持各 Clip 独立。`CutDocumentSession.apply` 在写入 history、revision 与 dirty state 前执行 OTIO serialization validation，因此非法 command 结果不能进入 VS Code backup/save 状态。
- Preview selection 不再要求当前位置必须存在 Video Clip。Extension 可只启动 PCM、也可发布无媒体流的 gap segment；Webview 在无 Video 时清空 canvas 并继续使用 timeline clock。并发的 pause/edit stop 通过 panel-scoped single-flight coordinator 合并，避免重复停止同一 Engine session。
- Timeline Overview 对每个 Clip 使用共同裁剪后的 `[start, end]` 范围；运行态三个结构条均保持在 2005px Overview 内，两个 Video Clip 分别位于 `0–1126.5px` 与 `1855.8–2005px`。Controller 在 Host revision 后复用未变化 Track projection，并仅在 source sampling 输入变化时失效缩略图/波形，移动 Clip 和添加 Track 不再清空所有派生表示。
- 基础设施审计确认 Cut 继续使用共享 i18n runtime、VS Code theme tokens、`@neko/ui`、共享 Logger 和 Extension ErrorHandler；新增 Overview label 与用户可见 cleanup/export 错误已接入这些入口。Host message 中仍有若干英文 diagnostic 字符串，后续若引入 typed diagnostic catalog 应统一迁移，但没有新增第二套 i18n/logger/error runtime。
- 自动验证通过：Domain `2 files / 24 tests`，Cut `15 files / 78 tests`，Webview `18 files / 173 tests`，Domain 与 Extension typecheck、Cut compile、Cut lint（仅一个既有 unsafe-regex warning）、strict OpenSpec 和 `git diff --check`。
- Extension Development Host 使用隔离的 `neko-test/.functional/cut-second.otio`：linked duration 编辑后 Video/Audio 同为 38 秒，`Cmd+S` 成功；撤销后磁盘恢复为 39.2 秒。重载后的 renderer log 未再出现 `Cannot backup` 或 `Cannot serialize`。把 Video 放到 5 秒后，在 0 秒播放只启动 Audio，transport 从 `00:00.00` 继续到 `00:02.08`，canvas 保持黑屏且无 missing-Video diagnostic。暂停后立即撤销不再产生重复 stop 通知。空项目添加/撤销 Audio Track 正常，Overview、Inspector 与 Timeline 未丢失。

## Retained multi-selection and clipboard productivity (2026-07-23)

- document-scoped Zustand presentation state 现保存稳定的多 Clip locator selection 与 locator-only clipboard，不保存或修改 OTIO/project snapshot。Controller 在 revision 更新后按显式 Track/Clip identity 恢复仍有效的选择。
- Timeline 恢复 modifier 多选、框选、批量移动、cut/copy/paste/duplicate/select-all、播放头跟随和多文件 drop。linked Clip 在删除/移动时只展开一次；批量右移从最右侧开始、左移从最左侧开始，避免相邻选中 Clip 互相阻挡。
- Extension Host 的 `cut:batch` 通过 `CutDocumentSession.applyBatch` 在内存中验证全部 command 和最终 OTIO serialization，成功时只提交一个 revision/undo 单元，任一 command 失败时不修改文档。paste/duplicate 在当前 document/session/revision 重新解析 locator，并由 Host 分配新 Clip/link identity；跨文档 clipboard 继续 fail-visible。
- 文件选择器和 Webview drop 的多个 URI 由 Host 串行进入同一个 workspace containment/import/link-media canonical path，避免并行 revision 冲突；drop parser 覆盖 VS Code `text/uri-list`、纯文本 URI 与浏览器 `FileList`。
- Extension Development Host 首次刷新到本轮 bundle 后，modifier 多选两个 Video Clip 成功；`Cmd+D` 一次新增两个 Clip，`Cmd+Z` 一次恢复三个 Clip，证明批量 duplicate 与单 undo 单元已命中。随后真实 `Cmd+C`/`Cmd+V` 暴露了 planner 的瞬态布局缺陷：旧实现先在源后复制再移动，临时插入会推动后续 Clip 并产生 overlap。
- paste 已改用 Core `clone-clip-at-time` command，直接在最终绝对时间克隆，不创建临时 Clip/Gap；linked Video/Audio 在同一 command 中获得 reciprocal 新 identity 和各自最终时间。回归测试证明连续克隆不会移动原 Clip，并保持 OTIO 可序列化。
- 自动验证通过：Cut Domain `2 files / 35 tests`、Cut Extension `18 files / 89 tests`、Cut Webview `20 files / 186 tests`、共享 UI `35 files / 150 tests`、Cut Extension/Domain typecheck、Cut Webview build、Cut compile、全仓 build `9/9`、`pnpm check`（1,413 modules / 4,966 dependencies）、`pnpm check:legacy-debt`、`pnpm check:unused`、strict OpenSpec 和 `git diff --check`。
- `pnpm test` 的 Cut 路径通过，但全仓仍被 `@neko-agent/extension` 中两个与 Cut 无关的 `agentStreamProcessor.test.ts` 资源投影断言阻塞：测试仍期待 `{ variant }`，当前生产调用为 `{ source, mimeTypeHint }`。本轮未修改该调用链。
- 修复完成并重新编译后，macOS 在第二次刷新前再次锁屏，无法在新 bundle 上复测 paste、cut、box-select、batch move、playhead follow 与 multi-file drop。因此 OpenSpec 20.2 与 20.7 暂不勾选；修复前的 target 只作为缺陷复现证据，不作为修复验收。

## Rapid gesture, overlap placement and Track-control correction (2026-07-23)

- Webview durable intents now pass through one FIFO controller queue. Each accepted Host revision releases the next queued mutation; there is no optimistic OTIO mutation, stale-revision retry or replacement of the document-scoped Zustand presentation store. Focused tests cover two rapid edits that start from one projected revision.
- Clip start/end handles remain visible and can restore previously trimmed source material within `available_range`. The document session retains its timeline canvas extent after shortening, so one Track edit does not collapse the ruler and disturb cross-Track alignment. Preview no longer renders a stage border or filename overlay, and the Timeline Overview has a wider readable viewport.
- `place-clip` now carries an explicit overlap policy. Pointer drops over an occupied Clip use `insert` and deterministically place before/after the anchor; exact Inspector start-time edits use `reject`. Extension Development Host pointer evidence moved the short first Clip over the second Clip, producing long-then-short order with no overlap diagnostic; one Undo restored the synthetic fixture.
- Track labels use shared media-kind, visibility, lock, mute and delete SVG icons. A red-capable component assertion reproduced the reported missing-button defect because the former Codicon spans contained no SVG; the canonical `@neko/ui/icons` path now exports font-independent `Eye`, `EyeOff`, `Lock` and `Unlock` icons. The five runtime Track labels each contained visibility and lock SVGs after reload.
- Per-Track media-add buttons are absent. The single add-media action remains in `TimelineControls`. Runtime Clip context menu text contained only Clip operations, while the Track context menu contained add media, rename, visibility, mute, lock, Agent and delete Track operations.
- Current automated results: shared types/icons `181 files / 1,457 tests`, Cut Webview `21 files / 194 tests`, Cut Extension `18 files / 89 tests`, Cut Domain `2 files / 37 tests`; Domain typecheck, Cut Extension/Webview compile, full `pnpm build` (`9/9`), `pnpm check`, `pnpm check:legacy-debt`, `pnpm check:unused`, strict OpenSpec, Webview target smoke and `git diff --check` passed.
- Full `pnpm test` remains blocked by the same two unrelated `@neko-agent/extension` assertions in `agentStreamProcessor.test.ts`: those tests expect the removed `{ variant }` request while production uses `{ source, mimeTypeHint }`. All affected Cut and shared-icon suites are green.
