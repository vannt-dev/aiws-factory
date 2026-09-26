// Parsers for the structured parts of phase artifacts. Formats are fixed by aiws/templates/.
// HTML comments are ignored everywhere: templates carry their instructions (and examples) in comments.

export function stripComments(md) {
  return (md ?? '').replace(/<!--[\s\S]*?-->/g, '');
}

/** Splits markdown into sections keyed by normalised heading text. */
export function sections(md) {
  const out = [];
  let current = { level: 0, title: '', lines: [] };
  for (const line of stripComments(md).split(/\r?\n/)) {
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) {
      out.push(current);
      current = { level: m[1].length, title: m[2], lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  out.push(current);
  return out;
}

export function normHeading(s) {
  return String(s)
    .normalize('NFC')
    .toLowerCase()
    .replace(/^[\d.\s)]+/, '') // strip "1." / "2)" numbering
    .replace(/[`*_:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findSection(md, title) {
  const want = normHeading(title);
  return sections(md).find((s) => normHeading(s.title) === want || normHeading(s.title).startsWith(want + ' ')) ?? null;
}

export function missingHeadings(md, required) {
  const have = sections(md).map((s) => normHeading(s.title));
  return (required ?? []).filter((h) => {
    const want = normHeading(h);
    return !have.some((x) => x === want || x.startsWith(want + ' ') || x.startsWith(want + ' ('));
  });
}

/** Acceptance criteria ids (AC-n) defined as list items in the analysis. */
export function acceptanceCriteria(md) {
  const ids = [];
  for (const m of stripComments(md).matchAll(/^\s*[-*]\s*\**(AC-\d+)\**\s*[:.)-]/gm)) ids.push(m[1]);
  return [...new Set(ids)];
}

/** Open questions marked [blocking] that are not yet [answered]/[resolved]. */
export function blockingQuestions(md) {
  return stripComments(md)
    .split(/\r?\n/)
    .filter((l) => /\[blocking\]/i.test(l) && !/\[(answered|resolved)\]/i.test(l))
    .map((l) => l.trim());
}

/** Test cases: `### TC-n: title` headings followed by a `covers: AC-x, AC-y` line. */
export function testCases(md) {
  const cases = [];
  for (const s of sections(md)) {
    const m = /^(TC-\d+)\b\s*[:.-]?\s*(.*)$/.exec(s.title.trim());
    if (!m) continue;
    const body = s.lines.join('\n');
    const covers = /covers\s*[:=]\s*(.+)/i.exec(body);
    const ac = covers ? [...covers[1].matchAll(/AC-\d+/g)].map((x) => x[0]) : [];
    const side = /side\s*[:=]\s*(\w+)/i.exec(body)?.[1]?.toLowerCase() ?? null;
    cases.push({ id: m[1], title: m[2], covers: ac, side });
  }
  return cases;
}

/** Review findings: list items tagged [critical] / [major] / [minor], optionally [resolved]. */
export function reviewFindings(md) {
  const findings = [];
  for (const line of stripComments(md).split(/\r?\n/)) {
    const m = /^\s*[-*]\s*\[(critical|major|minor)\]\s*(.*)$/i.exec(line);
    if (!m) continue;
    findings.push({ severity: m[1].toLowerCase(), text: m[2].trim(), resolved: /\[resolved\]/i.test(line) });
  }
  return findings;
}
