/**
 * The little markup the project notes are written in.
 *
 * WHY MARKERS IN PLAIN TEXT, AND NOT A RICH EDITOR. The notes travel inside the
 * session file, and that file is handed in, opened by someone else, read in a
 * text editor and diffed. Storing HTML would make it none of those things, and
 * would mean the application rendering markup that arrived from somebody else's
 * file. Markers keep the stored value a plain string -- `persist.js` is
 * untouched -- and keep it readable with no application at all.
 *
 *   # a title            ## a heading        - a bullet
 *   **bold**             *emph*              _underline_
 *   [what it says](https://where.it/goes)
 *
 * ON `_underline_`. Markdown spends that marker on italic, and this does not:
 * italic is `*emph*` here, and the underscore keeps the older plain-text
 * meaning it has had since people wrote _like this_ in mail. It is the one
 * place this notation and markdown disagree, and it is deliberate, because a
 * student asked for three buttons and there are only so many markers.
 *
 * NOTHING HERE BUILDS MARKUP. It returns a description -- blocks, each holding
 * spans, each a piece of text with flags -- and the caller turns that into
 * elements with `textContent`. Untrusted text therefore never becomes markup,
 * which is what makes rendering somebody else's notes safe rather than
 * carefully sanitised.
 */

/**
 * @typedef {{text: string, bold?: boolean, emph?: boolean,
 *            underline?: boolean, href?: string|null}} Span
 * @typedef {{kind: 'title'|'heading'|'bullet'|'body'|'blank', spans: Span[]}} Block
 */

/** The block a line asks to be, and what is left after the marker. */
const BLOCKS = [
  [/^##\s+/, 'heading'],
  [/^#\s+/, 'title'],
  [/^[-*]\s+/, 'bullet'],
];

/**
 * Which links may be followed.
 *
 * A note can carry a link to where a photograph came from, which is worth
 * having. It must not be able to carry `javascript:` or a `data:` document,
 * because a session file is something one student hands another, and following
 * a link in it should not be able to run anything. A refused scheme is not
 * hidden: the line is left exactly as it was typed, so the writer can see that
 * it did not become a link and why.
 */
export function safeHref(url) {
  const said = String(url ?? '').trim();
  if (!said) return null;
  if (/^(https?:|mailto:)/i.test(said)) return said;
  // A bare host, which is what people type: www.example.org
  if (/^www\.[^\s/]+\.[^\s/]/i.test(said)) return `https://${said}`;
  return null;
}

const INLINE = [
  { re: /\[([^\]\n]*)\]\(([^)\s]*)\)/, kind: 'link' },
  { re: /\*\*([^*\n]+)\*\*/, kind: 'bold' },
  { re: /\*([^*\n]+)\*/, kind: 'emph' },
  { re: /_([^_\n]+)_/, kind: 'underline' },
];

/** One line of text, as a list of spans. */
function spansOf(text, style = {}) {
  if (!text) return [];
  let best = null;
  for (const rule of INLINE) {
    const m = rule.re.exec(text);
    if (m && (!best || m.index < best.m.index)) best = { rule, m };
  }
  if (!best) return [{ text, ...style }];

  const { rule, m } = best;
  const out = [];
  if (m.index > 0) out.push(...spansOf(text.slice(0, m.index), style));

  if (rule.kind === 'link') {
    const href = safeHref(m[2]);
    if (href) {
      out.push(...spansOf(m[1], { ...style, href }));
    } else {
      // Left exactly as typed, so nothing is silently dropped.
      out.push({ text: m[0], ...style });
    }
  } else {
    out.push(...spansOf(m[1], { ...style, [rule.kind]: true }));
  }

  out.push(...spansOf(text.slice(m.index + m[0].length), style));
  return out.filter((s) => s.text !== '');
}

/**
 * The notes, as blocks a caller can build elements from.
 *
 * @param {string} text
 * @returns {Block[]}
 */
export function parseNotes(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  return lines.map((line) => {
    if (!line.trim()) return { kind: 'blank', spans: [] };
    for (const [re, kind] of BLOCKS) {
      if (re.test(line)) {
        return { kind, spans: spansOf(line.replace(re, '')) };
      }
    }
    return { kind: 'body', spans: spansOf(line) };
  });
}

/**
 * Put a marker round a stretch of text, or take it off again.
 *
 * The toggle is what makes a button a button rather than a stamp: pressing
 * bold on something already bold has to undo it, or the text fills up with
 * markers nobody asked for.
 *
 * @returns {{text: string, start: number, end: number}} the whole new text and
 *          where the selection should sit afterwards
 */
export function toggleWrap(text, start, end, marker) {
  const before = text.slice(0, start);
  const middle = text.slice(start, end);
  const after = text.slice(end);
  const n = marker.length;

  // Already wrapped, inside the selection?
  if (middle.startsWith(marker) && middle.endsWith(marker)
    && middle.length >= 2 * n) {
    const bare = middle.slice(n, -n);
    return { text: before + bare + after, start, end: start + bare.length };
  }
  // Already wrapped, just outside it?
  if (before.endsWith(marker) && after.startsWith(marker)) {
    return {
      text: before.slice(0, -n) + middle + after.slice(n),
      start: start - n,
      end: end - n,
    };
  }
  return {
    text: `${before}${marker}${middle || 'text'}${marker}${after}`,
    start: start + n,
    end: start + n + (middle || 'text').length,
  };
}

/**
 * Give every line the selection touches a block marker, or take it away.
 *
 * Whole lines, because a heading is a property of a line and not of a word.
 */
export function setBlockStyle(text, start, end, prefix) {
  const from = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  let to = text.indexOf('\n', end);
  if (to < 0) to = text.length;

  const changed = text.slice(from, to).split('\n').map((line) => {
    const bare = line.replace(/^(#{1,2}\s+|[-*]\s+)/, '');
    return prefix ? prefix + bare : bare;
  }).join('\n');

  return {
    text: text.slice(0, from) + changed + text.slice(to),
    start: from,
    end: from + changed.length,
  };
}

/** A link, with the address left for the writer to fill in if there is none. */
export function insertLink(text, start, end, url = '') {
  const label = text.slice(start, end) || 'what it says';
  const made = `[${label}](${url || 'https://'})`;
  return {
    text: text.slice(0, start) + made + text.slice(end),
    // Leave the cursor in the address, which is the part still to be written.
    start: start + label.length + 3,
    end: start + made.length - 1,
  };
}
