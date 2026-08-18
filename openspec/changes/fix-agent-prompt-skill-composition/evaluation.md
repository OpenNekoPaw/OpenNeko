# Agent Evaluation Disposition

## Scope

- Change: exact Turn-scoped Prompt/Tool composition, opaque Skill catalog locators and truthful
  persistence claims.
- Decision: `update` the existing `agent-runtime.prompt-composition` and
  `agent-runtime.skill-runtime` suites; reuse `agent-runtime.screenplay-authoring` only for the
  approval-gated durable Workspace file assertion instead of creating another writer or Evaluation
  runner. Exact `content-document` receipt admission remains deterministic Runtime coverage because
  the current Evaluation driver has no receipt-binding setup or corresponding runtime fact.
- Canonical path: queued Turn snapshot -> final target/image/capability Tool filtering -> matching
  provider-owned Prompt fragments -> Pi Skill catalog -> exact composed system prompt facts.
- Forbidden paths: controller-time fragment concatenation, fragment without its declared Tool,
  provider provenance loss, absolute Skill host paths, direct Skill filesystem reads, and claims that
  chat or composite artifacts are saved files.

## Cases

- Prompt composition: deterministic Runtime coverage proves that a content-document Turn exposes
  the Canvas/Cut capability fragments only when their declared Tools are present; priority and
  stable id order are preserved with provider provenance, while Character, World and unbound Turns
  do not receive those fragments.
- Skill runtime: a model-selected Skill is advertised only through an opaque `/__neko_skills/`
  locator, loaded through `read_skill`, and never receives wording that converts the locator to an
  absolute Tool path.
- Persistence truthfulness: the screenplay suite proves approval-gated `Write`, successful
  Workspace mutation and final bytes. It does not prove that `Write` originated from an exact
  content-document receipt; a chat answer or composite artifact alone still cannot satisfy the
  durable file case.
- Poison checks: duplicate fragment ids, empty or duplicate declared Tool names, wrong-target
  fragments and a leaked physical Skill directory all fail rather than silently composing.

## Verification

- Deterministic producer/consumer coverage is owned by Agent Contracts and Runtime tests for the
  exact queued Turn snapshot, final Tool filtering, fragment order/provenance, Skill locator
  formatting and persistence wording.
- Desktop deterministic coverage detaches the Session Surface after Turn acceptance, composes the
  final prompt while the background Turn drains, and proves facts and terminal diagnostics settle
  before the connection-owned projector is disposed.
- Key-free validation uses `pnpm test:agent:eval` and strict OpenSpec validation. These prove suite,
  Scenario, assertion and coverage integrity; they are not model-behavior evidence.
- A focused provider-backed run of `agent-runtime.prompt-composition`,
  `agent-runtime.skill-runtime` and `agent-runtime.screenplay-authoring` requires explicit
  provider/model/cost authorization.
- No provider/model/cost authorization was supplied for this change, so real execution is
  `infrastructure-blocked` and was not attempted.
- UI validation is not applicable: existing target selection and Renderer/Webview behavior are
  unchanged, and ordinary-document delivery is exercised only inside the current exact Turn.

## Interpretation

- Deterministic success proves that Pi receives one canonical system prompt derived from the same
  immutable Turn snapshot as the available Tools, and that recorded prompt facts describe that
  exact final prompt.
- Existing Skill scenarios remain the behavioral owner for explicit injection and model-selected
  `read_skill`; screenplay authoring remains the behavioral owner for durable Workspace file
  publication, while exact receipt admission is proven only by deterministic Runtime tests.
- Final-answer quality or a plausible saved-file statement without exact mutation facts is not
  acceptance evidence.

## Residual Risk

- Model-level Skill selection, compliance with capability guidance and refusal to overstate
  persistence remain unverified until an explicitly authorized real-provider run is completed.
- The current Evaluation driver cannot establish or observe an exact `content-document` receipt, so
  provider-backed exact-receipt handoff remains coverage-blocked rather than inferred from a
  successful `Write` call.
- Existing exact content targets compose correctly; this change intentionally does not create or
  infer a target when the current Turn lacks document mutation authority.
