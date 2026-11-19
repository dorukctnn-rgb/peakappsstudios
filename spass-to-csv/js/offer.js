// Decant: the Pro offer at the moment of need. What the free files leave out of THIS file (cards, addresses, notes), the change list
// beyond its first ten rows and the reused passwords, shown side by side with Pro when a free save starts (once per session), when a
// Pro-only button is pressed, and after a free save. The window and the panel are built by assets/pro-offer.js; this file only
// says what to put in them. Nothing here reads a password or a note: it uses counts only, and sends none of them anywhere.
import { createOffer } from '/assets/pro-offer.js';
import { FREE_ROWS } from './pro.js';

const THEME = {
  '--po-bg': '#fff', '--po-ink': 'var(--dc-ink)', '--po-muted': 'var(--dc-muted)', '--po-line': 'var(--dc-line)',
  '--po-accent': 'var(--dc-green)', '--po-accent-ink': '#fff', '--po-tint': 'var(--dc-rose-soft)',
  '--po-chip-bg': 'var(--dc-lime)', '--po-chip-ink': 'var(--dc-green-deep)', '--po-display': 'var(--serif)', '--po-radius': '18px',
};
const REFUND = '/legal/refund/';
const GUIDE = { apple: '/spass-to-csv/apple-passwords/', google: '/spass-to-csv/google-password-manager/' };

// state() -> { c: counts, list: the change list, groups: the reused passwords }, computed when the offer needs it
export function installOffer({ S, L, n, state, isPro, buy, turnOn, labelOf }) {
  const O = S.offer;
  const offer = createOffer({ tool: 'decant', price: O.price, words: O.words, theme: THEME, isPro, buy, turnOn, refundHref: REFUND, lang: L });
  const A = (href, text) => { const a = document.createElement('a'); a.href = href; a.textContent = text; return a; };

  const leftover = c => c.card + c.address + c.note;
  const worth = ({ c, list, groups }) => leftover(c) > 0 || list.length > FREE_ROWS || groups.length > 0;

  // one row per thing the file holds; `hot` marks the rows the pressed Pro button is about
  function rows(st, hot) {
    const { c, list, groups } = st;
    const r = [{ label: O.rLogins, free: n(c.login), pro: n(c.login) }];
    if (c.card) r.push({ label: O.rCards, free: O.left, pro: n(c.card), hot: hot === 'bitwarden' || hot === 'sheet' });
    if (c.address) r.push({ label: O.rAddresses, free: O.left, pro: n(c.address), hot: hot === 'bitwarden' || hot === 'sheet' });
    if (c.note) r.push({ label: O.rNotes, free: O.left, pro: n(c.note), hot: hot === 'bitwarden' || hot === 'sheet' });
    if (list.length > FREE_ROWS) r.push({ label: O.rChange, free: O.firstN(L, FREE_ROWS), pro: O.allN(L, list.length), hot: hot === 'list' });
    if (groups.length) r.push({ label: O.rReuse, free: O.reuseFree(L, groups.length), pro: O.reuseByLogin });
    return r;
  }
  const lede = st => (leftover(st.c) > 0 ? O.ledeLeft(L, O.parts(L, st.c)) : O.ledeList(L, st.c.login));

  return {
    // a free save is about to start: 'free' means go on
    async beforeFree(kind) {
      const st = state();
      if (!st) return 'free';
      return offer.choose({ id: kind, worth: worth(st), title: O.chooseTitle(labelOf(kind)), lede: lede(st), rows: rows(st), freeLabel: O.freeLabel });
    },
    // a button that only Pro unlocks was pressed
    gate(kind) {
      const st = state();
      if (!st) return;
      const [title, line] = O.gate[kind];
      offer.gate({ id: kind, title, lede: line, rows: rows(st, kind) });
    },
    // after a free save: what to do next, and what the file still holds
    afterFree(kind, fileName) {
      const st = state();
      const slot = document.querySelector('#result .dc-save');
      if (!st || !slot) return;
      const how = kind === 'apple' ? O.stepApple : O.stepGoogle;
      const guide = L === 'en' ? [' ', A(GUIDE[kind], O.steps)] : [];
      const steps = [[how, ...guide], [O.stepDelete]];
      const hook = worth(st) ? { text: leftover(st.c) > 0 ? O.hookLeft(L, O.parts(L, st.c)) : O.hookList(L, st.list.length), button: O.words.buy } : null;
      offer.next(slot, { after: true, label: O.saved(fileName), title: O.saved(fileName), steps, hook });
    },
    // the Pro tag on the buttons that only Pro unlocks
    tagButtons(ids) { for (const id of ids) offer.tag(document.getElementById(id)); },
    proOn() { offer.proOn(); },
  };
}
