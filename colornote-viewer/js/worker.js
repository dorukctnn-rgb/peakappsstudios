/* Notelift worker: opens the ColorNote backup you pick, in this browser tab, with ColorNote's default password or the
 * one you type, and builds the files you save. It makes no network request; nothing it reads is stored or sent
 * anywhere, the password is used once and dropped, and the backup is only read, never changed. The file's bytes stay
 * in memory only until it is open (or you pick another file). */
import { zipSync, strToU8, unzipSync } from '../vendor/fflate.js';
import { openBackup, BackupError, sniff, readHeader } from './backup.js';
import { normalise, textBundle, noteFileText, noteMarkdown, notesCsv, notesJson, notesEnex, notesDocHtml, notePaths, restoreList, shownTitle, folderName, isoLocal } from './notes.js';
import { sampleRecords } from './sample.js';
import { labels } from './i18n.js';
import { readme } from './readme.js';

const books = { main: null, compare: null }; // the open backups: { notes, folders, skipped, header, name }
const pending = { main: null, compare: null }; // a file waiting for its password: { bytes, name }
const post = (type, data, transfer) => self.postMessage(Object.assign({ type }, data), transfer || []);
const progress = (purpose, step) => post('progress', { purpose, step });

async function bytesOf(file) {
  if (!file || !file.size) throw new BackupError('empty');
  if (file.size > 256 * 1024 * 1024) throw new BackupError('toobig');
  let bytes = new Uint8Array(await file.arrayBuffer());
  if (sniff(bytes.subarray(0, 64)) === 'zip') {
    // a backup that was sent as a ZIP (some mail apps and cloud drives do this): open the backup inside it
    let entries;
    try { entries = unzipSync(bytes, { filter: f => f.originalSize < 256 * 1024 * 1024 && !/\/$/.test(f.name) && !/(^|\/)(__MACOSX|\.)/.test(f.name) }); } catch (e) { throw new BackupError('zipbad'); }
    const names = Object.keys(entries);
    const pick = names.find(n => readHeader(entries[n])) || names.find(n => /\.(backup|dat|doc)$/i.test(n));
    if (!pick) throw new BackupError('zipnobackup', names.slice(0, 5).map(n => n.split('/').pop()).join(', '));
    bytes = entries[pick];
  }
  return bytes;
}

function opened(purpose, name, got, sample = false) {
  progress(purpose, 'notes');
  const N = normalise(got.records);
  const book = { notes: N.notes, folders: N.folders, skipped: N.skipped, header: got.header, name, cut: !!got.cut, sample };
  books[purpose] = book;
  pending[purpose] = null;
  post('opened', { purpose, data: { notes: N.notes, folders: N.folders, skipped: N.skipped, header: got.header, name, cut: !!got.cut, layout: got.layout, sample, password: got.password || 'default' } });
}

async function tryOpen(purpose, password) {
  const p = pending[purpose];
  if (!p) return;
  progress(purpose, 'decrypt');
  try {
    const got = await openBackup(p.bytes, password);
    opened(purpose, p.name, got);
  } catch (e) {
    const code = e && e.code ? e.code : 'internal';
    if (code === 'password' || code === 'nosig') { post('password', { purpose, code, retry: password != null, name: p.name }); return; }
    pending[purpose] = null;
    post('error', { purpose, code, detail: e && e.detail ? e.detail : String(e && e.message || e).slice(0, 200) });
  }
}

const zipOf = files => new Blob([zipSync(files, { level: 6, mtime: new Date() })], { type: 'application/zip' });
const txt = s => strToU8(s.replace(/\r?\n/g, '\r\n'));

function pick(book, ids) {
  if (!ids) return book.notes;
  const want = new Set(ids);
  return book.notes.filter(n => want.has(n.n));
}

function buildExport(m) {
  const book = books.main;
  if (!book) throw new Error('nobook');
  const L = Object.assign({}, labels(m.lang), readme(m.lang));
  const notes = pick(book, m.ids);
  const F = book.folders;
  switch (m.kind) {
    case 'txt20': return new Blob([textBundle(notes.slice(0, 20), F, L)], { type: 'text/plain;charset=utf-8' });
    case 'note': return new Blob([noteFileText(notes[0], F, L)], { type: 'text/plain;charset=utf-8' });
    case 'zip-txt': {
      const files = {};
      notePaths(notes, F, L, 'txt').forEach((p, i) => { files[p] = txt(noteFileText(notes[i], F, L)); });
      files[`${L.allInOne}.txt`] = txt(textBundle(notes, F, L));
      return zipOf(files);
    }
    case 'zip-md': {
      const files = {};
      notePaths(notes, F, L, 'md').forEach((p, i) => { files[p] = strToU8(noteMarkdown(notes[i], F, L)); });
      return zipOf(files);
    }
    case 'csv': return new Blob([notesCsv(notes, F, L)], { type: 'text/csv;charset=utf-8' });
    case 'json': return new Blob([notesJson(notes, F)], { type: 'application/json' });
    case 'iphone': {
      const files = {};
      const shown = notes.filter(n => n.where !== 'trash');
      notePaths(shown, F, L, 'md').forEach((p, i) => { files[`${L.packMarkdownDir}/${p}`] = strToU8(noteMarkdown(shown[i], F, L, true)); });
      files[`${L.packEnexName}.enex`] = strToU8(notesEnex(shown, L));
      files[`${L.readmeName}.txt`] = txt(L.readmeIphone);
      return zipOf(files);
    }
    case 'gdocs': {
      const files = {};
      const shown = notes.filter(n => n.where !== 'trash');
      files[`${L.allInOne}.html`] = strToU8(notesDocHtml(shown, F, L, m.lang));
      notePaths(shown, F, L, 'html').forEach((p, i) => { files[`${L.packDocsDir}/${p}`] = strToU8(notesDocHtml([shown[i]], F, L, m.lang).replace(/<h1>[^<]*<\/h1>\n/, '')); });
      files[`${L.readmeName}.txt`] = txt(L.readmeGdocs);
      return zipOf(files);
    }
    case 'restore': {
      const R = restoreList(book.notes);
      const line = n => `- ${shownTitle(n) || L.untitled} (${L.modified}: ${isoLocal(n.modified)}; ${L.folder}: ${folderName(n.folder, F, L)})`;
      const parts = [L.restoreFileTitle, '', `${L.places.archive} (${R.archive.length})`, ...R.archive.map(line), '', `${L.places.trash} (${R.trash.length})`, ...R.trash.map(line), '', L.restoreFileSteps];
      return new Blob(['﻿' + parts.join('\r\n') + '\r\n'], { type: 'text/plain;charset=utf-8' });
    }
    case 'compare': return new Blob(['﻿' + String(m.text || '').replace(/\r?\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' });
    default: throw new Error('unknown export ' + m.kind);
  }
}

self.onmessage = async ev => {
  const m = ev.data || {};
  try {
    if (m.type === 'open') {
      const purpose = m.purpose === 'compare' ? 'compare' : 'main';
      pending[purpose] = null;
      progress(purpose, 'reading');
      let bytes;
      try { bytes = await bytesOf(m.file); } catch (e) { post('error', { purpose, code: e.code || 'read', detail: e.detail || '' }); return; }
      pending[purpose] = { bytes, name: m.file && m.file.name ? String(m.file.name).slice(0, 200) : 'backup' };
      await tryOpen(purpose, null);
      return;
    }
    if (m.type === 'password') { await tryOpen(m.purpose === 'compare' ? 'compare' : 'main', String(m.password || '')); return; }
    if (m.type === 'cancel') { pending[m.purpose === 'compare' ? 'compare' : 'main'] = null; return; }
    if (m.type === 'sample') { pending.main = null; opened('main', 'sample', { records: sampleRecords(m.lang, Date.now()), header: null, layout: 'sample' }, true); return; }
    if (m.type === 'export') { post('result', { id: m.id, blob: buildExport(m) }); return; }
  } catch (e) {
    if (m.id != null) post('error', { id: m.id, code: 'internal', detail: String(e && e.message || e).slice(0, 200) });
    else post('error', { purpose: m.purpose || 'main', code: 'internal', detail: String(e && e.message || e).slice(0, 200) });
  }
};
