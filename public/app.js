// Review UI.
//
// Optimised for getting through a queue, not for browsing: the keyboard drives it,
// the next unreviewed item is always one key away, and every action writes straight
// back to the source document. The design rule this serves is that an artefact must
// be checkable in less time than it took to produce, so anything that adds a click
// between reading a scenario and judging it has to earn its place.

import { renderMarkdown, renderSource } from './markdown.js';
import { resolveDocName } from './doc-name.js';
// Shared with the command line, so a conversational review walks the same order the
// page shows. Two implementations of "most important first" would disagree.
import {
  STATUS_ORDER,
  flagged,
  needsAgent,
  intentClass,
  scenarioRisk,
  orderQueue,
} from './queue-order.js';

const $ = (s) => document.querySelector(s);
const state = {
  all: [],
  view: [],
  index: -1,
  projects: [],
  highlight: new Set(),
  // Set from saved state before the first load, and used to reselect the
  // scenario the reviewer was on. Cleared once honoured.
  restoreKey: null,
  // The reading tab: which document is open, and the listing once fetched. Kept
  // beside the queue's state rather than in its own module because the two share
  // the keyboard and only one can be showing.
  tab: 'review',
  docs: [],
  doc: null,
  // Flat is the queue: one ordered list, riskiest first, which is what a review PASS
  // wants. Tree is the map: which document holds what, and which feature inside it,
  // which is what someone answering "where does this live" wants. Different questions,
  // so both, rather than a compromise that serves neither.
  tree: false,
  collapsed: new Set(),
  // The version this page loaded against. A tab left open across an upgrade keeps running
  // its original script while its data refreshes live, so the two can silently disagree
  // about how a scenario should render.
  version: null,
  // Inspection mode, not a preference: a reviewer occasionally needs to see WHICH term a
  // sentence used rather than the word it renders to. Deliberately not persisted - display
  // is the right default every time a page is opened.
  rawTerms: false,
  // A presentation is a third ordering of the same queue, alongside risk order and the tree.
  // Selecting one changes the ORDER and the grouping headings; it changes nothing about a
  // scenario, because those facts are still read from the documents.
  presentations: [],
  presentation: '',
};

/**
 * Filters and the current scenario survive a browser refresh.
 *
 * A review is a session of work, not a page view. Losing the filter and the
 * position on every refresh means re-navigating to where you already were, and
 * the reflex fix - not refreshing - is the wrong one now that a refresh is how
 * you pick up another session's edits.
 *
 * Keyed by scenario identity rather than index, for the same reason live updates
 * are: the queue reorders when a flag is raised, and an index would silently
 * restore a different scenario than the one that was open.
 */
const SAVED = 'criteria-review:view';

function scenarioKey(s) {
  return s ? `${s.project}|${s.id}|${s.title}` : null;
}

function saveViewState() {
  try {
    localStorage.setItem(
      SAVED,
      JSON.stringify({
        project: $('#project').value,
        status: $('#status').value,
        video: $('#video').value,
        search: $('#search').value,
        selected: scenarioKey(state.view[state.index]),
        task: $('#task').value,
        presentation: $('#presentation').value,
        tab: state.tab,
        doc: state.doc,
        tree: state.tree,
        collapsed: [...state.collapsed],
      })
    );
  } catch {
    // A browser refusing storage is not a reason to break the review.
  }
}

function restoreViewState() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(SAVED) || 'null');
  } catch {
    saved = null;
  }
  if (!saved) return;
  // Controls are set before the first render so the first paint is already the
  // view the reviewer left, rather than the default flashing past.
  if (saved.status != null) $('#status').value = saved.status;
  if (saved.video != null) $('#video').value = saved.video;
  if (saved.search != null) $('#search').value = saved.search;
  state.savedTask = saved.task ?? '';
  state.savedPresentation = saved.presentation ?? '';
  state.restoreKey = saved.selected ?? null;
  state.savedProject = saved.project ?? '';
  // The reading position is part of the session too: someone half way through a
  // document who refreshes should be back on it, not at the top of the queue.
  state.doc = saved.doc ?? null;
  state.savedTab = saved.tab === 'standard' ? 'standard' : 'review';
  state.tree = saved.tree === true;
  state.collapsed = new Set(Array.isArray(saved.collapsed) ? saved.collapsed : []);
}

/**
 * A message from whatever is driving the page.
 *
 * Persistent rather than a toast: an agent explaining what it just changed is
 * context the reviewer needs while working through the affected scenarios, not a
 * notification to acknowledge and forget.
 */
function banner(text, onClick) {
  const el = document.getElementById('banner');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  // A banner that offers an action performs it; otherwise clicking dismisses. Both are
  // one click, and which one it is has just been stated in the text.
  el.onclick = onClick ?? (() => { el.hidden = true; });
}

async function api(path, options) {
  const r = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
  return body;
}

/**
 * Every write this page makes is the architect acting, which is what lets the
 * server retire a raised @looknow along with the action.
 *
 * Stamped at the transport rather than at each call site on purpose: a write that
 * forgot it would leave the flag standing on an item already dealt with, and the
 * failure is invisible - the action appears to have worked.
 */
function post(path, body) {
  return api(path, {
    method: 'POST',
    body: JSON.stringify({ ...body, actor: 'architect' }),
  });
}

function toast(msg, isError) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast ' + (isError ? 'error' : 'ok');
  setTimeout(() => {
    if (el.textContent === msg) el.textContent = '';
  }, 4000);
}

function matchesStatus(s, filter) {
  if (filter === '') return true;
  if (filter === 'untracked') return !s.id || !s.status;
  if (filter === 'looknow') return flagged(s);
  if (filter === 'review') return needsAgent(s);
  if (filter === 'noted') return (s.notes || []).length > 0;
  if (filter === 'plan') return s.inPlan === true;
  if (filter === 'needs-review') return !s.id || !s.status || s.status !== 'accepted';
  return s.status === filter;
}

function matchesVideo(s, filter) {
  if (filter === '') return true;
  if (filter === 'has') return !!s.video;
  if (filter === 'named') return s.video?.how === 'named';
  if (filter === 'none') return !s.video;
  return true;
}

/**
 * Order the queue the way the product presents itself.
 *
 * Placement order wins, and anything the presentation does not place falls to the end in its
 * usual risk order rather than disappearing. A view that silently dropped scenarios would be
 * the exact failure the presentation audit exists to catch, reproduced in the one surface
 * where nobody would think to look for it.
 */
function orderByPresentation(items) {
  const pres = state.presentations.find((p) => p.title === state.presentation);
  if (!pres) return orderQueue(items);
  const rank = new Map();
  const section = new Map();
  pres.placements.forEach((p, i) => {
    if (!rank.has(p.id)) rank.set(p.id, i);
    if (!section.has(p.id)) section.set(p.id, p.path.join(' > '));
  });
  const placed = items
    .filter((s) => rank.has(s.id))
    .map((s) => ({ ...s, presSection: section.get(s.id) }))
    .sort((a, b) => rank.get(a.id) - rank.get(b.id));
  const rest = orderQueue(items.filter((s) => !rank.has(s.id)));
  return [...placed, ...rest.map((s) => ({ ...s, presSection: 'Not in this presentation' }))];
}

function applyFilters() {
  const project = $('#project').value;
  const status = $('#status').value;
  const q = $('#search').value.trim().toLowerCase();

  const video = $('#video').value;
  const task = $('#task').value;
  state.presentation = $('#presentation').value;

  const filtered = state.all
    // A set of tasks is normal, so narrowing to one is a filter rather than a mode.
    .filter((s) => (task ? s.planTask === task : true))
    .filter((s) => (project ? s.project === project : true))
    .filter((s) => matchesStatus(s, status))
    .filter((s) => matchesVideo(s, video))
    .filter((s) =>
      q
        ? [
            s.id,
            s.title,
            s.titleDisplay,
            s.feature,
            s.persona,
            s.source,
            (s.steps || []).join(' '),
            (s.stepsDisplay || []).join(' '),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q)
        : true
    );

  state.view = state.presentation ? orderByPresentation(filtered) : orderQueue(filtered);

  state.index = state.view.length ? Math.min(Math.max(state.index, 0), state.view.length - 1) : -1;
  renderList();
  renderDetail();
  saveViewState();
}

function statusPill(s) {
  const label = s.status || 'untracked';
  return `<span class="pill ${label}">${label}</span>`;
}

/**
 * Show which tree each project resolves to.
 *
 * A worktree and its main clone share a project name and a git remote, so the
 * name alone cannot distinguish them - and reviewing the wrong tree looks
 * identical to reviewing the right one right up until the scenarios disagree.
 */
function renderRoots() {
  const el = $('#roots');
  if (!el) return;
  const project = $('#project').value;
  const shown = project ? state.projects.filter((p) => p.name === project) : state.projects;
  el.innerHTML = shown
    .map(
      (p) =>
        `<span class="root" title="${escapeHtml(p.root)}"><b>${escapeHtml(p.name)}</b>${
          p.branch ? ` <span class="branch">${escapeHtml(p.branch)}</span>` : ''
        } ${escapeHtml(shorten(p.root))}</span>`
    )
    .join('');
}

/** Keep the tail of a path, which is the part that distinguishes worktrees. */
function shorten(path) {
  const parts = String(path).split('/');
  return parts.length > 3 ? '…/' + parts.slice(-3).join('/') : path;
}

function renderCounts() {
  const by = {};
  for (const s of state.all) {
    const k = !s.id || !s.status ? 'untracked' : s.status;
    by[k] = (by[k] || 0) + 1;
  }
  $('#counts').innerHTML = Object.entries(by)
    .map(([k, v]) => `<span class="pill ${k}">${k} ${v}</span>`)
    .join('');
}

/** One scenario row. Shared by both views so they cannot drift in how a scenario reads. */
function scenarioRow(s, i, depth = 0) {
  return `<button class="row depth-${depth} ${i === state.index ? 'active' : ''} ${
          state.highlight.has(s.id) ? 'highlighted' : ''
        }" data-i="${i}">
          <span class="row-top">${flagged(s) ? '<span class="looknow">LOOK</span>' : ''}${
            needsAgent(s) ? '<span class="forme">NOTED</span>' : ''
          }${statusPill(s)}<code>${s.id || '(no id)'}</code>${
            intentClass(s.intent) === 'sourced'
              ? ''
              : `<span class="no-intent" title="${
                  intentClass(s.intent) === 'missing'
                    ? 'No intent recorded'
                    : 'Intent recorded but no source cited'
                }">!</span>`
          }</span>
          <span class="row-title">${escapeHtml(s.titleDisplay ?? s.title)}</span>
        </button>`;
}

/** The queue: one ordered list, with a header where the document changes. */
/** Grouped by the presentation's own headings, so the walk reads as it was written. */
function renderPresentation() {
  let last = null;
  return state.view
    .map((s, i) => {
      let header = '';
      if (s.presSection !== last) {
        last = s.presSection;
        header = `<div class="doc-head"><span class="doc-name">${escapeHtml(
          s.presSection ?? ''
        )}</span></div>`;
      }
      return header + scenarioRow(s, i);
    })
    .join('');
}

function renderFlat() {
  // A header whenever the document changes, so the batch boundary is visible. Without
  // it the grouping is real but invisible, and a reviewer cannot tell whether the next
  // item continues the current feature or starts a new one.
  let lastDoc = null;
  return state.view
    .map((s, i) => {
      const doc = `${s.project} ${s.source}`;
      let header = '';
      if (doc !== lastDoc) {
        lastDoc = doc;
        const remaining = state.view.filter((x) => `${x.project} ${x.source}` === doc).length;
        header = `<div class="doc-head">
            <span class="doc-name">${escapeHtml(s.source.split('/').slice(-1)[0])}</span>
            <span class="doc-meta">${escapeHtml(s.project)} · ${remaining}</span>
          </div>`;
      }
      return header + scenarioRow(s, i);
    })
    .join('');
}

/**
 * The map: project, document, feature, scenario.
 *
 * Groups keep the order of FIRST APPEARANCE in the queue rather than sorting
 * alphabetically, so the riskiest document is still at the top and the two views agree
 * about what matters most. A tree that reordered the queue would quietly disagree with
 * every other surface about where to start.
 */
function renderTree() {
  const tree = new Map();
  state.view.forEach((s, i) => {
    const docKey = `${s.project}|${s.source}`;
    if (!tree.has(docKey)) tree.set(docKey, { scenario: s, features: new Map() });
    const featureKey = s.feature ?? '';
    const features = tree.get(docKey).features;
    if (!features.has(featureKey)) features.set(featureKey, []);
    features.get(featureKey).push([s, i]);
  });

  const caret = (open) => `<span class="caret">${open ? '▾' : '▸'}</span>`;
  const out = [];

  for (const [docKey, { scenario, features }] of tree) {
    const docOpen = !state.collapsed.has(docKey);
    const count = [...features.values()].reduce((n, list) => n + list.length, 0);
    out.push(
      `<div class="doc-head tree-head" data-group="${escapeHtml(docKey)}">
        ${caret(docOpen)}
        <span class="doc-name">${escapeHtml(scenario.source.split('/').slice(-1)[0])}</span>
        <span class="doc-meta">${escapeHtml(scenario.project)} · ${count}</span>
      </div>`
    );
    if (!docOpen) continue;

    for (const [featureKey, list] of features) {
      const featKey = `${docKey}|${featureKey}`;
      const featOpen = !state.collapsed.has(featKey);
      // A document with no Feature headings would otherwise grow a nameless level that
      // costs a click and says nothing.
      const named = featureKey !== '';
      if (named) {
        out.push(
          `<div class="feature-head" data-group="${escapeHtml(featKey)}">
            ${caret(featOpen)}
            <span>${escapeHtml(featureKey)}</span>
            <span class="doc-meta">${list.length}</span>
          </div>`
        );
        if (!featOpen) continue;
      }
      for (const [s, i] of list) out.push(scenarioRow(s, i, named ? 1 : 0));
    }
  }
  return out.join('');
}

function renderList() {
  $('#list').innerHTML = state.presentation
    ? renderPresentation()
    : state.tree
      ? renderTree()
      : renderFlat();
  const active = $('#list .row.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

/**
 * The recording, when there is one.
 *
 * Reading the criteria tells you the test says what the scenario says. Only
 * watching the software tells you the scenario describes something that can
 * actually happen - which is the failure a side-by-side comparison cannot catch,
 * because the scenario and the test can agree perfectly and both be wrong.
 *
 * A fuzzy-matched recording is labelled as such. Accepting a scenario on the
 * strength of a video means trusting that the video shows THAT scenario, and a
 * guess is not the same evidence as a file named for it.
 */
/**
 * The architect's notes on a scenario.
 *
 * Rendered rather than merely stored. A note written into a document nobody
 * displays is indistinguishable from no note at all, which is what the first
 * version shipped: write-only, single-line, invisible afterwards.
 */
function renderNotes(s) {
  const notes = s.notes || [];
  if (!notes.length) return '';
  return `<div class="notes">
    <div class="notes-head">
      <strong>Review notes</strong>
      ${needsAgent(s) ? '<span class="await">awaiting an agent</span>' : ''}
      <button class="note-clear" data-act="clearnotes">Mark handled</button>
    </div>
    ${notes
      .map(
        (n) => `<div class="note">
          ${n.who ? `<span class="note-who">${escapeHtml(n.who)}</span>` : ''}
          <div class="note-body">${escapeHtml(n.text)}</div>
        </div>`
      )
      .join('')}
  </div>`;
}

function renderVideo(s) {
  if (!s.id) return '';
  if (!s.video) {
    return `<div class="video none">
      <strong>No recording.</strong>
      <span>Expected at <code>${escapeHtml(s.videoExpected || 'qa/videos/' + s.id + '.webm')}</code></span>
    </div>`;
  }
  const src = `/api/video?project=${encodeURIComponent(s.project)}&id=${encodeURIComponent(s.id)}`;
  return `<div class="video">
    <div class="video-head">
      <strong>Recording</strong>
      <code>${escapeHtml(s.video.name)}</code>
      <span class="src ${s.video.how}" title="${
        s.video.how === 'local'
          ? 'This worktree&#39;s own recording. It overrides master, because filming in a worktree is how you see what THIS branch does.'
          : s.video.how === 'master'
            ? 'From the shared master library: the accepted baseline for work this branch did not touch.'
            : 'Found by matching the scenario ID inside a path under test-results, not by the naming convention. A guess, not evidence.'
      }">${s.video.how === 'matched' ? 'matched, not named' : s.video.how}</span>
      <button class="fs" data-fullscreen>Fullscreen (f)</button>
    </div>
    <video id="player" controls preload="metadata" src="${src}"></video>
  </div>`;
}

/**
 * Does this scenario name any concept through the glossary?
 *
 * Compared against the RENDERED form rather than by looking for braces, so a scenario whose
 * prose happens to contain a brace does not grow a toggle that would do nothing. The offer
 * only appears where there is something behind it.
 */
function usesTerms(s) {
  if (!s.stepsDisplay && !s.titleDisplay) return false;
  if ((s.titleDisplay ?? s.title) !== s.title) return true;
  return (s.steps || []).some((raw, i) => (s.stepsDisplay || [])[i] !== raw);
}

function renderDetail() {
  const s = state.view[state.index];
  if (!s) {
    $('#detail').innerHTML = `<p class="empty">Nothing matches the current filter.</p>`;
    return;
  }

  const cls = intentClass(s.intent);
  const intent =
    cls === 'missing'
      ? `<p class="intent missing"><strong>Intent:</strong> not recorded. This scenario cannot be
         distinguished from one written by reading the code.</p>`
      : `<p class="intent ${cls}">
           <strong>Intent:</strong> ${escapeHtml(s.intent)}
           ${
             cls === 'unsourced'
               ? '<em class="unsourced-note">No source cited, so this describes what the software appears to do. A test citing it cannot disagree with the software.</em>'
               : ''
           }
         </p>`;

  $('#detail').innerHTML = `
    <div class="detail-head">
      ${flagged(s) ? '<span class="looknow">LOOK NOW</span>' : ''}
      ${needsAgent(s) ? '<span class="forme">NOTED FOR AGENT</span>' : ''}
      ${statusPill(s)}
      <code class="id">${s.id || '(no id)'}</code>
      ${s.persona ? `<span class="persona">${escapeHtml(s.persona)}</span>` : ''}
    </div>
    <h2>${escapeHtml(state.rawTerms ? s.title : (s.titleDisplay ?? s.title))}</h2>
    <p class="where">${escapeHtml(s.project)} · ${escapeHtml(s.source)}${
      s.feature ? ` · <em>${escapeHtml(s.feature)}</em>` : ''
    }</p>
    ${intent}
    ${
      usesTerms(s)
        ? `<button class="term-toggle" data-act="toggle-raw">${
            state.rawTerms ? 'showing glossary keys - show words' : 'show glossary keys'
          }</button>`
        : ''
    }
    <pre class="steps">${(state.rawTerms ? s.steps : (s.stepsDisplay ?? s.steps))
      .map(escapeHtml)
      .join('\n')}</pre>
    ${renderNotes(s)}
    ${renderVideo(s)}
    ${
      s.verifiedOn
        ? `<p class="verified-meta">verified ${escapeHtml(s.verifiedOn)}${
            s.commit ? ` at ${escapeHtml(s.commit)}` : ''
          }</p>`
        : ''
    }
    <div class="actions">
      <button data-act="accepted" ${!s.id ? 'disabled' : ''}>Accept (a)</button>
      <button data-act="verified" ${!s.id ? 'disabled' : ''}>Verified (v)</button>
      <button data-act="derived" ${!s.id ? 'disabled' : ''}>Back to derived</button>
      <button data-act="note" ${!s.id ? 'disabled' : ''}>Add note (n)</button>
      ${flagged(s) ? `<button data-act="unflag">Clear LOOK NOW</button>` : ''}
    </div>
    ${
      !s.id
        ? `<p class="warn">No ID, so nothing can cite it and no status can be stored.
           Add <code>@AREA-THING-001 @status:derived</code> above the Scenario line.</p>`
        : ''
    }
  `;
}

async function act(action) {
  const s = state.view[state.index];
  if (!s || !s.id) return;
  try {
    if (action === 'unflag') {
      await post('/api/flag', { project: s.project, id: s.id, flag: 'looknow', on: false });
      toast(`cleared LOOK NOW on ${s.id}`);
    } else if (action === 'clearnotes') {
      // Routed explicitly. Falling through to the status branch sent "clearnotes"
      // as a status, and setStatus is deliberately permissive on the vocabulary,
      // so the button stamped @status:clearnotes onto the scenario instead of
      // retiring the discussion.
      const { removed } = await post('/api/notes/clear', { project: s.project, id: s.id });
      toast(`${s.id}: cleared ${removed} note${removed === 1 ? '' : 's'}`);
    } else if (action === 'note') {
      // The editor owns the rest: it writes and reloads on close, so there is
      // nothing to await here.
      openNoteEditor(s);
      return;
    } else {
      await post('/api/status', { project: s.project, id: s.id, status: action });
      toast(`${s.id} -> ${action}`);
    }
    await load({ keepIndex: true });
  } catch (e) {
    toast(e.message, true);
  }
}

/**
 * Multi-line note editor.
 *
 * A prompt() was the wrong shape: the architect is discussing an item, not
 * labelling it, and a single line with no wrapping is why notes went unwritten.
 */
function openNoteEditor(s) {
  const dlg = document.getElementById('note-dialog');
  document.getElementById('note-for').textContent = `${s.id} - ${s.titleDisplay ?? s.title}`;
  const ta = document.getElementById('note-text');
  ta.value = '';
  dlg.showModal();
  ta.focus();

  dlg.onclose = async () => {
    if (dlg.returnValue !== 'save') return;
    const note = ta.value.trim();
    if (!note) return;
    try {
      await post('/api/note', { project: s.project, id: s.id, note, author: 'architect' });
      toast(`note saved on ${s.id}; raised for an agent`);
      await load({ keepIndex: true });
    } catch (e) {
      toast(e.message, true);
    }
  };
}

function revealSelected() {
  if (!state.tree) return;
  const s = state.view[state.index];
  if (!s) return;
  const docKey = `${s.project}|${s.source}`;
  state.collapsed.delete(docKey);
  state.collapsed.delete(`${docKey}|${s.feature ?? ''}`);
}

function move(delta) {
  if (!state.view.length) return;
  state.index = Math.min(Math.max(state.index + delta, 0), state.view.length - 1);
  // Before painting, not after: a selection inside a collapsed group would be real and
  // invisible, and the reviewer would answer whatever they could see instead.
  revealSelected();
  renderList();
  renderDetail();
  saveViewState();
}

async function loadPresentationsList() {
  try {
    state.presentations = (await api('/api/presentations')).presentations ?? [];
  } catch {
    state.presentations = [];
  }
}

async function load({ keepIndex } = {}) {
  // Remember WHICH scenario is selected, not where it sat. An external edit can
  // reorder the queue - a @looknow jumps to the top - and restoring by position
  // would silently move the reviewer onto a different scenario than the one they
  // were reading.
  const selectedKey = scenarioKey(state.view[state.index]) ?? state.restoreKey;

  const data = await api('/api/scenarios');
  state.all = data.scenarios;
  state.projects = data.projects;

  const sel = $('#project');
  // The saved project is only applied once, on the first load, because the
  // option list does not exist until the projects arrive.
  const current = sel.value || state.savedProject || '';
  state.savedProject = '';
  sel.innerHTML =
    '<option value="">all projects</option>' +
    data.projects
      .map(
        (p) =>
          `<option value="${escapeHtml(p.name)}" title="${escapeHtml(p.root)}">${escapeHtml(
            p.name
          )}${p.branch ? ' @ ' + escapeHtml(p.branch) : ''} (${p.count})</option>`
      )
      .join('');
  sel.value = current;

  // Build the status filter from the statuses actually present. A hard-coded list
  // silently hides a status the projects have started using, which is how
  // `proposed` went unnoticed until it appeared in a screenshot.
  const st = $('#status');
  const seen = [...new Set(data.scenarios.map((x) => x.status).filter(Boolean))].sort();
  const fixed = [
    ['needs-review', 'needs review'],
    ['looknow', 'LOOK NOW (flagged)'],
    ['untracked', 'untracked (no id/status)'],
  ];
  const stCurrent = st.value;
  st.innerHTML =
    fixed.map(([v, l]) => `<option value="${v}">${l}</option>`).join('') +
    seen.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('') +
    '<option value="">everything</option>';
  st.value = stCurrent;

  // The task list comes from what the plan actually declared, so an option cannot exist for
  // a task nothing is planned under - and a selection that no longer exists falls back to
  // "all" rather than silently showing an empty queue.
  const taskSel = $('#task');
  const tasks = [...new Set(state.all.map((s) => s.planTask).filter(Boolean))].sort();
  const wantTask = taskSel.value || state.savedTask || '';
  taskSel.innerHTML =
    '<option value="">all tasks</option>' +
    tasks.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  taskSel.value = tasks.includes(wantTask) ? wantTask : '';
  state.savedTask = null;
  taskSel.hidden = tasks.length === 0;

  renderRoots();

  if (!keepIndex) state.index = 0;
  renderCounts();
  applyFilters();

  if (selectedKey) {
    const i = state.view.findIndex((s) => scenarioKey(s) === selectedKey);
    if (i !== -1 && i !== state.index) {
      state.index = i;
      renderList();
      renderDetail();
    }
    state.restoreKey = null;
  }
  saveViewState();

  // Say so ONCE, and only when it has actually changed - a page nagging on every refresh
  // gets its banner dismissed reflexively, which is the same as not warning at all.
  if (data.standardVersion) {
    if (!state.version) state.version = data.standardVersion;
    else if (state.version !== data.standardVersion && !state.staleNotified) {
      state.staleNotified = true;
      banner(
        `This page was loaded against standard ${state.version}; the tool is now running ` +
          `${data.standardVersion}. Click here to reload and pick it up.`,
        () => location.reload()
      );
    }
  }

  if (data.missing?.length) {
    toast(`Missing roots: ${data.missing.map((m) => m.name).join(', ')}`, true);
  }
}

/**
 * The reading tab.
 *
 * The standard is what the queue is judging against, so a reviewer deciding whether a
 * scenario is written correctly should be able to read the rule without leaving the
 * page. Read-only on purpose: disagreeing with a rule is a change to the repository
 * that owns it, and goes through review like any other.
 */
function renderDocList() {
  const el = $('#doc-list');
  if (!state.docs.length) {
    el.innerHTML = '<p class="empty">No standard documents found.</p>';
    return;
  }
  // Grouped, because the two sets answer different questions: someone who has never
  // seen this wants the walkthrough, someone mid-review wants the rule. One flat list
  // serves neither.
  let group = null;
  el.innerHTML = state.docs
    .map((d) => {
      const heading =
        d.group === group ? '' : `<div class="doc-group">${escapeHtml(d.groupLabel)}</div>`;
      group = d.group;
      return (
        heading +
        `<div class="row doc-row ${d.name === state.doc ? 'active' : ''}" data-doc="${escapeHtml(d.name)}">` +
        `<div class="row-title">${escapeHtml(d.title)}</div>` +
        `<div class="row-sub">${escapeHtml(d.file)}</div>` +
        `</div>`
      );
    })
    .join('');
  const active = el.querySelector('.row.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

async function openDoc(rawName) {
  const target = $('#doc');
  const name = resolveDocName(state.docs, rawName, state.doc);
  try {
    const doc = await api(`/api/standard/doc?name=${encodeURIComponent(name)}`);
    state.doc = doc.name;
    // A .ts example is shown as source rather than parsed as prose: its comments and
    // asterisks are code, and rendering them as markup would rewrite the sample.
    target.innerHTML =
      doc.kind === 'source' ? renderSource(doc.text, 'ts') : renderMarkdown(doc.text);
    target.scrollTop = 0;
    renderDocList();
    saveViewState();
  } catch (e) {
    target.innerHTML = `<p class="empty">Could not open ${escapeHtml(name)}: ${escapeHtml(e.message)}</p>`;
  }
}

async function showTab(tab) {
  state.tab = tab;
  $('#review-pane').hidden = tab !== 'review';
  $('#standard-pane').hidden = tab !== 'standard';
  for (const b of document.querySelectorAll('#tabs button')) {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    // The class is what a sighted reader sees; this is what everything else reads. Setting
    // one without the other makes the tab strip a lie to half its audience.
    b.setAttribute('aria-selected', String(on));
  }
  // The queue's filters steer the queue and mean nothing while reading, so they go
  // rather than sit there implying they apply to what is on screen. Same for the
  // key hints: an advertised key that does nothing teaches distrust of the whole row.
  $('.filters').hidden = tab !== 'review';
  $('#counts').hidden = tab !== 'review';
  $('#keys-review').hidden = tab !== 'review';
  $('#keys-standard').hidden = tab === 'review';
  saveViewState();

  if (tab !== 'standard') return;
  if (!state.docs.length) {
    try {
      state.docs = (await api('/api/standard')).docs;
    } catch (e) {
      toast(e.message, true);
    }
  }
  // Open something, always. A restored name marks its row active but has no text
  // behind it until it is fetched, so leaving this to renderDocList alone shows a
  // selected document with an empty pane - which reads as the document being blank.
  const wanted = state.docs.some((d) => d.name === state.doc) ? state.doc : state.docs[0]?.name;
  if (wanted) await openDoc(wanted);
  else renderDocList();
}

/** Move through the reading list with the same keys as the queue. */
function moveDoc(delta) {
  if (!state.docs.length) return;
  const at = state.docs.findIndex((d) => d.name === state.doc);
  const next = Math.min(state.docs.length - 1, Math.max(0, (at === -1 ? 0 : at) + delta));
  openDoc(state.docs[next].name);
}

function setListMode(tree) {
  state.tree = tree;
  $('#view-mode').textContent = tree ? 'flat' : 'tree';
  $('#view-mode').setAttribute('aria-pressed', String(tree));
  revealSelected();
  renderList();
  saveViewState();
}

$('#view-mode').addEventListener('click', () => setListMode(!state.tree));

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) showTab(b.dataset.tab);
});

$('#doc-list').addEventListener('click', (e) => {
  const row = e.target.closest('.doc-row');
  if (row) openDoc(row.dataset.doc);
});

// Cross-references between the documents are rewritten to #doc= links, so following
// one opens it here rather than downloading a file or dead-ending.
$('#doc').addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#doc="]');
  if (!a) return;
  e.preventDefault();
  openDoc(decodeURIComponent(a.getAttribute('href').slice('#doc='.length)));
});

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }

  // One key switches, from either side.
  if (e.key === 's') return void showTab(state.tab === 'standard' ? 'review' : 'standard');

  // While reading, only navigation applies. Leaving `a` and `v` live would let a
  // reviewer promote a scenario they cannot currently see, which is the one action
  // in this tool that must never happen by accident.
  if (state.tab === 'standard') {
    if (e.key === 'j') moveDoc(1);
    else if (e.key === 'k') moveDoc(-1);
    return;
  }

  if (e.key === 't') setListMode(!state.tree);
  else if (e.key === 'j') move(1);
  else if (e.key === 'k') move(-1);
  else if (e.key === 'a') act('accepted');
  else if (e.key === 'v') act('verified');
  else if (e.key === 'n') act('note');
  else if (e.key === 'r') {
    load({ keepIndex: true }).then(() => toast('reloaded'));
  } else if (e.key === 'f') {
    const v = document.getElementById('player');
    if (v) (v.requestFullscreen ? v.requestFullscreen() : v.webkitEnterFullscreen?.());
  } else if (e.key === '/') {
    e.preventDefault();
    $('#search').focus();
  }
});

$('#list').addEventListener('click', (e) => {
  const group = e.target.closest('[data-group]');
  if (group) {
    const key = group.dataset.group;
    if (state.collapsed.has(key)) state.collapsed.delete(key);
    else state.collapsed.add(key);
    renderList();
    saveViewState();
    return;
  }
  const row = e.target.closest('.row');
  if (!row) return;
  state.index = Number(row.dataset.i);
  renderList();
  renderDetail();
  saveViewState();
});

$('#detail').addEventListener('click', (e) => {
  if (e.target.closest('[data-fullscreen]')) {
    const v = document.getElementById('player');
    if (v) (v.requestFullscreen ? v.requestFullscreen() : v.webkitEnterFullscreen?.());
    return;
  }
  const b = e.target.closest('button[data-act]');
  if (b?.dataset.act === 'toggle-raw') {
    state.rawTerms = !state.rawTerms;
    renderDetail();
    return;
  }
  if (b) act(b.dataset.act);
});

for (const id of ['#project', '#status', '#video', '#search', '#task', '#presentation']) {
  $(id).addEventListener('input', () => {
    applyFilters();
    renderRoots();
  });
}

/**
 * Live updates.
 *
 * The page is left open while other sessions edit the same documents, so it has to
 * notice. EventSource reconnects on its own, which is why there is no retry logic
 * here; a dropped connection during a laptop sleep heals without intervention.
 */
function listen() {
  const es = new EventSource('/api/events');
  es.addEventListener('changed', () => {
    load({ keepIndex: true })
      .then(() => toast('updated from disk'))
      .catch((e) => toast(e.message, true));
  });
  es.addEventListener('push', (ev) => {
    let p;
    try {
      p = JSON.parse(ev.data);
    } catch {
      return;
    }

    if (p.message) banner(p.message);
    state.highlight = new Set(p.highlight || []);

    if (p.filter) {
      // Only touch the controls named, so a push that narrows by status does not
      // silently discard a project filter the reviewer set for themselves.
      if ('project' in p.filter) $('#project').value = p.filter.project ?? '';
      if ('status' in p.filter) $('#status').value = p.filter.status ?? '';
      if ('video' in p.filter) $('#video').value = p.filter.video ?? '';
      if ('search' in p.filter) $('#search').value = p.filter.search ?? '';
    }

    if (p.focus) {
      // Widen before selecting, or a focus lands on a scenario the current filter
      // excludes and appears to do nothing at all.
      $('#status').value = '';
      $('#video').value = '';
      $('#search').value = p.focus;
      if (p.project) $('#project').value = p.project;
    }

    load({ keepIndex: !p.focus })
      .then(() => {
        if (!p.focus) return;
        const i = state.view.findIndex((s) => s.id === p.focus);
        if (i !== -1) {
          state.index = i;
          renderList();
          renderDetail();
          toast(`focused ${p.focus}`);
        } else {
          toast(`${p.focus} not found`, true);
        }
      })
      .catch((e) => toast(e.message, true));
  });

  es.onerror = () => {
    // Browser handles reconnection; only say something if it stays down.
    if (es.readyState === EventSource.CLOSED) toast('live updates disconnected', true);
  };
}

restoreViewState();
setListMode(state.tree);
loadPresentationsList()
  .then(load)
  .then(listen)
  .then(() => {
    // After the queue, so a refresh into the reading tab still has the review pane
    // populated behind it and switching back is instant.
    if (state.savedTab === 'standard') return showTab('standard');
  })
  .catch((e) => toast(e.message, true));
