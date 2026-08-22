## 1. Provider projection

- [x] 1.1 在 OpenNeko DSH provider profile 的唯一 materializer 中投影 12 MiB `maxRequestImageBytes`。
- [x] 1.2 补充 producer 测试，覆盖多 provider route 和现有 provider-local failure isolation。

## 2. Verification

- [x] 2.1 执行 Desktop provider runtime tests/typecheck 与 DSH package validation。
- [x] 2.2 记录 multi-image Agent Evaluation disposition；真实 provider 运行需要显式成本授权。
- [x] 2.3 执行 strict OpenSpec 与 Neko quality review，记录预算只限制请求载荷的剩余风险。
