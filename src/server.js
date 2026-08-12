// Local review server.
//
// A browser rather than a terminal, for one reason: the model this supports is
// "read the criteria, then watch the software do it". A recorded journey is what
// closes the gap Gherkin cannot - a scenario and its test can agree perfectly and
// both describe a situation that cannot occur. Only demonstration catches that,
// and a TUI cannot show video.
//
// Binds to loopback only. This reads and writes the architect's documents; it is
// not something to expose on a network interface.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream, watch } from 'node:fs';
import { dirname as dirOf } from 'node:path';
import { extname, join, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanAll, toPosixPath } from './scan.js';
import { setStatus, addNote, setFlag, clearNotes } from './write.js';
import { indexVideos, videoFor, expectedPath } from './videos.js';
import { listStandardDocs, readStandardDoc } from './standard.js';
import { branchName, repoName } from './media.js';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

/** The subset of a parsed scenario the UI needs. Absolute paths stay server-side. */
function toWire(s) {
  return {
    project: s.project,
    source: s.source,
    id: s.id,
    title: s.title,
    feature: s.feature,
    persona: s.persona,
    status: s.status,
    verifiedOn: s.verifiedOn,
    commit: s.commit,
    intent: s.intent,
    steps: s.steps,
    index: s.index,
    flags: s.flags ?? [],
    // Byte offsets stay server side. They exist so a write can delete exactly the
    // right comment, and a browser that had them could only make them stale.
    notes: (s.notes ?? []).map((n) => ({ who: n.who, text: n.text })),
  };
}

function json(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Request body was not valid JSON.');
  }
}

/**
 * Resolve the absolute file for a scenario from a fresh scan rather than trusting
 * a path supplied by the client. The browser is local and trusted, but a write
 * addressed by client-supplied path is still a write to an arbitrary file, and
 * this tool's whole job is to be safe with documents it did not author.
 */
async function resolveTarget(roots, project, id) {
  const { results } = await scanAll(roots);
  const p = results.find((r) => r.project === project);
  if (!p) throw new Error(`Unknown project "${project}".`);
  const s = p.scenarios.find((x) => x.id === id);
  if (!s) throw new Error(`Scenario "${id}" not found in project "${project}".`);
  return s.absolutePath;
}

/**
 * Push a nudge to open pages when the criteria change on disk.
 *
 * The case that matters is not this tool's own writes - those already refresh the
 * page that made them. It is a DIFFERENT session editing the documents: an agent
 * working in a repo writes `@looknow` on a scenario, and the reviewer's open page
 * should surface it without them knowing to press reload. A flag nobody sees is
 * the same as no flag.
 *
 * Server-sent events rather than websockets or polling: the traffic is one-way and
 * rare, EventSource is built into the browser, and it reconnects on its own. The
 * event carries no payload - the client refetches - so there is no second code
 * path that could disagree with the normal load.
 *
 * Watches are narrowed to the directories that actually hold criteria. Watching a
 * project root would pick up node_modules and build output, which on a busy repo
 * is a constant stream of wake-ups for nothing.
 */
function startWatching(dirs, onChange) {
  const watchers = [];
  let timer = null;
  const fire = () => {
    // Editors write in several operations; debounce so one save is one event.
    clearTimeout(timer);
    timer = setTimeout(onChange, 250);
  };
  for (const dir of dirs) {
    try {
      watchers.push(watch(dir, { recursive: true }, fire));
    } catch {
      // A directory that cannot be watched is not worth failing over: the page
      // still works, it just will not update on its own.
    }
  }
  return () => {
    clearTimeout(timer);
    for (const w of watchers) w.close();
  };
}

/**
 * @param rootsOrLoader Either a fixed list, or a function returning the current
 *   list. A function is what lets `criteria-review here` register a tree and have
 *   the already-running server pick it up: capturing roots at startup meant a
 *   newly registered project stayed invisible until a restart, which is exactly
 *   the sort of quiet no-op that makes a tool untrustworthy.
 */
export function createReviewServer(rootsOrLoader, opts = {}) {
  const getRoots =
    typeof rootsOrLoader === 'function' ? rootsOrLoader : async () => rootsOrLoader;
  /** Open SSE responses. */
  const clients = new Set();
  let stopWatching = null;

  /**
   * Idle shutdown.
   *
   * Tying the server's life to a Claude session sounds right and is not: several
   * sessions and several browser tabs can be open at once, so the first session to
   * end would kill a server another was still using, and reference-counting
   * sessions means every abnormal exit leaks a count.
   *
   * The honest signal is USE, not session count. An open page holds an SSE
   * connection; when the last one closes and nothing asks for anything, the server
   * has no reason to exist. Anything can start it again, cheaply and idempotently.
   */
  let idleTimer = null;
  const idleMs = (opts.idleMinutes ?? 0) * 60_000;
  const armIdle = () => {
    if (!idleMs) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (clients.size === 0) {
        console.log(`idle for ${opts.idleMinutes}m with no open page; shutting down`);
        server.close();
        process.exit(0);
      }
    }, idleMs);
  };

  // Derived from where criteria actually live, rather than guessed.
  getRoots()
    .then((roots) => scanAll(roots))
    .then(({ results }) => {
      const dirs = new Set();
      for (const r of results) {
        for (const s of r.scenarios) dirs.add(dirOf(s.absolutePath));
      }
      if (dirs.size) {
        stopWatching = startWatching([...dirs], () => {
          for (const res of clients) res.write('event: changed\ndata: 1\n\n');
        });
      }
    })
    .catch(() => {
      // No watch is a degraded but working tool.
    });

  const server = createServer(async (req, res) => {
    try {
      armIdle();
      const roots = await getRoots();
      const url = new URL(req.url ?? '/', 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/api/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        res.write('retry: 2000\n\n');
        clients.add(res);
        clearTimeout(idleTimer);
        req.on('close', () => {
          clients.delete(res);
          armIdle();
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/video') {
        const project = url.searchParams.get('project');
        const id = url.searchParams.get('id');
        const root = roots.find((p) => p.name === project);
        if (!root) return json(res, 404, { error: 'Unknown project' });

        // Resolve through the index rather than trusting a client-supplied path,
        // so this endpoint can only ever serve a file the index already found.
        const index = await indexVideos(root, opts.mediaRoot);
        const hit = await videoFor(index, id);
        if (!hit) return json(res, 404, { error: 'No recording for this scenario' });

        const info = await stat(hit.file);
        const type = extname(hit.file) === '.mp4' ? 'video/mp4' : 'video/webm';
        const range = req.headers.range;

        // Range support is what makes the player seekable; without it the browser
        // can only play straight through from the start.
        if (range) {
          const m = /bytes=(\d*)-(\d*)/.exec(range);
          const start = m && m[1] ? Number(m[1]) : 0;
          const end = m && m[2] ? Number(m[2]) : info.size - 1;
          if (start >= info.size || end >= info.size || start > end) {
            res.writeHead(416, { 'content-range': `bytes */${info.size}` });
            return res.end();
          }
          res.writeHead(206, {
            'content-type': type,
            'content-length': end - start + 1,
            'content-range': `bytes ${start}-${end}/${info.size}`,
            'accept-ranges': 'bytes',
          });
          return createReadStream(hit.file, { start, end }).pipe(res);
        }

        res.writeHead(200, {
          'content-type': type,
          'content-length': info.size,
          'accept-ranges': 'bytes',
        });
        return createReadStream(hit.file).pipe(res);
      }

      // The standard, readable in the page that judges against it. Read-only: there
      // is no write route here, and there should not be. A reviewer disagreeing with
      // a rule takes that to the repository that owns it, where it goes through
      // review like any other change.
      if (req.method === 'GET' && url.pathname === '/api/standard') {
        return json(res, 200, { docs: await listStandardDocs(roots) });
      }

      if (req.method === 'GET' && url.pathname === '/api/standard/doc') {
        const doc = await readStandardDoc(url.searchParams.get('name') ?? '', roots);
        // 404 rather than 400 for a name that is not in the listing, including a
        // traversal attempt: the honest answer is that no such document exists here.
        if (!doc) return json(res, 404, { error: 'no such document' });
        return json(res, 200, doc);
      }

      if (req.method === 'GET' && url.pathname === '/api/scenarios') {
        const { results, missing } = await scanAll(roots);

        // One index per project, reused across that project's scenarios.
        const indexes = new Map();
        for (const root of roots) {
          try {
            indexes.set(root.name, await indexVideos(root, opts.mediaRoot));
          } catch {
            indexes.set(root.name, null);
          }
        }

        const withVideo = async (s) => {
          const index = indexes.get(s.project);
          if (!index || !s.id) return { video: null, videoExpected: null };
          const hit = await videoFor(index, s.id);
          return {
            video: hit
              ? { how: hit.how, name: basename(hit.file) }
              : null,
            // Normalised for the same reason as a scenario's source: this is a
            // repo-relative path shown in a web page and copied into scripts, so it
            // should read the same whoever is looking at it. Display only, unlike
            // `source`, which reaches a committed artefact.
            videoExpected: toPosixPath(
              relative(
                roots.find((r) => r.name === s.project)?.path ?? '',
                expectedPath(index, s.id)
              )
            ),
          };
        };

        const scenarios = [];
        for (const r of results) {
          for (const s of r.scenarios) {
            scenarios.push({ ...(await withVideo(s)), ...toWire(s) });
          }
        }
        return json(res, 200, {
          scenarios,
          projects: results.map((r) => ({
            name: r.project,
            root: r.root,
            files: r.files,
            count: r.scenarios.length,
          })),
          missing,
        });
      }

      if (req.method === 'POST' && url.pathname === '/api/status') {
        const body = await readBody(req);
        const file = await resolveTarget(roots, body.project, body.id);
        // `actor` decides whether this write also answers a raised @looknow. The
        // review page stamps every write it makes; the CLI never does, so an
        // agent can never clear a flag it raised itself.
        const status = await setStatus(file, body.id, body.status, {
          commit: body.commit,
          actor: body.actor,
        });
        return json(res, 200, { ok: true, id: body.id, status });
      }

      // Drive the reviewer's open page.
      //
      // One composable endpoint rather than a verb per action, because these are
      // almost always wanted together: after rewriting a document an agent wants
      // to say what it did, narrow the queue to the affected scenarios, and land
      // the reviewer on the first one. Three round trips to achieve that would
      // produce three visible jumps.
      //
      // Everything here is TRANSIENT. It changes what a page is showing, never
      // what is on disk. The durable channel is @looknow, which survives a reload
      // and a restart because it lives in the document. An agent that wants
      // attention tomorrow writes a flag; an agent that wants attention now
      // pushes. Conflating them would mean either flags that evaporate or
      // notifications that need clearing up afterwards.
      if (req.method === 'POST' && url.pathname === '/api/push') {
        const body = await readBody(req);
        const payload = {
          focus: body.focus ?? body.id ?? null,
          project: body.project ?? null,
          filter: body.filter ?? null,
          highlight: Array.isArray(body.highlight) ? body.highlight : null,
          message: body.message ?? null,
          reload: body.reload !== false,
        };
        for (const c of clients) c.write(`event: push\ndata: ${JSON.stringify(payload)}\n\n`);
        return json(res, 200, { ok: true, listeners: clients.size, ...payload });
      }

      // Kept as a thin alias: focusing one scenario is the common case and reads
      // better than a push with a single field set.
      if (req.method === 'POST' && url.pathname === '/api/focus') {
        const body = await readBody(req);
        if (!body.id) return json(res, 400, { error: 'focus needs an id' });
        const payload = JSON.stringify({
          focus: body.id,
          project: body.project ?? null,
          filter: null,
          highlight: null,
          message: null,
          reload: true,
        });
        for (const c of clients) c.write(`event: push\ndata: ${payload}\n\n`);
        return json(res, 200, { ok: true, focused: body.id, listeners: clients.size });
      }

      if (req.method === 'POST' && url.pathname === '/api/flag') {
        const body = await readBody(req);
        const file = await resolveTarget(roots, body.project, body.id);
        const on = await setFlag(file, body.id, body.flag ?? 'looknow', !!body.on);
        return json(res, 200, { ok: true, id: body.id, flag: body.flag ?? 'looknow', on });
      }

      if (req.method === 'POST' && url.pathname === '/api/notes/clear') {
        const body = await readBody(req);
        const file = await resolveTarget(roots, body.project, body.id);
        const removed = await clearNotes(file, body.id, { actor: body.actor });
        return json(res, 200, { ok: true, id: body.id, removed });
      }

      if (req.method === 'POST' && url.pathname === '/api/note') {
        const body = await readBody(req);
        const file = await resolveTarget(roots, body.project, body.id);
        const written = await addNote(file, body.id, body.note, {
          author: body.author,
          actor: body.actor,
        });
        return json(res, 200, { ok: true, id: body.id, note: written });
      }

      if (req.method === 'GET') {
        const name = url.pathname === '/' ? '/index.html' : url.pathname;
        if (name.includes('..')) return json(res, 400, { error: 'Bad path' });
        try {
          const buf = await readFile(join(PUBLIC_DIR, name));
          res.writeHead(200, { 'content-type': MIME[extname(name)] ?? 'text/plain' });
          return res.end(buf);
        } catch {
          return json(res, 404, { error: 'Not found' });
        }
      }

      return json(res, 405, { error: 'Method not allowed' });
    } catch (e) {
      // Surface the real reason. This is a local tool for one person; a generic
      // 500 would just mean opening the server log to learn what a write refused.
      return json(res, 400, { error: (e && e.message) || String(e) });
    }
  });

  armIdle();

  server.on('close', () => {
    clearTimeout(idleTimer);
    if (stopWatching) stopWatching();
    for (const res of clients) res.end();
    clients.clear();
  });

  return server;
}
