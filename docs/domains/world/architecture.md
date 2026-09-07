# World 领域架构

## Authority

```text
Project Workspace
  -> local editable WorldProject / WorldVersion
  -> exact read-only GlobalWorld + WorldVersion references

Global World catalog
  -> GlobalWorld
  -> immutable WorldVersion history

Runtime catalog
  -> exact WorldVersion -> WorldRun -> WorldSave/branch
```

World 拥有定义、版本、同步、运行资格和运行事实；Project 只拥有 membership 和精确引用；Agent 拥有
Conversation/turn；Desktop 只拥有 sender/window/path 授权和可见 Surface 组合。

## Canonical Commands

- `create local`：在一个精确 Project Workspace transaction 中首次提交 WorldProject 和 membership。
- `Agent query/fill draft`：只在绑定同一精确 Project 和既有 fresh WorldProject 时查询或填充草稿；不创建全局对象或发布版本。
- `create global`：由 World global catalog service 直接原子提交 GlobalWorld 与首个不可变版本；不是 Project-bound Agent Tool operation。
- `synchronize to global`：创建 GlobalWorld 首版，或在显式 stale-base 选择后追加不可变版本。
- `add/update/remove global reference`：只改变精确 Project 引用，不复制 World facts。
- `copy global to local`：从一个精确全局版本创建新的工作区世界 identity。
- `import ZIP`：验证一个单版本 archive 后直接提交全局目录。
- `export ZIP`：导出一个用户选择的精确 WorldVersion。

同一意图不得存在 install、adapt、recover、publication-plan、preview/commit import 或 active/recent fallback
成功路径。

## Failure Isolation

- 非法 archive 在全局 commit 前失败，不改变 sibling GlobalWorld、Project、Run 或 Save。
- stale synchronization 必须要求用户选择基于当前版本或另存为新对象，不自动 merge。
- 一条无效全局版本或 Project 引用只禁用依赖该记录的操作，其他世界和工作区保持可用。
- UI 卸载不得停止受保护 World runtime，也不得保留隐藏 React Root。

## Runtime Boundary

World runtime 绑定一个精确全局 WorldVersion；Run/Save 不读取工作区草稿、ZIP、current/latest 或
Project active selection。全局新增版本不会改变已有 Run/Save；用户显式更新时只修改确认的引用。

当前 Desktop consumer 只实现确定性 Foundation action/fact Workbench，不等同于完整 World Experience。
Story、Gameplay、Agent Play、实时生成、外部引擎或多 Character participant 只有在各自存在真实 producer、
consumer 和精确 action contract 后才能进入运行边界，不得由 prompt、fixture 或 UI 占位推断为可用能力。
