# 🎮 Schotter Royale

Ein **komplett offline** spielbares Solo-Battle-Royale fürs iPhone — im Stil von Fortnite,
aber als Top-Down-Shooter im Browser. Kein Server, kein Login, kein Internet nötig.
Reines HTML/JS/Canvas, alles läuft lokal auf dem Handy.

![Genre](https://img.shields.io/badge/Modus-Solo%20Battle%20Royale-8a4fd8)
![Offline](https://img.shields.io/badge/Offline-100%25-3ddc84)
![Ziel](https://img.shields.io/badge/Plattform-iPhone%20(PWA)-4aa3ff)

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
| **Links ziehen** (irgendwo linke Bildschirmhälfte) | Laufen — der Stick erscheint unter dem Daumen |
| **Rechts ziehen** | Zielen; mit Auto-Feuer wird automatisch geschossen, sobald jemand im Visier ist |
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
| **Zielhilfe** | Aus / Normal / Stark — zieht das Fadenkreuz auf Gegner im Sichtkegel |
| **Match-Tempo** | Normal · Schnell (~3,5 Min) · Blitz — skaliert alle Sturmphasen |
| **Sound** | An/Aus |
| **Layout** | Rechts- oder Linkshänder (tauscht Lauf- und Zielstick) |
| **Grafik** | Auto (max. 2× Pixeldichte) · Hoch · Sparsam — bei älteren iPhones „Sparsam" |

Siege, Kills und Rekorde werden lokal im Gerät gespeichert.

---

## Technik

```
index.html      HUD, Layout, Safe-Area-Handling für iPhone-Notch
js/core.js      Mathe, Multi-Touch-Eingabe, Web-Audio-Synthese, Speicher
js/data.js      Waffen, Seltenheiten, Loot-Tabellen, Sturmphasen, Bot-Namen
js/world.js     Inselgenerierung, Spatial Hash, Kollision, Bausystem
js/ai.js        Bot-Gehirn mit zwei Detailstufen
js/game.js      Match-Ablauf, Spieler, Geschosse, Rendering, HUD
sw.js           Service Worker fürs Offline-Spielen
```

Damit 100 Bots auf einem Handy flüssig laufen, arbeitet die KI mit **zwei
Detailstufen**: Bots in der Nähe werden voll simuliert (echte Geschosse,
Sichtlinien-Prüfung, Deckung), weit entfernte Bots laufen mit 4 Hz und tragen ihre
Duelle abstrakt aus. Kills, Loot und der Überlebenden-Zähler verhalten sich in beiden
Stufen gleich — man merkt den Unterschied nur am Stromverbrauch.

Gemessen (Chromium, iPhone-13-Viewport, 2× Pixeldichte): **60 fps mit 100 Bots**,
Spiellogik 0,6 ms pro Frame.

Kollisionen, Sichtlinien und Loot-Abfragen laufen über ein Spatial-Hash-Grid,
Geschosse und Partikel über feste Pools ohne Neuallokation, und schnelle Projektile
werden in Teilschritten bewegt, damit nichts durch Wände tunnelt.
