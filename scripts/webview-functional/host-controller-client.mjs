import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

class HostControllerClient {
  constructor(connection, options = {}) {
    this.connection = connection;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10000;
  }

  async execute(action, payload) {
    return this.#request('/execute', { action, payload });
  }

  async readObservations() {
    const result = await this.#request('/observations', {});
    return result.observations;
  }

  async #request(path, body) {
    const response = await fetch(`http://127.0.0.1:${this.connection.port}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.connection.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });
    const result = await response.json();
    if (!response.ok || result.ok !== true) {
      throw new Error(result.error ?? `Host controller failed with HTTP ${response.status}`);
    }
    return result.value ?? result;
  }
}

export async function waitForHostController(connectionFile, token, timeoutMs, options = {}) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const connection = JSON.parse(await readFile(connectionFile, 'utf8'));
      if (!isControllerConnectionForRun(connection, token, options.excludePid)) {
        throw new Error('Host controller connection file does not match this run');
      }
      const client = new HostControllerClient(connection);
      await client.execute('ping', {});
      return client;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for host controller: ${lastError?.message ?? 'not ready'}`);
}

export function isControllerConnectionForRun(connection, token, excludePid) {
  return Boolean(
    connection &&
      (token === undefined || connection.token === token) &&
      typeof connection.token === 'string' &&
      connection.token.length > 0 &&
      Number.isInteger(connection.port) &&
      Number.isInteger(connection.pid) &&
      connection.pid !== excludePid,
  );
}
