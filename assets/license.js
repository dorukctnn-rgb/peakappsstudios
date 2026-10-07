/* Gumroad license check for Peak Apps Tools.
 * Usage (per tool page):
 *   <script src="/assets/license.js" defer></script>
 *   PeakLicense.setup({ tool: 'tumbler', productId: '...', permalink: 'tumbler-studio-pro', buyUrl: '...' })
 *   PeakLicense.isPro()            -> boolean (true only after a successful verify)
 *   PeakLicense.onChange(fn)       -> fn(isPro) on every change (also called once immediately)
 *   PeakLicense.open()             -> opens the "enter your license key" dialog
 *   PeakLicense.requirePro(label)  -> true if Pro, otherwise opens the upsell dialog and returns false
 * Verification calls Gumroad's public endpoint (CORS allowed, no secret needed).
 * The verified key is cached locally and re-checked in the background every 7 days.
 */
(function () {
  const API = 'https://api.gumroad.com/v2/licenses/verify';
  const WEEK = 7 * 864e5;
  let cfg = null;
  const listeners = [];
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const keyName = () => `peak-license:${cfg.tool}`;

  function current() {
    const rec = cfg && store.get(keyName());
    return !!(rec && rec.ok && rec.key);
  }
  function emit() { const pro = current(); listeners.forEach(fn => { try { fn(pro); } catch (e) { console.error(e); } }); }

  async function verify(licenseKey, { increment = false } = {}) {
    if (!cfg) throw new Error('PeakLicense.setup() was not called');
    const key = String(licenseKey || '').trim();
    if (!/^[A-Za-z0-9-]{8,}$/.test(key)) return { ok: false, message: 'That doesn’t look like a license key. It is in your Gumroad receipt email.' };
    const body = new URLSearchParams({ license_key: key, increment_uses_count: increment ? 'true' : 'false' });
    if (cfg.productId) body.set('product_id', cfg.productId); else body.set('product_permalink', cfg.permalink);
    let json;
    try {
      const r = await fetch(API, { method: 'POST', body });
      json = await r.json();
    } catch (e) {
      return { ok: false, network: true, message: 'Couldn’t reach Gumroad to check the key. Check your connection and try again.' };
    }
    const p = json && json.purchase;
    const valid = json && json.success && p && !p.refunded && !p.chargebacked && !p.disputed &&
      !(p.subscription_cancelled_at || p.subscription_failed_at || p.subscription_ended_at);
    if (valid) {
      store.set(keyName(), { ok: true, key, checked: Date.now(), email: p.email || '' });
      emit();
      return { ok: true, message: 'Pro is active on this browser. Thank you.' };
    }
    if (json && json.success && p) { store.del(keyName()); emit(); return { ok: false, message: 'This purchase was refunded or has ended, so Pro is off.' }; }
    return { ok: false, message: (json && json.message) || 'That license key was not accepted.' };
  }

  async function recheck() {
    const rec = store.get(keyName());
    if (!rec || !rec.key || Date.now() - (rec.checked || 0) < WEEK) return;
    const res = await verify(rec.key);
    if (!res.ok && !res.network) { store.del(keyName()); emit(); }
  }

  function dialog() {
    let d = document.getElementById('peak-license-dialog');
    if (d) return d;
    d = document.createElement('dialog');
    d.id = 'peak-license-dialog';
    d.className = 'license-dialog';
    d.innerHTML = `
      <form method="dialog">
        <h2 style="font-size:22px" data-l-title>Get Pro</h2>
        <p class="small muted" data-l-reason style="margin:0"></p>
        <a class="btn btn-primary" data-l-buy target="_blank" rel="noopener">Buy Pro on Gumroad</a>
        <label class="field"><span>Already bought it? Paste your license key</span>
          <input class="input mono" name="key" autocomplete="off" spellcheck="false" placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"></label>
        <p class="license-status" data-l-status role="status"></p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-ink" value="verify" data-l-verify>Activate</button>
          <button class="btn" value="close" formnovalidate>Close</button>
        </div>
      </form>`;
    document.body.appendChild(d);
    const status = d.querySelector('[data-l-status]');
    d.querySelector('[data-l-verify]').addEventListener('click', async (ev) => {
      ev.preventDefault();
      status.dataset.state = ''; status.textContent = 'Checking with Gumroad…';
      const res = await verify(d.querySelector('input[name=key]').value);
      status.dataset.state = res.ok ? 'ok' : 'err'; status.textContent = res.message;
      if (res.ok) setTimeout(() => d.close(), 900);
    });
    return d;
  }

  function open(reason) {
    const d = dialog();
    d.querySelector('[data-l-buy]').href = cfg.buyUrl;
    d.querySelector('[data-l-reason]').textContent = reason || cfg.pitch || '';
    d.querySelector('[data-l-status]').textContent = current() ? 'Pro is active on this browser.' : '';
    if (typeof d.showModal === 'function') d.showModal(); else window.open(cfg.buyUrl, '_blank', 'noopener');
  }

  window.PeakLicense = {
    setup(options) {
      cfg = Object.assign({ tool: 'tool', productId: '', permalink: '', buyUrl: '#', pitch: '' }, options);
      document.querySelectorAll('[data-buy-pro]').forEach(a => { a.href = cfg.buyUrl; a.target = '_blank'; a.rel = 'noopener'; });
      document.querySelectorAll('[data-enter-key]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); open(); }));
      recheck();
      emit();
    },
    isPro: current,
    verify,
    open,
    onChange(fn) { listeners.push(fn); if (cfg) fn(current()); },
    requirePro(reason) { if (current()) return true; open(reason); return false; },
    signOut() { store.del(keyName()); emit(); },
  };
})();
