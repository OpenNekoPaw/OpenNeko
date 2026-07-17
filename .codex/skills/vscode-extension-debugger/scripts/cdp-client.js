#!/usr/bin/env node
/**
 * CDP Client - Chrome DevTools Protocol client for VS Code Extension debugging
 *
 * Usage:
 *   node .codex/skills/vscode-extension-debugger/scripts/cdp-client.js <command> [options]
 *
 * Commands:
 *   list                    - List all debug targets
 *   snapshot <targetId>     - Get DOM snapshot of a target
 *   screenshot <targetId>   - Take screenshot (saves to /tmp/vscode-screenshot.png)
 *   eval <targetId> <code>  - Execute JavaScript in target
 *   console <targetId>      - Get console messages
 */

const WebSocket = require('ws');
const fs = require('fs');
const http = require('http');

const DEFAULT_PORT = 9222;
const TIMEOUT = 5000;

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

async function getTargets(port = DEFAULT_PORT) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}/json`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function sendCDPCommand(targetId, method, params = {}, port = DEFAULT_PORT) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/devtools/page/${targetId}`);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Timeout'));
    }, TIMEOUT);

    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 1, method, params }));
    });

    ws.on('message', (data) => {
      clearTimeout(timeout);
      const msg = JSON.parse(data.toString());
      ws.close();
      if (msg.error) {
        reject(new Error(msg.error.message));
      } else {
        resolve(msg.result);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function listTargets() {
  const targets = await getTargets();
  console.log(JSON.stringify(targets.map(t => ({
    id: t.id,
    type: t.type,
    title: t.title,
    url: t.url?.substring(0, 100),
    parentId: t.parentId
  })), null, 2));
}

async function getSnapshot(targetId) {
  // First try to get the active-frame content (for webviews)
  const result = await sendCDPCommand(targetId, 'Runtime.evaluate', {
    expression: `
      (function() {
        const frame = document.getElementById('active-frame');
        if (frame && frame.contentDocument) {
          const doc = frame.contentDocument;
          return JSON.stringify({
            type: 'webview',
            title: doc.title,
            url: location.href,
            bodyText: doc.body?.innerText?.substring(0, 5000) || '',
            elements: Array.from(doc.querySelectorAll('button, input, select, [role], a, [data-testid]'))
              .slice(0, 50)
              .map((el, idx) => ({
                uid: 'el_' + idx,
                tag: el.tagName.toLowerCase(),
                text: el.innerText?.substring(0, 100)?.trim(),
                role: el.getAttribute('role'),
                class: el.className?.substring?.(0, 50),
                id: el.id,
                type: el.type,
                placeholder: el.placeholder
              }))
          });
        } else {
          return JSON.stringify({
            type: 'page',
            title: document.title,
            url: location.href,
            bodyText: document.body?.innerText?.substring(0, 5000) || '',
            elements: Array.from(document.querySelectorAll('button, input, select, [role], a, [data-testid]'))
              .slice(0, 50)
              .map((el, idx) => ({
                uid: 'el_' + idx,
                tag: el.tagName.toLowerCase(),
                text: el.innerText?.substring(0, 100)?.trim(),
                role: el.getAttribute('role'),
                class: el.className?.substring?.(0, 50),
                id: el.id,
                type: el.type,
                placeholder: el.placeholder
              }))
          });
        }
      })()
    `,
    returnByValue: true
  });

  if (result?.result?.value) {
    console.log(result.result.value);
  } else {
    console.log(JSON.stringify({ error: 'Failed to get snapshot' }));
  }
}

async function takeScreenshot(targetId, outputPath = '/tmp/vscode-screenshot.png') {
  const result = await sendCDPCommand(targetId, 'Page.captureScreenshot', {
    format: 'png'
  });

  if (result?.data) {
    const buffer = Buffer.from(result.data, 'base64');
    fs.writeFileSync(outputPath, buffer);
    console.log(JSON.stringify({
      success: true,
      path: outputPath,
      size: buffer.length
    }));
  } else {
    console.log(JSON.stringify({ error: 'Failed to capture screenshot' }));
  }
}

async function evalScript(targetId, code) {
  const result = await sendCDPCommand(targetId, 'Runtime.evaluate', {
    expression: code,
    returnByValue: true
  });

  if (result?.result?.value !== undefined) {
    console.log(JSON.stringify({ result: result.result.value }));
  } else if (result?.result?.description) {
    console.log(JSON.stringify({ result: result.result.description }));
  } else if (result?.exceptionDetails) {
    console.log(JSON.stringify({ error: result.exceptionDetails.text }));
  } else {
    console.log(JSON.stringify({ result: result }));
  }
}

async function getConsoleMessages(targetId) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${DEFAULT_PORT}/devtools/page/${targetId}`);
    const messages = [];
    let msgId = 0;

    const timeout = setTimeout(() => {
      ws.close();
      console.log(JSON.stringify(messages));
      resolve();
    }, 2000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ id: ++msgId, method: 'Runtime.enable' }));
      ws.send(JSON.stringify({ id: ++msgId, method: 'Log.enable' }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.method === 'Runtime.consoleAPICalled') {
        messages.push({
          type: msg.params.type,
          text: msg.params.args.map(a => a.value || a.description).join(' '),
          timestamp: msg.params.timestamp
        });
      } else if (msg.method === 'Log.entryAdded') {
        messages.push({
          type: msg.params.entry.level,
          text: msg.params.entry.text,
          source: msg.params.entry.source
        });
      }
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      console.log(JSON.stringify({ error: 'Connection failed' }));
      resolve();
    });
  });
}

async function main() {
  try {
    switch (command) {
      case 'list':
        await listTargets();
        break;
      case 'snapshot':
        if (!args[1]) {
          console.log(JSON.stringify({ error: 'Target ID required' }));
          process.exit(1);
        }
        await getSnapshot(args[1]);
        break;
      case 'screenshot':
        if (!args[1]) {
          console.log(JSON.stringify({ error: 'Target ID required' }));
          process.exit(1);
        }
        await takeScreenshot(args[1], args[2]);
        break;
      case 'eval':
        if (!args[1] || !args[2]) {
          console.log(JSON.stringify({ error: 'Target ID and code required' }));
          process.exit(1);
        }
        await evalScript(args[1], args.slice(2).join(' '));
        break;
      case 'console':
        if (!args[1]) {
          console.log(JSON.stringify({ error: 'Target ID required' }));
          process.exit(1);
        }
        await getConsoleMessages(args[1]);
        break;
      default:
        console.log(JSON.stringify({
          error: 'Unknown command',
          usage: 'node cdp-client.js <list|snapshot|screenshot|eval|console> [targetId] [options]'
        }));
        process.exit(1);
    }
  } catch (err) {
    console.log(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

main();
