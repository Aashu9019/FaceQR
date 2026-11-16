(() => {
  const $ = (id) => document.getElementById(id);
  const urlEl = $('url'), fileEl = $('file'), drop = $('drop');
  const dotEl = $('dot'), contrastEl = $('contrast'), zoomEl = $('zoom');
  const canvas = $('out'), ctx = canvas.getContext('2d');
  const frame = $('frame'), dl = $('download'), test = $('test');
  const statusEl = $('status'), hint = $('url-hint');

  const SIZE = 1000;
  const QUIET = 4;
  const opts = { mode: 'photo', shape: 'square', corner: 'square', style: 'color' };
  const sampler = document.createElement('canvas');
  const sctx = sampler.getContext('2d', { willReadFrequently: true });

  // push a color dark enough (or light enough) for scanners, keeping its hue
  function adjust(r, g, b, dark) {
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (dark && lum > 0.36) {
      const k = 0.36 / lum;
      return `rgb(${r * k | 0},${g * k | 0},${b * k | 0})`;
    }
    if (!dark && lum < 0.74) {
      const t = (0.74 - lum) / (1 - lum);
      return `rgb(${r + (255 - r) * t | 0},${g + (255 - g) * t | 0},${b + (255 - b) * t | 0})`;
    }
    return `rgb(${r},${g},${b})`;
  }
  const PALETTES = {
    color: { dark: '#111111', light: '#ffffff', filter: '' },
    mono: { dark: '#111111', light: '#ffffff', filter: ' grayscale(1)' },
    ink: { dark: '#14264d', light: '#f4f6fb', filter: ' grayscale(1) sepia(0.3) hue-rotate(180deg)' },
    ember: { dark: '#8f2410', light: '#fff6f2', filter: ' grayscale(1) sepia(0.6)' },
  };

  let img = null;
  let pan = { x: 0, y: 0 };
  let layout = null;

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

  function inFinder(r, c, n) {
    const box = (r0, c0) => r >= r0 && r < r0 + 8 && c >= c0 && c < c0 + 8;
    return box(0, 0) || box(0, n - 8) || box(n - 8, 0);
  }

  function shapePath(x, y, s, shape) {
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2);
    } else if (shape === 'round') {
      ctx.roundRect(x, y, s, s, s * 0.3);
    } else if (shape === 'diamond') {
      ctx.moveTo(x + s / 2, y);
      ctx.lineTo(x + s, y + s / 2);
      ctx.lineTo(x + s / 2, y + s);
      ctx.lineTo(x, y + s / 2);
      ctx.closePath();
    } else {
      ctx.rect(x, y, s, s);
    }
  }

  function cornerPath(x, y, s, corner) {
    ctx.beginPath();
    if (corner === 'circle') ctx.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2);
    else if (corner === 'round') ctx.roundRect(x, y, s, s, s * 0.28);
    else ctx.rect(x, y, s, s);
  }

  function drawFinder(x, y, cell, pal) {
    // white separator ring, then 7 / 5 / 3 module layers
    ctx.fillStyle = pal.light;
    ctx.fillRect(x - cell, y - cell, cell * 9, cell * 9);
    const layers = [[0, 7, pal.dark], [1, 5, pal.light], [2, 3, pal.dark]];
    for (const [inset, span, color] of layers) {
      ctx.fillStyle = color;
      cornerPath(x + inset * cell, y + inset * cell, span * cell, opts.corner);
      ctx.fill();
    }
  }

  function clampPan() {
    if (!layout || !img) return;
    const { area } = layout;
    const s = Math.max(area / img.width, area / img.height) * (zoomEl.value / 100);
    const maxX = Math.max(0, (img.width * s - area) / 2);
    const maxY = Math.max(0, (img.height * s - area) / 2);
    pan.x = Math.min(maxX, Math.max(-maxX, pan.x));
    pan.y = Math.min(maxY, Math.max(-maxY, pan.y));
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

    const pal = PALETTES[opts.style];
    const n = qr.getModuleCount();
    const cell = SIZE / (n + QUIET * 2);
    const off = QUIET * cell;
    const area = n * cell;
    layout = { area };
    clampPan();

    ctx.fillStyle = pal.light;
    ctx.fillRect(0, 0, SIZE, SIZE);

    const s = Math.max(area / img.width, area / img.height) * (zoomEl.value / 100);
    const w = img.width * s, h = img.height * s;
    const imgX = (area - w) / 2 + pan.x, imgY = (area - h) / 2 + pan.y;
    const filter = `contrast(${contrastEl.value}%)${pal.filter}`;

    if (opts.mode === 'photo') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(off, off, area, area);
      ctx.clip();
      ctx.filter = filter;
      ctx.drawImage(img, off + imgX, off + imgY, w, h);
      ctx.restore();
      ctx.filter = 'none';

      const dot = cell * (dotEl.value / 100);
      const pad = (cell - dot) / 2;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (inFinder(r, c, n)) continue;
          ctx.fillStyle = qr.isDark(r, c) ? pal.dark : pal.light;
          shapePath(off + c * cell + pad, off + r * cell + pad, dot, opts.shape);
          ctx.fill();
        }
      }
    } else {
      // halftone: one sample per module, image becomes the dots
      const k = n / area;
      sampler.width = sampler.height = n;
      sctx.fillStyle = '#ffffff';
      sctx.fillRect(0, 0, n, n);
      sctx.filter = filter;
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(img, imgX * k, imgY * k, w * k, h * k);
      sctx.filter = 'none';
      const px = sctx.getImageData(0, 0, n, n).data;

      // dot slider maps to 55..100% of the cell here, halftone needs fuller dots
      const dot = cell * (0.55 + (dotEl.value - 25) / 35 * 0.45);
      const pad = (cell - dot) / 2;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (inFinder(r, c, n)) continue;
          const i = (r * n + c) * 4;
          ctx.fillStyle = adjust(px[i], px[i + 1], px[i + 2], qr.isDark(r, c));
          shapePath(off + c * cell + pad, off + r * cell + pad, dot, opts.shape);
          ctx.fill();
        }
      }
    }

    drawFinder(off, off, cell, pal);
    drawFinder(off + (n - 7) * cell, off, cell, pal);
    drawFinder(off, off + (n - 7) * cell, cell, pal);

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
        pan = { x: 0, y: 0 };
        zoomEl.value = 100;
        $('drop-title').textContent = 'Change image';
        $('drop-sub').textContent = file.name;
        render();
      };
      i.onerror = () => { statusEl.textContent = 'Could not read that image.'; };
      i.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  // drag to move the image
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (frame.dataset.state !== 'ready' || drag) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const k = SIZE / canvas.getBoundingClientRect().width;
    pan.x = drag.px + (e.clientX - drag.x) * k;
    pan.y = drag.py + (e.clientY - drag.y) * k;
    render();
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    if (frame.dataset.state !== 'ready') return;
    e.preventDefault();
    zoomEl.value = Math.min(300, Math.max(100, +zoomEl.value - Math.sign(e.deltaY) * 8));
    render();
  }, { passive: false });

  $('reset').addEventListener('click', () => {
    pan = { x: 0, y: 0 };
    zoomEl.value = 100;
    render();
  });

  urlEl.addEventListener('input', render);
  urlEl.addEventListener('blur', () => {
    const v = normalise(urlEl.value);
    if (v !== urlEl.value) { urlEl.value = v; render(); }
  });
  fileEl.addEventListener('change', () => loadFile(fileEl.files[0]));
  [dotEl, contrastEl, zoomEl].forEach((el) => el.addEventListener('input', render));

  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (ev) => loadFile(ev.dataTransfer.files[0]));

  document.querySelectorAll('.seg[data-group]').forEach((group) => {
    const buttons = group.querySelectorAll('button');
    buttons.forEach((b) => b.addEventListener('click', () => {
      buttons.forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      opts[group.dataset.group] = b.dataset.value;
      render();
    }));
  });

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
