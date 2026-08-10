## REMOVED Requirements

### Requirement: Project catalog supports local multi-selection

**Reason**: Ordinary Project activation now opens the exact Workspace directly; retaining hidden or parallel selection semantics would preserve two conflicting input paths and recreate the layout instability through future batch UI.

**Migration**: Use each Project item's explicit management actions. Host contracts continue accepting a non-empty Project identity collection, while the catalog submits a single exact identity per action.

### Requirement: Project catalog exposes batch removal

**Reason**: The always-available navigation surface no longer enters an implicit batch management mode or inserts a selection toolbar after an ordinary click.

**Migration**: Invoke the removal action on the exact Project item. Cancellation continues to send no mutation, and removal continues through the existing canonical Host contract with a single-element identity collection.

## MODIFIED Requirements

### Requirement: Unavailable Projects remain manageable without becoming openable

The Project catalog SHALL keep unavailable Project records visible for individual management while all open actions for those records remain disabled.

#### Scenario: User manages an unavailable Project

- **WHEN** an unavailable Project appears in the current Project catalog result
- **THEN** the user can invoke its exact Project removal action while its diagnostic remains visible and its open action remains disabled

### Requirement: Batch removal does not delete Project files

Removing Projects from the Project catalog SHALL update local catalog, Workspace registration and Window references, and SHALL NOT delete Agent conversations, the Project directory, Project files, media or generated artifacts.

#### Scenario: User confirms item removal

- **WHEN** the Host completes Project removal for the exact item identity submitted by the catalog
- **THEN** that Project group is absent from the Project catalog and its retained Workspace conversations remain visibly unavailable
- **AND** no conversation or filesystem deletion operation is performed
