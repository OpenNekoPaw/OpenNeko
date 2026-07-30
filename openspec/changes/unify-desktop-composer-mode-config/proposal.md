## Why

Desktop composer 当前只在 Agent 模式提供统一模型配置面板，而图片、视频、音频模式仍各自展示独立模型下拉框，形成两套模型配置入口和不一致的交互。模型 purpose binding 已由同一 Host catalog 与 tab render state 持有，现在应让所有模式复用一个创作配置面板，在同一展示容器内切换模型与参数，同时保持两类事实各自的状态 authority。

## What Changes

- 将 `Agent 模型配置` 扩展为模式无关的 `创作配置` 面板，统一承载模型与参数两类配置页面。
- Agent、图片、视频、音频模式都使用同一个配置入口；当前模式决定触发器摘要和默认打开的配置页签，但不限制用户切换其他模型类别。
- composer 底栏收敛为“模式 / 模型 / 参数”三个快捷入口：模式入口只切换当前 session mode，模型与参数入口打开同一个统一配置面板。
- 统一配置面板使用两级导航：一级为对话、图片、视频、音频内容类别，二级为模型、参数；底部模型/参数入口分别定位当前类别对应的二级页面。
- 图片、视频、音频模式移除重复的内联模型下拉框和常驻参数轨；统一面板的参数二级页继续编辑本次请求的画幅、分辨率、时长或音频类型。
- Agent 模式省略参数入口和参数二级页，不再从 Webview 注入“稳定/创意/发散”等语义预设；高级 LLM 原始参数继续由设置/配置 owner 管理。
- 图片、视频、音频的模型页明确分为“感知模型”和“生成模型”；感知模型继续绑定对应 `*.understand` purpose，不与生成模型或主对话模型混用。
- 保持精确 provider/model 单选、`auto` 理解模型和 `none` 生成模型语义，不新增模型池、自动 fallback 或第二套配置状态。
- 补充共享 Webview、Desktop Dock、键盘可访问性和运行中禁用行为验证。

## Capabilities

### New Capabilities

- `unified-composer-model-configuration`: 定义所有 composer 模式共享一个两级创作配置面板，并将模式专属请求参数与模型 purpose binding 的状态 authority 分离。

### Modified Capabilities

## Impact

- 影响 `packages/neko-agent/packages/webview` 的 InputArea、模式/模型/参数弹层、菜单状态、i18n、CSS 和 React 测试。
- Desktop 与 VS Code 继续复用 package-owned Agent Webview；不新增 Desktop IPC、Host message、模型目录或持久化契约。
- 直接媒体请求 payload、模型 purpose resolver 和 provider credential 行为保持不变；Webview Agent turn 不再注入 composer LLM preset。
