# tools/

工具执行模块，处理来自 Extension 的 AI 工具调用。

> 说明：从 “Timeline 工具下沉到 Extension（VSCode Undo 模式）” 起，AI/HTTP 调用的 timeline **数据类工具**默认在 Extension 侧执行并写回 `.nkv`（形成 VSCode Undo/Redo 步骤）。本目录保留为 **兼容层**：UI 交互仍可直接操作 store，且部分 UI-only/渲染类工具仍可能通过 Webview 执行。

## 职责

接收和执行 Extension 发来的 AI 工具调用请求，主要处理仍需 Webview 的工具（如渲染/导出）。

## 结构

```
tools/
├── index.ts              # 模块导出
├── types.ts              # 类型定义
├── timeline-executor.ts  # 时间线执行器
└── handlers/             # 工具处理器
    ├── export-handlers.ts
    └── render-handlers.ts
```

## 接口

| 导出                 | 类型 | 用途         |
| -------------------- | ---- | ------------ |
| `initToolExecutor()` | 函数 | 初始化执行器 |
| `getEditorStore()`   | 函数 | 获取 Store   |
| `ToolHandler`        | 类型 | 工具处理器   |
| `ToolExecuteRequest` | 类型 | 执行请求     |
| `ToolExecuteResult`  | 类型 | 执行结果     |

## 依赖

```
→ stores/         # 状态操作
→ hooks/          # VSCode 消息
← main.tsx        # 初始化
```

## 工作流程

```
Extension (AI 工具调用)
    ↓ postMessage
Webview.onMessage()
    ↓
ToolExecutor.execute()
    ↓
ToolHandler 执行
    ↓
Store 状态更新
    ↓
返回结果给 Extension
```
