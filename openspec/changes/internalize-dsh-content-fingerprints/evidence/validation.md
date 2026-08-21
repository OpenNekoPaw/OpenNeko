# Validation evidence

## Automated

- Canvas Domain: 37 files, 299 tests passed; typecheck passed.
- Cut Domain: 7 files, 65 tests passed; typecheck passed.
- Canvas/Cut DSH plugins: 2 tests each passed; typechecks passed.
- Agent Runtime: 52 files, 359 tests passed; typecheck passed.
- Desktop: 102 files, 611 tests passed; typecheck passed.
- Desktop production package passed for `darwin-arm64`, including the staged DSH runtime and production Vite bundles.
- Strict OpenSpec, Agent boundaries, package boundaries and Content access boundaries passed.
- Key-free Agent Evaluation passed with 45 files, 314 tests, 26 suites and 67 dry-run cases.

## Path evidence

- Canvas/Cut model schemas, decoders and projected facts contain no fingerprint field.
- Supplying the retired `expectedFingerprint` model field fails strict decoding.
- Each mutation Host adapter first queries the exact requested document and forwards only the Host-observed fingerprint
  to the existing internal CAS-protected authoring service.
- No retry, active-document substitution or model-supplied fingerprint path is present.

## Non-blocking repository findings

- Desktop full lint remains red on eight unrelated pre-existing errors and two warnings outside this change.
- The internal-versioning harness passes, while the repository audit remains red on dirty-worktree baseline drift; after
  removing this change's initial debt-token wording, no reported new occurrence belongs to these fingerprint changes.

## Behavior evidence

No real provider or post-fix visible Desktop run was performed because provider/model/cost authorization was not
supplied. The key-free harness and deterministic tests do not claim real Agent behavior or graphical acceptance.
