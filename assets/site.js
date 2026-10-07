/* Shared helpers for Peak Apps Tools pages. */
(function () {
  // Toast: PeakUI.toast('Saved')
  let t;
  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(t); t = setTimeout(() => el.classList.remove('show'), 2600);
  }
  // Download a Blob or data URL with a filename.
  function download(data, filename) {
    const url = typeof data === 'string' ? data : URL.createObjectURL(data);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    if (typeof data !== 'string') setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  // Segmented controls: <div class="seg" data-seg="unit"><button data-value="in" aria-pressed="true">in</button>…</div>
  function seg(root, onChange) {
    root.addEventListener('click', e => {
      const b = e.target.closest('button[data-value]'); if (!b) return;
      root.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      onChange && onChange(b.dataset.value);
    });
    const on = root.querySelector('[aria-pressed="true"]');
    return () => (root.querySelector('[aria-pressed="true"]') || on).dataset.value;
  }
  // Drop zone wiring: drop(el, files => …)
  function drop(el, onFiles) {
    const input = el.querySelector('input[type=file]');
    el.addEventListener('click', e => { if (e.target !== input) input && input.click(); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input && input.click(); } });
    input && input.addEventListener('change', () => input.files.length && onFiles([...input.files]));
    ['dragenter', 'dragover'].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); el.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); el.classList.remove('is-over'); }));
    el.addEventListener('drop', e => e.dataTransfer.files.length && onFiles([...e.dataTransfer.files]));
  }
  window.PeakUI = { toast, download, seg, drop };
})();
