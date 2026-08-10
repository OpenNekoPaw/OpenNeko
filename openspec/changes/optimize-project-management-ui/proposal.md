## Why

“所有项目”目前把普通单击解释为页面内多选，并在内容上方插入批量工具条；用户还需要双击才能进入项目。这个交互让项目目录更像批处理表格而不是导航入口，也会造成明显的纵向跳动和“选择后弹出一栏”的干扰。

## What Changes

- 将可用项目卡片的普通单击改为直接打开对应 Workspace，不再创建页面内选择状态或插入批量工具条。
- **BREAKING** 移除项目目录的多选、范围选择、全选和批量移除展示路径；项目管理继续通过每个精确项目自身的操作完成。
- 将项目目录默认展示从列表改为网格，同时保留用户显式切换到列表的能力。
- 保持“移除项目登记”和“删除该项目的 Workspace 会话”两种独立操作及确认语义；二者都不删除项目目录、文件、媒体或生成产物。
- 保持失效项目可见、不可打开，并允许用户通过精确项目操作移除登记；删除会话仅在存在精确 Workspace-owned 会话时可用。

## Capabilities

### New Capabilities

- `project-catalog-direct-navigation`: 定义项目目录的单击打开、默认网格和稳定卡片操作行为。

### Modified Capabilities

- `project-catalog-batch-management`: 移除 Renderer 多选与批量工具条要求，保留 Host 批量 contract 作为精确单项目调用的 canonical contract，并保持项目登记、会话和文件生命周期分离。

## Impact

- `apps/neko-desktop/src/renderer`（Desktop 产品 Shell presentation owner）：`DesktopProjectCatalogSurface`、样式、i18n consumer 与交互测试切换为直接导航和默认网格；该代码保留在 `apps/*`，因为它只决定当前 Window 的可见 scene 交互与布局，不决定项目或会话业务事实。
- `@neko/host` 继续拥有项目登记移除、精确 Workspace 会话解析和 Host application service；`@neko/agent-runtime` 继续拥有 Conversation 删除生命周期。现有 public contract、Main/preload IPC producer/consumer 和 authoritative data source 均不变。
- 被替代路径是 Renderer-local 的 selection state、modifier/range/select-all 逻辑、batch toolbar 和双击打开；不新增替代 handler、fallback、feature flag 或持久 presentation state。
- 用户数据语义不变：移除项目保留会话和项目文件；删除项目会话保留项目登记和项目文件。
