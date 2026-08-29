/* Bündelt das Spiel in eine einzige, komplett eigenständige HTML-Datei.
   Aufruf:  node build.js   ->  dist/schotter-royale.html          */
const fs = require('fs'), path = require('path');
const ROOT = __dirname;
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const b64  = f => fs.readFileSync(path.join(ROOT, f)).toString('base64');

let html = read('index.html');

// 1) alle Skripte inline setzen (Reihenfolge wie im HTML)
const scripts = ['js/core.js', 'js/data.js', 'js/world.js', 'js/ai.js', 'js/game.js'];
for (const s of scripts) {
  const tag = `<script src="${s}"></script>`;
  if (!html.includes(tag)) throw new Error('Script-Tag nicht gefunden: ' + s);
  // </script> im Quelltext würde den Block vorzeitig schließen
  const code = read(s).replace(/<\/script>/gi, '<\\/script>');
  html = html.replace(tag, `<script>\n${code}\n</script>`);
}

// 2) Icons + Manifest als data:-URI einbetten, damit nichts nachgeladen wird
const icon180 = 'data:image/png;base64,' + b64('icon-180.png');
const iconSvg = 'data:image/svg+xml;base64,' + Buffer.from(read('icon.svg')).toString('base64');
const manifest = JSON.parse(read('manifest.webmanifest'));
manifest.icons = [{ src: 'data:image/png;base64,' + b64('icon-192.png'), sizes: '192x192', type: 'image/png' },
                  { src: 'data:image/png;base64,' + b64('icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' }];
manifest.start_url = './';
const manifestUri = 'data:application/manifest+json;base64,' + Buffer.from(JSON.stringify(manifest)).toString('base64');

html = html.replace('<link rel="manifest" href="manifest.webmanifest">', `<link rel="manifest" href="${manifestUri}">`);
html = html.replace('<link rel="icon" href="icon.svg" type="image/svg+xml">', `<link rel="icon" href="${iconSvg}" type="image/svg+xml">`);
html = html.replace('<link rel="apple-touch-icon" href="icon-180.png">', `<link rel="apple-touch-icon" href="${icon180}">`);

// 3) Service Worker gibt es in der Einzeldatei nicht — sie ist ohnehin offline
html = html.replace(/\s*if \('serviceWorker' in navigator[\s\S]*?\n  \}\n/,
  "\n  // Einzeldatei-Build: kein Service Worker nötig, alles steckt schon in dieser Datei.\n");

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', 'schotter-royale.html');
fs.writeFileSync(out, html);
console.log('geschrieben:', out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
