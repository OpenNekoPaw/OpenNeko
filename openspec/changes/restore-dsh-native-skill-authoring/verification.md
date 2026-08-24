# Verification snapshot

The focused provider-validation tests pass against public `FileSystemSkillProvider` APIs in an isolated custom root. OpenNeko does not copy DSH frontmatter or layout parsing. The builtin `skill-creator` method describes DSH-native directory/flat layouts, frontmatter and relative resources without inventing target arguments, Tool permission or a product manifest.

The version-free Tool contract, exact Conversation target resolver, same-filesystem staging/no-replace writer, short-lived bridge validation operation, approval path and scoped catalog re-observation are implemented. DSH Q0 loads the real `@neko/agent-dsh-plugin`, asks approval inside an open turn and executes `CreateSkill` through the reverse Host port without loading `skill-creator`. Directory/flat provider validation, resource containment, conflict preservation and Workspace isolation have deterministic tests. Existing user Skill bytes are not modified by validation.

Provider-backed model behavior and one visible Desktop approval run still require an explicitly authorized provider/model/cost configuration. They are not replaced by Q0 or key-free evidence.

Focused verification passes:

- Agent contracts: typecheck and 18 files / 110 tests.
- Agent runtime: typecheck and 54 files / 375 tests.
- DSH bridge: typecheck and 5 files / 47 tests.
- Desktop authoring/product/runtime: 4 files / 17 tests; Desktop typecheck passes.
- Agent DSH plugin: build, typecheck and unit test.
- OpenSpec, package roles, application boundaries, Agent extension surface and packaged DSH runtime closure pass.
- Agent evaluation: 45 files / 314 tests and 27 suites / 82 indexed cases pass key-free validation.

The isolated staged snapshot's full Q0 run stops at its pre-existing committed-history replay assertion before reaching the W2 `CreateSkill` scenario; focused CreateSkill producer/consumer tests pass, but full Q0 qualification therefore remains open. The broader Agent boundary composition remains red on concurrent ComfyUI inventory drift and a missing inventory-test input file. Full repository typecheck is red on an Entity Webview `ContentLocator` error; dependency checks retain three Agent→Chara findings; the legacy-debt scan remains red on pre-existing image-preview `shim` names. These failures do not enter the CreateSkill producer/consumer path, but keep delivery task 4.3 open until the repository-wide gates are green.
