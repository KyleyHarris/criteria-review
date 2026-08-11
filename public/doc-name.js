/**
 * Resolving a document link to a document key.
 *
 * A link inside a document reads `03-example-acceptance-document.md`, which is
 * RELATIVE, the way it is when the file is opened on disk. The tool keys documents as
 * `<group>/<file>` so the two directories cannot collide on a filename. Those two
 * facts do not meet on their own, and when they did not, every cross-reference in the
 * standard reported "no such document" - found by clicking one, not by reading the
 * code.
 *
 * Resolution belongs here rather than in the renderer: the renderer is handed a string
 * and has no idea which document it came from.
 */

/**
 * @param docs   the listing, each with `name` (`group/file`), `group` and `file`
 * @param name   the link target as written in the document
 * @param from   the key of the document the link was in
 * @returns the resolved key, or `name` unchanged when nothing matches, so the caller
 *          can report an honest failure rather than silently opening something else
 */
export function resolveDocName(docs, name, from) {
  // An already-qualified key wins, so an explicit `standard/x.md` is never reinterpreted.
  if (docs.some((d) => d.name === name)) return name;

  // Same group next, because that is what a relative link means.
  const group = docs.find((d) => d.name === from)?.group;
  if (group && docs.some((d) => d.name === `${group}/${name}`)) return `${group}/${name}`;

  // Then anywhere, so a reference across the two groups still opens rather than
  // dead-ending. Ambiguity is possible in principle and harmless in practice: the
  // groups hold different filenames, and the qualified form above is the way to be
  // explicit when that stops being true.
  return docs.find((d) => d.file === name)?.name ?? name;
}
