## VS Code contribution and resource inventory

Date: 2026-07-29

Canonical sources:

- manifest: `apps/neko-vscode/package.json`
- English localization: `apps/neko-vscode/package.nls.json`
- Chinese localization: `apps/neko-vscode/package.nls.zh-cn.json`
- Extension Host entry: `apps/neko-vscode/src/extension.ts`
- feature adapters: `apps/neko-vscode/src/features/*`

Both localization files contain the same 103 keys. Manifest tests validate that
every `%key%` reference resolves in both files; these files are the exhaustive
key record rather than a duplicated list in this inventory.

### Commands

All 81 contributed command IDs have one owner.

| Owner       | Command IDs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tools (5)   | `neko.tools.compareFiles`, `neko.tools.compareImages`, `neko.tools.compareVideos`, `neko.tools.compareAudio`, `neko.tools.showMediaInfo`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Preview (8) | `neko.preview.openThreeReferenceGuide`, `neko.preview.openVideo`, `neko.preview.openAudio`, `neko.preview.openPdf`, `neko.preview.openCbz`, `neko.preview.openEpub`, `neko.preview.openDocx`, `neko.epub.goToChapter`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Assets (24) | `neko.assets.previewMedia`, `neko.assets.addToTimeline`, `neko.assets.addToCanvas`, `neko.assets.addMediaLibrary`, `neko.assets.removeMediaLibrary`, `neko.assets.relinkMediaLibrary`, `neko.assets.deleteMediaLibraryFile`, `neko.assets.copyToMediaLibrary`, `neko.assets.revealFileInOS`, `neko.assets.copyFilePath`, `neko.assets.copyFileReference`, `neko.assets.revealMediaLibraryFile`, `neko.assets.previewMediaLibraryFile`, `neko.assets.addToTimelineFromLibrary`, `neko.assets.addToCanvasFromLibrary`, `neko.assets.refreshMediaLibraries`, `neko.assets.searchMediaLibrary`, `neko.assets.directory.reveal`, `neko.assets.addToAgent`, `neko.entityBrowser.refresh`, `neko.entityBrowser.inspect`, `neko.entityBrowser.rename`, `neko.entityBrowser.editAppearance`, `neko.entityBrowser.createCandidate`                                                                              |
| Cut (2)     | `neko.cut.newProject`, `neko.cut.previewMedia`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Canvas (12) | `neko.canvas.new`, `neko.canvas.previewMedia`, `neko.canvas.revealPlaybackWorkspace`, `neko.canvas.deleteSelected`, `neko.canvas.escape`, `neko.canvas.selectAll`, `neko.canvas.undo`, `neko.canvas.redo`, `neko.canvas.selectNodeFromOutline`, `neko.canvas.selectConnectionFromOutline`, `neko.canvas.resetZoom`, `neko.canvas.deleteNodeFromOutline`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Agent (30)  | `neko.ai.chat`, `neko.agent.showLogs`, `neko.ai.generateImage`, `neko.ai.generateVideo`, `neko.ai.generateTTS`, `neko.ai.generateMusic`, `neko.ai.generateCharacter`, `neko.ai.transferStyle`, `neko.ai.enhanceVideo`, `neko.ai.optimizeAudio`, `neko.ai.analyzeImage`, `neko.ai.extractImageText`, `neko.ai.analyzeVideo`, `neko.ai.extractVideoSummary`, `neko.ai.generateScript`, `neko.ai.optimizeScript`, `neko.ai.generateStoryboard`, `neko.ai.generateSubtitles`, `neko.script.generate`, `neko.script.optimize`, `neko.script.generateImage`, `neko.script.generateVideo`, `neko.ai.summarizeDocument`, `neko.ai.chatWithDocument`, `neko.agent.createFromFile`, `neko.agent.retryCreation`, `neko.agent.addToContext`, `neko.agent.debug.startTimelineProjectionAcceptance`, `neko.agent.debug.continueTimelineProjectionAcceptance`, `neko.agent.debug.cancelTimelineProjectionAcceptance` |

The application also registers three explicit fail-closed command poisons for
the retired Engine path: `neko.engine.ensureFrameServer`,
`neko.engine.extractThumbnail`, and `neko.engine.probeInternal`. They are not
product contributions and must never return legacy success.

### Views and editors

| Owner   | IDs                                                                                                                                                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tools   | custom editor `neko.mediaDiff`                                                                                                                                                      |
| Preview | custom editors `neko.modelPreview`, `neko.videoPreview`, `neko.audioPreview`, `neko.pdfPreview`, `neko.cbzPreview`, `neko.epubPreview`, `neko.docxPreview`; view `neko.epubOutline` |
| Assets  | activity container `neko-asset-manager`; views `neko.mediaLibraries`, `neko.entityBrowser`, `neko.entityInspector`                                                                  |
| Cut     | custom editor `neko.cut.otioEditor`                                                                                                                                                 |
| Canvas  | custom editor `neko.canvasEditor`; view `neko.canvasOutline`                                                                                                                        |
| Agent   | panel container `neko-assistant`; Webview view `neko.aiAssistant`                                                                                                                   |

### Other contribution identities

- languages: `neko-canvas-file`, `epub`
- themes: `Neko macOS Dark`, `Neko macOS Light`
- icon theme: `neko-file-icons`
- installation types/kinds: `media.voice-pack`, `shader`, `skill`, `endpoint`,
  `provider`, `model`, `processor`
- settings: `neko.entityInspector.autoFollow`,
  `neko.cut.defaultProjectRoot`, `neko.agent.provider`, `neko.agent.model`,
  `neko.agent.apiKey.anthropic`, `neko.agent.apiKey.openai`,
  `neko.agent.media.outputDir`, `neko.agent.media.showSaveNotification`,
  `neko.agent.mcp.servers`

Menus contain 43 references to the command IDs above and introduce no second
command owner.

### Resources and Webview outputs

| Owner   | Application staging root                                                                                         |
| ------- | ---------------------------------------------------------------------------------------------------------------- |
| Tools   | `dist/features/neko-tools`; theme JSON and icons originate from `apps/neko-vscode/resources/features/neko-tools` |
| Preview | `dist/features/neko-preview`; Preview Webview build outputs                                                      |
| Assets  | `dist/features/neko-assets`; Assets Webview build outputs and feature localization                               |
| Cut     | `dist/features/neko-cut`; Cut Webview and Node media adapter outputs                                             |
| Canvas  | `dist/features/neko-canvas`; Canvas Webview and preset/media resources                                           |
| Agent   | `dist/features/neko-agent`; Agent Webview, builtin Skills and target Sharp closure                               |

The directory names are resource namespaces only. They contain no feature
manifest, extension entry or independently activatable payload.

### Cross-feature typed edges

- Canvas receives Preview variants, Assets media representation and Cut route
  handoff from the application composition root.
- Agent receives Assets and Canvas capability providers from the composition
  root.
- No feature adapter imports a sibling feature adapter or discovers an internal
  extension through VS Code.
- The remaining broad AI/Host services injection is tracked separately and is
  not accepted as the final typed-port design.
