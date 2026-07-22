## Why

媒体库当前用 `${VAR}`、shared/local target settings 和多层 resolver 重新维护 OS 已经能够表达的目录映射。把外部媒体库作为工作区 symlink/junction 后，项目、Agent 和领域包可以统一使用真实 workspace-relative path，并显著缩小路径泄露与迁移边界。

## What Changes

- **BREAKING**：媒体库直接表现为本机 Git-ignored 的 `neko/assets/<libraryName>` symlink；Windows 使用等价 junction。link filename/target 是本机映射的唯一事实。
- 删除新 runtime 对媒体库 variable、original path、local override、library ID path lookup、mount registry 和 target repair service 的依赖。
- 媒体库文件与普通工作区文件使用同一相对路径语义，例如 `neko/assets/Footage/shot/a001.mov`；PathResolver 不增加媒体库分支，OS 在实际打开时跟随 link。
- Host 只扩展现有 workspace file guard：拒绝 absolute/traversal，只允许 `neko/assets` 直接 link 穿越 workspace root，并阻止最终 realpath 逃出该 link target。
- Agent、Search、Assets、Canvas、Cut、Preview 和 package/export 使用实际 `neko/assets/...` path，不接收 `${VAR}`、library ID、target 或 cache path。
- **BREAKING**：NKC/NKV 新写入只接受普通 workspace-relative 媒体库 path；旧 settings 与 `${VAR}`/absolute source 只进入显式 inspection/migration。
- 打包与导出解引用 link descendant 的文件字节，不序列化 link object、target 或本机设置。
- 本变更保持现有 ContentAccess/ContentIngest 和 ResourceCache contract 不变；内容接口与缓存所有权由后续独立 changes 处理。

## Capabilities

### New Capabilities

- `workspace-linked-media-libraries`: OS-owned media-library links、薄文件系统 helper、workspace guard、Agent/搜索路径可见性和 relink 行为。
- `portable-project-source-references`: NKC/NKV 与 Asset source 的普通 workspace-relative 媒体库引用、legacy migration 和 package dereference。

### Modified Capabilities

无。当前 `openspec/specs/` 没有覆盖媒体库路径或 NK 媒体库 source 的已归档 capability。

## Impact

- `@neko/shared` path/settings/source contracts、workspace file guard 和 storage layout。
- Assets media-library settings、root discovery、watch/search projection 和 extension API。
- Agent workspace tree/search/file tools，以及 Canvas/Cut/Preview/Tools source consumers。
- NKC/NKV validators/writers、save/reopen/relink、Engine registration、package/export。
- 旧媒体库设置和包含 `${VAR}`/absolute source 的未发布项目；迁移失败时必须保留原字节。
