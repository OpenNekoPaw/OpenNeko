# Agent Evaluation Disposition

## Evaluation Scope

- Change: model-facing core file Tool validation and canonical result handling for relative and absolute inputs.
- Decision: `update` the existing `agent-runtime.stream-delivery/directory-format-routing` coverage because it owns core file Tool routing and Workspace path evidence.
- Real Evaluation is required before release because the model may choose either input form and Tool routing/result handling changes.
- Canonical path: user request -> model core Tool call -> one Workspace path resolver -> exact authorization -> one Tool handler -> Workspace-relative result.
- Forbidden fallback: upstream Pi/DSH native Tool registration, alternate Workspace/root, direct filesystem access, raw `.nkc`/`.otio`, absolute result identity or retry under another path interpretation.

## Cases

- Update one positive case so the provider may use a relative path and receives Workspace-relative evidence.
- Add one focused positive case whose prompt supplies an exact absolute in-Workspace path and requires successful canonical Workspace-relative result evidence.
- Add one negative case with an absolute outside-authority target and require fail-visible denial plus absence of file content and fallback Tool calls.
- Deterministic contract tests own malformed syntax, Windows/POSIX normalization, symlink containment, result redaction and identical Pi/DSH registration.
- Missing observability: if runtime facts cannot prove the submitted path form and canonical returned path without recording the Host root, add only a neutral redacted path-form/canonical-path fact; do not log the absolute input.

## Verification

- Run focused unit/contract tests and key-free Evaluation authoring validation first.
- Run the updated case through the complete Desktop session owner and real provider when provider/model/cost authorization is explicitly supplied.
- Require one visible Desktop case through the actual composer and Tool approval controls; a direct Turn runner or mock does not count.
- No real provider/Desktop result is claimed by this proposal.

## Interpretation

- Success requires path-level evidence that both forms reach the same resolver/handler and yield the same canonical identity.
- A correct final answer without submitted-path and canonical-result facts is insufficient.
- Outside-authority denial must be distinguished from provider refusal or Evaluation infrastructure failure.

## Residual Risk

- Model preference and typo rate for absolute paths remain unmeasured until authorized repeated real-provider samples run.
- DSH behavior remains contract-only until the DSH production runtime replacement is available through the complete Desktop owner.
