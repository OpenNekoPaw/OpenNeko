# Neko Assets

> 资产管理：版本控制 (Git/LFS)、云端同步、CI/CD 自动渲染

## Context Summary

- 项目：OpenNeko - VSCode 创意工作套件
- 架构：Extension Host + 子包 `@neko/asset`（素材库核心）

## Quick Reference

- **职责**：媒体资产的 Git/LFS 版本控制、多云同步、CI/CD 自动渲染触发
- **入口**：`src/extension.ts`（单包结构）
- **子包**：`packages/asset`（`@neko/asset` 素材库核心逻辑）
- **依赖**：`@neko/asset`、`@neko/shared`
- **显式素材入库**：`AssetFileImportService` 是工作区文件（包括 `neko/generated/` 输出）进入 AssetLibrary 的 canonical adapter。Canvas 投影不要求 Asset 身份，也不选择资产物理路径或直接写 `library.json`。

## Architecture

```
用户操作（保存/提交/推送）
  │
  ▼
Extension Host
  ├── Git LFS           → 大文件版本追踪（视频/图片/音频）
  ├── 云同步服务        → GitHub / GitLab / S3 / rclone
  ├── 导入分类器       → RuleClassifier（确定性文件名/路径规则）
  ├── MediaLibrary      → 文件名/树投影 + FileSystemWatcher
  ├── SemanticSource    → 统一文本 source catalog、SQLite projection 与 reconciliation
  └── CI/CD 触发        → 提交后自动渲染
        │
        └── GitHub Actions / GitLab CI
              └── neko-cli render project.nkv -o output.mp4
```

### 素材分类

自动导入分类只使用 `RuleClassifier`，不隐式借用 Agent 主模型，也不在失败时从模型调用降级到另一条成功路径。需要模型视觉理解时，由 Agent 的 `image.understand` 显式 purpose Tool 读取稳定素材引用并返回结构化证据。

### 媒体库增量索引

`MediaLibraryTreeProvider` 对展开过的目录建立内存缓存，并注册 `FileSystemWatcher` 监听文件创建/删除/修改事件，自动失效缓存并触发防抖刷新，避免每次展开/折叠重复扫描磁盘。

媒体库搜索与树只拥有各自的文件名、目录和导航 projection，不负责语义解析或 Entity 候选。`SemanticSourceDiscoveryService` 是工作区和已配置素材库中文本 source 的唯一 watcher/reconciliation owner：事件只触发低延迟提示，启动、焦点恢复、root remap 和手动刷新通过有界扫描补齐遗漏。语义发现不会调用 `AssetFileImportService`，也不会自动写入 `library.json` 或确认 Entity。

### 云存储支持

| 提供商   | 说明                      |
| -------- | ------------------------- |
| `github` | GitHub / GitHub LFS       |
| `gitlab` | GitLab / GitLab LFS       |
| `s3`     | Amazon S3 兼容存储        |
| `rclone` | 40+ 云存储（通过 rclone） |

## Deep Dive

### CI/CD 自动渲染示例（GitHub Actions）

```yaml
on:
  push:
    paths: ['**.nkv']
jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { lfs: true }
      - run: neko-cli render project.nkv -o output.mp4
```

### 配置

| 配置                        | 默认值    | 说明                |
| --------------------------- | --------- | ------------------- |
| `neko.assets.cloudProvider` | `github`  | 云存储提供商        |
| `neko.assets.autoSync`      | `false`   | 保存时自动同步      |
| `neko.assets.lfsThreshold`  | `1048576` | LFS 追踪阈值（1MB） |
| `neko.assets.cicdEnabled`   | `true`    | 启用 CI/CD 自动渲染 |
