const DOCUMENT_TYPES = new Set([
  'ADR',
  'RUNBOOK',
  'ARCHITECTURE',
  'PHASE',
  'PLAN',
  'ACCEPTANCE',
  'OTHER',
]);

const ENTITY_TYPES = new Set([
  'service',
  'package',
  'database',
  'provider',
  'queue',
  'endpoint',
  'policy',
  'decision',
  'phase',
  'system',
]);

const RELATIONSHIPS = new Set([
  'depends_on',
  'owns',
  'calls',
  'replaces',
  'prohibits',
  'supersedes',
  'implements',
  'persists',
  'routes_to',
  'verified_by',
  'declares_authority',
  'defines',
  'delivers_via',
  'prohibited_from_depends_on',
  'references',
]);

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isStringArray(v) {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

export function validateSemanticExtraction(data, { documentPath } = {}) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['root must be an object'] };
  }

  if (documentPath && data.document !== documentPath) {
    errors.push(`document must equal source path (${documentPath})`);
  }
  if (!isNonEmptyString(data.document)) errors.push('document required');
  if (!DOCUMENT_TYPES.has(data.document_type)) errors.push('invalid document_type');
  if (!isNonEmptyString(data.summary)) errors.push('summary required');

  if (!Array.isArray(data.entities)) {
    errors.push('entities must be array');
  } else {
    for (const [i, e] of data.entities.entries()) {
      if (!isNonEmptyString(e?.name)) errors.push(`entities[${i}].name required`);
      if (!ENTITY_TYPES.has(e?.type)) errors.push(`entities[${i}].type invalid`);
    }
  }

  if (!Array.isArray(data.relationships)) {
    errors.push('relationships must be array');
  } else {
    for (const [i, r] of data.relationships.entries()) {
      if (!isNonEmptyString(r?.source)) errors.push(`relationships[${i}].source required`);
      if (!RELATIONSHIPS.has(r?.relationship)) errors.push(`relationships[${i}].relationship invalid`);
      if (!isNonEmptyString(r?.target)) errors.push(`relationships[${i}].target required`);
      if (!isNonEmptyString(r?.evidence)) errors.push(`relationships[${i}].evidence required`);
    }
  }

  for (const field of [
    'decisions',
    'constraints',
    'code_references',
    'security_boundaries',
    'data_authorities',
    'operational_dependencies',
  ]) {
    if (!(field in data)) errors.push(`${field} required`);
  }

  if (!Array.isArray(data.decisions)) errors.push('decisions must be array');
  if (!Array.isArray(data.constraints)) errors.push('constraints must be array');
  if (!isStringArray(data.code_references)) errors.push('code_references must be string array');
  if (!isStringArray(data.security_boundaries)) errors.push('security_boundaries must be string array');
  if (!isStringArray(data.data_authorities)) errors.push('data_authorities must be string array');
  if (!isStringArray(data.operational_dependencies)) errors.push('operational_dependencies must be string array');

  return { valid: errors.length === 0, errors };
}

export function buildExtractionPrompt(documentPath, content, contentSha) {
  return `You are a read-only semantic extraction engine for Yubie engineering documentation.

RULES:
- Extract ONLY facts explicitly supported by the document below.
- Do NOT invent architecture, dependencies, or decisions.
- Every relationship MUST include an evidence string quoting or paraphrasing a specific section.
- Return ONLY valid JSON matching the schema. No markdown fences. No prose outside JSON.

Required JSON schema:
{
  "document": "${documentPath}",
  "document_type": "ADR|RUNBOOK|ARCHITECTURE|PHASE|PLAN|ACCEPTANCE|OTHER",
  "summary": "string",
  "entities": [{"name": "string", "type": "service|package|database|provider|queue|endpoint|policy|decision|phase|system"}],
  "relationships": [{"source": "string", "relationship": "depends_on|owns|calls|replaces|prohibits|supersedes|implements|persists|routes_to|verified_by|declares_authority|defines|delivers_via|prohibited_from_depends_on|references", "target": "string", "evidence": "string"}],
  "decisions": [{"decision": "string", "status": "string", "scope": "string", "supersedes": []}],
  "constraints": [{"rule": "string", "scope": "string", "severity": "required|recommended|informational"}],
  "code_references": ["packages/...", "apps/...", "infrastructure/..."],
  "security_boundaries": ["string"],
  "data_authorities": ["string"],
  "operational_dependencies": ["string"]
}

Document path: ${documentPath}
Content SHA256: ${contentSha}

DOCUMENT:
${content}`;
}

export function buildCorrectionPrompt(documentPath, errors, priorOutput) {
  return `Your previous JSON response was invalid.

Errors:
${errors.map((e) => `- ${e}`).join('\n')}

Prior output:
${priorOutput}

Return ONLY corrected JSON for document "${documentPath}". No markdown fences.`;
}

export function parseCliJsonOutput(stdout) {
  const trimmed = stdout.trim();
  try {
    const envelope = JSON.parse(trimmed);
    if (envelope?.result) {
      const inner = typeof envelope.result === 'string' ? envelope.result.trim() : JSON.stringify(envelope.result);
      const fenced = inner.match(/```(?:json)?\s*([\s\S]*?)```/);
      const payload = fenced ? fenced[1].trim() : inner;
      return JSON.parse(payload);
    }
  } catch {
    // fall through
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(payload);
}
