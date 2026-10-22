/* Dayfold Pro: the journal as Markdown files for Obsidian (or any notes app): one note per day with the day's mood and
 * activities in its front matter, a note per year linking every day, and every photo next to them. Pure, no DOM. */
const p2 = n => String(n).padStart(2, '0');

// an Obsidian tag: letters, numbers, - _ and /; spaces become -
export function tagOf(name) {
  const t = String(name || '').trim().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_\-/]/gu, '').replace(/^[-/]+|[-/]+$/g, '');
  if (!t) return '';
  return /^\d+$/.test(t) ? `_${t}` : t;
}
const yamlStr = s => (/^[\p{L}\p{N} _.-]+$/u.test(s) && !/^(true|false|null|yes|no|on|off|~)$/i.test(s) && !/^[\d.-]+$/.test(s) ? s : JSON.stringify(s));

/* journal: from parse.normalise; ys: the years to write; T: { mood(pre), dayTitle(e), monthYear(y,m), readme, words };
 * photos: Map assetId -> { ext } of the files that will be added (the caller adds the bytes). Returns { files: { path: text } , photoPaths: Map assetId -> path } */
export function buildMarkdown(journal, ys, T, photos) {
  const set = new Set(ys);
  const root = 'Dayfold export/';
  const files = {};
  const photoPaths = new Map();
  const moodById = new Map(journal.moods.map(m => [m.id, m]));
  const moodName = id => { const m = moodById.get(id); return m ? (m.name || T.mood(m.pre)) : ''; };
  const tagById = new Map(journal.tags.map(t => [t.id, t]));
  const byDay = new Map();
  for (const e of journal.entries) {
    if (!set.has(e.y)) continue;
    const list = byDay.get(e.key) || [];
    list.push(e);
    byDay.set(e.key, list);
  }
  const yearLinks = new Map();
  for (const [key, list] of byDay) {
    const first = list[0];
    const rated = list.filter(e => e.score != null);
    const avg = rated.length ? Math.round((rated.reduce((a, e) => a + e.score, 0) / rated.length) * 10) / 10 : null;
    const tags = ['daylio'];
    for (const e of list) for (const t of e.tags) { const g = tagOf((tagById.get(t) || {}).name); if (g && !tags.includes(g)) tags.push(g); }
    const moods = [...new Set(list.map(e => moodName(e.mood)).filter(Boolean))];
    const fm = ['---', `date: ${key}`];
    if (moods.length === 1) fm.push(`mood: ${yamlStr(moods[0])}`); else if (moods.length) fm.push('moods:', ...moods.map(m => `  - ${yamlStr(m)}`));
    if (avg != null) fm.push(`mood_level: ${avg}`);
    fm.push(`entries: ${list.length}`, 'tags:', ...tags.map(t => `  - ${yamlStr(t)}`), '---', '');
    const body = [`# ${T.dayTitle(first)}`, ''];
    let pn = 0;
    for (const e of list) {
      body.push(`## ${p2(e.h)}:${p2(e.mi)}${e.mood != null ? `, ${moodName(e.mood)}` : ''}`, '');
      const acts = e.tags.map(t => (tagById.get(t) || {}).name).filter(Boolean);
      if (acts.length) body.push(`${T.activitiesLabel}: ${acts.join(', ')}`, '');
      if (e.title) body.push(`### ${e.title.replace(/[#\r\n]/g, ' ').trim()}`, '');
      if (e.md) body.push(e.md, '');
      for (const a of e.assets) {
        const A = journal.assets.get(a);
        const p = photos.get(a);
        if (!A || !p) continue;
        pn++;
        const name = `${key}-${pn}.${p.ext}`;
        photoPaths.set(a, `${root}Attachments/${name}`);
        body.push(A.type === 'photo' ? `![](../../Attachments/${name})` : `[${T.voiceLabel}](../../Attachments/${name})`, '');
      }
    }
    files[`${root}Journal/${first.y}/${key}.md`] = fm.join('\n') + body.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
    const yl = yearLinks.get(first.y) || [];
    yl.push({ key, m: first.m, moods: moods.join(', ') });
    yearLinks.set(first.y, yl);
  }
  for (const [y, list] of yearLinks) {
    const lines = [`# ${y}`, ''];
    let month = -1;
    for (const r of list.sort((a, b) => a.key.localeCompare(b.key))) {
      if (r.m !== month) { month = r.m; lines.push('', `## ${T.monthYear(y, r.m)}`, ''); }
      lines.push(`- [[${r.key}]]${r.moods ? ` ${r.moods}` : ''}`);
    }
    files[`${root}Journal/${y}.md`] = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }
  files[`${root}README.md`] = T.readme(byDay.size, [...set].sort((a, b) => a - b)) + '\n';
  return { files, photoPaths, days: byDay.size };
}
