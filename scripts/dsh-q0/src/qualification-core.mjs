import { readFile } from 'node:fs/promises'

const expectedVersions = Object.freeze({
  '@agentclientprotocol/sdk': '0.25.1',
  '@deepseek-ai/dsh': '0.1.1-rc.2',
  '@deepseek-ai/dsh-base': '0.1.1-rc.2',
  '@deepseek-ai/dsh-headless': '0.1.1-rc.2',
  '@deepseek-ai/dsh-llm': '0.1.1-rc.2',
  '@deepseek-ai/dsh-tools': '0.1.1-rc.2',
})

export async function assertExactPackageVersions(resolvePackageJson) {
  for (const [packageName, expectedVersion] of Object.entries(expectedVersions)) {
    const packageJsonPath = resolvePackageJson(packageName)
    const manifest = JSON.parse(await readFile(packageJsonPath, 'utf8'))
    if (manifest.name !== packageName || manifest.version !== expectedVersion) {
      throw new Error(
        `DSH Q0 expected ${packageName}@${expectedVersion}, received ${String(manifest.name)}@${String(manifest.version)}`,
      )
    }
  }
}

export function createJsonRpcPurityInspector() {
  let buffered = ''
  let messageCount = 0

  const inspectLine = (line) => {
    if (line.length === 0) return
    let message
    try {
      message = JSON.parse(line)
    } catch (error) {
      throw new Error(`DSH ACP stdout contained a non-JSON line: ${JSON.stringify(line)}`, {
        cause: error,
      })
    }
    if (
      message === null ||
      typeof message !== 'object' ||
      Array.isArray(message) ||
      message.jsonrpc !== '2.0'
    ) {
      throw new Error(`DSH ACP stdout contained a non-JSON-RPC message: ${line}`)
    }
    messageCount += 1
  }

  return {
    push(chunk) {
      buffered += chunk.toString('utf8')
      const lines = buffered.split('\n')
      buffered = lines.pop() ?? ''
      for (const line of lines) inspectLine(line)
    },
    finish() {
      if (buffered.length > 0) inspectLine(buffered)
      if (messageCount === 0) {
        throw new Error('DSH ACP stdout produced no JSON-RPC messages')
      }
      return messageCount
    },
  }
}

export function assertQualifiedCapabilities(response) {
  if (response.protocolVersion !== 1) {
    throw new Error(`DSH ACP negotiated unexpected protocol version ${String(response.protocolVersion)}`)
  }
  if (response.agentCapabilities?.loadSession !== true) {
    throw new Error('OpenNeko DSH bridge did not advertise session/load')
  }
  const sessionCapabilities = response.agentCapabilities?.sessionCapabilities
  for (const capability of ['list', 'resume', 'close']) {
    if (sessionCapabilities?.[capability] === undefined || sessionCapabilities[capability] === null) {
      throw new Error(`OpenNeko DSH bridge did not advertise session/${capability}`)
    }
  }
}
