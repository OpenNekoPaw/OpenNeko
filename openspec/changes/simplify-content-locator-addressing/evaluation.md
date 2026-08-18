# Agent Evaluation Disposition

## Evaluation Scope

- Change: opaque content Tool references, PDF visual evidence handling and creator-visible/Board artifact delivery.
- Decision: `update` `agent-runtime.stream-delivery/document-image-native-delivery` and `agent-runtime.workflow-controller/workspace-board-projection`; they already own document image use and durable Board delivery.
- Real Evaluation is required before release because Tool schemas, reference binding, provider visual continuation and artifact routing change.
- Canonical path: attached PDF `input_ref` -> ReadDocument units/images -> internal representation handle -> provider `image_ref` -> Markdown artifact -> original PDF `ContentLocator` plus Markdown Board delivery.
- Forbidden fallback: raw locator parameters, source-path reconstruction, representation persistence, data/Preview URL persistence, automatic materialization, active/recent binding or source-locator substitution as raster pixels.

## Cases

- Update document image delivery to prove the provider visually consumes `image_ref` while model-visible Tool inputs/results contain no locator/spec/generator fields.
- Update Workspace Board projection to prove one delivery containing the original PDF durable locator and Markdown result, with no representation handle/locator or raster artifact.
- Add a negative expired/cross-Conversation opaque-ref case with fail-local diagnostic and no inferred binding.
- Add deterministic contract cases for new locator codecs, explicit fingerprint preconditions, invalid old-shape isolation and explicit export returning a new durable locator.
- Missing observability: current facts must distinguish durable artifact candidates from representation-only perceptual evidence without exposing handle internals; add only a neutral candidate-kind/omission diagnostic if absent.

## Verification

- Validate focused unit/contract tests, every indexed Evaluation suite and the selected cases key-free.
- Run the updated cases through the complete Desktop session owner and real provider only with explicit provider/model/cost authorization.
- Require one visible Desktop path through the real composer, attachment controls and Workspace Board; inspect final artifact identity and Canvas projection, not only final text.
- No real provider/Desktop result is claimed by this proposal.

## Interpretation

- Success requires path evidence that the provider saw visual bytes through an opaque ref and Board persisted only canonical durable locators.
- A rendered thumbnail alone does not prove durable artifact correctness, and a successful Board node alone does not prove the provider inspected raster evidence.
- Reference failure, provider behavior failure and Evaluation infrastructure failure must remain separate outcomes.

## Residual Risk

- Existing persisted locator inventory may block implementation if released authoritative records require a separate preservation workflow.
- Provider visual compliance and complete Desktop delivery remain unverified until explicitly authorized real runs complete.
