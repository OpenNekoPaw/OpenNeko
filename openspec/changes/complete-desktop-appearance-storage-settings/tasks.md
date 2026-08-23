## 1. Contract And Authority

- [x] 1.1 扩展 application settings canonical preferences，加入全窗口字号和新项目默认目录 locator，并更新严格 contract/state 测试。
- [x] 1.2 增加受控 storage projection、目录打开和目录选择 contract，逐 entry 返回占用量或 diagnostic。

## 2. Desktop Integration

- [x] 2.1 在 Main 实现不跟随 symlink 的目录统计和受控路径解析，并把默认目录接入新项目选择器。
- [x] 2.2 在 Renderer 根应用字号，在 Settings overlay 补全外观与存储 UI。

## 3. Verification

- [x] 3.1 运行 focused contract/service/Renderer 测试、Desktop typecheck、OpenSpec 与 diff check。
- [x] 3.2 在可见 Electron 验证尺寸、滚动、字号、打开目录和已有项目不变；记录未验证风险。
