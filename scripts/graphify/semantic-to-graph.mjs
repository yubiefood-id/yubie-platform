import fs from 'node:fs';
import crypto from 'node:crypto';
import { PATHS } from './lib/paths.mjs';
import { loadAllCachedExtractions } from './semantic-cache.mjs';

function nodeId(prefix, parts) {
  const raw = `${prefix}:${parts.join(':')}`;
  return raw.replace(/[^a-zA-Z0-9_:/.-]/g, '_').slice(0, 180);
}

function slug(label) {
  return label.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80);
}

export function buildSemanticGraphFromCache() {
  const entries = loadAllCachedExtractions();
  const nodes = [];
  const links = [];
  const seenNodes = new Set();

  const addNode = (id, label, meta) => {
    if (seenNodes.has(id)) return id;
    seenNodes.add(id);
    nodes.push({
      id,
      label,
      norm_label: label.toLowerCase(),
      source_file: meta.source_file,
      source_location: meta.source_location ?? 'L1',
      _origin: 'semantic',
      community: meta.community ?? 'semantic',
      community_name: meta.community ?? 'semantic',
      file_type: 'semantic',
      provenance: meta.provenance,
    });
    return id;
  };

  for (const entry of entries) {
    const doc = entry.extraction;
    const docId = addNode(nodeId('doc', [entry.path]), entry.path, {
      source_file: entry.path,
      community: doc.document_type,
      provenance: {
        content_sha256: entry.content_sha256,
        provider: entry.provider,
        indexed_at: entry.last_semantic_indexed_at,
      },
    });

    const entityIds = new Map();
    for (const entity of doc.entities ?? []) {
      const id = addNode(nodeId('entity', [entry.path, entity.name]), entity.name, {
        source_file: entry.path,
        community: doc.document_type,
        provenance: { entity_type: entity.type, content_sha256: entry.content_sha256 },
      });
      entityIds.set(entity.name, id);
      links.push({
        source: docId,
        target: id,
        relation: 'documents',
        context: 'semantic',
        confidence: 'INFERRED',
        source_file: entry.path,
        _origin: 'semantic',
      });
    }

    for (const rel of doc.relationships ?? []) {
      const src = entityIds.get(rel.source) ?? addNode(nodeId('entity', [entry.path, rel.source]), rel.source, {
        source_file: entry.path,
        community: doc.document_type,
        provenance: { content_sha256: entry.content_sha256 },
      });
      const tgt = entityIds.get(rel.target) ?? addNode(nodeId('entity', [entry.path, rel.target]), rel.target, {
        source_file: entry.path,
        community: doc.document_type,
        provenance: { content_sha256: entry.content_sha256 },
      });
      links.push({
        source: src,
        target: tgt,
        relation: rel.relationship,
        context: 'semantic',
        confidence: 'INFERRED',
        source_file: entry.path,
        evidence: rel.evidence,
        _origin: 'semantic',
      });
    }

    for (const ref of doc.code_references ?? []) {
      const refId = addNode(nodeId('code_ref', [entry.path, ref]), ref, {
        source_file: entry.path,
        community: 'code_reference',
        provenance: { content_sha256: entry.content_sha256 },
      });
      links.push({
        source: docId,
        target: refId,
        relation: 'references',
        context: 'semantic',
        confidence: 'INFERRED',
        source_file: entry.path,
        _origin: 'semantic',
      });
    }
  }

  return {
    directed: true,
    multigraph: false,
    graph: {},
    nodes,
    links,
    hyperedges: [],
    built_at_commit: '',
    _origin: 'yubie-semantic',
  };
}

export function rebuildSemanticGraph() {
  const graph = buildSemanticGraphFromCache();
  fs.mkdirSync(PATHS.graphifyOut, { recursive: true });
  const tmp = `${PATHS.semanticGraph}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(graph, null, 2)}\n`);
  fs.renameSync(tmp, PATHS.semanticGraph);
  return graph;
}
