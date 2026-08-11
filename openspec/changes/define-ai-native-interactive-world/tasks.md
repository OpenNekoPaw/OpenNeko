## 0. World Foundation experimental slice

- [x] 0.1 定义单一 package-owned World Foundation host contract 与 strict codec，覆盖 snapshot、Project/Version authoring、确定性 preview Run、事实事件、Save branch 和 committed replay，不声明 WorldExperience。
- [x] 0.2 在 `@neko/world` 实现 Foundation query/command application service 和唯一确定性事实 action handler；所有命令携带精确 project/version/run/save/branch/revision identity，非法记录或 stale revision 必须 fail-local。
- [x] 0.3 在 `@neko/world-webview` 实现 World Library、Foundation Studio 和基础预览，复用共享设计 token，并明确展示完整 Experience、Story、Gameplay、游戏引擎和世界模型仍未启用。
- [x] 0.4 在 Desktop Main/preload/renderer 完成隔离原型组合、sender-bound typed IPC 和 scene fixture；Desktop 不解释 World 业务命令，不建立第二事实来源或保留隐藏 Root。
- [x] 0.5 添加 contract/application/Webview/Desktop delegation 测试，运行 focused typecheck/test、严格 OpenSpec、质量门禁、构建和隔离 Electron UI 验收，并记录未覆盖的完整 Experience 风险。

## 0A. Transformation experimental slice

- [x] 0A.1 修订 proposal/design/spec，删除所有 World 强制消费期 AI/Web/引擎/World Model 的假设，定义至少一个 Interaction Surface 与作品级 required/optional capability requirements。
- [x] 0A.2 在 `@neko/world` 定义 owner-qualified authoring/transformation candidate、semantic diff、capability requirement/resolution/gap 和 strict codec；不创建通用跨 owner 可写 document 或任意代码执行 contract。
- [x] 0A.3 实现 deterministic capability resolver 与 World transformation planning service，精确隔离 missing/stale/unauthorized candidate。
- [x] 0A.4 将 Foundation fact set/delete 接入 transformation state plan，证明仍只命中 canonical `WorldRuntimeService` handler/event/state 链。
- [x] 0A.5 在隔离 World Studio fixture 增加 Sources/Candidates/Diff/Capability Diagnostics 投影，并保持完整 Experience unavailable。
- [x] 0A.6 添加 contract/application/Webview/Desktop tests 与质量门禁；未存在真实 provider path 的行为只记录为 Evaluation 计划。

## 0B. P0 product gate and change split

- [x] 0B.1 明确 Foundation/transformation 是隔离实验原型，不以实现、fixture 或截图替代路线图所需的真实用户晋级证据。
- [x] 0B.2 让生产 Host 对 `open-world-management` 返回 owner-qualified unavailable，保持当前 scene 且不挂载 World Root。
- [x] 0B.3 将持久化 `world-management` presentation 局部重置为 fresh Agent Entry，产生 `desktop-presentation-reset` diagnostic，并证明 World durable records 和后台 runtime 不受影响。
- [x] 0B.4 更新 Host/Desktop producer-consumer tests，poison World Root 成功路径，并在标准与小窗口真实 Electron 路径验证明确不可用反馈。
  - Evidence: the visible isolated Electron product path retained one exact Agent Entry scene, mounted no World Root and displayed the complete unavailable diagnostic at 1440 x 960 and 900 x 650. Direct screenshot review found no clipping, overlap or horizontal overflow.
- [x] 0B.5 创建五个独立 follow-up OpenSpec changes，分别承接 topology/contracts、deterministic runtime、Desktop interaction、Agent/realtime qualification、Gameplay/Agent Play；当前 change 不再保留其实施任务。
- [x] 0B.6 运行 `pnpm check:openspec`、focused tests/typechecks、application-boundary/no-internal-versioning/legacy-debt/test-orchestration gates，并记录 UI evidence 与剩余风险。
  - All required deterministic gates passed. `pnpm check:unused` remains non-blocking on the existing repository baseline of 3 unused files, 154 unused exports and 3 configuration hints; this change introduces none of those findings.

## Follow-up changes

- `define-world-topology-and-data-contracts`
- `build-deterministic-world-experience-runtime`
- `add-world-interaction-surface-and-desktop-loop`
- `qualify-world-agent-and-realtime-capabilities`
- `add-world-gameplay-and-agent-play-composition`
