## ADDED Requirements

### Requirement: All composer modes share one creative configuration surface

The Agent Webview SHALL expose one shared configuration surface for Agent, image, video, and audio session modes. Every mode SHALL place session-mode, model, and parameter entry triggers in the same compact composer toolbar. The surface SHALL use content category as its primary navigation and model/parameter as its secondary navigation, and MUST NOT create mode-specific configuration authorities.

#### Scenario: Open model configuration from Agent mode
- **WHEN** the creator opens model configuration while the session mode is Agent
- **THEN** the shared panel opens on the chat primary category and model secondary page and shows the selected primary LLM

#### Scenario: Open model configuration from image mode
- **WHEN** the creator opens model configuration while the session mode is image
- **THEN** the same shared panel opens on the image primary category and model secondary page and still permits navigation to chat, video, and audio categories

#### Scenario: Open parameters from image mode
- **WHEN** the creator uses the parameter entry while the session mode is image
- **THEN** the same shared panel opens on the image primary category and parameter secondary page

#### Scenario: Switch among composer modes
- **WHEN** the creator switches between Agent and direct media modes
- **THEN** the session-mode, model, and parameter entry triggers remain stable in the composer toolbar while their summaries follow the active mode

#### Scenario: Change a model from any mode
- **WHEN** the creator selects an exact provider/model option in the shared panel
- **THEN** the existing purpose-specific callback receives that option identity regardless of which session mode opened the panel

### Requirement: Model summaries follow the active mode

The shared model configuration trigger SHALL summarize the primary chat model in Agent mode and the matching generation model in each direct media mode. An unavailable or disabled generation binding SHALL be represented explicitly and MUST NOT silently display another category or fallback model.

#### Scenario: Display selected video model
- **WHEN** the session mode is video and an exact video generation model is selected
- **THEN** the shared trigger displays that video model summary

#### Scenario: Display unconfigured audio model
- **WHEN** the session mode is audio and its generation selection is `none`
- **THEN** the shared trigger displays an explicit unconfigured state without substituting the chat, image, or video model

### Requirement: Request parameters remain separate from model bindings

The shared configuration surface SHALL expose model and parameter secondary pages for media content categories. The chat category SHALL expose only model selection and SHALL NOT expose a composer parameter entry or parameter page. Media parameter pages SHALL edit the current generation request. The Webview MUST NOT persist request parameters as model purpose bindings, duplicate the media model selector outside the shared surface, expose separate parameter overlays, or inject vague creativity, verbosity, or reasoning presets.

#### Scenario: Configure an image request
- **WHEN** the creator uses image mode
- **THEN** the composer exposes mode, model, and parameter entries, and the shared panel image parameter page contains ratio and resolution choices without a second image-model dropdown

#### Scenario: Configure a video request
- **WHEN** the creator uses video mode
- **THEN** the shared panel video parameter page contains ratio, resolution, and duration choices

#### Scenario: Configure an audio request
- **WHEN** the creator uses audio mode
- **THEN** the shared panel audio parameter page contains audio type and duration choices

#### Scenario: Agent mode omits parameters
- **WHEN** the creator uses Agent mode
- **THEN** the composer shows mode and model entries without a parameter entry, and the chat category has no parameter secondary page

#### Scenario: Send an Agent turn
- **WHEN** the creator sends a turn from the Agent composer
- **THEN** the Webview does not inject reasoning, verbosity, creativity, or advanced LLM parameter overrides

### Requirement: Media model pages separate perception and generation

Each image, video, and audio primary category model page SHALL expose a perception model group before a generation model group. The perception group SHALL bind only the matching `*.understand` purpose and the generation group SHALL bind only the matching generation purpose.

#### Scenario: Configure image perception
- **WHEN** the creator opens the image model page
- **THEN** the panel shows “image perception model” and “image generation model” as separate labelled groups

#### Scenario: Resolve automatic perception
- **WHEN** the perception selection is `auto`
- **THEN** the option displays the exact currently resolved perception model or an explicit missing state

#### Scenario: Perception model is unavailable
- **WHEN** no compatible perception model is configured
- **THEN** the panel reports the missing perception binding without substituting the primary chat model or the generation model

### Requirement: Configuration remains tab-scoped and locked during execution

The shared model panel category and open state SHALL remain presentation state in the existing composer tab realm. All model and request-parameter controls SHALL be disabled while the foreground run is active and MUST NOT mutate the in-flight snapshot.

#### Scenario: Open model configuration in two conversation tabs
- **WHEN** two conversation tabs use different model-panel categories
- **THEN** each tab restores its own category without using an active-conversation fallback

#### Scenario: Attempt configuration during a run
- **WHEN** the foreground conversation is executing
- **THEN** the mode, model, and direct media parameter triggers are disabled
