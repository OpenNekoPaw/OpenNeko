## ADDED Requirements

### Requirement: First user input establishes the durable conversation title

The Agent Host SHALL initialize a conversation whose durable title is exactly `New conversation`
from the first non-empty user input before preparing or dispatching the turn. The title SHALL be
persisted through the conversation authority and SHALL NOT be inferred independently by the Webview.

#### Scenario: First Agent or media message is accepted

- **WHEN** an ordinary conversation with the default title receives its first non-empty user input
- **THEN** the Host persists the normalized bounded title before dispatch and projects the same title to the open Tab

#### Scenario: Conversation already has a title

- **WHEN** a conversation with a non-default title receives another message
- **THEN** the Host preserves the existing title and does not emit a replacement Tab title

### Requirement: Tab labels follow committed conversation titles

The Agent Host SHALL update every ordinary open Tab bound to a conversation after that conversation's
title is committed. The update SHALL use the existing revisioned TabState persistence and projection
path.

#### Scenario: Multiple Tabs bind one conversation

- **WHEN** a committed title changes for a conversation represented by multiple ordinary Tabs
- **THEN** every matching Tab receives the same title in one new TabState revision

#### Scenario: Role-owned Tab is present

- **WHEN** Character Dialogue or Embody Character Tabs are open while an ordinary conversation title changes
- **THEN** their role-owned labels remain unchanged

#### Scenario: Title persistence fails

- **WHEN** the conversation authority rejects the title update
- **THEN** turn dispatch fails visibly and no TabState title update is emitted
