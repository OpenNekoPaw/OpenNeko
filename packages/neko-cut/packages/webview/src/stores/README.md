# stores/

Zustand 状态管理，管理编辑器的全局状态。所有编辑操作通过 EditOperation 系统统一管理，支持操作式 undo/redo 和增量同步到 Extension Host。

## 结构

```
stores/
├── editor-store.ts              # 主 Store 定义（三阶段初始化）
├── utils/
│   ├── operation-helpers.ts     # createMeta 等操作辅助
│   └── extension-sync.ts       # EditOperation → Extension Host 同步
└── slices/                      # 状态切片
    ├── projectSlice.ts          # 项目状态
    ├── playbackSlice.ts         # 播放状态
    ├── selectionSlice.ts        # 选择状态
    ├── uiStateSlice.ts          # UI 状态
    ├── operationHistorySlice.ts # 操作式撤销重做
    ├── dispatchSlice.ts         # 操作分发中心
    ├── elementOpsSlice.ts       # 元素操作
    ├── trackOpsSlice.ts         # 轨道操作
    ├── elementSplitSlice.ts     # 元素分割
    ├── keyframeSlice.ts         # 关键帧操作
    ├── clipboardSlice.ts        # 剪贴板
    ├── shapeOpsSlice.ts         # 形状操作
    └── aiActionSlice.ts         # AI 动作
```

## 状态切片

| Slice | 用途 |
|-------|------|
| `projectSlice` | 项目数据（轨道、元素） |
| `playbackSlice` | 播放状态（时间、播放中） |
| `selectionSlice` | 选中的元素/轨道 |
| `uiStateSlice` | UI 状态（缩放、滚动） |
| `operationHistorySlice` | 操作式 undo/redo 栈（上限 200） |
| `dispatchSlice` | EditOperation 分发中心 |
| `elementOpsSlice` | 元素 CRUD 操作 |
| `trackOpsSlice` | 轨道 CRUD 操作 |
| `elementSplitSlice` | 元素分割（splitAt / splitKeepLeft / splitKeepRight） |
| `keyframeSlice` | 关键帧操作（transform / effect / mask） |
| `clipboardSlice` | 复制/粘贴（含碰撞检测） |
| `shapeOpsSlice` | 形状图层操作（几何/样式/排序） |
| `aiActionSlice` | AI 辅助编辑动作 |

## EditOperation 流程

所有编辑操作通过统一的 EditOperation 管线：

```
User Action → Slice Action → dispatch(EditOperation)
                                 │
                                 ├─ applyOperation(project, op) → 新 ProjectData
                                 ├─ pushOperation(op) → undo 栈
                                 └─ syncOperationToExtension(op) → postMessage → Extension Host
```

**核心模块职责**：
- `dispatchSlice` — 接收 EditOperation，调用 `applyOperation()` 更新状态，再调 `pushOperation()` 入栈
- `operationHistorySlice` — 管理 undo/redo 栈，通过 `invertOperation()` 生成逆操作
- `extension-sync` — 每次操作（push/undo/redo）后通过 `postMessage` 发送到 Extension Host

**高频操作例外**：`updateElement()`（拖拽、调整大小）直接 `set()` 更新状态，不经过 dispatch/history，避免性能瓶颈。拖拽结束后由调用方手动构建 `element.update` 操作推入历史栈。

## 三阶段初始化

`editor-store.ts` 按依赖顺序分三阶段创建 slice：

```
Phase 1（独立）: projectSlice, selectionSlice, playbackSlice, uiStateSlice
Phase 2（历史）: operationHistorySlice, dispatchSlice, keyframeSlice
Phase 3（依赖）: trackOpsSlice, elementOpsSlice, elementSplitSlice,
                 clipboardSlice, shapeOpsSlice, aiActionSlice
```

Phase 3 的 slice 依赖 Phase 2 的 `dispatch` 和 `pushOperation`。

## 依赖

```
→ @neko/shared         # 项目类型 + EditOperation (applyOperation, invertOperation)
→ @neko/shared/vscode  # postMessage (Extension 通信)
← hooks/              # Hooks 使用
← components/         # 组件使用
```

## 使用示例

```typescript
import { useEditorStore } from './stores/editor-store';

// 读取状态
const currentTime = useEditorStore(state => state.currentTime);

// 调用 action（通过 EditOperation 管线）
const { addElement, opUndo, opRedo } = useEditorStore();
```
