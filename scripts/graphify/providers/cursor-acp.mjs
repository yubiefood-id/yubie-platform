import { spawn } from 'node:child_process';
import readline from 'node:readline';

const DEFAULT_TIMEOUT_MS = 180_000;

export class CursorAcpSemanticProvider {
  constructor({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.name = 'acp';
    this.timeoutMs = timeoutMs;
    this.child = null;
    this.nextId = 1;
    this.pending = new Map();
    this.chunks = [];
  }

  async isAvailable() {
    return new Promise((resolve) => {
      const child = spawn('agent', ['acp'], { stdio: ['pipe', 'pipe', 'pipe'] });
      let settled = false;
      const done = (ok) => {
        if (!settled) {
          settled = true;
          child.kill();
          resolve(ok);
        }
      };
      child.on('error', () => done(false));
      setTimeout(() => done(true), 500);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    this.child.stdin.write(`${msg}\n`);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  handleLine(line) {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }

    if (msg.method === 'session/update') {
      const update = msg.params?.update;
      if (update?.sessionUpdate === 'agent_message_chunk' && update?.content?.text) {
        this.chunks.push(update.content.text);
      }
      return;
    }

    if (msg.method === 'session/request_permission') {
      const id = msg.id;
      const response = {
        jsonrpc: '2.0',
        id,
        result: { outcome: { outcome: 'denied' } },
      };
      this.child.stdin.write(`${JSON.stringify(response)}\n`);
      return;
    }

    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  }

  async extract(prompt) {
    this.chunks = [];
    this.child = spawn('agent', ['acp'], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    const rl = readline.createInterface({ input: this.child.stdout });
    rl.on('line', (line) => this.handleLine(line));

    const timer = setTimeout(() => {
      this.child?.kill('SIGTERM');
    }, this.timeoutMs);

    try {
      await this.send('initialize', {
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
        clientInfo: { name: 'yubie-graphify', version: '1.0.0' },
      });

      await this.send('authenticate', { methodId: 'cursor_login' });
      const { sessionId } = await this.send('session/new', {
        cwd: process.cwd(),
        mcpServers: [],
      });

      this.chunks = [];
      await this.send('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: prompt }],
      });

      clearTimeout(timer);
      return { stdout: this.chunks.join(''), stderr: '', provider: this.name };
    } catch (err) {
      clearTimeout(timer);
      throw err;
    } finally {
      this.child?.kill();
      this.child = null;
      rl.close();
    }
  }
}
