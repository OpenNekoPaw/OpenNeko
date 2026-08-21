import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  assertExactPackageVersions,
  assertQualifiedCapabilities,
  createJsonRpcPurityInspector,
} from './qualification-core.mjs'

test('qualification pins every direct protocol and DSH runtime dependency', async () => {
  const root = await mkdtemp(join(tmpdir(), 'openneko-dsh-q0-versions-'))
  const expected = new Map([
    ['@agentclientprotocol/sdk', '0.25.1'],
    ['@deepseek-ai/dsh', '0.1.0-rc.8'],
    ['@deepseek-ai/dsh-base', '0.1.0-rc.8'],
    ['@deepseek-ai/dsh-headless', '0.1.0-rc.8'],
    ['@deepseek-ai/dsh-llm', '0.1.0-rc.8'],
  ])
  const manifests = new Map()
  const resolved = []

  try {
    for (const [packageName, packageRelease] of expected) {
      const path = join(root, `${manifests.size}.json`)
      await writeFile(path, JSON.stringify({ name: packageName, version: packageRelease }))
      manifests.set(packageName, path)
    }
    await assertExactPackageVersions((packageName) => {
      resolved.push(packageName)
      const path = manifests.get(packageName)
      if (path === undefined) throw new Error(`Unexpected package ${packageName}`)
      return path
    })

    assert.deepEqual(resolved, [...expected.keys()])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('stdout purity accepts newline-delimited JSON-RPC only', () => {
  const inspector = createJsonRpcPurityInspector()
  inspector.push(Buffer.from('{"jsonrpc":"2.0","id":1,'))
  inspector.push(Buffer.from('"result":{}}\n'))
  assert.equal(inspector.finish(), 1)
})

test('stdout purity rejects ordinary process logs', () => {
  const inspector = createJsonRpcPurityInspector()
  assert.throws(
    () => inspector.push(Buffer.from('server ready\n')),
    /stdout contained a non-JSON line/,
  )
})

test('qualification requires the complete recovery capability set', () => {
  assert.throws(
    () =>
      assertQualifiedCapabilities({
        protocolVersion: 1,
        agentCapabilities: { loadSession: true, sessionCapabilities: { list: {} } },
      }),
    /did not advertise session\/resume/,
  )
})
