#!/usr/bin/env node
// criteria-review - review acceptance criteria across projects.
//
// Projects are registered once in a config file rather than passed each time, so
// the command is the same from any working directory. That is the whole point: the
// review is cross-project, and having to remember paths is friction on the one
// activity this is trying to make cheap.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { dirname, join, resolve, basename } from 'node:path';
import { createReviewServer } from '../src/server.js';
import { scanAll } from '../src/scan.js';
import { isUntracked, needsReview } from '../src/parse.js';
import { addNote, setStatus, ACTOR_ARCHITECT } from '../src/write.js';
import { orderQueue } from '../public/queue-order.js';
import { buildModel, RENDERERS } from '../src/emit.js';
import { scanAll as scanAllRoots } from '../src/scan.js';
import { resolveMediaRoot, masterVideoDir, MEDIA_CONFIG, branchName } from '../src/media.js';

const CONFIG_DIR = join(homedir(), '.config', 'criteria-review');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
// A pidfile rather than pgrep: a skill needs to start and stop this without
// guessing which process is ours, and matching on a command name would happily
// kill an unrelated editor session that happens to have the word in its args.
const PID_FILE = join(CONFIG_DIR, 'server.pid');

async function loadConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_FILE, 'utf8'));
  } catch {
    return { projects: [] };
  }
}

async function saveConfig(cfg) {
  await mkdir(dirname(CONFIG_FILE), { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

function parseArgs(argv) {
  const args = { _: [], projects: [], port: 4380, open: true, idle: 120 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') args.port = Number(argv[++i]);
    else if (a === '--no-open') args.open = false;
    else if (a === '--idle') args.idle = Number(argv[++i]);
    else if (a === '--message') args.message = argv[++i];
    // Who the architect sees above a question in the review pane. Defaults to
    // "agent"; name the session when several are asking at once.
    else if (a === '--as') args.as = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--limit') args.limit = argv[++i];
    else if (a === '--commit') args.commit = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--format') args.format = argv[++i];
    // Verify rather than write: the gate's half of generation. See cmdGenerate.
    else if (a === '--check') args.check = true;
    else if (a === '--filter') args.filter = argv[++i];
    else if (a === '--highlight') args.highlight = argv[++i];
    else if (a === '--focus') args.focus = argv[++i];
    else if (a === '--in') args.in = argv[++i];
    else if (a === '--project') {
      const v = argv[++i] ?? '';
      const eq = v.indexOf('=');
      if (eq === -1) throw new Error('--project expects name=path');
      args.projects.push({ name: v.slice(0, eq), path: resolve(v.slice(eq + 1)) });
    } else args._.push(a);
  }
  return args;
}

/** The running server's pid, or null. Clears a stale pidfile as a side effect. */
async function runningPid() {
  let raw;
  try {
    raw = await readFile(PID_FILE, 'utf8');
  } catch {
    return null;
  }
  const parsed = JSON.parse(raw);
  try {
    // Signal 0 tests for existence without touching the process.
    process.kill(parsed.pid, 0);
    return parsed;
  } catch {
    await rm(PID_FILE, { force: true });
    return null;
  }
}

async function cmdStatus() {
  const live = await runningPid();
  if (!live) {
    console.log('criteria-review: not running');
    return 1;
  }
  console.log(`criteria-review: running on ${live.url} (pid ${live.pid})`);
  return 0;
}

async function cmdStop() {
  const live = await runningPid();
  if (!live) {
    console.log('criteria-review: not running');
    return;
  }
  process.kill(live.pid, 'SIGTERM');
  await rm(PID_FILE, { force: true });
  console.log(`criteria-review: stopped (pid ${live.pid})`);
}

/**
 * Start detached, so the caller gets its prompt back. Idempotent: an already
 * running server is reported rather than a second one started on a port that is
 * taken, which would fail confusingly.
 */
async function cmdStart(args) {
  const live = await runningPid();
  if (live) {
    console.log(`criteria-review: already running on ${live.url} (pid ${live.pid})`);
    return;
  }
  const { spawn } = await import('node:child_process');
  const logPath = join(CONFIG_DIR, 'server.log');
  await mkdir(CONFIG_DIR, { recursive: true });
  const { openSync } = await import('node:fs');
  const out = openSync(logPath, 'a');
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(import.meta.url),
      'serve',
      '--port',
      String(args.port),
      '--no-open',
      '--idle',
      String(args.idle),
    ],
    { detached: true, stdio: ['ignore', out, out] }
  );
  child.unref();

  const url = `http://127.0.0.1:${args.port}/`;
  // Wait for it to actually answer before claiming success, so a failure to bind
  // is reported here rather than discovered later in a browser.
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        await writeFile(PID_FILE, JSON.stringify({ pid: child.pid, url, port: args.port }), 'utf8');
        console.log(`criteria-review: started on ${url} (pid ${child.pid})`);
        console.log(`log: ${logPath}`);
        return;
      }
    } catch {
      // not up yet
    }
  }
  throw new Error(`did not become ready on ${url}; see ${logPath}`);
}

function usage() {
  console.log(`criteria-review - review acceptance criteria across projects

  criteria-review                     open the review UI (foreground)
  criteria-review here [path] [name]  register this tree, start, and show it
  criteria-review start               start in the background
  criteria-review stop                stop the background server
  criteria-review status              is it running, and where
  criteria-review restart             stop then start
  criteria-review ask <ID> [proj]     ask the architect, beside the scenario:
                                        --message "..."   the question
                                        --as <name>       who is asking
  criteria-review notes               print the architect's outstanding notes
  criteria-review handled <ID> [proj] clear its notes and raise it for re-review
  criteria-review refresh             make every open page reload
  criteria-review push [opts]         narrate + steer:
                                        --message "..."   banner text
                                        --filter k=v,k=v  project|status|video|search
                                        --highlight A,B   mark rows
                                        --focus ID        select it
                                        --in <project>    scope for --focus
  criteria-review focus <ID>          jump every open page to a scenario
  criteria-review flag <ID>           mark it LOOK NOW
  criteria-review unflag <ID>         clear LOOK NOW
  criteria-review guide [skill]       print the agent instruction set
  criteria-review queue               what needs a decision, most important first
                                        --limit <n>       how many to list (default 10)
                                        --json            machine-readable
  criteria-review show <ID> [proj]    one scenario in full, with its notes
  criteria-review note <ID> [proj]    write the architect's note (raises @review):
                                        --message "..."   what it says
  criteria-review accept <ID> [proj]  confirm it is what the software SHOULD do
  criteria-review verify <ID> [proj]  you watched it happen: --commit <sha> required
  criteria-review reject <ID> [proj]  send it back to derived
  criteria-review generate [path]     emit the criteria for a test suite to cite:
                                        --out <path>      where to write (required)
                                        --format ts|json  default from the extension
                                        --check           verify, do not write (the gate)
  criteria-review list                print a summary, no browser
  criteria-review add <path> [name]   register a project
  criteria-review remove <name>       unregister a project
  criteria-review projects            show registered projects

Options
  --port <n>          port for the UI (default 4380)
  --no-open           do not open a browser
  --idle <minutes>    exit after this long with no page open (0 disables, default 120)
  --project n=path    scan this root instead of the registered ones (repeatable)

Config: ${CONFIG_FILE}`);
}

async function rootsFrom(args) {
  if (args.projects.length) return args.projects;
  const cfg = await loadConfig();
  if (cfg.projects?.length) return cfg.projects;
  // Fall back to the current directory, so the tool is useful before anything is
  // registered rather than greeting a new user with an empty screen.
  return [{ name: basename(process.cwd()), path: process.cwd() }];
}

async function cmdList(roots) {
  const { results, missing } = await scanAll(roots);
  let total = 0;
  for (const r of results) {
    const by = {};
    for (const s of r.scenarios) {
      const k = isUntracked(s) ? 'untracked' : s.status;
      by[k] = (by[k] || 0) + 1;
    }
    total += r.scenarios.length;
    const parts = Object.entries(by).map(([k, v]) => `${k} ${v}`);
    const b = await branchName(r.root);
    console.log(
      `${r.project.padEnd(14)} ${(b ? '@' + b : '').padEnd(36)} ` +
        `${String(r.scenarios.length).padStart(4)} scenarios  ${parts.join(', ') || '(none)'}`
    );
  }
  for (const m of missing) console.log(`${m.name.padEnd(14)}  MISSING: ${m.path} (${m.reason})`);
  if (!total) {
    console.log(
      '\nNo scenarios found. Criteria live under a `ui-qa/` or `acceptance/` directory,\n' +
        'in fenced ```gherkin blocks. Register a project with: criteria-review add <path>'
    );
  }
}

/**
 * Emit the criteria as an artefact a test suite references, so a journey's step names
 * are the scenario's own words rather than a copy of them. See docs/decisions.md D-003.
 *
 * WRITE AND CHECK ARE TWO COMMANDS, deliberately. `--check` verifies the committed
 * artefact matches the documents and changes nothing; the plain form rewrites it. A gate
 * that silently regenerated would hide exactly the drift it exists to catch: someone
 * edits a document, the gate quietly rewrites the artefact, and the stale test that no
 * longer matches its criteria is never corrected.
 *
 * The destination is passed in rather than configured here. This tool does not know its
 * consumers, and the consumer's own package script is where "where my scenarios go"
 * belongs - it travels with the repository and works on a machine that has never
 * registered anything.
 */
async function cmdGenerate(args) {
  const out = args.out;
  if (!out) {
    throw new Error(
      'generate expects --out <path>, e.g.\n' +
        '  criteria-review generate . --out tests/e2e/support/scenarios.generated.ts\n' +
        'Put it in the consuming project\'s package scripts so it travels with the repo.'
    );
  }

  const format = args.format ?? (out.endsWith('.json') ? 'json' : 'ts');
  const render = RENDERERS[format];
  if (!render) throw new Error(`unknown --format ${format}. Expected: ${Object.keys(RENDERERS).join(', ')}`);

  // A named project, else a path, else the registered set. Generation is per consumer:
  // emitting two projects' scenarios into one artefact would let one project's rename
  // break another's build.
  const named = args._[1];
  const roots = named
    ? [{ name: basename(resolve(named)), path: resolve(named) }]
    : await rootsFrom(args);
  if (roots.length > 1) {
    throw new Error(
      `generate targets one project; ${roots.length} are registered. Name one: ` +
        `criteria-review generate <path> --out ${out}`
    );
  }

  const { results, missing } = await scanAllRoots(roots);
  for (const m of missing) throw new Error(`${m.name}: ${m.path} (${m.reason})`);

  const scenarios = results.flatMap((r) => r.scenarios);
  const model = buildModel(scenarios);
  const text = render(model);

  const target = resolve(roots[0].path, out);
  const existing = await readFile(target, 'utf8').catch(() => null);

  if (args.check) {
    if (existing === text) {
      console.log(`up to date: ${out} (${model.scenarios.length} scenarios)`);
      return;
    }
    // Exit non-zero without writing: this is the gate, and its job is to report.
    console.error(
      existing === null
        ? `MISSING: ${out} has never been generated. Run: criteria-review generate --out ${out}`
        : `STALE: ${out} does not match the acceptance documents.\n` +
            `An acceptance document changed and the artefact was not regenerated, or the\n` +
            `artefact was edited by hand. Run: criteria-review generate --out ${out}`
    );
    process.exit(1);
  }

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text, 'utf8');

  const changed = existing !== text;
  console.log(
    `${changed ? 'wrote' : 'unchanged'} ${out}  ` +
      `${model.scenarios.length} scenarios, standard ${model.standardVersion}`
  );
  if (model.untracked.length) {
    // Never silent: an excluded scenario looks identical to one that does not exist.
    // Summarised per document rather than listed, because a real backfill has dozens
    // and a wall of them on every run is the same as printing nothing.
    const byFile = new Map();
    for (const u of model.untracked) byFile.set(u.source, (byFile.get(u.source) ?? 0) + 1);
    console.log(
      `${model.untracked.length} scenario(s) excluded as untracked (no id or no status):`
    );
    for (const [source, n] of [...byFile].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}  ${source}`);
    }
  }
}

/**
 * The verbs a CONVERSATIONAL review needs: walk the queue, read one scenario, answer it.
 *
 * These exist because the browser is not always the right surface. Asked about one
 * scenario mid-task, opening a page, finding it and reading it costs more than the
 * answer is worth, and the review then does not happen. The design rule the whole
 * standard turns on is that an artefact must be checkable in less time than it took to
 * produce; a second surface with a lower floor is that rule applied to the tool itself.
 *
 * THEY WRITE DIRECTLY TO THE DOCUMENTS rather than posting to the server, so a review
 * works with nothing running. An open page still updates itself: the server watches the
 * criteria directories, so a write from here reaches a browser without either knowing
 * about the other.
 *
 * Every write here is the ARCHITECT acting. That is what retires a raised @looknow and
 * what points a note at an agent rather than back at the person who wrote it. An agent
 * asking a question uses `ask`, which is the same write with the other actor.
 */
async function resolveScenario(args, id) {
  const roots = await rootsFrom(args);
  const { results } = await scanAllRoots(roots);
  const wanted = String(id).replace(/^@/, '').toLowerCase();
  const project = args._[2];

  const hits = results
    .flatMap((r) => r.scenarios.map((s) => ({ ...s, root: r.root })))
    .filter((s) => s.id && s.id.toLowerCase() === wanted)
    .filter((s) => (project ? s.project === project : true));

  if (!hits.length) throw new Error(`No scenario ${id} in the registered projects.`);
  if (hits.length > 1) {
    // Never guess between two: the id is the join, and writing to the wrong copy would
    // record an answer against a scenario the architect never read.
    throw new Error(
      `${id} exists in ${hits.length} projects (${hits.map((h) => h.project).join(', ')}). ` +
        `Name one: criteria-review <verb> ${id} <project>`
    );
  }
  return { ...hits[0], file: join(hits[0].root, hits[0].source) };
}

/** One scenario, in full, as a person reads it. */
function printScenario(s, { index, total } = {}) {
  const where = index ? `[${index}/${total}] ` : '';
  const flags = (s.flags ?? []).map((f) => `@${f}`).join(' ');
  console.log(`\n${where}${s.id ?? '(no id)'}  ${s.title}`);
  console.log(
    `  ${s.project} · ${s.source}${s.feature ? ` · ${s.feature}` : ''}\n` +
      `  status: ${s.status ?? '(none)'}${s.persona ? ` · persona: ${s.persona}` : ''}` +
      `${s.verifiedOn ? ` · verified ${s.verifiedOn}` : ''}${flags ? ` · ${flags}` : ''}`
  );
  // The intent line is printed even when absent, and says so. An unsourced scenario is
  // the most dangerous kind here, and silence would read as "fine".
  console.log(`  intent: ${s.intent ?? 'NONE - not sourced'}`);
  if (s.steps?.length) {
    console.log('');
    for (const step of s.steps) console.log(`    ${step}`);
  }
  for (const n of s.notes ?? []) {
    console.log(`\n  note${n.who ? ` (${n.who})` : ''}: ${n.text.replace(/\n/g, '\n        ')}`);
  }
}

async function cmdQueue(args) {
  const roots = await rootsFrom(args);
  const { results } = await scanAllRoots(roots);
  const all = results.flatMap((r) => r.scenarios);
  // Same ordering the page uses, imported rather than reimplemented: a walk that
  // disagreed with the screen would leave the reviewer unable to tell which was right.
  const queue = orderQueue(all.filter((s) => needsReview(s)));
  const limit = Number(args.limit ?? 10);

  if (args.json) {
    console.log(JSON.stringify({ total: queue.length, items: queue.slice(0, limit) }, null, 2));
    return;
  }
  console.log(`${queue.length} scenario(s) still need a decision. Most important first:\n`);
  queue.slice(0, limit).forEach((s, i) => {
    const flags = (s.flags ?? []).includes('looknow') ? '  LOOK NOW' : '';
    console.log(
      `${String(i + 1).padStart(3)}. ${(s.id ?? '(no id)').padEnd(22)} ${(s.status ?? 'untracked').padEnd(9)}` +
        ` ${s.title}${flags}`
    );
  });
  if (queue.length > limit) console.log(`\n... and ${queue.length - limit} more.`);
}

async function cmdShow(args) {
  const s = await resolveScenario(args, args._[1]);
  if (args.json) return void console.log(JSON.stringify(s, null, 2));
  printScenario(s);
}

/** Record the architect's answer: a note, or a status, or both. */
async function cmdAnswer(args, verb) {
  const id = args._[1];
  if (!id) throw new Error(`${verb} expects a scenario id`);
  const s = await resolveScenario(args, id);

  const done = [];
  if (args.message) {
    await addNote(s.file, s.id, args.message, {
      author: args.as ?? 'architect',
      actor: ACTOR_ARCHITECT,
    });
    done.push('note written, raised @review for an agent to act on');
  }

  if (verb !== 'note') {
    const status = verb === 'reject' ? 'derived' : verb === 'accept' ? 'accepted' : 'verified';
    if (status === 'verified' && !args.commit) {
      // Refused rather than defaulted. `verified` claims a person watched the software
      // do this, and a claim with no commit behind it cannot be checked or aged.
      throw new Error(
        'verify expects --commit <sha>: the status records WHICH build was watched, ' +
          'and without it the claim ages into a lie.'
      );
    }
    await setStatus(s.file, s.id, status, { commit: args.commit, actor: ACTOR_ARCHITECT });
    done.push(`status -> ${status}`);
  } else if (!args.message) {
    throw new Error('note expects --message "..."');
  }

  console.log(`${s.id}: ${done.join('; ')}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const cmd = args._[0];

  if (cmd === 'help' || args._.includes('--help') || args._.includes('-h')) return usage();

  if (cmd === 'add') {
    const path = resolve(args._[1] ?? process.cwd());
    const name = args._[2] ?? basename(path);
    const cfg = await loadConfig();
    cfg.projects = (cfg.projects ?? []).filter((p) => p.name !== name);
    cfg.projects.push({ name, path });
    await saveConfig(cfg);
    console.log(`registered ${name} -> ${path}`);
    return;
  }

  if (cmd === 'remove') {
    const name = args._[1];
    if (!name) throw new Error('remove expects a project name');
    const cfg = await loadConfig();
    const before = cfg.projects?.length ?? 0;
    cfg.projects = (cfg.projects ?? []).filter((p) => p.name !== name);
    await saveConfig(cfg);
    console.log(before === cfg.projects.length ? `no project named ${name}` : `removed ${name}`);
    return;
  }

  if (cmd === 'projects') {
    const cfg = await loadConfig();
    if (!cfg.projects?.length) return console.log(`no projects registered (${CONFIG_FILE})`);
    for (const p of cfg.projects) {
      const b = await branchName(p.path);
      console.log(`${p.name.padEnd(14)} ${(b ? '@' + b : '').padEnd(36)} ${p.path}`);
    }
    return;
  }

  // Narrate + steer in one call. Everything is optional, so an agent can send
  // just a message, just a filter, or the lot.
  //   criteria-review push --message "..." --filter status=proposed --highlight A,B --focus A
  if (cmd === 'push' || cmd === 'refresh') {
    const live = await runningPid();
    if (!live) throw new Error('not running; start it with: criteria-review start');
    const body = { reload: true };
    if (args.message) body.message = args.message;
    if (args.focus) body.focus = args.focus;
    if (args.in) body.project = args.in;
    if (args.highlight) body.highlight = args.highlight.split(',').map((x) => x.trim());
    if (args.filter) {
      body.filter = {};
      for (const pair of args.filter.split(',')) {
        const [k, v] = pair.split('=');
        if (k) body.filter[k.trim()] = (v ?? '').trim();
      }
    }
    const r = await fetch(new URL('/api/push', live.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const out = await r.json();
    if (!r.ok) throw new Error(out.error || `HTTP ${r.status}`);
    console.log(JSON.stringify(out));
    return;
  }

  // Commands a working session uses to reach the reviewer's open page.
  if (cmd === 'focus' || cmd === 'flag' || cmd === 'unflag') {
    const id = args._[1];
    if (!id) throw new Error(`${cmd} expects a scenario id`);
    const live = await runningPid();
    if (!live) throw new Error('not running; start it with: criteria-review start');
    const path = cmd === 'focus' ? '/api/focus' : '/api/flag';
    const body =
      cmd === 'focus'
        ? { id, project: args._[2] }
        : { id, project: args._[2], flag: 'looknow', on: cmd === 'flag' };
    const r = await fetch(new URL(path, live.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const out = await r.json();
    if (!r.ok) throw new Error(out.error || `HTTP ${r.status}`);
    console.log(JSON.stringify(out));
    return;
  }

  // The single command a session runs on entry: make sure this working tree is
  // registered, make sure the server is up, and point the page at it. Written as
  // one verb because three (add, start, push) is three chances to do two of them.
  if (cmd === 'here') {
    const path = resolve(args._[1] ?? process.cwd());
    // A worktree and its main clone share a repo name, so the DIRECTORY name is
    // what distinguishes them in the queue. Both can be registered at once and
    // reviewed side by side; they resolve to the same master video library, which
    // is correct, because the recordings are of the same product.
    const name = args._[2] ?? basename(path);
    const cfg = await loadConfig();
    // Drop any entry with this name OR this path. Registering one tree twice under
    // two names would list its scenarios twice and make the counts wrong.
    const before = cfg.projects ?? [];
    cfg.projects = before.filter((p) => p.name !== name && resolve(p.path) !== path);
    const replaced = before.length !== cfg.projects.length;
    cfg.projects.push({ name, path });
    await saveConfig(cfg);
    console.log(`${replaced ? 're-registered' : 'registered'} ${name} -> ${path}`);

    if (!(await runningPid())) await cmdStart(args);
    const live = await runningPid();
    if (live) {
      await fetch(new URL('/api/push', live.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filter: { project: name },
          message: `Reviewing ${name}`,
          reload: true,
        }),
      }).catch(() => {});
      console.log(`criteria-review: ${live.url} showing ${name}`);
    }
    return;
  }

  // The agent's half of the loop: pull what the architect wrote, rather than
  // discovering it by accident. Without this there is no channel from the tool
  // back to a session at all - the push API is one-way, server to browser.
  if (cmd === 'notes') {
    const roots = await rootsFrom(args);
    const { results } = await scanAllRoots(roots);
    let found = 0;
    for (const r of results) {
      for (const sc of r.scenarios) {
        const notes = sc.notes ?? [];
        const awaiting = (sc.flags ?? []).includes('review');
        if (!notes.length && !awaiting) continue;
        found++;
        console.log(
          `\n${awaiting ? '[NOTED] ' : ''}${sc.id ?? '(no id)'}  ${r.project}  ${sc.source}`
        );
        console.log(`  ${sc.title}`);
        for (const n of notes) {
          console.log(`  ${n.who ? n.who + ': ' : ''}${n.text.replace(/\n/g, '\n  ')}`);
        }
      }
    }
    if (!found) console.log('no review notes outstanding');
    else
      console.log(
        `\n${found} scenario(s). Act on them, then:  criteria-review handled <ID> [project]`
      );
    return;
  }

  // Ask the architect something, next to the thing being asked about.
  //
  // `flag` says "look at this" and carries no words; `push` carries words and
  // evaporates on reload. Neither can ask a question and still be there an hour
  // later, so questions lived in chat transcripts and were answered nowhere near
  // the scenario. This writes the question as a note and raises @looknow, which
  // puts it in the review queue with the text attached. The architect answers with
  // their own note in the same pane, and that raises @review to hand it back.
  //
  // Deliberately NOT a push: a push yanks whatever page they have open, and a
  // question is not urgent enough to interrupt a review pass in progress. The flag
  // reaches them through the live queue on its own.
  if (cmd === 'ask') {
    const id = args._[1];
    if (!id) throw new Error('ask expects a scenario id');
    const question = args.message;
    if (!question) throw new Error('ask expects --message "the question"');
    const live = await runningPid();
    if (!live) throw new Error('not running; start it with: criteria-review here');
    const r = await fetch(new URL('/api/note', live.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // No actor: this is an agent writing, which is what routes the flag the other
      // way. The author is what the architect sees above the text in the pane.
      body: JSON.stringify({
        id,
        project: args._[2],
        note: question,
        author: args.as ?? 'agent',
      }),
    });
    const out = await r.json();
    if (!r.ok) throw new Error(out.error || `HTTP ${r.status}`);
    console.log(JSON.stringify({ ok: true, id, asked: true, awaiting: 'architect' }));
    return;
  }

  // Close the loop: the note is dealt with, so remove it and hand the item back
  // for re-review rather than leaving a finished discussion in the document.
  if (cmd === 'handled') {
    const id = args._[1];
    if (!id) throw new Error('handled expects a scenario id');
    const live = await runningPid();
    if (!live) throw new Error('not running; start it with: criteria-review start');
    const project = args._[2];
    const post = (path, body) =>
      fetch(new URL(path, live.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).then(async (r) => {
        const o = await r.json();
        if (!r.ok) throw new Error(o.error || `HTTP ${r.status}`);
        return o;
      });
    const cleared = await post('/api/notes/clear', { id, project });
    await post('/api/flag', { id, project, flag: 'looknow', on: true });
    console.log(
      JSON.stringify({ ok: true, id, notesRemoved: cleared.removed, raisedForReview: true })
    );
    return;
  }

  // The instruction set, printed rather than pointed at: a harness that can run a
  // command can absorb this without knowing where the tool is installed.
  if (cmd === 'guide') {
    const here = dirname(fileURLToPath(import.meta.url));
    const topic = args._[1];
    const file = topic
      ? join(here, '..', 'agents', 'skills', 'claude-code', topic, 'SKILL.md')
      : join(here, '..', 'agents', 'README.md');
    try {
      console.log(await readFile(file, 'utf8'));
    } catch {
      throw new Error(`No guide for "${topic ?? ''}". Try: criteria-review guide`);
    }
    return;
  }

  if (cmd === 'generate') return cmdGenerate(args);

  // The conversational surface: walk, read, answer. No browser, no running server.
  if (cmd === 'queue') return cmdQueue(args);
  if (cmd === 'show') return cmdShow(args);
  if (cmd === 'note' || cmd === 'accept' || cmd === 'verify' || cmd === 'reject') {
    return cmdAnswer(args, cmd);
  }

  if (cmd === 'status') return void process.exit(await cmdStatus());
  if (cmd === 'stop') return cmdStop();
  if (cmd === 'start') return cmdStart(args);
  if (cmd === 'restart') {
    await cmdStop();
    return cmdStart(args);
  }

  const roots = await rootsFrom(args);

  if (cmd === 'list') return cmdList(roots);

  const cfg = await loadConfig();
  const mediaRoot = await resolveMediaRoot(cfg.mediaRoot);
  // Re-read the config per request so `here` takes effect without a restart.
  const loadRoots = args.projects.length
    ? async () => args.projects
    : async () => {
        const c = await loadConfig();
        return c.projects?.length
          ? c.projects
          : [{ name: basename(process.cwd()), path: process.cwd() }];
      };
  const server = createReviewServer(loadRoots, { mediaRoot, idleMinutes: args.idle });
  await new Promise((res) => server.listen(args.port, '127.0.0.1', res));
  const url = `http://127.0.0.1:${args.port}/`;
  console.log(`criteria-review on ${url}`);
  // Print the resolved PATH, not just the name. A worktree and its main clone
  // share a project name, so a name alone cannot tell you which tree is being
  // reviewed - and reviewing the wrong tree looks exactly like reviewing the
  // right one until the scenarios disagree.
  console.log('scanning:');
  for (const r of roots) {
    const b = await branchName(r.path);
    console.log(`  ${r.name.padEnd(14)} ${(b ? '@' + b : '').padEnd(36)} ${r.path}`);
  }
  console.log(`master video library: ${mediaRoot ?? 'not configured (' + MEDIA_CONFIG + ')'}`);
  console.log('ctrl-c to stop');

  if (args.open) {
    const { spawn } = await import('node:child_process');
    const opener =
      process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawn(opener, [url], { stdio: 'ignore', detached: true }).unref();
  }
}

main().catch((e) => {
  console.error(`criteria-review: ${e.message}`);
  process.exit(1);
});
