// Chatbound: the Pro offer at the moment of need. What the free tier does for THIS export (one chat at a time, one character) beside
// what Pro does for all of it, shown when a free save starts (once per session), when a Pro-only button is pressed, and after a
// free save. The window and the panel are built by assets/pro-offer.js; this file only says what to put in them. It uses the counts
// of the open export (chats, messages, characters) and sends none of them anywhere. app.js loads it after the page is ready; if it
// cannot load, free saves go straight through and a Pro button opens the Pro window, as before.
import { createOffer } from '/assets/pro-offer.js';

const THEME = {
  '--po-bg': 'var(--card)', '--po-ink': 'var(--ink)', '--po-muted': 'var(--muted)', '--po-line': 'var(--line)',
  '--po-accent': 'var(--cloth)', '--po-accent-ink': '#fff', '--po-tint': 'color-mix(in oklab, var(--gilt) 16%, var(--card))',
  '--po-chip-bg': 'var(--gilt)', '--po-chip-ink': 'var(--gilt-ink)', '--po-btn-bg': 'var(--gilt)', '--po-btn-ink': 'var(--gilt-ink)', '--po-btn-line': '#d9a52e',
  '--po-display': 'var(--display)', '--po-radius': '10px',
};
const WORDS = {
  free: 'Free', pro: 'Pro', once: 'once', columnWhat: 'What this export gets', buy: 'Get Pro, $8 once', notNow: 'Not now', close: 'Close', dismiss: 'Dismiss',
  already: 'Bought Pro already?', turnOn: 'Turn Pro on',
  trustPay: 'Paid once through Paddle, no subscription.', refund: 'Refund policy',
  trustRefund: 'If Pro does not work with your export, you can ask for your money back within 14 days.',
  trustLocal: 'Your export stays on this page. Pro does not upload it either.',
};
// the Pro-only buttons: the window's title and the row of the table it is about
const GATES = {
  pdf: ['Saving as a PDF is part of Pro', 'save'],
  book: ['The offline book is part of Pro', 'save'],
  epub: ['The EPUB is part of Pro', 'save'],
  zip: ['The ZIP of every character and chat is part of Pro', 'move'],
  character: ['More than one character is part of Pro', 'move'],
  merge: ['Merging exports is part of Pro', 'merge'],
};
const FREE_KINDS = {
  'chat-html': ['Save this chat as HTML', 'It opens in any browser and needs no internet.'],
  'chat-txt': ['Save this chat as text', 'It opens in any text editor.'],
  'chat-md': ['Save this chat as Markdown', 'It opens in any Markdown or text editor.'],
  'card-png': ['Save the card (PNG)', null],
  'card-json': ['Save the card (JSON)', null],
  'chat-file': ['Save the chat file', null],
};

export function installOffer(CB, { isPro, buy, turnOn }) {
  const fmt = v => Number(v || 0).toLocaleString('en');
  const plural = (k, one, many) => `${fmt(k)} ${k === 1 ? one : many}`;
  const offer = createOffer({ tool: 'chatbound', price: '$8', words: WORDS, theme: THEME, isPro, buy, turnOn, refundHref: '/legal/refund/', lang: 'en' });
  const A = (href, text) => { const a = document.createElement('a'); a.href = href; a.textContent = text; return a; };
  const facts = () => {
    const ov = CB.overview;
    if (!ov) return null;
    return { chats: ov.counts.chats || 0, messages: ov.counts.messages || 0, people: (CB.facts && CB.facts.people) || ov.counts.characters || 0 };
  };

  function rows(f, hot) {
    const r = [];
    if (f.chats > 1) r.push({ label: 'Save the chats', free: 'one chat at a time', pro: `all ${fmt(f.chats)} in one book, PDF or EPUB`, hot: hot === 'save' });
    if (f.people > 1) r.push({ label: 'Move to another app', free: 'one character', pro: `all ${fmt(f.people)} characters and their chats, one ZIP`, hot: hot === 'move' });
    if (hot === 'merge') r.push({ label: 'Several exports', free: 'one at a time', pro: 'merged, repeated messages removed', hot: true });
    return r;
  }
  const worth = f => f.chats > 1 || f.people > 1;

  // the price next to the buttons that only Pro unlocks (the page tags them with Pro but does not say what it costs there)
  function priceNotes() {
    for (const p of document.querySelectorAll('.cb-keep p, .cb-mv-all p')) {
      if (p.querySelector('.po-note')) continue;
      const s = document.createElement('span');
      s.className = 'po-note';
      s.textContent = ' Pro, $8 once.';
      p.append(s);
    }
  }
  CB.onOpen(priceNotes);
  priceNotes();

  return {
    // a free save is about to start: 'free' means go on
    async beforeFree(id, info = {}) {
      const f = facts();
      if (!f) return 'free';
      const [freeLabel] = FREE_KINDS[id] || ['Save it free'];
      const card = id.startsWith('card') || id === 'chat-file';
      const lede = card
        ? `Your export holds ${plural(f.people, 'character', 'characters')} you can move. One character, with its card and its chats, is free: the one you save now is your free character. Pro moves all of them.`
        : `Your export holds ${plural(f.chats, 'chat', 'chats')} and ${plural(f.messages, 'message', 'messages')}. One chat at a time is free. Pro saves every chat at once.`;
      return offer.choose({ id, worth: worth(f), title: card ? `Save ${info.name || 'this character'}` : 'Save this chat', lede, rows: rows(f, card ? 'move' : 'save'), freeLabel });
    },
    // a button that only Pro unlocks was pressed (`why` is the page's own sentence about it)
    gate(id, why) {
      const f = facts();
      const [title, hot] = GATES[id] || ['This is part of Pro', ''];
      offer.gate({ id, title, lede: why || '', rows: f ? rows(f, hot) : [] });
    },
    // after a free save
    afterFree(kind, info = {}) {
      const f = facts();
      const slot = document.querySelector('.cb-tabs');
      if (!f || !slot) return;
      let steps, hook = null, title;
      if (kind === 'chat') {
        title = `Saved ${info.name}.`;
        const how = (FREE_KINDS[info.id] || [])[1];
        steps = [how ? [how] : null, f.people ? ['Moving a character to SillyTavern, Janitor AI or Perchance is in the ', moveLink(), ' tab.'] : null].filter(Boolean);
        if (f.chats > 1) hook = { text: `${plural(f.chats - 1, 'more chat is', 'more chats are')} in this export. Pro saves every chat at once, as an offline book, a PDF or an EPUB.`, button: WORDS.buy };
      } else {
        title = `Saved ${info.name}.`;
        steps = [['Import it in ', A('/character-ai-export-viewer/sillytavern/', 'SillyTavern'), ', ', A('/character-ai-export-viewer/janitor-ai/', 'Janitor AI'), ', ', A('/character-ai-export-viewer/perchance/', 'Perchance'), ' or ', A('/character-ai-export-viewer/sakura/', 'Sakura'), '.']];
        if (f.people > 1) hook = { text: `${info.free ? `${info.free} is your free character. ` : ''}${plural(f.people - 1, 'other character is', 'other characters are')} in this export. Pro moves all of them with their chats, as one ZIP.`, button: WORDS.buy };
      }
      offer.next(slot, { after: true, label: title, title, steps, hook });
    },
    proOn() { offer.proOn(); },
  };

  function moveLink() {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'po-link'; b.textContent = 'Move to another app';
    b.addEventListener('click', () => { try { CB.selectTab('tab-move'); } catch (e) { /* the tab is one click away */ } });
    return b;
  }
}
