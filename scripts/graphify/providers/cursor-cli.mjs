import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 120_000;

export class CursorCliSemanticProvider {
  constructor({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.name = 'cli';
    this.timeoutMs = timeoutMs;
  }

  async isAvailable() {
    return new Promise((resolve) => {
      const child = spawn('agent', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
    });
  }

  async extract(prompt) {
    return new Promise((resolve, reject) => {
      const args = ['--print', '--mode', 'ask', '--output-format', 'json', '-p', prompt];
      const child = spawn('agent', args, {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Cursor CLI semantic extraction timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      child.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`Cursor CLI exited ${code}: ${stderr || stdout}`));
          return;
        }
        resolve({ stdout, stderr, provider: this.name });
      });
    });
  }
}
