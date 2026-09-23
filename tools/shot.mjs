// Zero-dependency headless-Chrome harness: loads a URL, collects console output and uncaught
// exceptions, optionally holds keys down, and writes a PNG screenshot.
//
//   node shot.mjs --url=http://127.0.0.1:8080/?debug=1 --out=a.png --wait=2500 --hold=KeyD,KeyS

import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=') || true];
  })
);

const URL_ = args.url || 'http://127.0.0.1:8080/';
const OUT = args.out || 'shot.png';
const WAIT = Number(args.wait || 2000);
const PORT = Number(args.port || 9333);
const W = Number(args.width || 1280);
const H = Number(args.height || 800);
const HOLD = args.hold ? String(args.hold).split(',').filter(Boolean) : [];
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const VK = { KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68, Space: 32, Escape: 27, Enter: 13,
             KeyP: 80, KeyK: 75, F1: 112, F2: 113, ArrowLeft: 37, ArrowUp: 38,
             ArrowRight: 39, ArrowDown: 40 };
const KEYCHAR = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', Space: ' ', KeyP: 'p', KeyK: 'k' };

const profile = mkdtempSync(join(tmpdir(), 'cdp-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`,
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  // Synthetic key events are not trusted user gestures, so an AudioContext stays suspended
  // unless the policy is relaxed. Only used for testing audio; real play unlocks on a real key.
  ...(args.audio ? ['--autoplay-policy=no-user-gesture-required'] : ['--mute-audio']),
  ...(args.dpr ? [`--force-device-scale-factor=${args.dpr}`] : []),
  '--disable-extensions', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  ...(args.gpu
    ? ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(100);
  }
  throw new Error('Chrome DevTools endpoint never came up');
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (p) { this.pending.delete(msg.id); msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result); }
      } else {
        for (const h of this.handlers) h(msg);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  on(fn) { this.handlers.push(fn); }
}

const logs = [];
const errors = [];

function fmtArg(a) {
  if (a.value !== undefined) return String(a.value);
  if (a.description) return a.description;
  if (a.preview?.properties) return `{${a.preview.properties.map((p) => `${p.name}: ${p.value}`).join(', ')}}`;
  return a.type;
}

try {
  const wsUrl = await findTarget();
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const cdp = new CDP(ws);

  cdp.on((msg) => {
    if (msg.method === 'Runtime.consoleAPICalled') {
      logs.push(`[${msg.params.type}] ${msg.params.args.map(fmtArg).join(' ')}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      const where = d.url ? ` (${d.url.split('/').pop()}:${d.lineNumber + 1}:${d.columnNumber + 1})` : '';
      errors.push(`${d.exception?.description || d.text}${where}`);
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error') errors.push(`[${e.source}] ${e.text} ${e.url || ''}`);
      else logs.push(`[${e.level}] ${e.text}`);
    }
  });

  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');

  const loaded = new Promise((r) => {
    cdp.on((m) => { if (m.method === 'Page.loadEventFired') r(); });
  });
  await cdp.send('Page.navigate', { url: URL_ });
  await Promise.race([loaded, sleep(10000)]);

  for (const k of HOLD) {
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown', code: k, key: KEYCHAR[k] || k,
      windowsVirtualKeyCode: VK[k] || 0, nativeVirtualKeyCode: VK[k] || 0,
    });
  }

  // Wait for the game's own ready flag. Boot is async (asset decode), so Page.loadEventFired is
  // NOT a reliable signal that window.__dbg exists.
  for (let i = 0; i < 100; i++) {
    const r = await cdp.send('Runtime.evaluate', { expression: 'window.__booted === true', returnByValue: true });
    if (r.result && r.result.value) break;
    await sleep(50);
  }

  if (args.pre) {
    await cdp.send('Runtime.evaluate', { expression: String(args.pre), returnByValue: true, awaitPromise: true });
  }

  await sleep(WAIT);

  for (const k of HOLD) {
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp', code: k, key: KEYCHAR[k] || k,
      windowsVirtualKeyCode: VK[k] || 0, nativeVirtualKeyCode: VK[k] || 0,
    });
  }

  if (args.eval) {
    const r = await cdp.send('Runtime.evaluate', { expression: String(args.eval), returnByValue: true, awaitPromise: true });
    console.log('EVAL:', JSON.stringify(r.result?.value ?? r.result?.description ?? null));
  }

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log(`SCREENSHOT: ${OUT}`);
} catch (e) {
  errors.push(`HARNESS: ${e.message}`);
} finally {
  if (logs.length) console.log('--- console ---\n' + logs.join('\n'));
  console.log(errors.length ? `--- ERRORS (${errors.length}) ---\n` + errors.join('\n') : '--- no errors ---');
  chrome.kill();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(errors.length ? 1 : 0);
}
