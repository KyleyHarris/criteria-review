// The glossary: words that name domain concepts, resolved when criteria are read.
//
// WHY CRITERIA NEED THIS AT ALL. A scenario is user-facing prose naming domain concepts, so
// it is exactly the class of text a glossary exists for - and it was the one surface nobody
// applied the rule to. When a product renames the thing a login belongs to from "Member" to
// "Company", every criterion that spelled the word is silently describing something that no
// longer exists, and no test can notice because the words are prose.
//
// TWO RULES, TAKEN FROM THE APPLICATION-SIDE FEATURE THIS MIRRORS. They are copied
// deliberately: two dialects of "term" inside one organisation would be drift on a new axis.
//
//   1. KEYS NAME THE INTERNAL DOMAIN, VALUES NAME WHAT THE USER SEES. The key is `loginGroup`
//      because the entity is a login group; the value was "Member" and is now "Company". Keys
//      and values have different lifetimes, so keying on the current word would turn the next
//      rename into a key rename and leave `member` resolving to "Company".
//   2. ONLY `value` AND `plural` ARE AUTHORED. Every other form is derived, because an authored
//      lowercase is where drift reappears inside a single term: change `value`, forget the
//      sibling, and the exercise has failed at the smallest possible scale.
//
// `possessive` is the one exception, and the one authored form that can silently disagree with
// `value`, so it is re-checked whenever `value` changes.

import { readFile } from 'node:fs/promises';

/**
 * What an unresolved term renders as.
 *
 * LOUD AND PLAIN ASCII, deliberately. A missing term that rendered as nothing would delete a
 * noun from a requirement and leave a sentence that still reads; this cannot be mistaken for
 * prose, survives a screenshot, and is greppable in test output.
 */
export const missingTerm = (ref) => `<<MISSING TERM: ${ref}>>`;

/** `{key}` or `{key.variant}`. Not `<>`, which Scenario Outline owns. */
const MARKER = /\{([a-zA-Z][\w]*)(?:\.([a-zA-Z]+))?\}/g;

/** Every form a document may ask for. Only `value` and `plural` are authored. */
export function variantOf(term, variant = 'value') {
  const preserve = term.casing === 'preserve';
  const lower = (s) => (preserve ? s : s.toLowerCase());

  switch (variant) {
    case 'value':
      return term.value;
    case 'plural':
      return term.plural;
    case 'lower':
      return lower(term.value);
    case 'lowerPlural':
      return lower(term.plural);
    case 'possessive':
      // English disagrees with itself after a trailing s, so the derivation is a default a
      // term may override rather than a rule.
      return term.possessive ?? `${term.value}${/s$/i.test(term.value) ? "'" : "'s"}`;
    default:
      return null;
  }
}

/** True when the text contains at least one term marker. */
export const hasTerms = (text) => MARKER.test(String(text ?? '')) && (MARKER.lastIndex = 0) === 0;

/**
 * Resolve every marker in a piece of text.
 *
 * Returns the rendered string and the references that could not be resolved, so a caller can
 * be strict (generation refuses) or tolerant (the page shows the sentinel) without either
 * having to re-scan the text.
 */
export function renderTerms(text, terms = {}) {
  const missing = [];
  const rendered = String(text ?? '').replace(MARKER, (whole, key, variant = 'value') => {
    const term = terms[key];
    if (!term) {
      missing.push(`${key}${variant === 'value' ? '' : '.' + variant}`);
      return missingTerm(`${key}${variant === 'value' ? '' : '.' + variant}`);
    }
    const value = variantOf(term, variant);
    if (value === null || value === undefined) {
      missing.push(`${key}.${variant}`);
      return missingTerm(`${key}.${variant}`);
    }
    return value;
  });
  return { rendered, missing };
}

/**
 * Text that SPELLS a word the glossary owns, instead of naming the concept.
 *
 * This is the drift the glossary exists to prevent, caught at the moment it is introduced
 * rather than at the next rename. A criterion reading "a Company must have an owner" looks
 * perfectly correct today and is silently wrong the day Company becomes something else.
 *
 * Matched case-insensitively on whole words against `value` and `plural`, because a
 * criterion writing "company" mid-sentence means the term just as much as one writing it
 * capitalised. Reported rather than corrected: whether a word names the domain concept or is
 * ordinary prose is a judgement, and a glossary that swallows ordinary English makes
 * documents unreadable.
 *
 * Text already inside a marker cannot match, because markers hold KEYS and keys name the
 * internal domain rather than the visible word.
 */
export function findSpelledTerms(text, terms = {}) {
  const bare = String(text ?? '').replace(MARKER, ' ');
  const hits = [];
  for (const [key, term] of Object.entries(terms)) {
    for (const form of [term.value, term.plural]) {
      if (!form) continue;
      const pattern = new RegExp(`\\b${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      if (pattern.test(bare)) {
        hits.push({ key, spelled: form });
        break;
      }
    }
  }
  return hits;
}

/** Every problem in a manifest, reported together rather than one run at a time. */
export function validateTerms(terms) {
  const problems = [];
  for (const [key, term] of Object.entries(terms ?? {})) {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(key)) {
      problems.push(`${key}: a term key is a camelCase identifier naming the INTERNAL domain`);
    }
    if (!term || typeof term !== 'object') {
      problems.push(`${key}: expected an object with value, plural and description`);
      continue;
    }
    // Each of these is a field the application-side registry makes a compile error, and the
    // reason is the same here: a term missing its plural is the next hard-coded plural.
    if (!term.value) problems.push(`${key}: missing "value" - the singular the user sees`);
    if (!term.plural) problems.push(`${key}: missing "plural" - English is not reliably mechanical`);
    if (!term.description) {
      problems.push(`${key}: missing "description" - what the concept IS, for the next author`);
    }
    if (term.casing && term.casing !== 'title' && term.casing !== 'preserve') {
      problems.push(`${key}: casing must be "title" or "preserve"`);
    }
    for (const derived of ['lower', 'lowerPlural']) {
      if (derived in term) {
        problems.push(
          `${key}: "${derived}" is derived and must not be authored - an authored lowercase is ` +
            `where drift reappears inside a single term`
        );
      }
    }
  }
  return problems;
}

/**
 * Load a project's glossary.
 *
 * Absent is not an error: a project with no domain vocabulary problem should not have to
 * declare an empty file. Malformed IS an error, because a glossary that fails to parse would
 * otherwise silently render every term as missing.
 */
export async function loadTerms(file) {
  if (!file) return { terms: {}, file: null, found: false };
  try {
    const terms = JSON.parse(await readFile(file, 'utf8'));
    const problems = validateTerms(terms);
    if (problems.length) {
      throw new Error(`${file}:\n` + problems.map((p) => `  - ${p}`).join('\n'));
    }
    return { terms, file, found: true };
  } catch (err) {
    if (err.code === 'ENOENT') return { terms: {}, file, found: false };
    throw err;
  }
}
