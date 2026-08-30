# 🎮 Schotter Royale

Ein **komplett offline** spielbares Solo-Battle-Royale fürs iPhone — im Stil von Fortnite,
als **3D-Shooter aus der Ego-Perspektive**. Kein Server, kein Login, kein Internet nötig.
Alles läuft lokal auf dem Handy.

![Genre](https://img.shields.io/badge/Modus-Solo%20Battle%20Royale-8a4fd8)
![Offline](https://img.shields.io/badge/Offline-100%25-3ddc84)
![Ziel](https://img.shields.io/badge/Plattform-iPhone%20(PWA)-4aa3ff)
![Ansicht](https://img.shields.io/badge/Ansicht-Ego%203D-ff8a3a)

---

## Aufs iPhone bringen

### Weg 1 — GitHub Pages (empfohlen, 1 Minute)

1. Im Repo auf **Settings → Pages**
2. Bei *Source* **Deploy from a branch** wählen, Branch `main`, Ordner `/ (root)`, **Save**
3. Nach ~1 Minute ist das Spiel erreichbar unter
   `https://paulberger393.github.io/anime/`
4. Diese Adresse **auf dem iPhone in Safari** öffnen
5. **Teilen-Symbol → „Zum Home-Bildschirm"**

Ab jetzt liegt das Spiel als App-Icon auf dem Homescreen, startet im Vollbild ohne
Safari-Leiste und **läuft auch im Flugmodus** — ein Service Worker legt beim ersten
Start alle Dateien im Gerät ab.

### Weg 2 — ohne GitHub Pages

Repo herunterladen und den Ordner mit einem beliebigen Webserver ausliefern, z. B.:

```bash
python3 -m http.server 8080
```

Dann am iPhone `http://<IP-des-Rechners>:8080` im selben WLAN öffnen. Für den
Offline-Modus (Service Worker) ist `https` oder `localhost` nötig — über GitHub
Pages ist das automatisch gegeben.

---

## Steuerung

| Eingabe | Wirkung |
|---|---|
| **Links ziehen** (irgendwo linke Bildschirmhälfte) | Laufen — der Stick erscheint unter dem Daumen, Bewegung ist blickrelativ |
| **Rechts wischen** | Umschauen wie mit einer Maus (Drehen und Neigen); mit Auto-Feuer wird geschossen, sobald jemand im Fadenkreuz ist |
| **Rechts kurz tippen** | Einzelschuss, ohne den Daumen zum Feuerknopf zu bewegen |
| **FEUER** | Schießen |
| **NACHLADEN** | Magazin füllen |
| **HEILEN** | Bestes Heilitem benutzen (Verband, Medikit, Schild) |
| **HACKE** | Spitzhacke: Bäume/Steine/Kisten abbauen → Material, oder zuschlagen |
| **AUFHEBEN** | Truhe öffnen / Item aufheben (Munition & Material sammelt man automatisch ein) |
| **SPRINT** | Schneller laufen |
| **BAUEN** | Baumodus an/aus → **WAND**, **ECKE**, **BOX** und Materialwechsel |
| **Slots 1–5** | Waffe wählen; nochmal tippen auf ein Heilitem benutzt es |

Zum Testen am Rechner: `WASD` laufen, Maus zielen, Klick/`Leertaste` schießen,
`R` nachladen, `E` aufheben, `Q` heilen, `F` Hacke, `B` bauen, `Z/X/C` Bauteile.

---

## Was drin ist

**Match-Ablauf** — Battle Bus über die Insel, selbst abspringen und die Landezone
steuern, Gleitschirm, Landung, Loot-Rush, schrumpfender Sturm, Victory Royale.

**100 Gegner** (einstellbar 30–120). Die Bots looten, wechseln auf bessere Waffen,
heilen sich, rotieren in die Zone, feuern in Salven statt Dauerfeuer, bauen eine
Panikwand wenn sie beschossen werden — und rennen weg, solange sie noch keine Waffe
gefunden haben.

**7 Waffen** in 5 Seltenheitsstufen (grau bis legendär): Pistole, MP, Sturmgewehr,
Taktik-MP, Schrotflinte, Scharfschützengewehr, Raketenwerfer — mit vier Munitionsarten,
Magazingrößen, Streuung, Reichweite und Nachladezeiten.

**Loot** — Bodenloot, goldene Truhen, Munitionskisten und alles, was ein
ausgeschalteter Gegner fallen lässt. 5 Inventarplätze, automatischer Waffentausch
gegen Schlechteres.

**Heilung** — Verband, Medikit, Mini-Schild, Schildtrank, Wundertrank. 100 Leben +
100 Schild, jede Anwendung braucht Zeit und nagelt dich fest.

**Bauen** — Material aus Bäumen, Steinen und Kisten schlagen (Holz/Stein/Metall mit
unterschiedlicher Stabilität), dann Wand, Ecke oder Box setzen. Bauteile blocken
Bewegung *und* Kugeln und lassen sich zerschießen.

**Sturm** in 9 Phasen mit steigendem Schaden, Vorschau-Kreis auf Karte und Minimap.

**Sound** komplett synthetisiert (Web Audio) — keine Audiodateien, keine Ladezeit.

---

## Einstellungen im Hauptmenü

| Option | Bedeutung |
|---|---|
| **Gegner** | 30 / 50 / 75 / 100 / 120 Bots |
| **Schwierigkeit** | Leicht · Normal · Schwer · Profi (Zielgenauigkeit, Reaktion, Aggressivität, Sichtweite) |
| **Auto-Feuer** | Schießt automatisch, wenn beim Zielen ein Gegner erfasst wird |
| **Zielhilfe** | Aus / Normal / Stark — stupst das Fadenkreuz Richtung Gegner, ohne einzurasten |
| **Match-Tempo** | Normal · Schnell (~3,5 Min) · Blitz — skaliert alle Sturmphasen |
| **Sound** | An/Aus |
| **Layout** | Rechts- oder Linkshänder (tauscht Lauf- und Zielstick) |
| **Ansicht** | **Ego 3D** oder **Top-Down** (die 2D-Ansicht bleibt als Rückfallebene erhalten) |
| **Ausrichtung** | Automatisch, Quer ↺ oder Quer ↻ — bei aktiver Rotationssperre dreht das Spiel sein Bild selbst |
| **Blick-Tempo** | Empfindlichkeit des Wischens, fünf Stufen |
| **Startwaffe** | Pistole beim Landen oder ohne |
| **Gegner-Marker** | Namen, Lebensbalken und Entfernung über sichtbaren Gegnern |
| **Tippen = Schuss** | Kurzer Tipp im Blickbereich feuert |
| **Auto-Sprint** | Voll durchgedrückter Laufstick rennt automatisch |
| **Grafik** | Auto (max. 2× Pixeldichte) · Hoch · Sparsam — bei älteren iPhones „Sparsam" |

Siege, Kills und Rekorde werden lokal im Gerät gespeichert.

---

## Technik

```
index.html          HUD, Layout, Safe-Area-Handling für iPhone-Notch
vendor/three.min.js three.js r149 (mitgeliefert, damit nichts nachgeladen wird)
js/core.js          Mathe, Multi-Touch-Eingabe, Web-Audio-Synthese, Speicher
js/data.js          Waffen, Seltenheiten, Loot-Tabellen, Sturmphasen, Bot-Namen
js/world.js         Inselgenerierung, Spatial Hash, Kollision, Bausystem
js/ai.js            Bot-Gehirn mit zwei Detailstufen
js/render3d.js      Ego-Perspektive: Szene, Kulissen-Chunks, Figuren, Sturm
js/game.js          Match-Ablauf, Spieler, Geschosse, HUD, 2D-Rückfallansicht
sw.js               Service Worker fürs Offline-Spielen
```

### Wie aus 2D 3D wurde

Die Spielwelt ist weiterhin zweidimensional — das 3D-Bild legt sie nur auf die
Ebene: Welt-x wird 3D-x, Welt-y wird 3D-z, Höhe ist die neue 3D-y-Achse. Dadurch
laufen Kollision, KI, Sturm, Loot und Bauen unverändert weiter; getauscht wurden
Renderer, Kamera und Eingabe. Maßstab: 50 Einheiten sind ein Meter.

Die Sonne wirft echte Schatten. Eine kartenweite Shadow-Map wäre bei 6600
Einheiten unbrauchbar grob, deshalb folgt eine enge Ortho-Kamera von 1300
Einheiten dem Spieler, und nur Kulissen-Chunks im Umkreis von 1500 Einheiten
werfen überhaupt.

Die Insel misst 8600 Einheiten (172 m) im Quadrat, mit bis zu 36 benannten
Orten. Requisiten und Beute skalieren mit der Fläche mit, und die Fern-Simulation
der Bots ist darauf nachkalibriert — auf der größeren Karte ist fast jeder Bot
„fern", und die alte Einstellung tötete dort viel zu langsam.

Der Boden ist eine unterteilte Ebene mit Scheitelfarben — Wiesen, trockene
Flecken, Trampelpfade und ein Sandsaum am Inselrand. Wald gibt es in drei Arten
(Laubbaum, Fichte, abgestorbener Stamm), Häuser haben Dächer und fünf
Wandfarben, aus der Position abgeleitet, damit sie über Neustarts stabil bleiben.

Figuren bestehen aus einem Skelett aus runden Grundkörpern: kugeliger Kopf,
Mütze mit Schirm, Hals, sich verjüngender Brustkorb, Hüfte, Rucksack, acht
zylindrische Gliedmaßensegmente mit Schrittzyklus und Kugelgelenken an Schulter,
Ellbogen, Hüfte und Knie, dazu Hände und Stiefel. Jedes
Körperteil ist ein InstancedMesh, also je ein Zeichenaufruf für alle Figuren
zusammen. Bewaffnete greifen mit beiden Armen nach vorn an die Waffe,
Unbewaffnete lassen die Arme gegenläufig zu den Beinen pendeln.

Waffen gibt es als Modelle aus Verschluss, Lauf, Magazin, Schaft, Griff und —
wo es hingehört — Zielfernrohr, deren Maße je Typ variieren — langer dünner Lauf beim Scharfschützengewehr, kurz und dick
bei der Schrotflinte. Dieselben Meshes tragen die Waffe in der Hand und die am
Boden liegende, damit ein Gewehr überall gleich aussieht. Die Waffe am unteren
Bildrand skaliert nach denselben Maßen und färbt ihren Verschluss in der
Seltenheitsfarbe.

In der Ego-Sicht zeigen Marker über sichtbaren Gegnern Namen, Lebensbalken und
Entfernung — ohne die findet man auf einer 6600 Einheiten großen Insel schlicht
niemanden. Die Zielhilfe korrigiert Drehung *und* Neigung, ein Treffer blitzt am
Fadenkreuz auf. Gemessen: schief gezielt und ohne Zielhilfe gehen 14 Schuss fast
alle daneben (37 Schaden statt 111), mit Zielhilfe treffen sie (222).

Geschosse werden über die ganze Flugstrecke eines Bildes exakt gegen die
Geometrie geschnitten (Strecke gegen Rechteck bzw. Kreis), nicht in Teilschritten
abgetastet. Vorher waren die Schritte bis zu 26 Einheiten groß, Hauswände aber
nur 20 dick — je nachdem, wo man stand, passte die Wand genau zwischen zwei
Stützpunkte und der Schuss ging hindurch. Dächer blocken ebenfalls, sonst könnte
man über die Wand hinweg ins Haus schießen.

Geschosse haben seitdem eine echte Höhe. Nach oben zielen geht über den Gegner
hinweg, über eine Hauswand hinweg schießen funktioniert, und Baumkronen hängen
über Kopfhöhe — am Stamm bleibt eine Kugel hängen, an der Krone nicht.

Die Kulisse ist in Chunks von 1100 Einheiten aufgeteilt, jeder mit eigenen
InstancedMeshes. three.js prüft die Sichtbarkeit von `InstancedMesh` über die
Bounding-Sphere der *Geometrie* — die teilen sich aber alle Chunks, weshalb das
eingebaute Frustum-Culling hier nichts bringt. Deshalb cullt das Spiel selbst
über Entfernung und Blickkegel: das drückt die Zeichenaufrufe von über 220 auf
rund 60–130.

Schattenwurf per Shadow-Map wäre bei 100 Figuren plus Wald zu teuer fürs Handy;
stattdessen liegt unter jedem Objekt ein weicher Fleck. Kostet fast nichts und
erdet die Szene genauso.

Damit 100 Bots auf einem Handy flüssig laufen, arbeitet die KI mit **zwei
Detailstufen**: Bots in der Nähe werden voll simuliert (echte Geschosse,
Sichtlinien-Prüfung, Deckung), weit entfernte Bots laufen mit 4 Hz und tragen ihre
Duelle abstrakt aus. Kills, Loot und der Überlebenden-Zähler verhalten sich in beiden
Stufen gleich — man merkt den Unterschied nur am Stromverbrauch.

Gemessen (Chromium, iPhone-13-Viewport, 2× Pixeldichte): Spiellogik **1,3 ms pro
Frame** in der Ego-Ansicht (0,7 ms im Top-Down), 111 Zeichenaufrufe, 48 000
Dreiecke bei 100 Bots. Die Bildrate selbst ließ sich hier nicht sinnvoll messen —
der Testrechner hat keine GPU und rasterisiert in Software.

Kollisionen, Sichtlinien und Loot-Abfragen laufen über ein Spatial-Hash-Grid,
Geschosse und Partikel über feste Pools ohne Neuallokation, und schnelle Projektile
werden in Teilschritten bewegt, damit nichts durch Wände tunnelt.

---

## Download / Einzeldatei

`dist/schotter-royale.html` ist das komplette Spiel in **einer einzigen Datei**
(771 KB — Code, three.js und Icons inline, keine externen Abhängigkeiten). Am
Rechner einfach doppelklicken — läuft direkt im Browser, offline.

Neu bauen nach Aenderungen am Quelltext:

```bash
node build.js
```

Hinweis: iOS oeffnet lokale HTML-Dateien aus der Dateien-App nur eingeschraenkt
(Quick-Look fuehrt kein JavaScript aus). Fuers iPhone ist der Weg ueber GitHub
Pages und "Zum Home-Bildschirm" der zuverlaessige — nur so gibt es auch Vollbild
ohne Safari-Leiste.
