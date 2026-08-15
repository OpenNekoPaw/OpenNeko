## 1. Boundary design

> Task 1.2 is gated: only Foundation and exact cross-domain refs may enter the current production contract.
> Story/Experience identities and codecs remain design-only until the optional-capability audit in
> `simplify-resource-entity-character-world-boundaries` finds a complete real path.
> Foundation identities and product consumers are owned by
> `refine-world-management-authoring-and-runtime`; none of the tasks below may add a second
> WorldProject/WorldVersion/WorldRun/WorldSave contract, repository or registration.

- [ ] 1.1 完成五层 ownership/topology 审计并更新 package role metadata。
- [ ] 1.2 定义 World Definition、World Story、World Experience canonical identities、refs、contracts 和 strict codecs。
- [ ] 1.3 定义用户数据清单、workspace-relative owner paths 和 record-local diagnostics。

## 2. Verification

- [ ] 2.1 添加 producer/consumer contract tests 与 malformed sibling isolation tests。
- [ ] 2.2 添加 poison tests，禁止 Character mutation、active/latest rebinding、Electron/React/Agent implementation imports 和内部版本分发。
- [ ] 2.3 运行 focused tests/typechecks、OpenSpec、application boundaries、no-internal-versioning、legacy-debt 和 unused checks，记录剩余风险。
