## ADDED Requirements

### Requirement: Agent Generation inputs remain owned by the Generation node

Canvas SHALL preserve exact Agent-submitted media input locators in the projected Generation node and MUST NOT create duplicate ordinary material nodes solely to display those inputs. When an input locator is the selected output of an existing Generation node, Canvas SHALL connect the existing producer Generation node directly to the new Generation node with explicit lineage.

#### Scenario: Input material is not already a Canvas node

- **WHEN** an Agent Generation Job uses an authorized media locator that has no matching Canvas node
- **THEN** the projected Generation node retains that locator as its input material
- **AND** Canvas does not create a media or file node for the same locator
- **AND** rerunning the Generation node resolves the retained input material

#### Scenario: Input comes from a previous Generation result

- **WHEN** an Agent adjusts or extends a selected output from an existing Generation node
- **THEN** Canvas projects the new Job as a distinct Generation node
- **AND** connects the previous Generation node directly to the new node with a `derived-from` relation
- **AND** does not create another material node for the previous output

### Requirement: Canvas candidate focus is not downstream adoption

Canvas SHALL keep Generation candidates and may project one candidate as the current preview, but that presentation choice MUST NOT become a creator-adopted shot result, Cut input or delivery fact without an explicit creator action and a successful owning authoring operation.

#### Scenario: Latest candidate becomes visible

- **WHEN** a succeeded Generation snapshot adds a new committed output and Canvas displays it
- **THEN** the Generation node retains the stable output binding and current preview
- **AND** no Markdown shot row or Cut document is modified

#### Scenario: Creator adopts the visible candidate

- **WHEN** the creator explicitly chooses the visible committed output for a resolvable shot row
- **THEN** the owning Markdown authoring operation records its stable Workspace reference
- **AND** Canvas remains a projection of Generation candidates rather than an approval authority
