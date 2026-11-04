// The version of the ACCEPTANCE-CRITERIA STANDARD, not of this tool.
//
// Consumer repositories read their scenario definitions from documents this tool
// parses, so a change to the tag vocabulary, the status set, or the emitted shape
// breaks builds whoever made the change cannot see. The version is stamped into
// every generated artefact so a consumer can say which one it last conformed to
// without reading this source. See docs/decisions.md D-002.
//
// Major: something a conforming consumer relied on was removed, renamed or narrowed -
//        a status retired, a tag renamed, a field dropped from the emitted shape.
// Minor: something was added that no existing consumer can be broken by - a new status,
//        a new optional field.
// Patch: wording, documentation, and a defect fix that changes emitted CONTENT without
//        changing its shape - a consumer regenerates and commits, nothing else.
//
// A recommendation added or changed in the standard's prose does not move this number
// (D-015): nothing a consumer conforms to has changed, and moving it would fail every
// consumer's `generate --check` for a change that asks nothing of them.
//
// The additive/breaking split matters more than the surface changing: adding a status
// cannot break a consumer that does not use it, and treating it as breaking would make
// every vocabulary addition look like a migration.
export const STANDARD_VERSION = '1.4.0';
