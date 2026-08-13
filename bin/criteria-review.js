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
import { scanAll, changedSince } from '../src/scan.js';
import { loadSettings, PROJECT_CONFIG } from '../src/config.js';
import { ejectStandard } from '../src/standard.js';
import { loadTerms, renderTerms, variantOf, findSpelledTerms } from '../src/terms.js';
import {
  loadPlan,
  savePlan,
  clearPlan,
  resolveItems,
  readPlan,
  completeness,
  selectTasks,
} from '../src/plan.js';
import { isUntracked, needsReview } from '../src/parse.js';
import { addNote, setStatus, ACTOR_ARCHITECT } from '../src/write.js';
import { orderQueue } from '../public/queue-order.js';
import { STANDARD_VERSION } from '../src/version.js';
import { buildModel, RENDERERS } from '../src/emit.js';
import { scanAll as scanAllRoots } from '../src/scan.js';
import {
  resolveMediaRoot,
  masterVideoDir,
  MEDIA_CONFIG,
  branchName,
  headCommit,
} from '../src/media.js';
import { indexVideos, videoFor } from '../src/videos.js';

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
    // Widen past the tree the session is in. See scopedRoots.
    else if (a === '--all') args.all = true;
    // One mechanism, two audiences: a developer passes their trunk, a pipeline passes
    // the last release tag. See changedSince.
    else if (a === '--since') args.since = argv[++i];
    else if (a === '--plan') args.plan = true;
    // Repeatable: several tasks can be in flight, and working a set of them is normal.
    else if (a === '--task') (args.tasks ??= []).push(argv[++i]);
    else if (a === '--source') args.source = argv[++i];
    else if (a === '--format') args.format = argv[++i];
    // Verify rather than write: the gate's half of generation. See cmdGenerate.
    else if (a === '--check') args.check = true;
    // Makes a spelled term fail `terms check`, for a team that has finished migrating.
    else if (a === '--strict') args.strict = true;
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

/**
 * Is it running, and is what is running the same version as what is installed?
 *
 * Three states rather than two, because "running" was never the whole question. A server
 * started before an upgrade keeps serving its original code indefinitely - the idle timeout
 * is two hours and the page refreshes its DATA without ever reloading its script - so an
 * agent that only asked "is it up" would leave a stale process serving a stale page and have
 * no way to know.
 *
 *   0  running, and current
 *   1  not running
 *   2  running, but older than what is installed - restart it
 *
 * Exit 2 is deliberately non-zero so `criteria-review status || criteria-review restart` is
 * a correct idiom for both the down case and the stale case.
 */
async function cmdStatus() {
  const live = await runningPid();
  if (!live) {
    console.log('criteria-review: not running');
    return 1;
  }

  const mine = await installedVersion();
  let running = null;
  try {
    const res = await fetch(new URL('/api/version', live.url), { signal: AbortSignal.timeout(2000) });
    if (res.ok) running = await res.json();
  } catch {
    // Answered the pidfile but not HTTP: report what is known rather than guessing.
  }

  if (!running) {
    console.log(`criteria-review: running on ${live.url} (pid ${live.pid}), version unknown`);
    console.log('  it did not answer /api/version - it predates this check. Restart it.');
    return 2;
  }

  console.log(
    `criteria-review: running on ${live.url} (pid ${running.pid}) - ` +
      `${running.package} (standard ${running.standard}), started ${running.started.slice(0, 16).replace('T', ' ')}`
  );

  if (running.package !== mine) {
    console.log(
      `  STALE: ${mine} is installed. The running process still serves ${running.package}.\n` +
        '  Restart it:  criteria-review restart'
    );
    return 2;
  }
  return 0;
}

/** The version of the code this command is running from. */
async function installedVersion() {
  const pkg = JSON.parse(
    await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')
  );
  return pkg.version;
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
  criteria-review standard eject <dir> copy the standard into this project to own it
  criteria-review version             package and standard version (also --version)
  criteria-review guide [skill]       print the agent instruction set
  criteria-review plan [verb]         the scenarios this task covers (ids only):
                                        set|add [IDs|-]    from args or piped text
                                        show | next | check | clear
                                        --task <name>      repeatable: several in flight
                                        --source <where it came from>
  criteria-review terms [show|check]  the glossary: what it defines, what documents use,
                                      and what spells a term instead of naming it
                                        --strict          a spelled term fails the check
  criteria-review manifest            evidence index: scenarios, clips, and the work item
                                        --out <file>      write it (default: stdout)
                                        --since <ref> | --all   scope, else the plan
  criteria-review queue               what needs a decision here, most important first
                                        --limit <n>       how many to list (default 10)
                                        --all             every registered project
                                        --since <ref>     only what changed since a ref
                                        --plan            only what the plan covers
                                        --task <name>     narrow to one or more tasks
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
  const named = args._[1];
  const settingsRoot = named ? resolve(named) : (await scopedRoots(args))[0]?.path ?? process.cwd();
  const settings = await loadSettings(settingsRoot);
  // Declared in the project rather than passed every time, so the same command works
  // from a package script, a gate and a pipeline without three different invocations.
  const out = args.out ?? settings.emit.out;
  if (!out) {
    throw new Error(
      'generate expects --out <path>, e.g.\n' +
        '  criteria-review generate . --out tests/e2e/support/scenarios.generated.ts\n' +
        'Put it in the consuming project\'s package scripts so it travels with the repo.'
    );
  }

  const format = args.format ?? settings.emit.format ?? (out.endsWith('.json') ? 'json' : 'ts');
  const render = RENDERERS[format];
  if (!render) throw new Error(`unknown --format ${format}. Expected: ${Object.keys(RENDERERS).join(', ')}`);

  // A named project, else a path, else the registered set. Generation is per consumer:
  // emitting two projects' scenarios into one artefact would let one project's rename
  // break another's build.
  const roots = named
    ? [{ name: basename(resolve(named)), path: resolve(named) }]
    : await scopedRoots(args);
  if (roots.length > 1) {
    throw new Error(
      `generate targets one project; ${roots.length} are registered. Name one: ` +
        `criteria-review generate <path> --out ${out}`
    );
  }

  const { results, missing } = await scanAllRoots(roots);
  for (const m of missing) throw new Error(`${m.name}: ${m.path} (${m.reason})`);

  const scenarios = results.flatMap((r) => r.scenarios);
  const { terms } = settings.terms
    ? await loadTerms(resolve(settingsRoot, settings.terms))
    : { terms: {} };
  const model = buildModel(scenarios, { terms });
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
/**
 * The projects a conversational review works on.
 *
 * Defaults to the tree the session is in, NOT every registered project. A review pass is
 * work on one codebase, and dropping another project's queue into it is both noise and a
 * real hazard: the flagged items at the top would belong to a different piece of work,
 * and answering them from here means answering for a repository nobody in this session
 * has open. `--all` widens deliberately.
 *
 * Falls back to everything when the working directory is not a registered project, which
 * is what makes the command useful from anywhere.
 */
async function scopedRoots(args) {
  if (args.projects.length || args.all) return rootsFrom(args);
  const cfg = await loadConfig();
  const cwd = process.cwd();
  const here = (cfg.projects ?? []).filter(
    (p) => cwd === resolve(p.path) || cwd.startsWith(resolve(p.path) + '/')
  );
  // The deepest match wins, so a worktree inside a registered parent scopes to itself.
  if (here.length) return [here.sort((a, b) => b.path.length - a.path.length)[0]];

  // Not registered, but it declares itself a consumer: use it. Falling through to "the
  // registered projects" would answer about somebody else's repository from inside this
  // one, which is the wrong answer even when it names which project it used.
  try {
    await readFile(join(cwd, PROJECT_CONFIG), 'utf8');
    return [{ name: basename(cwd), path: cwd }];
  } catch {
    // No declaration here; fall back to what is registered.
  }
  return rootsFrom(args);
}

async function resolveScenario(args, id) {
  const roots = await scopedRoots(args);
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

/**
 * Narrow a scan to the documents a branch has touched, when asked.
 *
 * Reports when the diff could not be taken rather than returning nothing: an empty
 * result and a failed diff look identical from the outside, and the second one silently
 * tells a reviewer their branch is clean.
 */
async function narrowToChanged(results, roots, base) {
  if (!base) return { scenarios: results.flatMap((r) => r.scenarios), scope: null };
  const kept = [];
  const unavailable = [];
  for (const r of results) {
    const root = roots.find((x) => x.name === r.project);
    const changed = await changedSince(root?.path ?? r.root, base);
    if (changed === null) {
      unavailable.push(r.project);
      continue;
    }
    kept.push(...r.scenarios.filter((s) => changed.has(s.source)));
  }
  return { scenarios: kept, scope: { base, unavailable } };
}

/**
 * The plan: which scenarios a task covers.
 *
 * Every verb here reads the DOCUMENTS for title, status and flags. The plan file supplies
 * the list of ids and contributes nothing else, so there is no state in it that can
 * disagree with the criteria - and no "mark it done", because done is a scenario whose
 * status moved, not a tick somebody entered.
 */
async function cmdPlan(args) {
  const roots = await scopedRoots(args);
  const root = roots[0]?.path ?? process.cwd();
  const { results } = await scanAllRoots(roots);
  const scenarios = results.flatMap((r) => r.scenarios);
  const verb = args._[1] ?? 'show';

  if (verb === 'clear') {
    await clearPlan(root);
    console.log('plan cleared');
    return;
  }

  const plan = await loadPlan(root);

  // Narrow to named tasks, refusing an ambiguous name rather than picking one - working the
  // wrong task is worse than being asked again.
  const pick = (tasks) => {
    const { selected, unmatched, ambiguous } = selectTasks(tasks, args.tasks ?? []);
    for (const n of unmatched) console.error(`warning: no task matching "${n}" in this plan`);
    for (const a of ambiguous) {
      throw new Error(`"${a.name}" matches ${a.matched.length} tasks: ${a.matched.join(', ')}`);
    }
    return selected;
  };

  if (verb === 'set' || verb === 'add') {
    // Items come from stdin when nothing is on the command line, so a work item's body can
    // be piped in whole rather than reduced to a tidy list first.
    const fromArgs = args._.slice(2);
    const raw = fromArgs.length ? fromArgs : (await readStdin()).split('\n');
    const { ids, unresolved } = resolveItems(raw, scenarios);
    const name = (args.tasks ?? [])[0] ?? null;

    // `add` with a task NAME appends a task; `add` without one grows the last task. `set`
    // replaces everything, because a fresh selection should not silently inherit yesterday's.
    let tasks;
    if (verb === 'set') {
      tasks = [{ task: name, source: args.source ?? null, ids }];
    } else {
      tasks = [...plan.tasks];
      const existing = name ? tasks.find((t) => t.task === name) : tasks[tasks.length - 1];
      if (existing) {
        existing.ids = [...new Set([...existing.ids, ...ids])];
        if (args.source) existing.source = args.source;
      } else {
        tasks.push({ task: name, source: args.source ?? null, ids });
      }
    }
    await savePlan(root, tasks);

    console.log(
      `${verb === 'set' ? 'plan set to' : 'added'} ${ids.length} scenario(s)` +
        `${name ? ` under "${name}"` : ''}; ${tasks.length} task(s) in the plan`
    );
    if (unresolved.length) {
      // Never silent: an item that vanished here is scope that quietly left the task.
      console.log(`\n${unresolved.length} item(s) did NOT resolve:`);
      for (const u of unresolved) console.log(`  ${u.reason}: ${u.text.slice(0, 90)}`);
      console.log('\nThose need criteria written first, or are not criteria-shaped work.');
    }
    return;
  }

  const chosen = pick(plan.tasks);
  const { live, orphaned } = readPlan(plan, scenarios, chosen);
  const state = completeness(live);

  if (verb === 'check') {
    console.log(
      `${state.settled}/${state.total} settled across ${chosen.length} task(s)` +
        `${orphaned.length ? `, ${orphaned.length} orphaned` : ''}`
    );
    for (const s of state.outstanding) {
      console.log(
        `  outstanding  ${(s.id ?? '').padEnd(22)} ${(s.status ?? 'untracked').padEnd(9)}` +
          ` [${s.planTask ?? 'no task'}]  ${s.title}`
      );
    }
    for (const o of orphaned) {
      console.log(`  ORPHANED     ${o.id} [${o.task ?? 'no task'}] - no longer in the documents`);
    }
    // Exit non-zero so this can gate: a task is not done while a declared scenario is not.
    if (state.outstanding.length || orphaned.length) process.exit(1);
    return;
  }

  if (verb === 'next') {
    const next = orderQueue(state.outstanding)[0];
    if (!next) return void console.log('nothing outstanding in the plan');
    printScenario(next);
    return;
  }

  if (verb !== 'show') throw new Error(`unknown plan verb "${verb}". Try: set, add, show, next, check, clear`);

  if (!plan.found) {
    console.log(`no plan for this branch yet (${plan.file})`);
    return;
  }
  console.log(`${state.settled}/${state.total} settled across ${chosen.length} task(s)\n`);
  for (const group of chosen) {
    const mine = live.filter((s) => s.planTask === group.task);
    const done = mine.filter((s) => s.status === 'accepted' || s.status === 'verified').length;
    console.log(
      `${group.task ?? '(unnamed task)'}${group.source ? ` · ${group.source}` : ''}` +
        `  ${done}/${mine.length}`
    );
    for (const s of mine) {
      const mark = s.status === 'accepted' || s.status === 'verified' ? 'x' : ' ';
      console.log(`  [${mark}] ${(s.id ?? '').padEnd(22)} ${(s.status ?? 'untracked').padEnd(9)} ${s.title}`);
    }
    for (const o of orphaned.filter((o) => o.task === group.task)) {
      console.log(`  [!] ${o.id.padEnd(22)} ORPHANED - no longer in the documents`);
    }
    console.log('');
  }
}

/** Read piped input, so a work item's body can arrive whole. */
async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * A manifest tying the evidence to the work it was produced for.
 *
 * A video not tied to a named scenario is only a recording - the viewer cannot tell what it
 * is meant to prove. A PACKAGE not tied to a work item has the same problem one level up:
 * six months later nobody can say which delivery it belonged to, or what was agreed.
 *
 * So this emits the join: scenario id, its status, the clip that proves it, and the task and
 * source the plan recorded. Scenarios with NO recording are listed rather than omitted,
 * because a package that silently contains only what was filmed reads as complete.
 */
/**
 * The glossary: inspect it, validate it, and find what the documents actually use.
 *
 * This tool owns the FORMAT and the REQUIREMENT. It does not own the content and never
 * generates it: a project's vocabulary really lives in its own registry, its own database or
 * its own head, and a second hand-kept copy here would be drift on a new axis. The project
 * writes a script that emits this file; `criteria-glossary` is the skill that helps define
 * that script once so "update glossary" is one command afterwards.
 */
async function cmdTerms(args) {
  const roots = await scopedRoots(args);
  const root = roots[0]?.path ?? process.cwd();
  const settings = await loadSettings(root);
  const verb = args._[1] ?? 'show';

  if (!settings.terms) {
    console.log(
      `No glossary declared for ${roots[0]?.name ?? 'this project'}.\n\n` +
        `Criteria that spell a domain noun go stale the moment the product renames it, and\n` +
        `nothing can notice, because the words are prose. Declare one:\n\n` +
        `  ${PROJECT_CONFIG}: {"terms": "acceptance/terms.json"}\n\n` +
        `Then generate it from wherever your vocabulary really lives - see the standard's\n` +
        `glossary document, and the criteria-glossary skill.`
    );
    return;
  }

  const { terms, file, found } = await loadTerms(resolve(root, settings.terms));
  if (!found) throw new Error(`${settings.terms} is declared but does not exist (${file})`);

  const { results } = await scanAllRoots(roots);
  const scenarios = results.flatMap((r) => r.scenarios);

  // What the documents ask for, versus what the glossary defines. Both directions matter: an
  // unknown key is a broken criterion, and a term nobody uses is usually a rename that only
  // half happened.
  const used = new Map();
  const unresolved = [];
  const spelled = [];
  for (const s of scenarios) {
    for (const text of [s.title, ...s.steps]) {
      const { missing } = renderTerms(text, terms);
      for (const ref of missing) unresolved.push({ ref, id: s.id, source: s.source });
      // A criterion that SPELLS a word the glossary owns is the drift this exists to
      // prevent, caught the day it is written rather than at the next rename.
      for (const hit of findSpelledTerms(text, terms)) {
        spelled.push({ ...hit, id: s.id, source: s.source, text });
      }
      for (const m of String(text).matchAll(/\{([a-zA-Z][\w]*)(?:\.[a-zA-Z]+)?\}/g)) {
        used.set(m[1], (used.get(m[1]) ?? 0) + 1);
      }
    }
  }

  if (verb === 'check') {
    if (spelled.length) {
      // Reported, and NOT fatal by default. On the day a team adopts a glossary every
      // existing document spells its terms, and a gate that fails everything on day one is
      // a gate that gets switched off. `--strict` is what a team turns on once migrated.
      console.log(`${spelled.length} place(s) spell a term instead of naming it:`);
      for (const h of spelled) {
        console.log(`  "${h.spelled}" -> {${h.key}}  in ${h.id} (${h.source})`);
        console.log(`      ${h.text.trim().slice(0, 96)}`);
      }
      console.log('');
    }
    if (!unresolved.length) {
      console.log(`glossary ok: ${Object.keys(terms).length} terms, every marker resolves`);
      // Only --strict makes a spelled term fail, so adopting is a migration rather than a
      // wall, and finishing the migration is something a team opts into.
      if (spelled.length && args.strict) process.exit(1);
      return;
    }
    console.error(`${unresolved.length} unresolved term reference(s):`);
    for (const u of unresolved) console.error(`  ${u.ref}  in ${u.id} (${u.source})`);
    process.exit(1);
  }

  if (verb !== 'show') throw new Error(`unknown terms verb "${verb}". Try: show, check`);

  console.log(`${file}\n${Object.keys(terms).length} term(s)\n`);
  for (const [key, term] of Object.entries(terms)) {
    const n = used.get(key) ?? 0;
    console.log(
      `  ${key.padEnd(18)} ${term.value} / ${term.plural}` +
        `${term.casing === 'preserve' ? '  [casing preserved]' : ''}` +
        `  ${n ? `used ${n}x` : 'UNUSED'}`
    );
    console.log(`  ${''.padEnd(18)} ${term.description}`);
    console.log(
      `  ${''.padEnd(18)} lower: ${variantOf(term, 'lower')} · possessive: ${variantOf(term, 'possessive')}\n`
    );
  }

  const undefinedKeys = [...new Set(unresolved.map((u) => u.ref.split('.')[0]))];
  if (undefinedKeys.length) {
    console.log(`Used in documents but NOT defined: ${undefinedKeys.join(', ')}`);
    console.log('Run `criteria-review terms check` to see where.');
  }
}

async function cmdManifest(args) {
  const roots = await scopedRoots(args);
  const root = roots[0]?.path ?? process.cwd();
  const { results } = await scanAllRoots(roots);
  const all = results.flatMap((r) => r.scenarios);

  const plan = await loadPlan(root);
  let scope = 'everything';
  let chosen = all;
  if (args.since) {
    const narrowed = await narrowToChanged(results, roots, args.since);
    chosen = narrowed.scenarios;
    scope = `changed since ${args.since}`;
  } else if (plan.found && !args.all) {
    const { selected } = selectTasks(plan.tasks, args.tasks ?? []);
    const { live, orphaned } = readPlan(plan, all, selected);
    chosen = live;
    scope = selected.length === plan.tasks.length ? 'the plan' : selected.map((t) => t.task).join(', ');
    for (const o of orphaned) {
      console.error(`warning: ${o.id} is in the plan but not in the documents`);
    }
  }

  const index = await indexVideos(roots[0], (await loadConfig()).mediaRoot).catch(() => null);
  const items = [];
  for (const s of chosen) {
    const hit = index && s.id ? await videoFor(index, s.id) : null;
    items.push({
      id: s.id,
      title: s.title,
      status: s.status,
      persona: s.persona ?? null,
      document: s.source,
      // `how` matters: a fuzzy match is a guess that this clip shows THIS scenario, and a
      // reader accepting evidence deserves to know which kind they were handed.
      video: hit ? { file: basename(hit.file), how: hit.how } : null,
    });
  }

  const manifest = {
    tasks: plan.tasks.map((t) => ({ task: t.task, source: t.source })),
    project: roots[0]?.name ?? null,
    branch: (await branchName(root)) ?? null,
    scope,
    standardVersion: STANDARD_VERSION,
    recorded: new Date().toISOString().slice(0, 10),
    counts: {
      scenarios: items.length,
      recorded: items.filter((i) => i.video).length,
      missing: items.filter((i) => !i.video).length,
    },
    items,
  };

  const text = JSON.stringify(manifest, null, 2) + '\n';
  if (args.out) {
    const target = resolve(root, args.out);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, text, 'utf8');
    console.log(
      `wrote ${args.out}: ${manifest.counts.scenarios} scenario(s) for ` +
        `${manifest.tasks.map((t) => t.task ?? '(unnamed)').join(', ') || '(no task)'}, ` +
        `${manifest.counts.missing} with no recording`
    );
    for (const i of items.filter((x) => !x.video)) console.log(`  no recording: ${i.id} ${i.title}`);
    return;
  }
  console.log(text);
}

async function cmdQueue(args) {
  const roots = await scopedRoots(args);
  const settings = await loadSettings(roots[0]?.path ?? process.cwd()).catch(() => null);
  const since = args.since ?? settings?.since ?? null;
  const { results } = await scanAllRoots(roots);
  let { scenarios: all, scope } = await narrowToChanged(results, roots, since);
  if (args.plan || args.tasks?.length) {
    // The third scope, and the one a developer actually works to: what I chose. Narrowing
    // further to named tasks is how a set of them is worked without the rest in the way.
    const loaded = await loadPlan(roots[0]?.path ?? process.cwd());
    const { selected, ambiguous } = selectTasks(loaded.tasks, args.tasks ?? []);
    for (const a of ambiguous) {
      throw new Error(`"${a.name}" matches ${a.matched.length} tasks: ${a.matched.join(', ')}`);
    }
    const { live, orphaned } = readPlan(loaded, all, selected);
    for (const o of orphaned) {
      console.error(`warning: ${o.id} is in the plan but not in the documents`);
    }
    all = live;
  }
  for (const project of scope?.unavailable ?? []) {
    // Never silent: a project whose diff failed is not a project with nothing to review.
    console.error(`warning: cannot diff ${project} against ${scope.base}; it is not shown`);
  }
  // Same ordering the page uses, imported rather than reimplemented: a walk that
  // disagreed with the screen would leave the reviewer unable to tell which was right.
  const queue = orderQueue(all.filter((s) => needsReview(s)));
  const limit = Number(args.limit ?? settings?.limit ?? 10);

  if (args.json) {
    console.log(JSON.stringify({ total: queue.length, items: queue.slice(0, limit) }, null, 2));
    return;
  }
  console.log(
    `${queue.length} scenario(s) still need a decision in ` +
      `${roots.map((r) => r.name).join(', ')}` +
      `${since ? `, changed since ${since}` : ''}. Most important first:\n`
  );
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
    let commit = args.commit;
    if (status === 'verified' && !commit) {
      // Resolved from the project being reviewed, not asked for. `verified` records WHICH
      // build was watched, and the honest answer is the checkout the reviewer was looking
      // at. Making them find a hash is how a verification stops being recorded at all.
      const head = await headCommit(s.root);
      if (!head) {
        throw new Error(
          `Cannot resolve a commit for ${s.project}: it is not a git checkout. ` +
            'Pass --commit <sha>, because verified records which build was watched.'
        );
      }
      commit = head.sha;
      // Stated rather than hidden: a verification taken against uncommitted work names a
      // commit that does not contain what was watched.
      done.push(head.dirty ? `commit ${commit} (WORKING TREE DIRTY)` : `commit ${commit}`);
    }
    await setStatus(s.file, s.id, status, { commit, actor: ACTOR_ARCHITECT });
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

  // A gate pins an exact version, so it must be able to report which version ran. Without
  // this an unrecognised flag fell through to STARTING THE REVIEW SERVER and died on
  // EADDRINUSE - a version query that boots a web server is the wrong answer twice over.
  if (cmd === 'version' || args._.includes('--version') || args._.includes('-v')) {
    const pkg = JSON.parse(
      await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')
    );
    // Both numbers, because they answer different questions: the package is what you
    // pinned and downloaded, the standard is what your criteria conform to.
    console.log(`criteria-review ${pkg.version} (standard ${STANDARD_VERSION})`);
    return;
  }

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

    // `here` is the command people actually type, and it is documented as idempotent and
    // safe to run on entering a repo. So it is the right place to retire a stale server:
    // leaving one running would serve the previous release's page to somebody who just
    // upgraded, and the symptom - a feature that looks broken - says nothing about the cause.
    const state = await cmdStatus();
    if (state === 2) {
      console.log('restarting: the running server is older than what is installed');
      await cmdStop();
      await cmdStart(args);
    } else if (state === 1) {
      await cmdStart(args);
    }
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

  // Take a copy of the standard so a team can own it. The shipped one stays visible
  // beside theirs unless they turn it off, which is what makes divergence noticeable
  // when the package is upgraded.
  if (cmd === 'standard' && args._[1] === 'eject') {
    const target = args._[2];
    if (!target) throw new Error('standard eject expects a directory, e.g. docs/qa-standard');
    const r = await ejectStandard(resolve(target));
    console.log(`copied ${r.files} documents (standard ${r.version}) to ${target}`);
    console.log(
      `Now declare it, so this is what your team sees:\n` +
        `  ${PROJECT_CONFIG}: {"standard":{"path":"${target}"}}\n` +
        `The shipped standard stays visible as a reference; add "showReference": false to hide it.\n` +
        `Editing these documents does not change what the tool ENFORCES - the status\n` +
        `vocabulary, tag grammar and emitted shape are code, and a copy that disagrees is wrong.`
    );
    return;
  }

  if (cmd === 'generate') return cmdGenerate(args);

  // The conversational surface: walk, read, answer. No browser, no running server.
  if (cmd === 'plan') return cmdPlan(args);
  if (cmd === 'terms') return cmdTerms(args);
  if (cmd === 'manifest') return cmdManifest(args);
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

  // Anything that looks like a command or a flag but was not recognised is an error, not
  // an instruction to open the review UI. The old fallthrough turned a typo - or a flag a
  // newer version understands - into a server start, which in a pipeline is a hang and on
  // a desk is EADDRINUSE from the server already running.
  // `serve` is how a backgrounded server is spawned (see cmdStart), and no args at all is
  // the foreground UI. Everything else reaching here is unrecognised.
  //
  // NAMED EXPLICITLY rather than left to fall through, which is what made the first
  // version of this guard reject the tool's own subprocess and break `start`, `here` and
  // `restart` in a published release. A guard that does not know the commands it is
  // guarding is a guess.
  if (cmd !== undefined && cmd !== 'serve') {
    throw new Error(`unknown command "${cmd}". Run: criteria-review help`);
  }
  if (args._.some((a) => a.startsWith('-'))) {
    throw new Error(
      `unknown option "${args._.find((a) => a.startsWith('-'))}". Run: criteria-review help`
    );
  }

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
