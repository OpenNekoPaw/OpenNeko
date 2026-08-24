## Context

Settings 是 Window overlay；偏好由 `@neko/host/application-settings` 持久化。路径和磁盘统计必须留在 Host/Main 边界，Renderer 不获得任意文件系统能力。

五层分析：职责由 settings owner 保存偏好、Main 解析与统计、Renderer 展示；依赖只在 Main 使用 Node/Electron；接口只暴露受控 storage kind 和 `${HOME}` locator；扩展通过明确 storage entry 增加，不建立通用文件浏览 API；测试覆盖 contract、路径、已有项目不变和响应式 UI。

## Decisions

### 1. 路径使用 canonical locator

持久化的默认目录只允许 `${HOME}/...` locator。Renderer 显示 locator；Main 根据固定 storage kind 或已注册项目 identity 解析真实路径。不得保存绝对路径或把 raw path 传给打开目录命令。

### 2. 占用量是可刷新 projection

Main 在请求时统计目录，拒绝跟随符号链接。单个目录不可读只给该 entry 返回 diagnostic，不阻止 sibling entry。

### 3. 字号作用于整个 Renderer root

偏好使用 `small | default | large`，同时更新根字号 token 与完整 root scale；Settings 不拥有独立缩放路径。

### 4. 默认目录不迁移已有数据

选择目录只更新新项目 picker 的默认位置。workspace registry 中已有记录、媒体库和应用数据均不写入、不搬迁。

## Runtime Boundary

- Owner: `@neko/host/application-settings` 与 Desktop Main native storage adapter。
- Producer: Host settings service / Main storage projection。
- Consumer: Desktop Renderer Settings overlay 与 workspace directory picker。
- Canonical path: typed preload IPC；无直接 Renderer filesystem。
- Replaced path: 无；新增能力不建立第二套设置存储。
- User-data impact: 只读统计与显式偏好写入，不移动数据。
