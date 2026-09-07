## ADDED Requirements

### Requirement: Agent executes every independent operation in the current ready batch

When the creator asks to execute or continue an established media-production scope, the Agent SHALL derive the current ready batch from the authoritative shot plan, production-input coverage and committed artifacts. Every independent ready media item SHALL remain one bounded owning-capability Tool call. The Agent SHALL issue all calls in that batch within the same task, wait for every call to reach a terminal result, inspect the real results, and only then recompute the next dependency wave. It MUST NOT stop after the first successful item, combine distinct materials into one prompt, or require another generic continuation merely because one item completed.

#### Scenario: Several independent image materials are ready

- **WHEN** three image materials in the current preparation stage have stable inputs, confirmed Tool schemas and no result dependencies on one another
- **THEN** the Agent invokes the image capability three times in the same task, once for each material
- **AND** it waits for and inspects all three terminal results before reporting the batch or advancing dependencies

#### Scenario: A later operation depends on a batch result

- **WHEN** a video first frame or repair operation depends on one of the current image results
- **THEN** that dependent operation is not submitted in the same ready batch
- **AND** after all current calls settle, the Agent may submit the newly ready dependency wave in the same task only when the real results admit one unambiguous in-scope action

#### Scenario: One batch item fails

- **WHEN** one independent Tool call fails while sibling calls succeed
- **THEN** the failed item and its dependents receive a visible diagnostic
- **AND** successful siblings and work that does not depend on the failure remain usable and continue

#### Scenario: Results require a creator choice

- **WHEN** several valid candidates require subjective adoption or a result would materially change the established creative scope
- **THEN** the Agent stops after presenting the settled evidence and requests one creator decision
- **AND** no candidate is adopted merely because it was generated or inspected

### Requirement: A Markdown shot row binds only a creator-chosen result

An ordinary scene and shot plan SHALL remain one editable Markdown table with local row labels. A stable generated-media reference SHALL be written into a shot row only after the creator explicitly chooses that candidate for downstream use.

#### Scenario: Candidate is only being previewed

- **WHEN** Canvas displays or highlights one Generation candidate without an explicit creator choice
- **THEN** the corresponding `SHxx` row remains unchanged
- **AND** Cut and delivery do not consume that candidate as an adopted result

#### Scenario: Creator chooses one candidate

- **WHEN** the creator explicitly chooses a committed Generation output for one unambiguous `SHxx` row
- **THEN** the Agent updates that existing row with the stable Workspace media reference
- **AND** later work reuses the updated row instead of creating a parallel shot table or approval object

#### Scenario: Shot row cannot be resolved

- **WHEN** the target `SHxx` row is missing, duplicated or changed incompatibly
- **THEN** only the result-binding operation fails visibly
- **AND** the Generation output, document and sibling shot rows remain unchanged
