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

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');

/**
 * The two groups, in the order a newcomer needs them.
 *
 * `help` is how to work the tool and the process; `standard` is the rules themselves.
 * Kept as separate groups rather than merged into one list because they answer
 * different questions: someone who has never seen this wants the walkthrough, and
 * someone mid-review wants the rule. A single alphabetical list serves neither.
 */
const GROUPS = [
  { group: 'help', dir: 'help', label: 'Getting started' },
  { group: 'standard', dir: 'standard', label: 'The standard' },
];

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
 * Every readable document, grouped, in reading order.
 *
 * The `name` a caller uses is `<group>/<file>`, so the two directories cannot collide
 * on a filename and the name is still a plain key rather than a path to be joined.
 */
export async function listStandardDocs() {
  const docs = [];

  for (const { group, dir, label } of GROUPS) {
    let entries;
    try {
      entries = await readdir(join(DOCS_DIR, dir), { withFileTypes: true });
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
      const text = await readFile(join(DOCS_DIR, dir, file), 'utf8');
      docs.push({
        name: `${group}/${file}`,
        file,
        group,
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
export async function readStandardDoc(name) {
  const docs = await listStandardDocs();
  const doc = docs.find((d) => d.name === name);
  if (!doc) return null;
  // Rebuilt from the LISTED group and file, never from the caller's string, so even a
  // name that matched by some accident cannot reach outside its own directory.
  const text = await readFile(join(DOCS_DIR, doc.group, doc.file), 'utf8');
  return { ...doc, text };
}
