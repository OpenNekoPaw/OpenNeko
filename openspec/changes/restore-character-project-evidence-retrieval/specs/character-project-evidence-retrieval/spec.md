## ADDED Requirements

### Requirement: Character evidence discovery uses stable Entity identity

The Chara VS Code Host MUST resolve the selected stable Character Entity and discover story locators
using its canonical name, display name, and aliases. It MUST NOT include the internal Entity ID or the
current natural-language turn question in a `story-symbols` locator query.

#### Scenario: Character scene locators are discovered

- **WHEN** a confirmed Character Entity has a canonical name that appears in Fountain scenes
- **THEN** Chara queries Project Search with bounded Character identity terms
- **AND** all matching project-local scene locators remain eligible for Character evidence selection

#### Scenario: Multiple identity terms are available

- **WHEN** a Character has a canonical name, display name, and aliases
- **THEN** Chara applies OR semantics across distinct identity terms
- **AND** deduplicates results by stable Project Search item identity

### Requirement: Chara owns scene text materialization and turn relevance

Chara MUST safely read text only from eligible project-local Character scene locators and MUST rank
the resulting chunks against the current turn query, recent role-session transcript, Entity identity,
authority, and freshness before applying the evidence budget.

#### Scenario: Chinese question matches project evidence

- **WHEN** the user asks a Chinese question about the Character's current project events
- **AND** an eligible scene contains overlapping Chinese evidence terms
- **THEN** that scene is ranked into the bounded turn evidence
- **AND** the exact project evidence is included in the Character responder system prompt

#### Scenario: A locator escapes the project

- **WHEN** Project Search returns an absolute or relative locator outside the selected project
- **THEN** Chara rejects that locator with a safety omission
- **AND** does not read or inject the external file

### Requirement: Character profile assembly uses real project evidence

The default Character profile assembler MUST project real Character occurrences and script-context
facts from the canonical Chara project evidence adapter. It MUST NOT use an empty reader, Dashboard
compatibility path, or Agent-owned profile evidence implementation.

#### Scenario: A Character profile is launched from a script-backed Entity

- **WHEN** the Entity resolves and Project Search returns Character scene locators
- **THEN** the assembled profile contains project-derived occurrence or script-context evidence
- **AND** the role-session profile is richer than an identity-name-only projection

### Requirement: Evidence dependency failures are visible

The Character evidence path MUST fail visibly when stable Entity identity cannot be resolved, Project
Search is unavailable, or a required evidence dependency fails. Character Dialogue and Embody
controllers MUST NOT invoke the model responder for the affected turn.

#### Scenario: Project Search command fails

- **WHEN** the Project Search command rejects during Character evidence discovery
- **THEN** the controller projects an explicit role-session error
- **AND** no Character model response is started

#### Scenario: No project scene exists for the Character

- **WHEN** Entity identity and Project Search succeed but return no Character scene locator
- **THEN** Chara returns an explicit empty evidence bundle
- **AND** does not use Dashboard, broad workspace search, model memory, or another fallback as project evidence

### Requirement: Canonical evidence execution is path-tested

Regression tests MUST assert the stable Entity reader, identity-scoped Project Search adapter, safe
text reader, Chara relevance selector, prompt renderer, and responder are executed in order. Tests
MUST prove the deleted empty-reader and composite-query paths cannot return success.

#### Scenario: End-to-end deterministic evidence path is exercised

- **WHEN** a test Character backed by a Fountain fixture receives a project-fact question
- **THEN** the responder receives the expected scene text through the canonical evidence path
- **AND** poisoned legacy or empty-reader paths are not invoked
