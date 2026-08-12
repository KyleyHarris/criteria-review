// Serving the standard's own documents to the review page.
//
// WHY IN THE TOOL. The standard is what the review queue is judging against, and a
// reviewer deciding whether a scenario is written correctly should not have to leave
// the page and go find a repository to read the rule. The documents already travel
// with the tool, so exposing them costs a directory listing.
//
// The set is fixed and small, so this is a read-only allowlist rather than a file
// server. That is the whole security model, and it is deliberate: a route that takes
// a caller-supplied name and joins it onto a directory is a path traversal waiting
// to be written, and this server reads and writes the architect's documents.

import { readdir, readFile, mkdir, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSettings } from './config.js';
import { STANDARD_VERSION } from './version.js';

const DOCS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');

/** Readable as prose (rendered) or as source (shown as one code block). */
const READABLE = new Set(['.md', '.ts']);

/**
 * Reading order. The README is the index and belongs first; numbered files carry
 * their own order; everything else follows alphabetically. Sorting purely
 * lexicographically would bury the index in the middle of the list, which is where
 * a first-time reader is least likely to look for it.
 */
function readingOrder(a, b) {
  const rank = (n) => (n.toLowerCase().startsWith('readme') ? 0 : /^\d/.test(n) ? 1 : 2);
  return rank(a) - rank(b) || a.localeCompare(b);
}

/** The document's own H1, so the list reads as titles rather than as filenames. */
function titleOf(name, text) {
  const heading = text.split('\n').find((l) => /^#\s+\S/.test(l));
  if (heading) return heading.replace(/^#\s+/, '').trim();
  return name;
}

/**
 * Where the documents shown in the reading tab come from.
 *
 * A project may hold its OWN standard - a company adopting this tool ejects a copy and
 * edits it for their organisation, and theirs is what their people should see. The
 * shipped one stays visible beside it unless they turn it off, which is what lets them
 * notice divergence when the package is upgraded: a fork that hides its original cannot
 * tell when the original moved.
 *
 * FORKING THE DOCUMENTS DOES NOT FORK THE BEHAVIOUR. The status vocabulary, the tag
 * grammar and the emitted shape are enforced in code and versioned; a copy that disagrees
 * with them is wrong rather than authoritative.
 */
async function groupsFor(roots = []) {
  const groups = [];
  for (const root of roots) {
    let settings;
    try {
      settings = await loadSettings(root.path ?? root);
    } catch {
      // A malformed config must not blank the reading tab; the verbs that depend on it
      // report it loudly enough.
      continue;
    }
    if (!settings.standard.path) continue;
    groups.push({
      group: `standard:${root.name ?? 'project'}`,
      absolute: resolve(root.path ?? root, settings.standard.path),
      label: roots.length > 1 ? `${root.name} standard` : 'The standard',
      showReference: settings.standard.showReference,
    });
    if (settings.extraDocs) {
      groups.push({
        group: `extra:${root.name ?? 'project'}`,
        absolute: resolve(root.path ?? root, settings.extraDocs),
        label: roots.length > 1 ? `${root.name} docs` : 'Project documents',
      });
    }
  }

  const anyOwn = groups.some((g) => g.group.startsWith('standard:'));
  const hideShipped = anyOwn && groups.every((g) => g.showReference === false);

  return [
    { group: 'help', dir: 'help', label: 'Getting started' },
    ...groups,
    ...(hideShipped
      ? []
      : [
          {
            group: 'standard',
            dir: 'standard',
            label: anyOwn ? `Reference standard (shipped ${STANDARD_VERSION})` : 'The standard',
          },
        ]),
  ];
}

/** Copy the shipped standard into a project so it can be edited and owned. */
export async function ejectStandard(targetDir) {
  const from = join(DOCS_DIR, 'standard');
  const names = (await readdir(from, { withFileTypes: true }))
    .filter((e) => e.isFile() && READABLE.has(extensionOf(e.name)))
    .map((e) => e.name);
  await mkdir(targetDir, { recursive: true });
  for (const name of names) await copyFile(join(from, name), join(targetDir, name));
  return { files: names.length, version: STANDARD_VERSION, target: targetDir };
}

/**
 * Every readable document, grouped, in reading order.
 *
 * The `name` a caller uses is `<group>/<file>`, so two directories cannot collide on a
 * filename and the name stays a plain key rather than a path to be joined.
 */
export async function listStandardDocs(roots = []) {
  const docs = [];

  for (const { group, dir, label, absolute } of await groupsFor(roots)) {
    const base = absolute ?? join(DOCS_DIR, dir);
    let entries;
    try {
      entries = await readdir(base, { withFileTypes: true });
    } catch {
      // A checkout without a directory is not an error worth failing the server over;
      // the tab simply shows the group that is there.
      continue;
    }

    const names = entries
      .filter((e) => e.isFile() && READABLE.has(extensionOf(e.name)))
      .map((e) => e.name)
      .sort(readingOrder);

    for (const file of names) {
      const text = await readFile(join(base, file), 'utf8');
      docs.push({
        name: `${group}/${file}`,
        file,
        group,
        base,
        groupLabel: label,
        title: titleOf(file, text),
        kind: extensionOf(file) === '.md' ? 'markdown' : 'source',
      });
    }
  }

  return docs;
}

function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

/**
 * One document, by name.
 *
 * The name is checked against the ACTUAL LISTING rather than sanitised. A sanitiser
 * is a claim that every traversal has been thought of; a listing is a fact about what
 * exists. `../../.ssh/id_rsa` is not refused because it looks dangerous, it is
 * refused because it is not one of the files in this directory.
 */
export async function readStandardDoc(name, roots = []) {
  const docs = await listStandardDocs(roots);
  const doc = docs.find((d) => d.name === name);
  if (!doc) return null;
  // Rebuilt from the LISTED directory and file, never from the caller's string, so even a
  // name that matched by some accident cannot reach outside its own directory.
  const text = await readFile(join(doc.base, doc.file), 'utf8');
  return { ...doc, text };
}
