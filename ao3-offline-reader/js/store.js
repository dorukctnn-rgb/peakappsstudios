/* What Ficshelf remembers in this browser, only if the visitor leaves "Remember my shelf" on: one small record per work (title, tags,
 * counts, the file's path and size) in IndexedDB, never a file and never any text, and, in Chrome and Edge, the handle of a folder
 * chosen with "Choose a folder and remember it". Every call is wrapped: a private window or a blocked database just means nothing is
 * remembered. forget() empties both. Nothing here touches the network. */
const DB = 'ficshelf';
const VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise(resolve => {
    try {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('works')) db.createObjectStore('works', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}
const done = tx => new Promise(res => { tx.oncomplete = () => res(true); tx.onerror = () => res(false); tx.onabort = () => res(false); });
const reqp = r => new Promise(res => { r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); });

export async function saveWorks(works) {
  const db = await open();
  if (!db) return false;
  try {
    const tx = db.transaction('works', 'readwrite');
    const st = tx.objectStore('works');
    st.clear();
    for (const w of works) st.put(w);
    return await done(tx);
  } catch { return false; }
}
export async function loadWorks() {
  const db = await open();
  if (!db) return [];
  try { return (await reqp(db.transaction('works').objectStore('works').getAll())) || []; } catch { return []; }
}
export async function saveHandle(handle) {
  const db = await open();
  if (!db) return false;
  try { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(handle, 'folder'); return await done(tx); } catch { return false; }
}
export async function loadHandle() {
  const db = await open();
  if (!db) return null;
  try { return (await reqp(db.transaction('meta').objectStore('meta').get('folder'))) || null; } catch { return null; }
}
export async function forget() {
  const db = await open();
  if (!db) return false;
  try {
    const tx = db.transaction(['works', 'meta'], 'readwrite');
    tx.objectStore('works').clear();
    tx.objectStore('meta').clear();
    return await done(tx);
  } catch { return false; }
}
