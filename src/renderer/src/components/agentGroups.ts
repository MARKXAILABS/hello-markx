import { useEffect, useMemo, useState } from 'react';
import type { Agent } from '@/store/store';

/**
 * "Which repository is this agent working in?" — the one answer, shared.
 *
 * The fullscreen roster grew this logic first (async main-repo resolution, a
 * process-wide cache, grouping by ABSOLUTE root rather than basename) and it is
 * the right answer everywhere: the floor strip needs exactly the same buckets
 * once a fleet outgrows one screen. It lives here rather than being written a
 * second time, because the subtle parts — never re-asking for a path that
 * resolved to null, never stacking a second lookup for a path already in
 * flight — are exactly what a second implementation gets wrong.
 */

export function basename(path: string): string {
  // Split on BOTH separators: `git:mainRepo` hands back whatever the platform
  // uses, and a Windows `C:\work\repo` contains no '/' at all — so a '/'-only
  // split returned the whole absolute path as the group's "name".
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** cwd → main-repo root, resolved once per path and shared by every mount.
 *  An isolated agent's cwd is its own git worktree (`…/worktrees/<agent-id>`),
 *  so naming the group after that path buckets each such agent under its own id
 *  instead of the repository the user actually picked. `git:mainRepo` follows a
 *  linked worktree back to its main checkout. */
const repoRootByCwd = new Map<string, string | null>();
/** cwds with a lookup in flight, so a re-render can't start a second one. */
const repoLookupsInFlight = new Set<string>();

/** Which repository an agent belongs to — the ABSOLUTE root, so it is a real
 *  identity. Two unrelated checkouts can share a basename (`~/client-a/app` and
 *  `~/client-b/app`); keying groups on the name merged them into one section and
 *  let agents be dragged between two different repositories.
 *
 *  Falls back to the cwd itself until the async resolution lands, and for
 *  directories that aren't git repos at all. */
export function repoKeyOf(agent: Agent): string {
  return repoRootByCwd.get(agent.cwd) || agent.cwd || 'unknown';
}

/** What that group is CALLED — the basename, or the project the user picked. */
export function repoLabelOf(agent: Agent): string {
  const root = repoRootByCwd.get(agent.cwd);
  if (root) return basename(root);
  const project = agent.project?.trim();
  if (project) return project;
  return basename(agent.cwd) || 'unknown';
}

/** The roster section an agent lives in — god agents share one ungrouped
 *  section, everyone else groups by repository. */
export function groupKey(agent: Agent): string {
  return agent.isGod ? '__god__' : repoKeyOf(agent);
}

/** Resolve every distinct cwd's repository root, then re-render. Exactly one git
 *  call per distinct path, ever. */
export function useResolvedRepoNames(agents: Agent[]): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const pending = [...new Set(agents.map(a => a.cwd).filter(Boolean))]
      // `has` (not a truthiness check) so a resolved-to-null path — a cwd that
      // is not a git repo — counts as answered. Caching only successes meant
      // every agent outside a repo re-asked on each pass, and this effect
      // depends on `agents`, which the pty parser replaces on every chunk of
      // terminal output: one such agent spawned `git rev-parse` continuously
      // for as long as it was talking. In-flight paths are skipped too, so a
      // re-render mid-lookup doesn't stack a second round of subprocesses.
      .filter(cwd => !repoRootByCwd.has(cwd) && !repoLookupsInFlight.has(cwd));
    if (pending.length === 0) return;
    pending.forEach(cwd => repoLookupsInFlight.add(cwd));
    void Promise.all(pending.map(async (cwd) => {
      try {
        repoRootByCwd.set(cwd, (await window.cth.gitMainRepo(cwd)) || null);
      } catch {
        // Record the failure as answered as well — retrying a path that throws
        // is what the unbounded-subprocess bug was made of.
        repoRootByCwd.set(cwd, null);
      } finally {
        repoLookupsInFlight.delete(cwd);
      }
    })).then(() => { if (!cancelled) setVersion(v => v + 1); });
    return () => { cancelled = true; };
  }, [agents]);
  return version;
}

export interface AgentGroup {
  /** Absolute repo root — the group's identity. */
  key: string;
  /** The basename / project name shown to the user. */
  label: string;
  members: Agent[];
}

/**
 * God agents first and ungrouped, everyone else bucketed by repository.
 *
 * Insertion order is preserved inside each bucket (it is the user's own
 * drag-reorder) and buckets appear in first-seen order, so the list doesn't
 * reshuffle as statuses change.
 */
export function useAgentGroups(agents: Agent[]): { gods: Agent[]; groups: AgentGroup[] } {
  const repoVersion = useResolvedRepoNames(agents);
  return useMemo(() => {
    const gods: Agent[] = [];
    // Keyed by absolute repo root (identity); the label is carried alongside so
    // two same-named repos stay two groups but still read by name.
    const byRepo = new Map<string, AgentGroup>();
    for (const a of agents) {
      if (a.isGod) { gods.push(a); continue; }
      const key = repoKeyOf(a);
      const bucket = byRepo.get(key);
      if (bucket) bucket.members.push(a);
      else byRepo.set(key, { key, label: repoLabelOf(a), members: [a] });
    }
    return { gods, groups: [...byRepo.values()] };
    // `repoVersion` is not READ in this body, so ESLint calls it an unnecessary
    // dependency - and it is the only thing that makes this memo correct.
    // `repoKeyOf`/`repoLabelOf` above read the MODULE-LEVEL `repoRootByCwd` cache,
    // which useResolvedRepoNames fills asynchronously and mutates in place; no
    // static analysis can see through that. Drop the dependency and every agent
    // stays bucketed under its raw cwd forever, because nothing else in this
    // component changes when the git lookups land. The honest alternative -
    // threading the resolved map through repoKeyOf/repoLabelOf - changes two
    // exported functions that groupKey and matchesAgentQuery also call, which is a
    // refactor, not a lint fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, repoVersion]);
}

/** Free-text roster filter: name, project, repo label, and cwd. Empty query
 *  matches everything, so a call site can pass its input straight through. */
export function matchesAgentQuery(agent: Agent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [agent.name, agent.project, repoLabelOf(agent), agent.cwd]
    .some((field) => (field ?? '').toLowerCase().includes(q));
}
