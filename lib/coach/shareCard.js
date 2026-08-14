// Genera la IMAGEN compartible del Consejo del Día (client-side, SVG→PNG) y la comparte por
// Web Share API. PRIVACIDAD (regla dura): la imagen NO lleva NINGÚN PII — ni nombre, ni peso, ni
// kcal/macros personales. Sólo el TÍTULO del consejo (+ cuerpo SÓLO si no tiene cifras) + branding.
// El branding del pie es placeholder; Lugia (Copy) afina el texto/marca.

const BRAND = 'Registro Calórico';

function esc(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Envuelve texto en líneas de <= max caracteres (por palabras).
function wrap(text, max) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) { if (cur) lines.push(cur); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

function tspans(lines, x, lh) {
  return lines.map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lh}">${esc(l)}</tspan>`).join('');
}

// Construye el SVG 1080x1350 (formato historia). Fondo teal de marca, título grande, cuerpo
// (si es PII-free), emblema de racha si aplica, y branding sutil en el pie.
export function buildSVG({ titulo, cuerpo, foco }) {
  const W = 1080, H = 1350, PAD = 96;
  const esRacha = foco === 'racha' || foco === 'progreso';
  // Cuerpo SÓLO si NO contiene dígitos (evita filtrar cifras personales a la imagen pública).
  const cuerpoSeguro = /\d/.test(String(cuerpo || '')) ? '' : String(cuerpo || '');

  const titLines = wrap(titulo, 16);
  const titY = esRacha ? 620 : 560;
  const titBlock = `<text x="${PAD}" y="${titY}" fill="#FFFFFF" font-family="Inter, system-ui, sans-serif" font-size="86" font-weight="800" letter-spacing="-1">${tspans(titLines, PAD, 96)}</text>`;

  const bodyY = titY + titLines.length * 96 + 40;
  const bodyBlock = cuerpoSeguro
    ? `<text x="${PAD}" y="${bodyY}" fill="rgba(255,255,255,0.92)" font-family="Inter, system-ui, sans-serif" font-size="44" font-weight="400">${tspans(wrap(cuerpoSeguro, 30), PAD, 60)}</text>`
    : '';

  const emblema = esRacha
    ? `<g transform="translate(${PAD} 360)"><circle cx="60" cy="60" r="60" fill="rgba(255,255,255,0.14)"/><path transform="translate(30 26) scale(2.6)" d="M12 3c1 3 4 4.5 4 8a4 4 0 1 1-8 0c0-1.4.6-2.4 1.3-3.3C10 8.9 11.5 6 12 3Z" fill="#FFFFFF"/></g>`
    : `<g transform="translate(${PAD} 360)"><circle cx="60" cy="60" r="60" fill="rgba(255,255,255,0.14)"/><path transform="translate(34 34) scale(2)" d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" fill="#FFFFFF"/></g>`;

  const eyebrow = `<text x="${PAD}" y="300" fill="rgba(255,255,255,0.75)" font-family="Inter, system-ui, sans-serif" font-size="34" font-weight="700" letter-spacing="4">${esRacha ? 'TU RACHA' : 'CONSEJO DEL DÍA'}</text>`;
  const pie = `<text x="${PAD}" y="${H - 84}" fill="rgba(255,255,255,0.75)" font-family="Inter, system-ui, sans-serif" font-size="34" font-weight="600">hecho con ${esc(BRAND)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0E7C6B"/><stop offset="1" stop-color="#0A5F52"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="40" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="2"/>
    ${eyebrow}${emblema}${titBlock}${bodyBlock}${pie}
  </svg>`;
}

async function svgToBlob(svg, w, h) {
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const img = new Image();
  img.width = w; img.height = h;
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// Comparte el consejo como imagen (o texto-solo del TÍTULO como último recurso). 100% iniciativa
// del usuario. Devuelve { ok, motivo? }: 'no-soportado' | 'descarga' | 'error'.
export async function compartirConsejo({ titulo, cuerpo, foco }) {
  try {
    const svg = buildSVG({ titulo, cuerpo, foco });
    const blob = await svgToBlob(svg, 1080, 1350);
    const file = blob ? new File([blob], 'consejo.png', { type: 'image/png' }) : null;

    if (file && typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Consejo del día' });
      return { ok: true };
    }
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ title: 'Consejo del día', text: titulo }); // solo el título (sin PII)
      return { ok: true };
    }
    if (blob) { // sin Web Share → descarga la imagen
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'consejo.png';
      a.click();
      URL.revokeObjectURL(a.href);
      return { ok: true, motivo: 'descarga' };
    }
    return { ok: false, motivo: 'no-soportado' };
  } catch (e) {
    if (e?.name === 'AbortError') return { ok: true }; // el usuario canceló el share
    return { ok: false, motivo: 'error' };
  }
}
