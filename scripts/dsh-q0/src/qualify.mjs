import { spawn } from 'node:child_process';
import { appendFile, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable, PassThrough, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { ClientSideConnection, PROTOCOL_VERSION, ndJsonStream } from '@agentclientprotocol/sdk';

import {
  assertExactPackageVersions,
  assertQualifiedCapabilities,
  createJsonRpcPurityInspector,
} from './qualification-core.mjs';

const fixtureRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dshBridgePackageRoot = join(fixtureRoot, '..', '..', 'packages', 'dsh-bridge');
const profileName = 'openneko-acp-q0';
const w2ProfileName = 'openneko-w2-q0';
const promptAdmissionProfileName = 'openneko-prompt-admission-q0';
const shutdownTimeoutMs = 8_000;

function resolvePackageJson(packageName) {
  return fileURLToPath(import.meta.resolve(`${packageName}/package.json`));
}

class QualificationClient {
  updates = [];
  events = [];
  domainToolRequests = [];
  cancelRequests = [];
  pendingCancellations = new Map();

  async requestPermission() {
    throw new Error('DSH Q0 must not request permission without a prompt');
  }

  async sessionUpdate(notification) {
    this.updates.push(notification);
  }

  async extNotification(method, params) {
    if (method !== 'openneko/session/event') {
      throw new Error(`DSH Q0 received an unexpected extension notification: ${method}`);
    }
    this.events.push(params);
  }

  async extMethod(method, params) {
    if (method === 'openneko/domain-tool/cancel') {
      this.cancelRequests.push(params);
      return {};
    }
    if (method !== 'openneko/domain-tool/execute') {
      throw new Error(`DSH Q0 received an unexpected extension request: ${method}`);
    }
    this.domainToolRequests.push(params);
    if (params.tool === 'openneko.generation' && params.operation === 'describe') {
      return {
        outcome: 'success',
        result: {
          jobId: params.input?.jobId,
          kind: 'generation',
          phase: 'pending',
          stage: 'queued',
          lifecycleMode: 'detached',
          generationType: 'prompt',
          createdAt: 1,
          updatedAt: 1,
        },
        jobId: params.input?.jobId,
      };
    }
    if (params.tool === 'openneko.canvas' && params.operation === 'query') {
      return {
        outcome: 'success',
        result: {
          documentPath: params.input?.documentPath,
          fingerprint: { strategy: 'sha256', value: 'q0-canvas' },
          nodeCount: 0,
          connectionCount: 0,
        },
      };
    }
    if (params.operation === 'succeed') {
      return {
        outcome: 'success',
        result: { accepted: true, value: params.input?.value },
        jobId: `job-${params.toolCallId}`,
      };
    }
    if (params.operation === 'fail') {
      return {
        outcome: 'failure',
        diagnostic: { code: 'Q0_DOMAIN_REJECTED', message: 'Q0 requested rejection.' },
      };
    }
    if (params.operation === 'cancel-pending') {
      return new Promise((resolve) => {
        this.pendingCancellations.set(params.toolCallId, { params, resolve });
      });
    }
    if (params.operation === 'oversize-output') {
      return {
        outcome: 'success',
        result: { value: 'x'.repeat(300000) },
      };
    }
    throw new Error(`DSH Q0 received an unexpected domain operation: ${String(params.operation)}`);
  }

  async readTextFile() {
    throw new Error('DSH Q0 does not advertise client filesystem capabilities');
  }

  async writeTextFile() {
    throw new Error('DSH Q0 does not advertise client filesystem capabilities');
  }
}

async function createIsolatedProfile(dshHome) {
  const profileDir = join(dshHome, 'profiles', profileName);
  const nekoNamespaceDir = join(profileDir, 'node_modules', '@neko');
  const q0NamespaceDir = join(profileDir, 'node_modules', '@openneko');
  await mkdir(nekoNamespaceDir, { recursive: true });
  await mkdir(q0NamespaceDir, { recursive: true });
  await writeFile(
    join(profileDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'openneko-dsh-acp-q0-profile',
        private: true,
        dependencies: {
          '@neko/dsh-bridge': '*',
          '@openneko/dsh-q0-seed': '*',
        },
        dsh: {
          profile: {
            bundles: ['@deepseek-ai/dsh-base', '@neko/dsh-bridge'],
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(profileDir, 'cordis.patch.yml'),
    ['- insert:', '    - id: openneko-q0-seed', "      name: '@openneko/dsh-q0-seed'", ''].join(
      '\n',
    ),
  );
  await symlink(dshBridgePackageRoot, join(nekoNamespaceDir, 'dsh-bridge'), 'dir');
  await symlink(join(fixtureRoot, 'seed-plugin'), join(q0NamespaceDir, 'dsh-q0-seed'), 'dir');
  return profileDir;
}

async function createW2Profile(dshHome) {
  const profileDir = join(dshHome, 'profiles', w2ProfileName);
  const nekoNamespaceDir = join(profileDir, 'node_modules', '@neko');
  const q0NamespaceDir = join(profileDir, 'node_modules', '@openneko');
  await mkdir(nekoNamespaceDir, { recursive: true });
  await mkdir(q0NamespaceDir, { recursive: true });
  await writeFile(
    join(profileDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'openneko-dsh-w2-q0-profile',
        private: true,
        dependencies: {
          '@neko/dsh-bridge': '*',
          '@neko/generation-dsh-plugin': '*',
          '@neko/canvas-dsh-plugin': '*',
          '@openneko/dsh-w2-seed': '*',
        },
        dsh: {
          profile: {
            bundles: [
              '@deepseek-ai/dsh-base',
              '@neko/dsh-bridge',
              '@neko/generation-dsh-plugin',
              '@neko/canvas-dsh-plugin',
            ],
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(profileDir, 'cordis.patch.yml'),
    ['- insert:', '    - id: openneko-w2-seed', "      name: '@openneko/dsh-w2-seed'", ''].join(
      '\n',
    ),
  );
  await symlink(dshBridgePackageRoot, join(nekoNamespaceDir, 'dsh-bridge'), 'dir');
  await symlink(
    join(fixtureRoot, '..', '..', 'packages', 'generation', 'dsh-plugin'),
    join(nekoNamespaceDir, 'generation-dsh-plugin'),
    'dir',
  );
  await symlink(
    join(fixtureRoot, '..', '..', 'packages', 'canvas', 'dsh-plugin'),
    join(nekoNamespaceDir, 'canvas-dsh-plugin'),
    'dir',
  );
  await symlink(join(fixtureRoot, 'w2-seed-plugin'), join(q0NamespaceDir, 'dsh-w2-seed'), 'dir');
  return profileDir;
}

async function createPromptAdmissionProfile(dshHome) {
  const profileDir = join(dshHome, 'profiles', promptAdmissionProfileName);
  const nekoNamespaceDir = join(profileDir, 'node_modules', '@neko');
  const q0NamespaceDir = join(profileDir, 'node_modules', '@openneko');
  await mkdir(nekoNamespaceDir, { recursive: true });
  await mkdir(q0NamespaceDir, { recursive: true });
  await writeFile(
    join(profileDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'openneko-dsh-prompt-admission-q0-profile',
        private: true,
        dependencies: {
          '@neko/dsh-bridge': '*',
          '@openneko/dsh-q0-prompt-provider': '*',
        },
        dsh: {
          profile: {
            bundles: ['@deepseek-ai/dsh-base', '@neko/dsh-bridge'],
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(profileDir, 'cordis.patch.yml'),
    [
      '- id: openneko-acp',
      '  config:',
      '    provider: openneko-q0-prompt',
      '    model: deterministic',
      '    agentPreset: openneko',
      '- id: session-title-llm',
      '  disabled: true',
      '- insert:',
      '    - id: openneko-q0-prompt-provider',
      "      name: '@openneko/dsh-q0-prompt-provider'",
      '',
    ].join('\n'),
  );
  await symlink(dshBridgePackageRoot, join(nekoNamespaceDir, 'dsh-bridge'), 'dir');
  await symlink(
    join(fixtureRoot, 'prompt-provider'),
    join(q0NamespaceDir, 'dsh-q0-prompt-provider'),
    'dir',
  );
  return profileDir;
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

function createIsolatedEnvironment(dshHome, additionalEnvironment = {}) {
  const environment = {
    DSH_HOME: dshHome,
    DSH_TELEMETRY_DISABLED: '1',
    HOME: dshHome,
  };
  for (const key of ['PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'SystemRoot', 'ComSpec', 'PATHEXT']) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  Object.assign(environment, additionalEnvironment);
  return environment;
}

async function waitFor(predicate, message) {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function stopChild(child, exitPromise) {
  child.stdin.end();
  child.kill('SIGTERM');
  const timeout = new Promise((_, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`DSH ACP subprocess did not exit within ${shutdownTimeoutMs}ms`)),
      shutdownTimeoutMs,
    );
    timer.unref();
  });
  const result = await Promise.race([exitPromise, timeout]);
  if (result.code !== 0 || result.signal !== null) {
    throw new Error(
      `DSH ACP subprocess exited abnormally: code=${String(result.code)} signal=${String(result.signal)}`,
    );
  }
}

async function startBridge(
  dshHome,
  dshBin,
  client,
  selectedProfile = profileName,
  additionalEnvironment = {},
) {
  const purity = createJsonRpcPurityInspector();
  let stderr = '';
  let stderrReported = false;
  const child = spawn(process.execPath, [dshBin, '--profile', selectedProfile], {
    cwd: fixtureRoot,
    env: createIsolatedEnvironment(dshHome, additionalEnvironment),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const exitPromise = waitForExit(child);
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  void exitPromise.then((result) => {
    if ((result.code !== 0 || result.signal !== null) && stderr.length > 0) {
      process.stderr.write(`[${selectedProfile}]\n${stderr}`);
      stderrReported = true;
    }
  }, () => undefined);
  const inspectedStdout = new PassThrough();
  child.stdout.on('data', (chunk) => purity.push(chunk));
  child.stdout.pipe(inspectedStdout);
  const stream = ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(inspectedStdout));
  const connection = new ClientSideConnection(() => client, stream);
  const connectionClosed = captureOutcome(connection.closed);
  const initializeResponse = await connection.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientCapabilities: {},
  });
  assertQualifiedCapabilities(initializeResponse);
  return {
    child,
    connection,
    connectionClosed,
    exitPromise,
    initializeResponse,
    finishPurity: () => purity.finish(),
    readStderr: () => stderr,
    hasReportedStderr: () => stderrReported,
  };
}

async function qualify() {
  await assertExactPackageVersions(resolvePackageJson);
  const dshHome = await mkdtemp(join(tmpdir(), 'openneko-dsh-q0-'));
  const processes = [];

  try {
    await createIsolatedProfile(dshHome);
    await createW2Profile(dshHome);
    await createPromptAdmissionProfile(dshHome);
    const dshPackageJsonPath = resolvePackageJson('@deepseek-ai/dsh');
    const dshManifest = JSON.parse(await readFile(dshPackageJsonPath, 'utf8'));
    if (typeof dshManifest.bin?.dsh !== 'string') {
      throw new Error('@deepseek-ai/dsh does not publish the expected dsh executable');
    }
    const dshBin = join(dirname(dshPackageJsonPath), dshManifest.bin.dsh);
    const firstClient = new QualificationClient();
    const first = await startBridge(dshHome, dshBin, firstClient);
    processes.push(first);
    const session = await first.connection.newSession({
      cwd: fixtureRoot,
      mcpServers: [],
    });
    if (typeof session.sessionId !== 'string' || session.sessionId.length === 0) {
      throw new Error('DSH ACP returned an invalid fresh session identity');
    }
    const initialInbox = await first.connection.extMethod('openneko/session/inbox/read', {
      sessionId: session.sessionId,
    });
    const initialMessage = initialInbox.nextTurn?.[0];
    if (
      initialInbox.nextTurn?.length !== 1 ||
      initialInbox.nextStep?.length !== 0 ||
      typeof initialMessage?.messageId !== 'string'
    ) {
      throw new Error('OpenNeko DSH bridge returned an invalid initial inbox snapshot');
    }
    const replacedInbox = await first.connection.extMethod('openneko/session/inbox/replace', {
      sessionId: session.sessionId,
      messageId: initialMessage.messageId,
      content: [{ type: 'text', text: 'Replaced deterministic inbox message' }],
    });
    const replacementMessage = replacedInbox.nextTurn?.[0];
    if (
      replacedInbox.nextTurn?.length !== 1 ||
      replacementMessage?.messageId === initialMessage.messageId ||
      replacementMessage?.content?.[0]?.text !== 'Replaced deterministic inbox message'
    ) {
      throw new Error('OpenNeko DSH bridge did not replace the exact inbox message');
    }
    await waitFor(
      () =>
        firstClient.updates.some((item) => item.update?.sessionUpdate === 'tool_call') &&
        firstClient.updates.some((item) => item.update?.sessionUpdate === 'tool_call_update'),
      'OpenNeko DSH bridge did not project live Tool events',
    );
    await waitFor(
      () => firstClient.domainToolRequests.length === 3,
      `OpenNeko DSH bridge did not complete three reverse Host Tool requests; received ${firstClient.domainToolRequests.map((request) => request.operation).join(',')}`,
    );
    const firstReverseRequests = firstClient.domainToolRequests;
    if (
      firstReverseRequests.map((request) => request.operation).join(',') !==
        'succeed,fail,succeed' ||
      firstReverseRequests.some(
        (request) =>
          request.sessionId !== session.sessionId ||
          request.turn !== 0 ||
          request.tool !== 'openneko.q0-host-tool' ||
          typeof request.toolCallId !== 'string',
      )
    ) {
      throw new Error('OpenNeko DSH bridge lost exact reverse Host Tool identity');
    }
    await waitFor(
      () =>
        firstClient.domainToolRequests.some((request) => request.operation === 'cancel-pending') &&
        firstClient.cancelRequests.length === 1,
      'OpenNeko DSH bridge did not send the exact reverse Host Tool cancel extension',
    );
    const pendingExecute = firstClient.domainToolRequests.find(
      (request) => request.operation === 'cancel-pending',
    );
    const pendingCancel = firstClient.cancelRequests[0];
    if (
      pendingExecute === undefined ||
      pendingCancel === undefined ||
      pendingCancel.sessionId !== pendingExecute.sessionId ||
      pendingCancel.turn !== pendingExecute.turn ||
      pendingCancel.toolCallId !== pendingExecute.toolCallId
    ) {
      throw new Error('OpenNeko DSH bridge lost exact cancellation identity');
    }
    const pending = firstClient.pendingCancellations.get(pendingExecute.toolCallId);
    if (pending === undefined) {
      throw new Error('OpenNeko DSH Host did not retain the pending cancel-pending call');
    }
    pending.resolve({
      outcome: 'success',
      result: { accepted: false, value: 'late-after-cancel' },
      jobId: `job-${pendingExecute.toolCallId}`,
    });

    await waitFor(
      () => firstClient.domainToolRequests.length === 6,
      'OpenNeko DSH bridge did not complete cancellation, oversize, and later-success requests',
    );
    await waitFor(
      () =>
        firstClient.updates
          .filter((item) => String(item.update?.toolCallId ?? '').startsWith('q0-host-'))
          .filter((item) => item.update?.sessionUpdate === 'tool_call_update').length === 7,
      'OpenNeko DSH bridge did not project all seven Host Tool status updates',
    );
    const reverseRequests = firstClient.domainToolRequests;
    if (
      reverseRequests.map((request) => request.operation).join(',') !==
        'succeed,fail,succeed,cancel-pending,oversize-output,succeed' ||
      reverseRequests.some(
        (request) =>
          request.sessionId !== session.sessionId ||
          request.turn !== 0 ||
          request.tool !== 'openneko.q0-host-tool' ||
          typeof request.toolCallId !== 'string',
      )
    ) {
      throw new Error('OpenNeko DSH bridge lost exact reverse Host Tool identity or ordering');
    }
    if (reverseRequests.some((request) => request.operation === 'oversize-input')) {
      throw new Error('OpenNeko DSH bridge forwarded an oversize request to the Host');
    }
    const hostToolStatuses = firstClient.updates
      .filter((item) => String(item.update?.toolCallId ?? '').startsWith('q0-host-'))
      .filter((item) => item.update?.sessionUpdate === 'tool_call_update')
      .map((item) => item.update.status);
    if (
      hostToolStatuses.join(',') !== 'completed,failed,completed,failed,failed,failed,completed'
    ) {
      throw new Error(
        `OpenNeko DSH Host Tool results were not fail-local after cancellation and payload bounds: ${hostToolStatuses.join(',')}`,
      );
    }
    const removedInbox = await first.connection.extMethod('openneko/session/inbox/remove', {
      sessionId: session.sessionId,
      messageId: replacementMessage.messageId,
    });
    if (removedInbox.nextTurn?.length !== 0 || removedInbox.nextStep?.length !== 0) {
      throw new Error('OpenNeko DSH bridge did not remove the exact inbox message');
    }
    await first.connection.closeSession({ sessionId: session.sessionId });
    await stopChild(first.child, first.exitPromise);

    const secondClient = new QualificationClient();
    const second = await startBridge(dshHome, dshBin, secondClient);
    processes.push(second);
    const listed = await second.connection.listSessions({ cwd: fixtureRoot });
    if (!listed.sessions.some((item) => item.sessionId === session.sessionId)) {
      throw new Error('OpenNeko DSH bridge did not list the persisted session after restart');
    }
    await second.connection.resumeSession({
      sessionId: session.sessionId,
      cwd: fixtureRoot,
      mcpServers: [],
    });
    if (secondClient.updates.length !== 0 || secondClient.events.length !== 0) {
      throw new Error('session/resume unexpectedly replayed history');
    }
    const recoveredInbox = await second.connection.extMethod('openneko/session/inbox/read', {
      sessionId: session.sessionId,
    });
    if (recoveredInbox.nextTurn?.length !== 0 || recoveredInbox.nextStep?.length !== 0) {
      throw new Error('OpenNeko DSH bridge did not recover the removed inbox state');
    }
    await second.connection.closeSession({ sessionId: session.sessionId });
    await stopChild(second.child, second.exitPromise);

    const thirdClient = new QualificationClient();
    const third = await startBridge(dshHome, dshBin, thirdClient);
    processes.push(third);
    await third.connection.loadSession({
      sessionId: session.sessionId,
      cwd: fixtureRoot,
      mcpServers: [],
    });
    if (!thirdClient.updates.some((item) => item.update?.sessionUpdate === 'user_message_chunk')) {
      throw new Error(
        'OpenNeko DSH bridge did not replay committed history through session/update',
      );
    }
    if (
      !thirdClient.updates.some((item) => item.update?.sessionUpdate === 'tool_call') ||
      !thirdClient.updates.some((item) => item.update?.sessionUpdate === 'tool_call_update')
    ) {
      throw new Error('OpenNeko DSH bridge did not replay Tool progress through session/update');
    }
    if (!thirdClient.events.some((item) => item.sessionId === session.sessionId)) {
      throw new Error('OpenNeko DSH bridge did not replay exact session events');
    }
    const finalInbox = await third.connection.extMethod('openneko/session/inbox/read', {
      sessionId: session.sessionId,
    });
    if (finalInbox.nextTurn?.length !== 0 || finalInbox.nextStep?.length !== 0) {
      throw new Error('OpenNeko DSH bridge did not recover the removed inbox state');
    }
    await third.connection.closeSession({ sessionId: session.sessionId });
    await stopChild(third.child, third.exitPromise);

    const w2Client = new QualificationClient();
    const w2 = await startBridge(dshHome, dshBin, w2Client, w2ProfileName);
    processes.push(w2);
    const w2Session = await w2.connection.newSession({
      cwd: fixtureRoot,
      mcpServers: [],
    });
    await waitFor(
      () => w2Client.domainToolRequests.length === 2,
      'OpenNeko W2 profile did not execute both domain Tools',
    );
    const generationRequest = w2Client.domainToolRequests[0];
    const canvasRequest = w2Client.domainToolRequests[1];
    if (
      generationRequest?.tool !== 'openneko.generation' ||
      generationRequest.operation !== 'describe' ||
      generationRequest.input?.jobId !== 'w2-job' ||
      canvasRequest?.tool !== 'openneko.canvas' ||
      canvasRequest.operation !== 'query' ||
      canvasRequest.input?.documentPath !== 'boards/w2.nkc' ||
      generationRequest.sessionId !== w2Session.sessionId ||
      canvasRequest.sessionId !== w2Session.sessionId ||
      typeof generationRequest.toolCallId !== 'string' ||
      typeof canvasRequest.toolCallId !== 'string'
    ) {
      throw new Error('OpenNeko W2 profile did not preserve domain Tool identities');
    }
    await w2.connection.closeSession({ sessionId: w2Session.sessionId });
    await stopChild(w2.child, w2.exitPromise);

    const promptObservationsPath = join(dshHome, 'prompt-observations.jsonl');
    const promptReleasesPath = join(dshHome, 'prompt-releases.txt');
    await writeFile(promptObservationsPath, '');
    await writeFile(promptReleasesPath, '');
    const promptClient = new QualificationClient();
    const promptBridge = await startBridge(
      dshHome,
      dshBin,
      promptClient,
      promptAdmissionProfileName,
      {
        DSH_Q0_PROMPT_OBSERVATIONS: promptObservationsPath,
        DSH_Q0_PROMPT_RELEASES: promptReleasesPath,
      },
    );
    processes.push(promptBridge);
    const promptSessions = await Promise.all(
      Array.from({ length: 5 }, () =>
        promptBridge.connection.newSession({ cwd: fixtureRoot, mcpServers: [] }),
      ),
    );
    const [firstPromptSession, secondPromptSession, thirdPromptSession, fourthPromptSession, cancelledPromptSession] =
      promptSessions;
    if (
      firstPromptSession === undefined ||
      secondPromptSession === undefined ||
      thirdPromptSession === undefined ||
      fourthPromptSession === undefined ||
      cancelledPromptSession === undefined
    ) {
      throw new Error('DSH Q0 did not create all Prompt admission Sessions');
    }
    const firstPrompt = captureOutcome(
      promptBridge.connection.prompt({
        sessionId: firstPromptSession.sessionId,
        prompt: [{ type: 'text', text: 'Q0 active prompt one' }],
      }),
    );
    const secondPrompt = captureOutcome(
      promptBridge.connection.prompt({
        sessionId: secondPromptSession.sessionId,
        prompt: [{ type: 'text', text: 'Q0 active prompt two' }],
      }),
    );
    await waitForPromptObservations(
      promptObservationsPath,
      (events) => events.filter((event) => event.kind === 'start').length === 2,
      'DSH ACP did not start exactly two active standard Prompts',
    );
    const thirdPrompt = captureOutcome(
      promptBridge.connection.prompt({
        sessionId: thirdPromptSession.sessionId,
        prompt: [{ type: 'text', text: 'Q0 queued prompt one' }],
      }),
    );
    const fourthPrompt = captureOutcome(
      promptBridge.connection.prompt({
        sessionId: fourthPromptSession.sessionId,
        prompt: [{ type: 'text', text: 'Q0 queued prompt two' }],
      }),
    );
    const cancelledPromptResult = captureOutcome(
      promptBridge.connection.prompt({
        sessionId: cancelledPromptSession.sessionId,
        prompt: [{ type: 'text', text: 'Q0 queued prompt cancelled' }],
      }),
    );
    await promptBridge.connection.cancel({ sessionId: cancelledPromptSession.sessionId });
    const cancelledResult = await cancelledPromptResult;
    if (
      cancelledResult.outcome !== 'rejected' ||
      !(cancelledResult.error instanceof Error)
    ) {
      throw new Error('Queued standard ACP Prompt cancellation did not fail visibly');
    }
    let promptObservations = await readPromptObservations(promptObservationsPath);
    if (promptObservations.filter((event) => event.kind === 'start').length !== 2) {
      throw new Error('A queued standard ACP Prompt entered DSH before an active slot was released');
    }

    await appendFile(promptReleasesPath, `${firstPromptSession.sessionId}\n`);
    await waitForPromptObservations(
      promptObservationsPath,
      (events) =>
        events.some(
          (event) => event.kind === 'start' && event.sessionId === thirdPromptSession.sessionId,
        ),
      'The first queued standard ACP Prompt did not enter after a slot was released',
    );
    await appendFile(promptReleasesPath, `${thirdPromptSession.sessionId}\n`);
    await waitForPromptObservations(
      promptObservationsPath,
      (events) =>
        events.some(
          (event) => event.kind === 'start' && event.sessionId === fourthPromptSession.sessionId,
        ),
      'The second queued standard ACP Prompt did not enter in FIFO order',
    );
    await appendFile(
      promptReleasesPath,
      `${fourthPromptSession.sessionId}\n${secondPromptSession.sessionId}\n`,
    );
    const promptOutcomes = await Promise.all([firstPrompt, secondPrompt, thirdPrompt, fourthPrompt]);
    if (
      promptOutcomes.some(
        (outcome) => outcome.outcome !== 'resolved' || outcome.value.stopReason !== 'end_turn',
      )
    ) {
      throw new Error('A qualified standard ACP Prompt did not reach end_turn');
    }
    promptObservations = await readPromptObservations(promptObservationsPath);
    assertPromptAdmissionObservations(promptObservations, {
      active: [firstPromptSession.sessionId, secondPromptSession.sessionId],
      queued: [thirdPromptSession.sessionId, fourthPromptSession.sessionId],
      cancelled: cancelledPromptSession.sessionId,
    });
    for (const promptSession of promptSessions) {
      await promptBridge.connection.closeSession({ sessionId: promptSession.sessionId });
    }
    await stopChild(promptBridge.child, promptBridge.exitPromise);

    const messageCount = processes.reduce((total, process) => total + process.finishPurity(), 0);
    process.stdout.write(
      `${JSON.stringify({
        qualified: true,
        dsh: '0.1.0-rc.7',
        acp: '0.25.1',
        protocolVersion: third.initializeResponse.protocolVersion,
        sessionId: 'redacted',
        jsonRpcMessages: messageCount,
        sessionRecovery: true,
        historyReplay: true,
        toolProgress: true,
        inboxReadReplaceRemove: true,
        reverseHostTools: true,
        reverseHostToolFailLocal: true,
        reverseHostToolCancellation: true,
        reverseHostToolLateResultIsolation: true,
        reverseHostToolOversizeInputRejected: true,
        reverseHostToolOversizeOutputRejected: true,
        reverseHostToolSuccessAfterCancellation: true,
        standardPromptConcurrentAdmission: true,
        standardPromptFifoAdmission: true,
        standardPromptQueuedCancellation: true,
        generationDomainTool: true,
        canvasDomainTool: true,
        processRestarts: 3,
        providerContacted: false,
        isolatedDshHome: true,
      })}\n`,
    );
  } catch (error) {
    for (const process of processes) {
      if (process.child.exitCode === null && process.child.signalCode === null) {
        process.child.kill('SIGKILL');
        await process.exitPromise.catch(() => undefined);
      }
      const stderr = process.readStderr();
      if (stderr.length > 0 && !process.hasReportedStderr()) globalThis.process.stderr.write(stderr);
    }
    throw error;
  } finally {
    await rm(dshHome, { recursive: true, force: true });
  }
}

async function readPromptObservations(path) {
  const source = await readFile(path, 'utf8');
  return source
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

async function waitForPromptObservations(path, predicate, message) {
  const deadline = Date.now() + 5_000;
  while (true) {
    const events = await readPromptObservations(path);
    if (predicate(events)) return;
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function assertPromptAdmissionObservations(events, expected) {
  const starts = events.filter((event) => event.kind === 'start');
  const ends = events.filter((event) => event.kind === 'end');
  const firstTwo = new Set(starts.slice(0, 2).map((event) => event.sessionId));
  if (
    starts.length !== 4 ||
    ends.length !== 4 ||
    firstTwo.size !== 2 ||
    expected.active.some((sessionId) => !firstTwo.has(sessionId)) ||
    starts[2]?.sessionId !== expected.queued[0] ||
    starts[3]?.sessionId !== expected.queued[1] ||
    starts.some((event) => event.sessionId === expected.cancelled) ||
    Math.max(...events.map((event) => event.active)) !== 2 ||
    events.at(-1)?.active !== 0
  ) {
    throw new Error('Standard ACP Prompt subprocess admission observations were invalid');
  }
}

function captureOutcome(promise) {
  return promise.then(
    (value) => ({ outcome: 'resolved', value }),
    (error) => ({ outcome: 'rejected', error }),
  );
}

await qualify();
