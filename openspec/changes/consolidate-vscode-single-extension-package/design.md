## Context

OpenNeko 当前已经对外发布一个平台 VSIX，但内部仍沿用“多个扩展被嵌入一个扩展”的模型：

1. `scripts/package-openneko-platform.mjs` 先分别构建功能 VSIX，再解包到最终 staging tree。
2. `apps/neko-vscode` 动态加载各功能 `dist/extension.js`，读取子 manifest，并为其创建 scoped `ExtensionContext`。
3. `EmbeddedFeatureRegistry` 模拟 `vscode.Extension` 的查找与激活语义。
4. 一个宽泛的 AI/Host services 对象被传给多个功能，功能依赖和生命周期不够显式。
5. pnpm 同时发现 `packages/*`、`packages/*/packages/*` 和 feature-local `test-utils`，物理层级与运行时边界混在一起。

这些边界不能提供进程级隔离：所有 JavaScript 和 N-API 仍运行在同一 Extension Host。相反，它们让构建、状态、资源路径和错误传播更复杂。与此同时，Desktop/TUI 已开始复用 Agent、Canvas 等能力，因此不能把 host-neutral 领域代码和 React UI 都合并进 VS Code 应用。

本设计把“交付单元”和“复用单元”分开：

- `apps/neko-vscode` 是唯一 VS Code 交付与宿主组合单元。
- `packages/*` 是单层、host-neutral 或跨应用复用单元。
- `apps/neko-vscode/src/features/*` 是 VS Code 专属功能适配模块，不是 workspace package。
- Extension Host、Webview、Node/native 和 Engine 仍是必须保留的真实运行边界。

## Goals / Non-Goals

**Goals:**

- 形成一个 manifest、一个 extension entry、一个 `ExtensionContext`、一个平台 VSIX 的真实单扩展架构。
- 删除二级 workspace、内部功能 VSIX、embedded extension registry 和 scoped context 模拟层。
- 让跨功能依赖在 composition root 中显式可见，并以最小 typed ports 注入。
- 保持 Desktop/TUI 对 domain/runtime/UI 的复用，且不依赖 VS Code 应用。
- 将普通功能异常限制在失败功能及其显式依赖者，保持独立功能可用。
- 保留离线 native/runtime closure、Webview 沙箱、用户状态和 fail-visible 约束。

**Non-Goals:**

- 把整个仓库合并成一个 package，或把全部功能编译成一个 JavaScript bundle。
- 取消 `@neko/host`、domain package、UI package、Rust Engine 或 Webview message contract。
- 保留内部功能扩展 ID 的独立安装、激活或 marketplace discovery 能力。
- 为未知宿主设计统一万能 Host API。
- 在本次结构迁移中引入新的 Engine IPC 协议；原生崩溃、Extension Host 退出和 event-loop 卡死仍属于进程级失败。
- 同时重写各领域内部业务模型或 UI。

## Decisions

### 1. 单扩展应用，内部保持模块化

目标结构如下：

```text
apps/
  neko-vscode/
    package.json                 # 唯一 VS Code manifest
    src/
      extension.ts               # 唯一 activate/deactivate
      kernel/                    # activation plan, diagnostics, disposal
      features/
        tools/
        preview/
        assets/
        cut/
        canvas/
        agent/                   # VS Code-only adapters and registrations
      adapters/                  # shared VS Code implementations of narrow ports
    webviews/ or generated/      # app-owned browser entry composition

packages/
  neko-host/                     # host-neutral contracts
  neko-agent/                    # reusable domain/runtime
  neko-agent-ui/                 # only if reused by more than one app
  neko-canvas-domain/
  neko-canvas-ui/
  neko-cut-domain/
  neko-cut-ui/
  ...                            # every workspace is one physical level
```

目录名是目标职责示意，不要求一次性重命名所有 npm scope。迁移时先按真实消费者审计每个现有二级包：

- 两个以上应用或 runtime 使用的 domain/runtime/UI 能力成为顶层 package。
- 与 owning domain 同生命周期、同依赖层且没有独立消费者的薄 contract/types 包合并为 package subpath export。
- 仅被 VS Code 使用的 extension、command、view、panel、custom editor 和 host adapter 移入 `apps/neko-vscode/src/features/*`。
- feature-local `test-utils` 改为 owning package 的非 workspace 测试模块，或在有多个真实消费者时成为顶层测试工具包。

初始迁移方向：

| 当前形态 | 目标形态 |
| --- | --- |
| `packages/*/packages/extension` | `apps/neko-vscode/src/features/<feature>` |
| 顶层 `neko-*` extension manifest/entry | 删除；贡献归入 `apps/neko-vscode/package.json` |
| 可复用 `domain` / `agent` / `ai-sdk` / `platform` | 顶层 `packages/*`，必要时保持现有 npm identity |
| 多应用复用的 Webview/UI | 顶层 `packages/*-ui` |
| 单一功能内部 contracts/types/test-utils | 合并为 owning package subpath 或普通源码目录 |

选择单层 package graph 而不是“所有代码一个 package”，因为 pnpm package 边界仍能阻止 Desktop/TUI 依赖 VS Code；选择 app-internal VS Code feature modules，是因为它们没有独立发布、版本、进程或宿主生命周期。

### 2. Host Kernel 只负责组合和生命周期

`apps/neko-vscode/src/kernel` 提供以下最小职责：

- 校验静态 feature plan 的 ID、依赖 DAG、criticality 和贡献映射。
- 维护 `inactive → activating → active | unavailable → disposing → disposed` 状态。
- 为每个 feature 建立独立 `AbortController`、`DisposableStore`、logger scope 和 diagnostic scope。
- 按依赖顺序激活，按反向顺序释放。
- 将失败投影为 VS Code diagnostic/status/context，而不接管领域业务。

推荐契约形态：

```ts
interface FeatureModule<TDependencies, TCapability = void> {
  readonly id: FeatureId;
  readonly criticality: "kernel" | "optional";
  readonly dependencies: readonly FeatureId[];
  activate(
    context: FeatureActivationContext,
    dependencies: TDependencies,
  ): Promise<FeatureActivation<TCapability>>;
}

interface FeatureActivation<TCapability> {
  readonly capability: TCapability;
  readonly disposables: readonly vscode.Disposable[];
}
```

这里的 `FeatureActivationContext` 只包含真实共享基础能力，例如根 `ExtensionContext` 的只读资源定位器、feature-owned storage namespace、logger、diagnostic reporter 和 cancellation signal。它不是包含 Agent、Generation、Canvas、Assets 等业务 API 的 services bag。

应用 composition root 显式创建依赖：

```text
engineCapability ─┬─> previewFeature
                  ├─> toolsFeature
                  └─> agentFeature
assetsCapability ─┬─> canvasFeature
                  └─> agentFeature
```

feature 不调用全局 `getCapability(id)`，也不 import sibling adapter。composition root 通过类型化构造函数或 activation closure 把所需 capability 直接传入。静态 descriptor 只服务于 DAG 校验、状态和释放，不成为运行时 service locator。

备选方案是继续维护 embedded registry，或建立更通用的 UniversalHost/IoC container。前者保留了已无真实意义的扩展发现语义；后者隐藏依赖并扩大耦合面，因此均不采用。

### 3. `@neko/host` 保留，但只承载 host-neutral 稳定契约

`@neko/host` 当前规模较小且已经有禁止 VS Code/Electron/Node/React/domain 反向依赖的检查，应继续保留。它适合承载多个宿主共同实现的最小 primitive，例如文件选择、持久 KV、外部打开、生命周期信号等。

功能专属依赖遵循 consumer-owned port：

- Agent 需要 workspace/document 能力，由 Agent domain 定义窄 port。
- Canvas 需要 Assets selection/capability，由 Canvas 或中立 contract owner 定义。
- VS Code adapter 在 app 内实现这些 ports。
- Desktop adapter 在 Desktop app 内独立实现相同 ports。

只有在两个以上 feature 的职责、生命周期、错误模型和变化方向都一致时，才将适配实现提取为 `apps/neko-vscode/src/adapters`；仅代码形似不构成共享理由。

这避免 Host 之间直接耦合：宿主不会彼此调用，feature 也不认识宿主实现，只依赖自己的 port。跨 feature 依赖则由 composition root 明确连线。

### 4. 失败隔离以资源所有权和显式依赖为单位

单扩展不会天然导致“任一功能异常，全部崩溃”，也不会天然提供隔离。隔离策略如下：

| 失败类型 | 处理 |
| --- | --- |
| manifest/implementation 不一致、依赖环、重复 ID、缺失必需 runtime、无法安全迁移状态 | 内核失败；回滚已激活资源，扩展 activation reject |
| optional feature 抛出可捕获异常 | 清理部分资源，标记 feature unavailable |
| optional feature 的依赖失败 | 该 feature 不激活，记录 causal chain |
| independent feature | 继续运行 |
| 用户调用 unavailable feature 的贡献入口 | 显示带 feature ID 和根因的 unavailable diagnostic，不伪装成功 |
| native segfault、Extension Host OOM/退出、event loop 永久阻塞 | 无法在同进程恢复；由 VS Code 重启 Extension Host |

每个 feature activation 必须是事务式的：资源一创建即进入该 feature 的 `DisposableStore`；成功后才发布 capability。失败不得留下已注册命令、监听器、Webview provider 或后台任务。

是否把 Rust Engine 移入独立进程是另一项可靠性设计。若后续需要对 native crash 提供真正故障隔离，应通过独立 OpenSpec 定义进程 owner、IPC、取消、重启和数据一致性，而不是用更多 package/registry 层伪装隔离。

### 5. 直接组合 manifest、bundle 和资源

新的构建链：

```text
top-level reusable packages
        ↓
VS Code feature modules + Webview entries
        ↓
application Extension Host/Webview builds
        ↓
target-native Engine/Sharp/FFmpeg closure staging
        ↓
manifest/resource/closure validation
        ↓
one platform VSIX
```

`apps/neko-vscode/package.json` 是贡献声明的 canonical source。若为了维护性拆分 JSON fragments，它们必须位于 app 内、具有 schema、由确定性脚本合成，并在冲突时失败；不得再从独立 extension manifests 推导产品 manifest。

packager 直接复制：

- `dist/extension.js` 及显式 external Node modules；
- 各 Webview 构建产物；
- localization、icons、media 和 schema；
- 当前 target 的 Engine/FFmpeg/Sharp 等 native closure；
- versioned runtime closure manifest。

删除“临时 feature VSIX → unzip → `dist/features/*` → dynamic require”链路。检查器必须确认最终包不存在内部 extension manifests、独立 activation entries、错误 target binary 或 checkout 外部解析。

### 6. 一个真实 `ExtensionContext`，逻辑 namespace 代替模拟 context

VS Code 只提供应用根 `ExtensionContext`。内部 feature 使用明确的小型资源服务：

- `FeatureResources`: `extensionUri` 下的 feature resource root、`asWebviewUri` 输入和存在性校验。
- `FeatureState`: 基于稳定 feature ID 的 memento key namespace。
- `FeatureStorage`: 基于稳定 feature ID 的 workspace/global storage child URI。
- `FeatureSecrets`: 显式保留旧 secret key identity，或执行版本化迁移。
- `DisposableStore`: feature-owned disposable collection。

这些对象不伪装成完整 `ExtensionContext`，不能访问或覆写其他 feature 的 namespace。缺失资源或 identity mismatch 直接报错。

### 7. 用户状态采用版本化、幂等迁移

实施前生成 state inventory，覆盖当前 scoped context 对以下对象产生的所有 identity：

- `workspaceState` / `globalState` key；
- `secrets` key；
- `storageUri` / `globalStorageUri` 子路径；
- cache、preset、history 和 provider credential metadata；
- 设置项与 workspace 项目文件。

每项必须选择：

1. **原 identity 复用**：新 `FeatureState` 继续生成完全相同的 key/path；
2. **显式迁移**：copy/rename 到新 identity，校验后记录 migration version；
3. **可重建缓存**：保留源数据直到新缓存成功生成，再标记旧缓存可清理。

迁移是幂等且可重试的；version marker 最后提交。secret 不输出日志，项目文件和设置不自动删除。若存在冲突或部分失败，affected owner fail-closed，并给出恢复诊断。

### 8. 活跃 OpenSpec 以本变更为后继设计

`finalize-platform-packaging-and-removal` 中“一种公开 VSIX”的交付目标继续有效，但以下实现决策被本变更替代：

- feature VSIX 作为 build-only payload；
- scoped `ExtensionContext`；
- embedded feature registry；
- internal marketplace-style feature API resolution。

`close-embedded-runtime-dependencies` 中 target-exact native/runtime closure 与 isolated host verification 继续有效，但 payload root 改为单应用 staging tree 内的 feature resource namespace。实施前应先更新或关闭冲突任务，不能让两种 packaging/activation path 同时返回成功。

## Five-Layer Analysis

- **职责：** app 拥有 VS Code 组合、贡献和生命周期；domain/runtime/UI 包拥有可复用行为；feature module 拥有 VS Code 适配与资源；Engine 拥有计算；Webview 拥有浏览器 UI。
- **依赖：** `apps → feature modules → reusable packages → @neko/host/L0`；Webview 只依赖 L0/L2；package 不反向依赖 app；feature adapter 不横向 import sibling adapter。
- **接口：** 使用 feature-local typed ports、显式 activation result、稳定 feature ID/resource/state namespace；删除模拟 `vscode.Extension` 和万能 services bag。
- **扩展：** 新 feature 需要 app-owned contribution fragment、feature module、显式 dependency wiring、resource declaration 和测试；不需要新增 workspace 或 VSIX。
- **测试：** 静态边界验证拓扑和 imports；kernel tests 验证 DAG、rollback、failure containment 和 reverse disposal；packaging tests 验证 closure；Extension Development Host 验证真实贡献、Webview 和 Engine。

## Risks / Trade-offs

- **[单 app manifest 变大]** → 允许 app 内 schema-validated fragments，但最终 manifest 只有一个 canonical generator 和 collision check。
- **[顶层 packages 数量暂时较多]** → 首次迁移优先消除物理嵌套和扩展包装；仅对无独立消费者的薄包进行证据驱动合并，不以少文件数替代清晰边界。
- **[feature module 互相 import 导致 app 内耦合]** → architecture test 禁止 sibling adapter imports，composition root 是唯一连线位置。
- **[Host Kernel 演化成 service locator]** → context 白名单化，业务 capability 只能通过 typed dependency 参数传入。
- **[可选 feature 失败后贡献仍可见]** → descriptor 映射贡献入口；kernel 设置 availability context 并为不可隐藏入口提供明确 unavailable handler。
- **[一个 ExtensionContext 引发状态碰撞]** → 稳定 feature ID namespace、state inventory 和迁移 path assertion。
- **[直接 packaging 遗漏隐式资源]** → build output manifest 与最终 archive closure test，禁止 checkout/root `node_modules` 掩盖缺失文件。
- **[JavaScript 隔离被误认为进程隔离]** → 文档和测试明确恢复边界；native/process crash 不做虚假 recovery 承诺。
- **[与活跃单 VSIX 变更冲突]** → 实施前更新其剩余 tasks/spec 指向本 canonical path，poison 旧 assembler/registry。

## Migration Plan

1. 记录当前 workspace、extension entry、manifest contribution、跨 feature API、资源、runtime closure 和 state identity inventory；建立禁止新增嵌套 workspace/embedded path 的测试。
2. 定义 Host Kernel、feature descriptor、activation context、typed ports、failure policy 和 state migration contract，并用测试锁定 DAG、rollback 和 disposal。
3. 将可复用二级 workspace 移到顶层或合并进 owning package；同步所有 imports、tsconfig、Turbo、Vitest 和 package groups，一次性删除旧 manifest/exports。
4. 按依赖顺序把 VS Code-only extension adapters 迁入 `apps/neko-vscode/src/features/*`；应用 root 显式注入 capability，禁止 global registry lookup。
5. 将贡献清单和资源 ownership 迁到 app；实现 direct staging packager 和 closure validator。
6. 执行幂等状态迁移；在 synthetic fixture 上验证成功、冲突、中断和 retry，确认源数据在失败时保留。
7. 删除/poison embedded registry、scoped context、dynamic feature loader、temporary VSIX、internal extension manifest 和 legacy tests；运行 legacy-debt/unused checks。
8. 执行全量 build/test/check、平台包检查和隔离 Extension Development Host 场景；更新架构、开发和发布文档。

迁移过程不保留新旧双激活或双打包路径。每个边界切换应在同一任务中迁移全部调用者并使旧路径 fail-visible。回滚仅在未发布阶段通过恢复前一提交完成；状态迁移必须可重试，不能依赖代码回滚删除用户数据。

## Open Questions

None. 具体 package 是否合并由迁移 inventory 的真实消费者和依赖层级决定，但“无二级 workspace、无内部 extension package、一个 VS Code composition root”是固定约束。
