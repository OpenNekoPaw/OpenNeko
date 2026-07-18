/**
 * createNewFile — standard "new project file" UX for Neko extensions.
 *
 * Flow:
 *   1. Find a unique name in the target folder (Untitled.ext → Untitled-1.ext → …)
 *   2. Write template content to the file
 *   3. Call `onCreated` if provided (e.g. open the file in a custom editor)
 *   4. Reveal the file in the Explorer
 *   5. Trigger VSCode's inline rename — the input shows "Untitled.ext" with only
 *      the stem selected, so the extension is always visible and preserved
 *
 * Why not `explorer.newFile`?
 *   That command shows an empty input with no default name or extension hint.
 *   `renameFile` on a pre-created file is the only VSCode API that shows a
 *   pre-filled input (stem selected, extension not selected).
 */
import * as vscode from 'vscode';

/** A single template option shown in the quick-pick when creating a new file. */
export interface TemplateChoice {
  /** Unique identifier for this template. */
  id: string;
  /** Display label in the quick-pick (may include codicon, e.g. `'$(file) Blank'`). */
  label: string;
  /** Secondary description shown in the quick-pick. */
  description?: string;
  /** Returns the initial file content given the file stem. */
  template: (title: string) => string | Uint8Array;
  /**
   * Optional asset files to write alongside the project file.
   * Each entry's `name` may contain the literal `'template'` which will be
   * replaced with the actual file stem (title).
   */
  assets?: (title: string) => Promise<Array<{ name: string; data: Uint8Array }>>;
}

export interface CreateNewFileOptions {
  /** Target folder URI. Falls back to the first workspace folder when omitted. */
  targetFolder?: vscode.Uri;
  /** Stem used when generating a unique default name. Defaults to `'Untitled'`. */
  baseName?: string;
  /** File extension including the leading dot, e.g. `'.nkc'`. */
  ext: string;
  /** Returns the initial file content given the file stem (name without extension). */
  template: (title: string) => string | Uint8Array;
  /** Message shown when no target folder can be resolved. */
  noFolderErrorMessage?: string;
  /**
   * Called with the new file URI immediately after the template is written,
   * before the inline rename input appears. Use this to open the file in a
   * custom editor — VSCode will update the editor tab title automatically
   * when the user renames the file.
   */
  onCreated?: (uri: vscode.Uri) => void | Promise<void>;
  /**
   * When provided with more than one entry, a quick-pick is shown before
   * file creation so the user can choose a starting template.
   * A single entry is used directly without showing a picker.
   */
  templates?: TemplateChoice[];
  /** Title for the template quick-pick dialog. */
  templatePickTitle?: string;
  /**
   * Optional error handler for displaying errors (e.g., no folder available).
   * When provided, the handler is called instead of `vscode.window.showErrorMessage`.
   * Accepts an Error and should display it to the user.
   */
  onError?: (error: Error) => void;
}

/**
 * Create a new project file with a unique default name, reveal it in the
 * Explorer, and trigger an inline rename so the user can set the final name.
 *
 * The inline input is pre-filled with the default name and extension
 * (e.g. "Untitled.nkc"), with only the stem selected. The user can type a new
 * stem; the extension is preserved automatically by VSCode's rename UX.
 *
 * @returns The URI of the created file (with the default name, before rename),
 *          or `undefined` if no folder was available.
 */
export async function createNewFile(
  options: CreateNewFileOptions,
): Promise<vscode.Uri | undefined> {
  const { ext, onCreated } = options;
  const baseName = options.baseName ?? 'Untitled';

  // --- Template selection ---------------------------------------------------
  let templateFn = options.template;
  let assetsFn: TemplateChoice['assets'] | undefined;

  if (options.templates && options.templates.length > 0) {
    if (options.templates.length === 1) {
      // Single template — use directly
      templateFn = options.templates[0]!.template;
      assetsFn = options.templates[0]!.assets;
    } else {
      // Multiple templates — show quick-pick
      const items = options.templates.map((t) => ({
        label: t.label,
        description: t.description,
        _choice: t,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: options.templatePickTitle,
        title: options.templatePickTitle,
      });

      if (!picked) return undefined; // user cancelled
      templateFn = picked._choice.template;
      assetsFn = picked._choice.assets;
    }
  }

  // --- Resolve target folder ------------------------------------------------
  let targetFolder = options.targetFolder;
  if (!targetFolder) {
    targetFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
  }
  if (!targetFolder) {
    const msg = options.noFolderErrorMessage ?? 'No workspace folder is open.';
    if (options.onError) {
      options.onError(new Error(msg));
    } else {
      vscode.window.showErrorMessage(msg);
    }
    return undefined;
  }

  // Find a unique name: Untitled.ext → Untitled-1.ext → Untitled-2.ext …
  let fileName = `${baseName}${ext}`;
  let fileUri = vscode.Uri.joinPath(targetFolder, fileName);
  let counter = 1;
  while (true) {
    try {
      await vscode.workspace.fs.stat(fileUri);
      fileName = `${baseName}-${counter}${ext}`;
      fileUri = vscode.Uri.joinPath(targetFolder, fileName);
      counter++;
    } catch {
      break; // file does not exist — use this name
    }
  }

  // Write template content
  const title = fileName.slice(0, fileName.length - ext.length);
  const content = templateFn(title);
  const bytes = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
  await vscode.workspace.fs.writeFile(fileUri, bytes);

  // Write asset files alongside the project file
  if (assetsFn) {
    const assets = await assetsFn(title);
    for (const asset of assets) {
      const assetUri = vscode.Uri.joinPath(targetFolder, asset.name);
      await vscode.workspace.fs.writeFile(assetUri, asset.data);
    }
  }

  // Open in editor before rename so the tab is ready; VSCode updates the tab
  // title automatically when the user renames the file in Explorer.
  if (onCreated) {
    await onCreated(fileUri);
  }

  // Reveal in Explorer and trigger inline rename.
  // VSCode's renameFile shows the current filename with only the stem selected,
  // so the extension is always visible and the user never needs to type it.
  await vscode.commands.executeCommand('revealInExplorer', fileUri);
  await new Promise<void>((resolve) => setTimeout(resolve, 200));
  await vscode.commands.executeCommand('renameFile');

  return fileUri;
}
