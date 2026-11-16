(() => {
  const $ = (id) => document.getElementById(id);
  const urlEl = $('url'), fileEl = $('file'), drop = $('drop');
  const dotEl = $('dot'), contrastEl = $('contrast');
  const canvas = $('out'), ctx = canvas.getContext('2d');
  const frame = $('frame'), dl = $('download'), test = $('test');
  const statusEl = $('status'), hint = $('url-hint');
  const segButtons = document.querySelectorAll('.seg button');

  let img = null;
  let style = 'color';
  const SIZE = 1000;
  const QUIET = 4;

  function validUrl(v) {
    try {
      const u = new URL(v);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch { return false; }
  }

  function normalise(v) {
    v = v.trim();
    if (v && !/^[a-z]+:\/\//i.test(v)) v = 'https://' + v;
    return v;
  }

  function isFinder(r, c, n) {
    const inBox = (r0, c0) => r >= r0 && r < r0 + 8 && c >= c0 && c < c0 + 8;
    return inBox(0, 0) || inBox(0, n - 8) || inBox(n - 8, 0);
  }

  function render() {
    const url = normalise(urlEl.value);
    const ok = validUrl(url);

    hint.classList.toggle('error', !!urlEl.value && !ok);
    hint.textContent = urlEl.value && !ok ? 'That does not look like a web address yet.' : 'Full address, including https://';

    test.href = ok ? url : '#';
    test.setAttribute('aria-disabled', String(!ok));

    if (!ok || !img) {
      frame.dataset.state = 'empty';
      dl.disabled = true;
      statusEl.textContent = '';
      return;
    }

    let qr;
    try {
      qr = qrcode(0, 'H');
      qr.addData(url);
      qr.make();
    } catch {
      statusEl.textContent = 'That link is too long for a QR code. Try a shorter one.';
      frame.dataset.state = 'empty';
      dl.disabled = true;
      return;
    }

    const n = qr.getModuleCount();
    const cell = SIZE / (n + QUIET * 2);
    const off = QUIET * cell;
    const area = n * cell;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // image, cover-cropped into the code area
    const s = Math.max(area / img.width, area / img.height);
    const w = img.width * s, h = img.height * s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(off, off, area, area);
    ctx.clip();
    ctx.filter = `contrast(${contrastEl.value}%)${style === 'mono' ? ' grayscale(1)' : ''}`;
    ctx.drawImage(img, off + (area - w) / 2, off + (area - h) / 2, w, h);
    ctx.restore();
    ctx.filter = 'none';

    const dot = cell * (dotEl.value / 100);
    const pad = (cell - dot) / 2;

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const dark = qr.isDark(r, c);
        const x = off + c * cell, y = off + r * cell;
        if (isFinder(r, c, n)) {
          ctx.fillStyle = dark ? '#111111' : '#ffffff';
          ctx.fillRect(x, y, cell + 0.5, cell + 0.5);
          continue;
        }
        // light wash biases the whole module toward its value
        ctx.fillStyle = dark ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.32)';
        ctx.fillRect(x, y, cell + 0.5, cell + 0.5);
        ctx.fillStyle = dark ? '#111111' : '#ffffff';
        ctx.fillRect(x + pad, y + pad, dot, dot);
      }
    }

    frame.dataset.state = 'ready';
    dl.disabled = false;
    statusEl.textContent = 'Ready. Test it with your phone camera before printing.';
  }

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      statusEl.textContent = 'That file is not an image.';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const i = new Image();
      i.onload = () => {
        img = i;
        $('drop-title').textContent = 'Change image';
        $('drop-sub').textContent = file.name;
        render();
      };
      i.onerror = () => { statusEl.textContent = 'Could not read that image.'; };
      i.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  urlEl.addEventListener('input', render);
  urlEl.addEventListener('blur', () => {
    const v = normalise(urlEl.value);
    if (v !== urlEl.value) { urlEl.value = v; render(); }
  });
  fileEl.addEventListener('change', () => loadFile(fileEl.files[0]));
  dotEl.addEventListener('input', render);
  contrastEl.addEventListener('input', render);

  ['dragenter', 'dragover'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (ev) => loadFile(ev.dataTransfer.files[0]));

  segButtons.forEach((b) => b.addEventListener('click', () => {
    segButtons.forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    style = b.dataset.style;
    render();
  }));

  dl.addEventListener('click', () => {
    canvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'faceqr.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  });

  render();
})();
