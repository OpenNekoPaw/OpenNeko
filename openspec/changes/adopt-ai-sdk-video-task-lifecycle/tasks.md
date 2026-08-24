## 1. Contract and dependency boundary

- [x] 1.1 Upgrade Generation to AI SDK 7 and align `@neko/ai-sdk` provider dependencies without changing DSH's independent LLM runtime.
- [x] 1.2 Define canonical role-typed video inputs and exact provider/model-bound external-task observation; update every producer, codec, materializer and consumer atomically.
- [x] 1.3 Add contract tests for role preservation, illegal combinations, provider/model binding and secret/path exclusion.

## 2. Canonical AI SDK provider execution

- [x] 2.1 Add the official ByteDance Provider and exact `bytedance` provider resolution for Seedance.
- [x] 2.2 Implement MiniMax-H3 VideoModelV4 start/status against the V2 endpoints with strict request validation and typed result/error mapping.
- [x] 2.3 Move AI SDK asynchronous video execution to `startVideo/getVideoStatus`, persist the task checkpoint before status polling, and use the same status path during reconcile/restart.
- [x] 2.4 Remove MiniMax V1 MediaAdapter registration, implementation and tests; add poisoned-path assertions proving it cannot return success.

## 3. GenerationJob lifecycle verification

- [x] 3.1 Test submit-before-poll ordering, exact task persistence, normal completion, terminal failure, cancellation behavior and outcome-unknown handling.
- [x] 3.2 Test application restart recovery without resubmission, exact provider/model reconstruction, sibling Job isolation and no provider/stack fallback.
- [x] 3.3 Test H3 and Seedance request mapping for text, first/last frame and multimodal references within provider limits.

## 4. Evaluation and completion

- [x] 4.1 Reuse/update the indexed GenerationJob Agent Evaluation cases; run key-free validation and record that it proves harness readiness only.
- [x] 4.2 Run focused package typechecks/tests, architecture/legacy/unused gates, and record commands plus residual risks.
- [x] 4.3 Run real H3/Seedance Desktop provider cases only when explicit cost authorization and credentials are available; otherwise record the exact infrastructure blocker.
