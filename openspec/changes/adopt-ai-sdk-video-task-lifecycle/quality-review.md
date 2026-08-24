## Quality review

Risk classification: high. The change touches public Generation contracts, provider selection, paid external submission, durable Job recovery and cancellation.

### Findings

No unresolved finding was identified in the changed execution path after focused review.

- `GenerationJobCoordinator` is the sole durable owner of polling, restart reconciliation, terminal state and result commit.
- Provider operation data is persisted only after submission and before the first status query; it contains no credential, absolute path, media bytes or provider response body.
- Status and cancellation reconstruct the exact frozen provider/model binding and do not use active/default model state.
- H3 has one AI SDK VideoModelV4 path; the prior MiniMax MediaAdapter implementation and registration were removed.
- Seedance uses the official ByteDance provider. Provider failures do not try another provider, model or adapter.
- Canonical video input roles are validated and preserved through codec, materialization and provider mapping. H3 rejects mixed frame/reference modes, invalid duration/resolution, excessive reference counts and unsupported media types.

### Residual risk

- Real provider response drift, account permissions, regional endpoint behavior and billing could not be verified without explicit paid-test authorization and credentials.
- Existing MiniMax models that depended on the removed V1 MediaAdapter no longer have that legacy success path; unsupported models now fail visibly, as required by the canonical-path design.
- Repository-level gates remain red for unrelated concurrent work listed in `verification.md`; they prevent a clean whole-worktree release claim but do not invalidate the focused passing evidence.
