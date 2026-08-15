# Project 领域架构

## Authority

```text
neko/project.json
  -> stable Workspace/Project identity

neko/project-bindings/entity-character/<entity>.json
  -> exact Project + Entity + CharacterProject association fact

Chara / World scoped catalogs + Entity / Canvas / Cut references
  -> Project Content and exact owner-qualified reference projections
```

Project 只拥有 membership 和导航元数据，不复制 Character/World 事实。工作区可以同时包含 Content、
本地可编辑 Character/World，以及只读的全局 CharacterVersion/WorldVersion 精确引用。全局目录更新不会
改写已有 Project 引用；用户必须显式选择新版本。Projection 不能写回 owner，也不能按名称、current、
latest 或 active fallback。

## 失败边界

- 缺失或无效 `neko/project.json` 是 Project identity diagnostic，不生成替代 identity。
- association 一条一文件独立解析；无效字节保留并只产生该 row diagnostic。
- Chara、World 或文档 owner 的单条无效记录只标记对应 group/row；有效 sibling 仍进入 Project Content。
- 完整性未知时，只阻止依赖该条记录的操作，不阻止 Workspace、Files 或无关领域。
- Desktop scene transition 在 Workspace 授权成功后提交；Project Content 构建失败留在其 Surface，不回滚
  Shell 导航。

## Workspace 展示

Desktop 在 Workspace 右侧组合 Project Browser 与 package-owned Workspace Root。列表同时展示 Content、
本地角色/世界和全局精确引用，并标注“可编辑”或“只读”。选择全局引用只加入当前 Workspace，不导航
离开；复制到本地后才可编辑。Project Content 的错误只影响当前行，其他 owner 和 Resources 仍可用。

## 同步与便携性

普通同步只处理 Project 自有事实和精确引用。角色/世界 ZIP 由各自 owner 负责：一个包只含一个不可变
领域版本和必要资源，导入直接提交全局目录；不创建安装记录、Project membership、适配副本或 publication
plan。归档路径、链接逃逸、重复条目、容量、清单和摘要校验失败时，只拒绝当前导入。

## 本机重新初始化

项目中的 `media-library` locator 是权威、可同步的外部媒体身份；`.neko/media-libraries` binding 与
`neko/assets/<libraryName>` managed link 都是本机可重建状态。删除 `.neko` 后项目仍可打开，受影响引用
显示未关联；只有项目事实需要同名库、现存直接链接精确匹配唯一可用全局 connection 且没有冲突时，才可
确定性重建 binding。零个或多个匹配、普通目录占位、链接目标不一致都必须局部显示冲突并要求显式关联，
不得把 Workspace 投影写回项目事实、按名称猜测 target 或读取全局目录作为替代事实。
