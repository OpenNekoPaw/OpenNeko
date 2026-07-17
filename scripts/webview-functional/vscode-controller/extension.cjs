const { createServer } = require('node:http');
const { randomBytes } = require('node:crypto');
const { mkdirSync, realpathSync, unlinkSync, writeFileSync } = require('node:fs');
const { dirname, isAbsolute, join, relative, resolve } = require('node:path');
const vscode = require('vscode');

let server;
let connectionFile;
let fixtureRoot;
let workspaceRoot;
const observations = [];

async function activate(context) {
  workspaceRoot = resolveWorkspaceRoot();
  fixtureRoot = workspaceRoot;
  connectionFile =
    process.env.NEKO_FUNCTIONAL_CONTROLLER_FILE ||
    join(resolve(context.extensionPath, '../../..'), '.tmp', 'webview-functional-controller.json');
  const token =
    process.env.NEKO_FUNCTIONAL_CONTROLLER_TOKEN || randomBytes(24).toString('hex');

  server = createServer(async (request, response) => {
    try {
      if (request.method !== 'POST') {
        return send(response, 405, { ok: false, error: 'Only POST is supported' });
      }
      if (request.headers.authorization !== `Bearer ${token}`) {
        return send(response, 401, { ok: false, error: 'Unauthorized controller request' });
      }
      const body = await readJsonBody(request);
      if (request.url === '/observations') {
        return send(response, 200, { ok: true, observations });
      }
      if (request.url !== '/execute') {
        return send(response, 404, { ok: false, error: 'Unknown controller route' });
      }
      const value = await execute(body.action, body.payload ?? {});
      observations.push({
        event: `host.${body.action}`,
        source: 'vscode-functional-controller',
        observedAt: new Date().toISOString(),
        details: projectObservationDetails(body.action, body.payload ?? {}),
      });
      return send(response, 200, { ok: true, value });
    } catch (error) {
      return send(response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Functional controller did not receive a TCP port');
  }
  mkdirSync(dirname(connectionFile), { recursive: true });
  writeFileSync(connectionFile, JSON.stringify({ port: address.port, token, pid: process.pid }), {
    encoding: 'utf8',
    mode: 0o600,
  });
  context.subscriptions.push({ dispose: () => server?.close() });
}

function deactivate() {
  server?.close();
  server = undefined;
  if (connectionFile) {
    try {
      unlinkSync(connectionFile);
    } catch {}
  }
  connectionFile = undefined;
  fixtureRoot = undefined;
  workspaceRoot = undefined;
}

async function execute(action, payload) {
  switch (action) {
    case 'ping':
      return { version: vscode.version, workspace: vscode.workspace.name, workspaceRoot };
    case 'clear-observations':
      observations.length = 0;
      return { cleared: true };
    case 'configure-fixture-root': {
      const nextRoot = realpathSync(requireString(payload.path, 'path'));
      if (!isPathInsideOrEqual(nextRoot, requireWorkspaceRoot())) {
        throw new Error('Functional fixture root must stay inside the Debug Host workspace');
      }
      fixtureRoot = nextRoot;
      return { configured: true, relativePath: relative(requireWorkspaceRoot(), nextRoot) };
    }
    case 'host-identity':
      return {
        version: vscode.version,
        workspaceRoot: requireWorkspaceRoot(),
        extensions: (payload.extensionIds ?? []).map((id) => {
          const extension = vscode.extensions.getExtension(requireString(id, 'extensionId'));
          if (!extension) throw new Error(`Required extension is not installed: ${id}`);
          return {
            id: extension.id,
            version: extension.packageJSON.version,
            isActive: extension.isActive,
            webviewViewTypes: collectWebviewViewTypes(extension.packageJSON),
            customEditorViewTypes: collectCustomEditorViewTypes(extension.packageJSON),
          };
        }),
      };
    case 'execute-command':
      return vscode.commands.executeCommand(requireString(payload.command, 'command'), ...(payload.args ?? []));
    case 'open-file':
      return openFile(fixtureRoot, payload.path);
    case 'read-workspace': {
      const path = requireFixturePath(fixtureRoot, payload.path);
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(path));
      return { path: payload.path, text: Buffer.from(bytes).toString('utf8') };
    }
    case 'read-diagnostics': {
      const path = requireFixturePath(fixtureRoot, payload.path);
      const uri = vscode.Uri.file(path);
      return {
        path: payload.path,
        diagnostics: vscode.languages.getDiagnostics(uri).map(projectDiagnostic),
      };
    }
    case 'open-custom-editor': {
      const path = requireFixturePath(fixtureRoot, payload.path);
      const viewType = requireString(payload.viewType, 'viewType');
      await vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(path), viewType);
      return { uri: vscode.Uri.file(path).toString(), viewType };
    }
    case 'save-active': {
      const editor = vscode.window.activeTextEditor;
      if (editor) return { saved: await editor.document.save(), uri: editor.document.uri.toString() };
      await vscode.commands.executeCommand('workbench.action.files.save');
      return { saved: true, customEditor: true };
    }
    case 'close-reopen': {
      const path = requireFixturePath(fixtureRoot, payload.path);
      await closeFixtureTabs({ exactPath: path, requireMatch: true });
      if (payload.viewType) {
        await vscode.commands.executeCommand(
          'vscode.openWith',
          vscode.Uri.file(path),
          requireString(payload.viewType, 'viewType'),
        );
        return { uri: vscode.Uri.file(path).toString(), viewType: payload.viewType };
      }
      return openFile(fixtureRoot, path);
    }
    case 'hide-reveal':
      await vscode.commands.executeCommand('workbench.action.togglePanel');
      await vscode.commands.executeCommand('workbench.action.togglePanel');
      return { toggled: true };
    case 'reload-window':
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
      return { reloading: true };
    case 'cleanup-session':
      return { closedEditors: await closeFixtureTabs() };
    default:
      throw new Error(`Unknown controller action: ${action}`);
  }
}

async function closeFixtureTabs(options = {}) {
  const root = requireFixtureRoot();
  let matchingTabs = findFixtureTabs(root, options.exactPath);
  for (let attempt = 0; options.requireMatch && matchingTabs.length === 0 && attempt < 20; attempt += 1) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    matchingTabs = findFixtureTabs(root, options.exactPath);
  }
  if (options.requireMatch && matchingTabs.length === 0) {
    throw new Error(
      `Functional fixture editor is not open: ${options.exactPath}. ` +
      `Open functional tabs: ${JSON.stringify(listOpenFunctionalTabPaths())}`,
    );
  }
  for (const tab of matchingTabs) {
    const closed = await vscode.window.tabGroups.close(tab, true);
    if (!closed) {
      throw new Error(`VS Code did not close functional fixture editor: ${readTabUri(tab)}`);
    }
  }
  return matchingTabs.length;
}

function listOpenFunctionalTabPaths() {
  const functionalRoot = resolve(requireWorkspaceRoot(), '.neko', '.functional');
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .map(readTabUri)
    .filter((uri) => uri?.scheme === 'file' && isPathInsideOrEqual(resolve(uri.fsPath), functionalRoot))
    .map((uri) => relative(functionalRoot, resolve(uri.fsPath)));
}

function findFixtureTabs(root, exactPath) {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => {
      const uri = readTabUri(tab);
      if (!uri || uri.scheme !== 'file') return false;
      const tabPath = resolve(uri.fsPath);
      return exactPath
        ? tabPath === resolve(exactPath)
        : isPathInsideOrEqual(tabPath, root);
    });
}

function readTabUri(tab) {
  const input = tab?.input;
  const uri = input && typeof input === 'object' ? input.uri : undefined;
  return uri &&
    typeof uri === 'object' &&
    typeof uri.scheme === 'string' &&
    typeof uri.fsPath === 'string' &&
    typeof uri.toString === 'function'
    ? uri
    : undefined;
}

function requireFixtureRoot() {
  if (!fixtureRoot) throw new Error('Functional fixture root is not configured');
  return fixtureRoot;
}

function projectDiagnostic(diagnostic) {
  return {
    code: normalizeDiagnosticCode(diagnostic.code),
    message: diagnostic.message,
    severity: diagnostic.severity,
    source: diagnostic.source,
    range: {
      start: {
        line: diagnostic.range.start.line,
        character: diagnostic.range.start.character,
      },
      end: {
        line: diagnostic.range.end.line,
        character: diagnostic.range.end.character,
      },
    },
  };
}

function normalizeDiagnosticCode(code) {
  if (typeof code === 'string' || typeof code === 'number') return String(code);
  if (code && typeof code.value === 'string') return code.value;
  return undefined;
}

function collectWebviewViewTypes(packageJson) {
  const viewGroups = packageJson?.contributes?.views;
  if (!viewGroups || typeof viewGroups !== 'object') return [];
  return Object.values(viewGroups)
    .flatMap((views) => Array.isArray(views) ? views : [])
    .filter((view) => view?.type === 'webview' && typeof view.id === 'string')
    .map((view) => view.id);
}

function collectCustomEditorViewTypes(packageJson) {
  const editors = packageJson?.contributes?.customEditors;
  if (!Array.isArray(editors)) return [];
  return editors
    .filter((editor) => typeof editor?.viewType === 'string')
    .map((editor) => editor.viewType);
}

async function openFile(fixtureRoot, relativePath) {
  const path = requireFixturePath(fixtureRoot, relativePath);
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path));
  await vscode.window.showTextDocument(document, { preview: false });
  return { uri: document.uri.toString(), languageId: document.languageId };
}

function requireFixturePath(fixtureRoot, value) {
  if (!fixtureRoot) throw new Error('Functional fixture root is not configured');
  const path = resolve(fixtureRoot, requireString(value, 'path'));
  const relativePath = relative(fixtureRoot, path);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`Controller path escapes fixture root: ${value}`);
  }
  return path;
}

function resolveWorkspaceRoot() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) throw new Error('Functional Debug Host requires a workspace folder');
  return realpathSync(folder.uri.fsPath);
}

function requireWorkspaceRoot() {
  if (!workspaceRoot) throw new Error('Functional Debug Host workspace is not initialized');
  return workspaceRoot;
}

function isPathInsideOrEqual(candidatePath, rootPath) {
  const relativePath = relative(rootPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a string`);
  return value;
}

function readJsonBody(request) {
  return new Promise((resolvePromise, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) request.destroy(new Error('Controller request is too large'));
    });
    request.on('end', () => {
      try {
        resolvePromise(JSON.parse(body || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function send(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function projectObservationDetails(action, payload) {
  if (action === 'execute-command') return { command: payload.command };
  if (typeof payload.path === 'string') {
    return { path: payload.path, ...(payload.viewType ? { viewType: payload.viewType } : {}) };
  }
  return {};
}

module.exports = { activate, deactivate };
