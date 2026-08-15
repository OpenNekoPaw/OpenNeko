## ADDED Requirements

### Requirement: Installed World management, Project authoring, and runtime remain distinct

OpenNeko SHALL treat installed World management as an immutable release catalog/lifecycle surface under Conversation, World Authoring as a Project-bound Creative Workspace capability for one exact mutable WorldProject, and World Runtime as an independent durable Run/Save lifecycle launched from one exact eligible immutable WorldVersion. Management selection, current Workspace, authoring preview, active Window scene, or package path MUST NOT grant or infer runtime or mutation authority.

#### Scenario: User selects an installed World

- **WHEN** the user selects one exact installed WorldVersion
- **THEN** the owner detail shows eligibility, dependencies, provenance, usage, adaptation, export, and uninstall diagnostics
- **AND** no WorldProject, World Studio, WorldRun, WorldSave, branch, event editor, or Agent Conversation is created

### Requirement: Installed World management uses a lightweight card catalog

Installed World management SHALL render immutable WorldVersions through a World-owned responsive card catalog with search, stable sort, and explicit empty/loading/error presentations. Each card SHALL identify title, summary, provenance, runtime eligibility, adaptation eligibility, and owner-qualified attention without rendering a mutable WorldDefinition. The catalog MUST NOT expose blank creation, direct editing, finalization, or management-owned Agent generation.

#### Scenario: Installed World catalog is empty

- **WHEN** no installed WorldVersion exists
- **THEN** Main renders the canonical installed-library empty state and package import action
- **AND** no placeholder WorldProject, active selection, Creative Workspace, Run, or Save is fabricated

### Requirement: World authoring is Project-bound

Every newly created mutable WorldProject SHALL use one exact Project-bound Creative Workspace and the canonical World contract, application service, codec, file repository, publication behavior, and authoring Root. Project SHALL own only target membership and typed output composition. Existing standalone mutable records MAY appear only in recovery with mutation/publication disabled. The system MUST NOT infer a Project, use an installed release as a mutable target, or fall back to another root.

#### Scenario: Project-local World opens for authoring

- **WHEN** Host authorizes one exact Project Creative Workspace and Project verifies the WorldProject membership
- **THEN** the World-owned authoring surface operates on that exact target below the Project authority
- **AND** Project and Desktop do not copy or interpret World facts

#### Scenario: Exact World authority is invalid

- **WHEN** the Workspace grant, containment, Project membership, or WorldProject binding is missing or mismatched
- **THEN** only that authoring target reports an owner-qualified diagnostic and World mutations are disabled
- **AND** the system does not use an installed release, recovery record, active Workspace, cache, or empty World as a substitute

### Requirement: World authoring preserves visible Workspace composition

Opening a WorldProject for authoring SHALL mount the exact World-owned authoring Root only in the declared Project Creative Workspace slot while retaining every other explicitly visible slot identity. Closing authoring SHALL remove only that Root and allowed presentation snapshot. Desktop and World MUST NOT fabricate a Board, retain a hidden World Root, or make layout state authoritative for Project or World facts.

#### Scenario: World opens beside another visible target

- **WHEN** one Project composition explicitly displays another creative target and opens a WorldProject in a supported secondary slot
- **THEN** both Roots remain bound to their exact owner identities and declared slots
- **AND** neither Root, selection, or layout state becomes the other's fact authority

### Requirement: World authoring creates local usable versions without implying runtime or remote publication

Finalizing a review-ready WorldProject SHALL create one exact immutable local WorldVersion. This action SHALL NOT upload, share, synchronize, install another release, start a Run, create a Save, or replace existing dependencies. Remote sharing, package export, Project publication composition, and runtime launch SHALL remain separately named and authorized workflows.

#### Scenario: Author finalizes a World draft

- **WHEN** the exact project-local draft passes World validation and the user confirms local finalization
- **THEN** World stores one immutable WorldVersion linked to that WorldProject
- **AND** no network request, runtime record, installed-library mutation, or automatic Project replacement occurs

### Requirement: Authoring preview is not formal World runtime

World Authoring MAY provide a deterministic bounded preview from the exact current draft, but it MUST NOT create or write a WorldRun, WorldSave, branch, checkpoint, event log, recent-run entry, Agent Conversation, or runtime repository record. Formal runtime SHALL start only from one exact eligible immutable WorldVersion through the World Runtime launch path.

#### Scenario: Author previews an unpublished draft

- **WHEN** the user requests a deterministic test of the current WorldProject draft
- **THEN** World returns a bounded authoring preview and visible validation diagnostics
- **AND** installed library, runtime catalog, recent Runs, Saves, and branches remain unchanged

### Requirement: Invalid World records remain visible and fail locally

World installed-library, Project authoring, runtime, and recovery catalogs SHALL preserve an invalid record in its exact owner scope with a stable identity and explicit diagnostic whenever its authority, codec, dependency, or file cannot be resolved. Only dependent actions SHALL be disabled; sibling records, other Projects, valid Runs/Saves, and unrelated capabilities SHALL remain usable.

#### Scenario: One World record is malformed

- **WHEN** one owner catalog cannot decode a World record while sibling records are valid
- **THEN** that record remains visible as invalid with owner-qualified repair/export context
- **AND** sibling cards and valid runtime records continue through their canonical paths

<!-- SUCCESSOR: simplify-project-authoring-and-installed-libraries -->
> **Successor disposition (2026-08-15):** World owner projections, runtime transitions, and failure isolation remain; mutable World authoring is Project-only and independent libraries contain immutable installed releases.
