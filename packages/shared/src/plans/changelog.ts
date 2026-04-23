import type { PlanType } from './types.ts';

export const CHANGELOG_TEMPLATE = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

`;

const SUBSECTION_ORDER = [
  'Added',
  'Changed',
  'Deprecated',
  'Removed',
  'Fixed',
  'Security',
  'Documentation',
] as const;

export type ChangelogSubsection = typeof SUBSECTION_ORDER[number];

export function subsectionForType(type: PlanType): ChangelogSubsection {
  switch (type) {
    case 'feat':
      return 'Added';
    case 'fix':
      return 'Fixed';
    case 'docs':
      return 'Documentation';
    case 'chore':
    case 'refactor':
    case 'test':
      return 'Changed';
  }
}

export interface ChangelogEntryInput {
  type: PlanType;
  title: string;
  sha: string; // already-shortened; we don't re-shorten
}

/**
 * Prepend a new changelog entry under the \`[Unreleased]\` section. If the
 * document has no Unreleased section (or is empty), a fresh one is inserted
 * at the top. Entries within a subsection are in reverse-chronological order
 * (newest first).
 */
export function prependChangelogEntry(
  existing: string,
  entry: ChangelogEntryInput,
): string {
  const base = existing.trim().length === 0 ? CHANGELOG_TEMPLATE : existing;
  const subsection = subsectionForType(entry.type);
  const bullet = `- ${entry.title} (${entry.sha})`;

  const unreleasedRegex = /^##\s+\[Unreleased\]\s*$/m;
  const unreleasedMatch = unreleasedRegex.exec(base);
  if (!unreleasedMatch) {
    // Malformed: inject a fresh [Unreleased] block before the first \`## [\` heading.
    const firstRelease = /^##\s+\[/m.exec(base);
    const insertAt = firstRelease ? firstRelease.index : base.length;
    const block = `## [Unreleased]\n\n### ${subsection}\n\n${bullet}\n\n`;
    return base.slice(0, insertAt) + block + base.slice(insertAt);
  }

  const unreleasedStart = unreleasedMatch.index;
  const afterUnreleased = unreleasedStart + unreleasedMatch[0].length;

  // Find the end of the Unreleased section (next \`## [\`, or EOF).
  const nextReleaseRegex = /^##\s+\[/m;
  nextReleaseRegex.lastIndex = afterUnreleased;
  const afterSlice = base.slice(afterUnreleased);
  const nextReleaseLocal = afterSlice.search(/^##\s+\[/m);
  const sectionEnd =
    nextReleaseLocal === -1
      ? base.length
      : afterUnreleased + nextReleaseLocal;

  const sectionText = base.slice(afterUnreleased, sectionEnd);

  // Does the target subsection already exist within the section?
  const subsectionRegex = new RegExp(`^###\\s+${subsection}\\s*$`, 'm');
  const subsectionMatch = subsectionRegex.exec(sectionText);

  if (subsectionMatch) {
    // Insert bullet right after the subsection heading's trailing blank line.
    const subsectionLocal = subsectionMatch.index;
    const afterHeading = subsectionLocal + subsectionMatch[0].length;
    const updatedSection =
      sectionText.slice(0, afterHeading) +
      `\n\n${bullet}` +
      sectionText.slice(afterHeading).replace(/^\n+/, '\n\n');
    return base.slice(0, afterUnreleased) + updatedSection + base.slice(sectionEnd);
  }

  // Subsection missing — insert it in standard order.
  const desiredIdx = SUBSECTION_ORDER.indexOf(subsection);
  const existingHeadings = [...sectionText.matchAll(/^###\s+(\w+)\s*$/gm)];
  let insertAtLocal = sectionText.length; // append by default
  for (const m of existingHeadings) {
    const name = m[1] as ChangelogSubsection;
    const idx = SUBSECTION_ORDER.indexOf(name);
    if (idx > desiredIdx) {
      insertAtLocal = m.index ?? sectionText.length;
      break;
    }
  }
  const block = `\n### ${subsection}\n\n${bullet}\n\n`;
  const newSection =
    sectionText.slice(0, insertAtLocal) + block + sectionText.slice(insertAtLocal);
  return base.slice(0, afterUnreleased) + newSection + base.slice(sectionEnd);
}
