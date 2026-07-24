/**
 * English translations for neko-assets
 */

export const en = {
  // Media Library Management
  'mediaLibrary.add.title': 'Select media library directory',
  'mediaLibrary.add.namePrompt': 'Enter a name for this media library',
  'mediaLibrary.add.namePlaceholder': 'e.g., Team Footage',
  'mediaLibrary.add.success': 'Media library "{name}" added',
  'mediaLibrary.add.error': 'Failed to add library: {error}',

  'mediaLibrary.remove.selectTitle': 'Select library to remove',
  'mediaLibrary.remove.success': 'Media library removed',

  'mediaLibrary.delete.action': 'Delete File',
  'mediaLibrary.delete.confirm':
    'Delete "{fileName}" from the linked Media Library target? This deletes the target file, not just a workspace link.',
  'mediaLibrary.delete.failed': 'Media Library deletion failed ({code}).',
  'mediaLibrary.delete.invalidSelection': 'Select a Media Library file to delete.',
  'mediaLibrary.delete.success': 'Media Library file deleted.',

  'mediaLibrary.relink.selectTitle': 'Select library to relink',
  'mediaLibrary.relink.dialogTitle': 'Select replacement directory for {name}',
  'mediaLibrary.relink.success': 'Media library "{name}" relinked',
  'mediaLibrary.relink.structureWarning':
    'Relinking "{name}" keeps every saved neko/assets/{name}/... path unchanged. Select only a replacement directory with the same internal structure.',
  'mediaLibrary.relink.confirmAction': 'Choose Replacement',

  'mediaLibrary.gitIntegration.warning':
    "VS Code's built-in Git cannot inspect files below linked Media Library directories and may repeatedly report pathspec errors. Disable built-in Git for this workspace folder while linked Media Libraries are present? Git features for this folder will be unavailable; files and Neko media access remain available.",
  'mediaLibrary.gitIntegration.disableAction': 'Disable Git for This Folder',
  'mediaLibrary.gitIntegration.keepAction': 'Keep Git Enabled',
  'mediaLibrary.gitIntegration.disabled':
    'Built-in Git disabled for this workspace folder while linked Media Libraries are present.',

  'mediaLibrary.import.success': 'Imported: {name}',
  'mediaLibrary.import.successMultiple': 'Imported {count} files',

  'mediaLibrary.copyPath.success': 'File path copied to clipboard',
  'mediaLibrary.copy.destinationOutsideLibrary':
    'Choose a destination inside the selected Media Library.',
  'mediaLibrary.copy.failed': 'Media Library copy failed ({code}).',
  'mediaLibrary.copy.invalidSource': 'Select a supported content source to copy.',
  'mediaLibrary.copy.selectDestination': 'Choose Media Library destination',
  'mediaLibrary.copy.selectLibrary': 'Select writable Media Library',
  'mediaLibrary.copy.success': 'File copied to Media Library.',

  'mediaLibrary.placeholder': 'No media libraries configured',
  'mediaLibrary.placeholder.action': 'Add Media Library',

  'mediaLibrary.status.online': 'Status: Online',
  'mediaLibrary.status.offline': 'Status: Offline',

  'mediaLibrary.fileCount': '{count} file',
  'mediaLibrary.fileCount.plural': '{count} files',

  // Search
  'mediaLibrary.search.placeholder': 'Search media files across all libraries...',
  'mediaLibrary.search.noResults': 'No matching files found',
  'mediaLibrary.search.scanning': 'Scanning media libraries...',

  // Commands
  'command.previewVideo': 'Preview Video',
  'command.previewAudio': 'Preview Audio',
  'command.openFile': 'Open File',

  // Metadata tooltips
  'metadata.resolution': 'Resolution',
  'metadata.duration': 'Duration',
  'metadata.frameRate': 'Frame Rate',
  'metadata.codec': 'Codec',
  'metadata.size': 'Size',
  'metadata.sampleRate': 'Sample Rate',
  'metadata.channels': 'Channels',
  'metadata.bitrate': 'Bitrate',
};
