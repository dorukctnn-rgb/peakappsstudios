/* Lastleaf: the files it saves. The free download is one plain text file with every note, in the order the page lists
 * them (newest first), each with its notebook and dates. Windows line endings and a byte order mark, so the file opens
 * cleanly in Notepad on Windows, TextEdit on a Mac and any phone. Plain functions, shared by the worker and the tests. */
import { shownTitle } from './notes.js';

const pad2 = v => String(v).padStart(2, '0');
/** "2026-10-27 14:05" in the computer's own time zone, or '' */
export function stamp(ms) {
  if (ms == null) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export const RULE = '========================================';
export const NOTE_LINE = /^Note (\d+) of (\d+)$/;

/** One note as text: the title, its notebook and dates, then the note. */
export function noteText(n, { noTitle = '(no title)', noNotebook = '(no notebook)' } = {}) {
  const lines = [`Title: ${shownTitle(n) || noTitle}`, `Notebook: ${n.folder || noNotebook}`];
  if (n.created != null) lines.push(`Created: ${stamp(n.created)}`);
  if (n.modified != null && n.modified !== n.created) lines.push(`Last changed: ${stamp(n.modified)}`);
  lines.push('', n.text || '(This note is empty.)');
  return lines.join('\n');
}

/** Every note in one text file. `madeOn` is the date shown in the heading; `sample` marks the sample notes. */
export function allNotesText(notes, { madeOn = Date.now(), sources = [], sample = false } = {}) {
  const total = notes.length;
  const head = [
    'Yahoo Notepad notes, saved with Lastleaf (https://peakappsstudio.com/yahoo-notepad/)',
    `Saved on ${stamp(madeOn).slice(0, 10)}. ${total} note${total === 1 ? '' : 's'}.`,
  ];
  if (sample) head.push('These are the made-up sample notes, not notes from Yahoo.');
  else if (sources.length) head.push(`From: ${sources.join(', ')}`);
  const parts = [head.join('\n')];
  notes.forEach((n, i) => { parts.push(`${RULE}\nNote ${i + 1} of ${total}\n${noteText(n)}`); });
  return '\ufeff' + parts.join('\n\n').replace(/\r?\n/g, '\r\n') + '\r\n';
}

/** How many notes a saved text file holds (the tests compare this with the count on the page): entries that follow the
 *  separator line and are numbered 1, 2, 3... of the total, so a note that quotes those lines is not counted twice. */
export function countNotesInText(text) {
  const lines = text.split(/\r?\n/);
  let n = 0;
  for (let i = 1; i < lines.length; i++) {
    const m = lines[i - 1] === RULE && NOTE_LINE.exec(lines[i]);
    if (m && Number(m[1]) === n + 1 && Number(m[2]) >= n + 1) n++;
  }
  return n;
}
