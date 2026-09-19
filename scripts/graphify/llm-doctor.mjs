#!/usr/bin/env node
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './lib/paths.mjs';
import { validateSemanticExtraction, parseCliJsonOutput, buildExtractionPrompt } from './semantic-schema.mjs';
import { contentSha256 } from './semantic-cache.mjs';
import { CursorCliSemanticProvider } from './providers/cursor-cli.mjs';
import { CursorAcpSemanticProvider } from './providers/cursor-acp.mjs';

const FIXTURE = {
  document: 'docs/production/ADR-009_ZAMMAD_SUPPORT_AUTHORITY.md',
  document_type: 'ADR',
  summary: 'Zammad is support operations authority.',
  entities: [{ name: 'Zammad', type: 'system' }],
  relationships: [
    {
      source: 'Zammad',
      relationship: 'declares_authority',
      target: 'support operations',
      evidence: 'Decision section',
    },
  ],
  decisions: [{ decision: 'Zammad owns ticket operations', status: 'Accepted', scope: 'M4-Z', supersedes: [] }],
  constraints: [],
  code_references: ['packages/integrations/src/zammad/'],
  security_boundaries: [],
  data_authorities: ['Zammad'],
  operational_dependencies: [],
};

function check(name, ok, detail = '') {
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`${name.padEnd(18)} ${status}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function main() {
  let allOk = true;

  const cliInstalled = (() => {
    try {
      execSync('agent --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  })();
  allOk = check('Cursor CLI', cliInstalled) && allOk;

  let authOk = false;
  if (cliInstalled) {
    try {
      const out = execSync('agent status', { cwd: REPO_ROOT, encoding: 'utf8' });
      authOk = /logged in|authenticated/i.test(out);
    } catch {
      authOk = false;
    }
  }
  allOk = check('Cursor auth', authOk) && allOk;

  let cliSemantic = false;
  if (cliInstalled && authOk && process.env.GRAPHIFY_LLM_DOCTOR_LIVE === '1') {
    try {
      const provider = new CursorCliSemanticProvider({ timeoutMs: 90_000 });
      const fixturePath = path.join(REPO_ROOT, FIXTURE.document);
      const content = fs.existsSync(fixturePath)
        ? fs.readFileSync(fixturePath, 'utf8').slice(0, 2000)
        : '# ADR-009\nZammad is support authority.';
      const prompt = buildExtractionPrompt(FIXTURE.document, content, contentSha256(content));
      const { stdout } = await provider.extract(prompt);
      const data = parseCliJsonOutput(stdout);
      const v = validateSemanticExtraction({ ...data, document: FIXTURE.document }, { documentPath: FIXTURE.document });
      cliSemantic = v.valid;
    } catch (err) {
      cliSemantic = false;
    }
  } else {
    const v = validateSemanticExtraction(FIXTURE);
    cliSemantic = v.valid;
  }
  allOk = check('CLI semantic', cliSemantic, process.env.GRAPHIFY_LLM_DOCTOR_LIVE === '1' ? 'live' : 'schema fixture') && allOk;

  let acpOk = false;
  if (process.env.GRAPHIFY_LLM_DOCTOR_ACP === '1') {
    try {
      const acp = new CursorAcpSemanticProvider({ timeoutMs: 120_000 });
      acpOk = await acp.isAvailable();
    } catch {
      acpOk = false;
    }
  } else {
    acpOk = cliInstalled;
  }
  allOk = check('ACP fallback', acpOk, process.env.GRAPHIFY_LLM_DOCTOR_ACP === '1' ? 'live' : 'skipped') && allOk;

  let graphifyOk = false;
  try {
    execSync('graphify --version', { stdio: 'pipe' });
    graphifyOk = fs.existsSync(path.join(REPO_ROOT, 'graphify-out/graph.json'));
  } catch {
    graphifyOk = false;
  }
  allOk = check('Graphify', graphifyOk) && allOk;

  process.exit(allOk ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
