## 1. Contract and projection

- [x] 1.1 定义并严格解码 DSH context-pressure ACP notification 与 Desktop Session pressure projection。
- [x] 1.2 从 DSH Session projection registry 发布 exact Session whole value，并补 producer 测试。
- [x] 1.3 在 Agent runtime 保存最新 pressure，覆盖合法、stale、非法和 sibling isolation。

## 2. Desktop and Webview

- [x] 2.1 通过 Desktop Session Host 投影 pressure，不在应用组合根计算 token。
- [x] 2.2 将现有 `UsageIndicator` 接到 `projectedTokens` 和 `contextWindow`，保持 UI 结构不变。
- [x] 2.3 补充 contract、Desktop consumer 与 Webview 回归测试，删除硬编码 pressure path。

## 3. Verification

- [x] 3.1 执行 affected contracts/runtime/bridge/Desktop/Webview tests 与 typechecks。
- [x] 3.2 按 Agent Evaluation disposition 更新或复用 multi-image 场景，并记录真实 provider/UI 未执行项。
- [x] 3.3 执行 strict OpenSpec、UI validation 与 Neko quality review，记录剩余风险。
