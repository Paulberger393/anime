/* Baut die Artifact-Fassung: gleiches Spiel, aber ohne <html>/<head>/<body>,
   weil die Artifact-Plattform diese Huelle selbst beisteuert.
   Aufruf:  node build-artifact.js  ->  dist/artifact.html               */
const fs = require('fs'), path = require('path');
const ROOT = __dirname;
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const b64  = f => fs.readFileSync(path.join(ROOT, f)).toString('base64');

const src = read('index.html');
const style = src.slice(src.indexOf('<style>'), src.indexOf('</style>') + 8);
const body  = src.slice(src.indexOf('<canvas id="game">'), src.indexOf('<script src="js/core.js">'));

const icon180 = 'data:image/png;base64,' + b64('icon-180.png');
const manifest = JSON.parse(read('manifest.webmanifest'));
manifest.icons = [
  { src: 'data:image/png;base64,' + b64('icon-192.png'), sizes: '192x192', type: 'image/png' },
  { src: 'data:image/png;base64,' + b64('icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' }
];
manifest.start_url = location => './';
delete manifest.start_url;
const manifestUri = 'data:application/manifest+json;base64,' + Buffer.from(JSON.stringify(manifest)).toString('base64');

/* Die Huelle bringt ihr eigenes viewport-Meta mit, das weder viewport-fit=cover
   noch user-scalable=no setzt. Beides ist auf dem iPhone Pflicht: sonst liegt das
   HUD unter der Notch und ein Doppeltipp zoomt mitten im Match. Zur Laufzeit
   nachziehen ist der einzige Weg, an den Head zu kommen. */
const shim = `
<script>
(function () {
  var vp = document.querySelector('meta[name="viewport"]');
  if (!vp) { vp = document.createElement('meta'); vp.name = 'viewport'; document.head.appendChild(vp); }
  vp.setAttribute('content', 'width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover');
  var metas = {
    'apple-mobile-web-app-capable': 'yes',
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': 'Schotter',
    'theme-color': '#0b1020',
    'color-scheme': 'dark'
  };
  for (var n in metas) {
    var m = document.querySelector('meta[name="' + n + '"]') || document.createElement('meta');
    m.setAttribute('name', n); m.setAttribute('content', metas[n]);
    if (!m.parentNode) document.head.appendChild(m);
  }
  function link(rel, href, type) {
    var l = document.createElement('link');
    l.rel = rel; l.href = href; if (type) l.type = type;
    document.head.appendChild(l);
  }
  link('apple-touch-icon', ${JSON.stringify(icon180)});
  link('manifest', ${JSON.stringify(manifestUri)}, 'application/manifest+json');
})();
</script>`;

const scripts = ['vendor/three.min.js', 'js/core.js', 'js/data.js', 'js/world.js', 'js/ai.js', 'js/render3d.js', 'js/game.js']
  .map(f => '<script>\n' + read(f).replace(/<\/script>/gi, '<\\/script>') + '\n</script>')
  .join('\n');

let out = '<title>Schotter Royale</title>\n' + style + '\n' + shim + '\n' + body + scripts + '\n';

// Kein Service Worker: die Datei ist eine einzelne Seite, es gibt kein sw.js daneben.
out = out.replace(/\s*if \('serviceWorker' in navigator[\s\S]*?\n  \}\n/, '\n');

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist', 'artifact.html'), out);
console.log('dist/artifact.html', (out.length / 1024).toFixed(0) + ' KB');
