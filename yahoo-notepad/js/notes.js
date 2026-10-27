/* Lastleaf: small helpers the page, the worker and the tests share (titles, search). No browser APIs, no imports. */

/** The title a note is shown with: its own, else its first line of text, else ''. */
export function shownTitle(n) {
  if (n.title) return n.title;
  const first = (n.text.split('\n').find(l => l.trim()) || '').trim();
  return first.length > 80 ? first.slice(0, 77).replace(/\s+\S*$/, '') + '...' : first;
}

// search: case-insensitive, and accents on Latin letters do not matter ("cafe" finds "caf\u00e9"); other scripts as written
export const fold = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
export const haystack = n => fold(`${n.title}\n${n.text}\n${n.folder}`);
export function search(notes, hay, q) {
  const words = fold(q.trim()).split(/\s+/).filter(Boolean);
  if (!words.length) return notes;
  return notes.filter((n, i) => words.every(w => hay[i].includes(w)));
}

