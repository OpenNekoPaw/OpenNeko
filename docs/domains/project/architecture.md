# Project 领域架构

## Authority

```text
neko/project.json
  -> stable Workspace/Project identity

neko/project-bindings/entity-character/<entity>.json
  -> exact Project + Entity + CharacterProject association fact

Chara / World scoped catalogs + Entity / Canvas / Cut references
  -> Project Content, target, dependency, usage and publication projections
```

`neko/project-composition.json` 不再是 authority 或 runtime input。Character/World membership 从精确
Project scope records 派生；CharacterVersion、WorldVersion、Asset revision、package resource 与
Media Library dependency 从当前 consumer 引用派生。Projection 不能写回 owner，也不能授权删除、发布、
读取或 fallback。

## 失败边界

- 缺失或无效 `neko/project.json` 是 Project identity diagnostic，不生成替代 identity。
- association 一条一文件独立解析；无效字节保留并只产生该 row diagnostic。
- Chara、World 或文档 owner 的单条无效记录只标记对应 group/row；有效 sibling 仍进入 Project Content。
- 完整性未知时，只阻止要求 dependency closure 完整的 publication/portable 操作，不阻止 Workspace、Files
  或无关领域。
- Desktop scene transition 在 Workspace 授权成功后提交；Project Content 构建失败留在其 Surface，不回滚
  Shell 导航。

## 同步与便携性

普通产品同步读取 `neko/project.json` 的精确 identity，传输同步事实、项目 owned files 与逻辑 locator；
根 `.neko`、隐藏/tool 目录、symbolic link、global connection、credential、物理 target 和外部媒体字节
不会进入同步清单。

便携打包重读固定 owner references 与 Character/World catalogs，要求完整 coverage，并把 dependency
fingerprint 纳入 stale precondition。当前 Media Library 字节按引用收集到确定的项目路径，只修改 staging
中的 owning documents；缺失版本、未组合的精确 Asset/package export owner、目标冲突、容量不足、内容变化
或取消均在 publish 前失败。staging 还会拒绝 machine-local field 和退休 locator，最终只通过一次 rename
发布。

## 离线转换

旧 composition、`neko/assets` link 和 linked-media locator 不由产品启动或普通 reader 解释。用户必须在
Desktop 关闭时，对绝对 Workspace 与全局 Media root 先执行只读 inspection；只有 `ready` 结果、原 inspection
fingerprint 与精确 Project confirmation 同时存在时，产品不可达工具才创建 sibling staging。原 Workspace
被保留为 timestamped backup，完整后验验证通过的 staging 才替换精确 target；备份永不成为 fallback authority。
