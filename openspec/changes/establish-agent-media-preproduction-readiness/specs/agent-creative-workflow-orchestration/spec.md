## ADDED Requirements

### Requirement: Media preproduction establishes source and material readiness before planned video generation

For source-based time media, the Agent SHALL complete visual, character, story, world and storyboard-translation analysis to the scope it claims and SHALL establish material and generation-intent coverage for the current production range before recommending production video generation. It MUST treat source coverage, shot planning, reusable static references, per-shot still intent and per-shot video intent as distinct dependencies, while keeping each actual Tool operation bounded by its current schema and model capability. The current production range SHALL be the whole PV by default, or one creator-approved episode, sequence block or continuous production unit for long-form and TV work.

#### Scenario: Style sampling is not complete adaptation analysis

- **WHEN** inspected source images establish a visual style but do not establish production-relevant character states, story causality, world rules or storyboard translation for the claimed range
- **THEN** the Agent keeps analysis incomplete and names the next evidence gap within those five analysis dimensions
- **AND** it does not treat the style sample as sufficient analysis for PV, long-form or TV production

#### Scenario: Volume evidence is insufficient

- **WHEN** a creator requests a volume-level adaptation but the inspected source has not established structure, story-bearing ranges, distinct early/middle/late decisions and continuous cause-action-consequence evidence for the proposed spine
- **THEN** the Agent keeps the current result at an evidence-review or narrower local creative scope
- **AND** its next operation continues the named source analysis gap rather than preparing generation inputs or producing video

#### Scenario: Preparation begins for a planned shot range

- **WHEN** a reviewable time-based concept and shot range exist but their production references are not yet covered
- **THEN** the Agent accounts for every planned shot and identifies the story beat and applicable world rules, character states, objects, environment topology, style, composition, action and sound materials it actually consumes
- **AND** it records for every shot either an executable still-generation or edit intent, or a real bound still that needs no image operation, plus a distinct complete video-motion intent
- **AND** one source or generated image satisfies only the observable roles and shots it explicitly binds, while unanalyzed later shots cannot be deferred as one generic range
- **AND** it prioritizes validated existing material and reusable low-cost static references before per-shot video generation

#### Scenario: Creator continues during incomplete preparation

- **WHEN** the immediately preceding result identifies an unresolved material or per-shot intent batch and the creator says “continue” without changing the objective
- **THEN** the Agent prepares or executes the next bounded compatible batch within the same preparation stage
- **AND** it does not treat one prepared still or one technical shot test as completion of the full planned range

#### Scenario: A shot is ready for video generation

- **WHEN** the current production range has no unresolved critical static-material gaps, every planned shot has complete and distinct still-operation and video-motion intent, and one planned continuous shot has a stable shot contract, all required character, object and environment continuity references, and a directly consumable starting state supported by the current video capability
- **THEN** the Agent may recommend or execute that shot's bounded video generation as requested
- **AND** any later shot-specific video inputs remain visible without being promoted to completed video preparation

#### Scenario: One existing first frame conflicts with incomplete planned-range coverage

- **WHEN** one shot has a consumable first frame or a prior submit-ready packet but other planned shots still lack character, object, environment, action or composition references or distinct generation intents
- **THEN** the Agent treats the prior ready state as local to that operation and continues the highest-priority static-material batch
- **AND** it does not recommend video unless the creator explicitly requests an early technical test

#### Scenario: Creator explicitly requests an early technical video test

- **WHEN** the creator requests a video experiment before the current production range has complete material and generation-intent coverage
- **THEN** the Agent may execute the supported bounded test from its real inputs
- **AND** it labels the result as a technical experiment that does not complete source analysis, preparation or planned video coverage
