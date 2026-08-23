/**
 * KnowledgeManager — the Electron-main façade over the file-backed store of the
 * organisation's own documents. Owns ingestion (in-app, over IPC) and exposes
 * the same search the agent CLI uses; agents themselves query out-of-process via
 * `resources/kg.cjs` (see docs/design/knowledge-graph.md).
 *
 * What that search actually is: KEYWORD SCORING OVER TEXT CHUNKS, not entities
 * or a graph — same wording as the README, and it should stay honest.
 *
 * All heavy lifting lives in the pure-JS `kg-core.cjs` sidecar (no native deps),
 * required the same way `slack.ts` requires `slack-trigger.cjs`. Mirrors the
 * MemoryManager surface (`active()` / `env()` / `status()`) so it slots into the
 * existing spawn-injection flow.
 */
import { app } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readConfig } from './config';

// Pure-JS core, copied to out/main at build (like slack-trigger.cjs) and shipped
// to process.resourcesPath for the agent CLI (electron-builder extraResources).
const core = require('./kg-core.cjs') as KgCore;

interface KgMeta {
  id: string; title: string; source: string; modality: string; mime: string | null;
  origExt: string; bytes: number; tags: string[]; caption: string | null;
  chunkCount: number; addedAt: string; extractor: string; truncated: boolean;
  /** sha256 over the raw artifact + its indexed metadata — the dedupe key.
   *  Optional: documents ingested before dedupe landed do not carry one. */
  contentHash?: string | null;
}
/** `duplicate` is true when the content was already in the corpus: the EXISTING
 *  document is returned untouched and nothing was added. */
interface KgIngestResult { docId: string; chunkCount: number; meta: KgMeta; duplicate: boolean }
interface KgHit {
  docId: string; title: string; source: string; modality: string;
  chunkIdx: number; score: number; snippet: string;
}
interface KgIngestInput {
  srcPath?: string; text?: string; title?: string; tags?: string[];
  caption?: string; modality?: string; source?: string;
}
interface KgCore {
  ingest(root: string, input: KgIngestInput): KgIngestResult;
  reindex(root: string): { docCount: number; chunkCount: number };
  search(root: string, query: string, opts?: { limit?: number }): KgHit[];
  list(root: string): KgMeta[];
  getDoc(root: string, docId: string): { meta: KgMeta; text: string } | null;
  removeDoc(root: string, docId: string): boolean;
  stats(root: string): { docCount: number; chunkCount: number; byModality: Record<string, number> };
}

export interface KnowledgeStatus {
  enabled: boolean;
  root: string;
  docCount: number;
  chunkCount: number;
  byModality: Record<string, number>;
}

export class KnowledgeManager {
  /** Whether the feature flag is on. */
  active(): boolean {
    return readConfig().knowledgeGraph?.enabled === true;
  }

  /** The store directory (config override or <userData>/knowledge). */
  root(): string {
    const override = readConfig().knowledgeGraph?.rootPath;
    if (override && override.trim()) return override;
    return join(app.getPath('userData'), 'knowledge');
  }

  /** Absolute path to the agent CLI (dev: repo resources/; packaged: resourcesPath). */
  private cliPath(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'kg.cjs')
      : join(app.getAppPath(), 'resources', 'kg.cjs');
  }

  /** Absolute path to the pure-JS core for the out-of-process CLI to require. */
  private corePath(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'kg-core.cjs')
      : join(app.getAppPath(), 'src', 'main', 'kg-core.cjs');
  }

  /** Env merged into each agent's spawn so its `kg` CLI hits this store. Empty
   *  when off — so a default install injects nothing (zero behaviour change). */
  env(): Record<string, string> {
    if (!this.active()) return {};
    return { KG_ROOT: this.root(), KG_CLI: this.cliPath(), KG_CORE: this.corePath() };
  }

  status(): KnowledgeStatus {
    const enabled = this.active();
    const root = this.root();
    const s = enabled && existsSync(root)
      ? core.stats(root)
      : { docCount: 0, chunkCount: 0, byModality: {} };
    return { enabled, root, docCount: s.docCount, chunkCount: s.chunkCount, byModality: s.byModality };
  }

  /** Ingest a file from disk. No-op-safe when off (callers gate on status).
   *  Content-addressed: re-ingesting the same file returns the existing document
   *  with `duplicate: true` instead of adding a second copy of it. */
  ingestFile(srcPath: string, opts: { title?: string; tags?: string[]; caption?: string } = {}): KgIngestResult {
    return core.ingest(this.root(), { srcPath, ...opts });
  }

  /** Ingest inline text (e.g. pasted content). Deduped the same way. */
  ingestText(text: string, opts: { title?: string; tags?: string[] } = {}): KgIngestResult {
    return core.ingest(this.root(), { text, ...opts });
  }

  /** Rebuild the search index from the stored documents. The repair verb for an
   *  index that duplicated (every pre-dedupe re-ingest appended another copy),
   *  drifted, or was edited by hand. Safe to run at any time; the store's `docs/`
   *  are the source of truth, so nothing is lost by it. */
  reindex(): { docCount: number; chunkCount: number } {
    if (!existsSync(this.root())) return { docCount: 0, chunkCount: 0 };
    return core.reindex(this.root());
  }

  search(query: string, limit?: number): KgHit[] {
    if (!existsSync(this.root())) return [];
    return core.search(this.root(), query, { limit });
  }

  list(): KgMeta[] {
    if (!existsSync(this.root())) return [];
    return core.list(this.root());
  }

  get(docId: string): { meta: KgMeta; text: string } | null {
    return core.getDoc(this.root(), docId);
  }

  remove(docId: string): boolean {
    return core.removeDoc(this.root(), docId);
  }
}
