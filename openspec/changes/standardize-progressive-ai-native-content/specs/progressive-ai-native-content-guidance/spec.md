## ADDED Requirements

### Requirement: Default output is the minimum useful result

The product system prompt SHALL direct the Agent to provide the smallest result that resolves the current request, including only decision-relevant evidence, constraints and the next useful action. It SHALL NOT require unsolicited alternatives, exhaustive background, a complete implementation plan, a risk matrix or a durable artifact. Explicit user requests for detail, completeness, alternatives, formal documents or execution SHALL expand the response accordingly.

#### Scenario: User asks for a brief analysis

- **WHEN** the available evidence supports a direct conclusion and the user does not request a formal report
- **THEN** the Agent SHALL return the conclusion, essential evidence and one next action
- **AND** SHALL NOT generate a full report template or multiple optional plans

#### Scenario: User asks for a complete proposal

- **WHEN** the user explicitly requests a complete reviewable proposal
- **THEN** the Agent SHALL include the sections and detail necessary for that deliverable
- **AND** the default concise preference SHALL NOT truncate required content

### Requirement: Content guidance is a composable DSH Skill

OpenNeko SHALL provide `content-authoring` as an ordinary DSH Skill with a short routing body and on-demand relative references for content forms. It MUST NOT be a mandatory gateway, an artifact profile, a Skill router or a reason to suppress another applicable DSH Skill.

#### Scenario: Content method and domain method both apply

- **WHEN** a request requires both general proposal structure and storyboard domain judgment
- **THEN** DSH MAY load both `content-authoring` and `storyboard`
- **AND** OpenNeko SHALL preserve both injection facts without designating one primary Skill

#### Scenario: Content authoring does not apply

- **WHEN** a short factual answer requires no document design or creative deliverable
- **THEN** the Agent need not load `content-authoring`
- **AND** the runtime SHALL NOT inject it globally as hidden mandatory content

#### Scenario: Chinese content-planning request uses native model selection

- **WHEN** a Chinese request clearly asks for a concise creative proposal, analysis, plan or prompt package without an explicit `$content-authoring` gesture
- **THEN** the DSH model-facing Skill catalog SHALL provide sufficient routing meaning for the model to select `content-authoring`
- **AND** OpenNeko SHALL NOT implement a language-specific router, mandatory injection or alternate Skill-loading path

### Requirement: Content forms share semantics without empty boilerplate

Content guidance SHALL distinguish goal, evidence/input, decisions, deliverable content and next action while allowing irrelevant slots to be omitted or combined. A table SHALL be used only when repeated records, mappings, sequences or comparisons are materially clearer than prose. Empty sections and placeholder rows MUST NOT be generated solely to satisfy a template.

#### Scenario: Three repeated work items need exact mapping

- **WHEN** a plan contains at least three comparable work items with the same decision fields
- **THEN** the applicable guide MAY require one concise table with stable headers
- **AND** prose SHALL explain only exceptions or decisions not evident from the table

#### Scenario: One direct recommendation is sufficient

- **WHEN** the deliverable contains one recommendation and one next action
- **THEN** it SHALL remain concise prose or a short list
- **AND** SHALL NOT create a one-row table or empty standard sections

### Requirement: AI-native handoff is capability-aware and executable

When a plan or prompt is intended for an AI model or creative Tool, the output SHALL identify the role of the selected capability, required inputs, executable prompt or operation intent, expected result and validation method at the depth requested by the user. Availability and execution claims SHALL be checked against the current DSH model/Tool catalog and permission state.

#### Scenario: Requested generation capability is available

- **WHEN** the current turn exposes the required generation capability and the user requests an executable handoff
- **THEN** the response SHALL provide the minimum usable input and prompt/operation guidance for that capability
- **AND** SHALL distinguish proposed instructions from confirmed execution results

#### Scenario: Requested capability is unavailable

- **WHEN** the necessary model or Tool is absent or denied
- **THEN** the response SHALL report the exact blocked state and minimum next decision
- **AND** SHALL NOT claim completion, silently switch providers or enumerate unrelated alternatives unless requested

### Requirement: Adaptation scale is supported by source coverage

When a creative plan proposes an episode count, per-episode duration or total runtime from an existing comic, book, screenplay or other ordered source, the Agent SHALL distinguish source-unit count from verified narrative content and SHALL state the coverage supporting the estimate. The Agent MAY use bounded representative samples to produce a provisional range when it states sample selection, narrative-density evidence, estimation method, uncertainty and confidence. Page count, chapter labels, a manifest, a cover, a contents page or an arbitrary small visual sample MUST NOT alone establish a fixed adaptation scale or universal conversion rule.

#### Scenario: Only three pages of a 240-page image comic were inspected

- **WHEN** the source reports 240 pages but only three pages have pixel-level review and story-beat coverage remains unknown
- **THEN** the current deliverable SHALL be a bounded source-coverage or adaptation-volume assessment
- **AND** the Agent SHALL NOT claim that full-volume analysis is complete, select `12 × 24` minutes, or generate a twelve-episode structure

#### Scenario: A representative chapter supports a provisional duration range

- **WHEN** a bounded 20–30 page chapter has been reviewed for story-bearing pages, scenes, beats, dialogue, action, atmosphere and transitions
- **THEN** the Agent MAY estimate a work-specific range such as 5–6 minutes when the reconstructed beats support it
- **AND** SHALL state the sampled range, method, confidence and reasons other chapters may differ
- **AND** SHALL NOT promote that range into a universal pages-to-minutes rule or a final whole-volume format

#### Scenario: A fixed format is proposed after sufficient review

- **WHEN** ordered narrative coverage and pacing assumptions are sufficient to propose a fixed format
- **THEN** the proposal SHALL expose total runtime, average source load per episode or segment, and the material expansion/compression/omission assumptions that make the format plausible
- **AND** SHALL distinguish that recommendation from source fact and creator approval

### Requirement: New content norms extend without a fixed Skill count

New norms that only refine a content form's structure or examples SHOULD be added as an on-demand reference. A new Skill MAY be added when it has independently routable judgment and composes with other Skills. Merge or split decisions SHALL be based on routing, composition, quality and context-cost evidence rather than a fixed catalog size.

#### Scenario: New report subtype shares the same task judgment

- **WHEN** a future report subtype changes only sections, table headers or examples
- **THEN** it SHALL be eligible for a new relative reference without requiring a new runtime profile or Skill

#### Scenario: New method has an independent trigger

- **WHEN** a future method has distinct applicability and can be loaded alongside existing Skills
- **THEN** it MAY be delivered as another DSH Skill
- **AND** no architectural Skill-count limit SHALL block it

### Requirement: External creative methods do not become runtime authority

OpenNeko MAY adapt externally published creative methods as on-demand Skill references when they improve a current task judgment. It SHALL preserve current DSH Skill format, Tool catalog, model binding, permission and Host authority as the execution contract, and SHALL NOT import external absolute paths, private Tool names, provider endpoints, internal template versions, hidden Skills or fixed creative layouts as OpenNeko runtime requirements.

#### Scenario: A model-specific video template contains reusable prompt semantics

- **WHEN** an external template distinguishes subject, action, spatial state, temporal order, camera, audio, references and constraints
- **THEN** the applicable OpenNeko Skill MAY adapt those semantics in a model-neutral on-demand reference
- **AND** actual model parameters and reference bindings SHALL be checked against the current Tool schema before execution

#### Scenario: An external workflow mandates a fixed nine-panel layout

- **WHEN** the user's task does not explicitly request that layout
- **THEN** OpenNeko SHALL preserve flexible shot count and narrative judgment
- **AND** SHALL NOT force the external layout, lens assignments or full-document template merely because the reference contains them

### Requirement: Builtin Skill catalog presentation is localized without changing DSH identity

The Agent Webview SHALL localize known builtin Skill display names, summaries and invocation labels for the active supported locale while preserving the canonical DSH name, source and provider. It MUST NOT add locale fields to DSH Skill frontmatter or the Host projection, and MUST NOT apply builtin copy to project, personal, custom or unknown Skill records.

#### Scenario: Chinese user views a known builtin Skill

- **WHEN** the active locale is `zh-cn` and the DSH projection contains a known Skill with `source=bundled`
- **THEN** the card SHALL show a Chinese display name and summary together with its canonical invocation name

#### Scenario: Project Skill shadows a builtin name

- **WHEN** a non-bundled Skill uses the same canonical name as a known builtin Skill
- **THEN** the card SHALL show the DSH-projected name and description unchanged
- **AND** SHALL NOT present it as the product builtin

### Requirement: Builtin Skill prompts are Chinese-first and English-equivalent

Every OpenNeko builtin Skill SHALL keep one canonical DSH identity while providing Chinese and English routing meaning in the model-visible `description`, Chinese and English method guidance in the loaded body, and equivalent language coverage in every model-readable relative reference. Chinese SHALL appear first. The Agent SHALL use the user's requested language for the deliverable and SHALL default to Chinese when the language cannot be determined; it SHALL NOT emit duplicate bilingual deliverables unless requested. OpenNeko MUST NOT implement this through locale frontmatter, duplicate localized Skill names, a Host locale router, or restrictions beyond the DSH Skill contract.

#### Scenario: Chinese request relies on implicit Skill selection

- **WHEN** a Chinese request matches a builtin Skill without an explicit `$skill-name` gesture
- **THEN** the DSH model catalog SHALL expose concise Chinese routing meaning before the English equivalent
- **AND** the selected Skill SHALL provide Chinese method guidance without requiring a Host language router

#### Scenario: English request uses the same Skill

- **WHEN** an English request matches the same builtin Skill
- **THEN** DSH SHALL select and load the same canonical Skill identity
- **AND** the Skill SHALL provide semantically equivalent English method guidance and preserve the same authority boundaries

#### Scenario: Detailed guidance is stored in a relative resource

- **WHEN** a builtin Skill directs the model to a relative reference for detailed rules
- **THEN** that reference SHALL contain Chinese-first and English-equivalent guidance or the Skill SHALL expose explicit same-package Chinese and English resource choices
- **AND** only the task- and language-relevant resource SHOULD be read
