# Pagina `/scarica/` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pagina statica `https://incomune.app/scarica/` con i due pulsanti store, quello del telefono in evidenza.

**Architecture:** un file `scarica/index.html` con `<style>` e `<script>` inline. Lo script espone una funzione pura `storeFor()` e mette una classe su `<html>`; l'ordine e l'evidenza dei pulsanti li decide il CSS. Un test `node --test` legge l'HTML e verifica link, copy e riconoscimento.

**Tech Stack:** HTML/CSS statico, `styles.css` del sito, Node 24 `node:test` (già usato da `scripts/pagine-eventi-core.test.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-19-pagina-scarica-design.md`

## Global Constraints
- Link App Store: `https://apps.apple.com/app/id6761307454`
- Link Google Play: `https://play.google.com/store/apps/details?id=app.incomune`
- Copy: niente em dash (`—`), "team di InComune", "entità".
- `/scarica/` mai in `.well-known/apple-app-site-association`.
- Senza JS: due pulsanti alla pari, pagina completa.
- Niente commit né push senza richiesta esplicita dell'utente (il push su `main` pubblica il sito).

## Review Focus
- iPad con iPadOS 13+ (UA da Mac, `platform` `MacIntel`, `maxTouchPoints` 5): deve dare App Store.
- Mac desktop vero (`MacIntel`, `maxTouchPoints` 0): nessuna evidenza.
- Browser interni di WhatsApp/Instagram/Facebook su Android (UA con `Android` e suffissi `FBAV`/`Instagram`): Google Play.
- Telefono stretto (320 px) e testo grande di sistema: niente scroll orizzontale, pulsanti a tutta larghezza.
- JS disattivato o in errore: nessuna classe su `<html>`, pulsanti alla pari e cliccabili.

---

### Task 1: pagina `scarica/index.html` con test

**Files:**
- Create: `scarica/index.html`
- Create: `scripts/scarica.test.mjs`
- Modify: `.github/workflows/pages.yml` (step «Test del generatore»: aggiungere `node --test scripts/scarica.test.mjs`)

**Interfaces:**
- Produces: nello `<script>` inline, `function storeFor(ua, platform, maxTouchPoints)` che ritorna `'ios' | 'android' | null`; poi `document.documentElement.classList.add('is-' + s)` se `s` non è null. Lo script inline contiene il marcatore `/* storeFor */` sulla riga della funzione, così il test la estrae.
- Pulsanti: `<a class="store-btn" data-store="ios" ...>` e `<a class="store-btn" data-store="android" ...>`; righe di contorno `<p class="alt-hint" data-for="android">Hai un Android?</p>` e `data-for="ios"` «Hai un iPhone?», visibili solo sotto il pulsante secondario quando c'è una classe `is-*`.

- [ ] **Step 1: scrivere il test `scripts/scarica.test.mjs`**

Legge `scarica/index.html` e `.well-known/apple-app-site-association`, estrae il primo `<script>` inline, lo valuta con `new Function(src + '; return storeFor;')` passando un `document` finto (`{ documentElement: { classList: { add(){} } } }`) e `navigator` finto. Asserzioni:

```js
assert.ok(html.includes('https://apps.apple.com/app/id6761307454'));
assert.ok(html.includes('https://play.google.com/store/apps/details?id=app.incomune'));
assert.ok(!html.includes('—'));                       // niente em dash
assert.ok(!aasa.includes('/scarica'));                     // mai Universal Link
assert.match(html, /<link rel="canonical" href="https:\/\/incomune\.app\/scarica\/">/);
assert.equal(storeFor('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5), 'ios');
assert.equal(storeFor('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5), 'ios');   // iPad
assert.equal(storeFor('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0), null);    // Mac
assert.equal(storeFor('Mozilla/5.0 (Linux; Android 14; M2101K6G) [FBAN/FB4A;FBAV/480.0]', 'Linux armv8l', 5), 'android');
assert.equal(storeFor('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 0), null);
```

- [ ] **Step 2: lanciare il test e vederlo fallire**

Run: `node --test scripts/scarica.test.mjs`
Expected: FAIL (`ENOENT` su `scarica/index.html`)

- [ ] **Step 3: scrivere `scarica/index.html`**

- `<head>` sul modello di `inizia/index.html` righe 1-31 (favicon, theme-color `#F17100`, preload font, `styles.css`), ma **senza** `noindex`; `<title>Scarica InComune</title>`; description «Scarica InComune, l'app della comunità di Novoli (LE): eventi, attività, associazioni e novità del paese.»; `og:url` e `canonical` `https://incomune.app/scarica/`; `og:image` `https://incomune.app/assets/og-image.png`.
- Corpo: una sola schermata `min-height: 100svh`, fondo `var(--terracotta)` con grana e "iN" in filigrana copiati dal `.cover` di `inizia/index.html` (righe 57-73). Logo bianco, `<h1>` serif «Scarica InComune», sotto «L'app della comunità di Novoli». Colonna `max-width: 480px`.
- Pulsanti: markup SVG e label identici a `404.html` righe 43-50, più `data-store`. Contenitore flex in colonna sul telefono (a tutta larghezza), in riga da `min-width: 640px`. Con `html.is-ios` il pulsante `ios` ha `order: 0`, scala più grande (`min-height: 64px`, `store-name` 19px) e l'altro ha `order: 2`, con la sua `alt-hint` a `order: 1`; simmetrico per `is-android`. Senza classe: `alt-hint` nascoste.
- Piede: «È gratis.» e `incomune.app · Privacy · Termini` come in `404.html` riga 54.
- Script inline in fondo al body: `storeFor` (`/Android/i` → `'android'`; `/iPhone|iPad|iPod/` oppure `platform === 'MacIntel' && maxTouchPoints > 1` → `'ios'`; altrimenti `null`), chiamata con `navigator.userAgent, navigator.platform, navigator.maxTouchPoints || 0` dentro `try/catch`.

- [ ] **Step 4: lanciare il test e vederlo passare**

Run: `node --test scripts/scarica.test.mjs` poi `node --test scripts/pagine-eventi-core.test.mjs`
Expected: entrambi `# fail 0`, exit code 0.

- [ ] **Step 5: aggiungere il test al workflow**

Nello step «Test del generatore» di `.github/workflows/pages.yml` la riga `run:` diventa un blocco con i due `node --test`.

- [ ] **Step 6: controllo visivo in locale**

Run (PowerShell, dalla root del sito): `npx --yes http-server -p 8765 -c-1 .` in background, poi l'utente apre `http://localhost:8765/scarica/` (mai aprire il browser di mia iniziativa). Verifiche: a 390 px e 320 px niente scroll orizzontale; con l'emulazione iPhone App Store sopra e in evidenza, con Android Google Play; da desktop pari.

- [ ] **Step 7: commit (solo su richiesta dell'utente)**

```bash
git add scarica/index.html scripts/scarica.test.mjs .github/workflows/pages.yml docs/superpowers/specs/2026-11-19-pagina-scarica-design.md docs/superpowers/plans/2026-11-19-pagina-scarica.md
git commit -m "Pagina /scarica/: un indirizzo per i QR con i due store, quello del telefono in evidenza"
```

---

## HANDOFF 19 nov 2026, 10:16

**Fatto**
- Task 1 completo con TDD: `scarica/index.html`, `scripts/scarica.test.mjs` (7 test), test aggiunto allo step dei test di `pages.yml`.
- Review finale Opus: 0 Critical, 1 Important (I1: «Hai un...?» letto da TalkBack accanto al pulsante sbagliato su Android), corretto con test RED→GREEN spostando le righe nel DOM subito prima del loro pulsante.
- Controllo visivo con Edge headless in iframe da 390/320/700 px, UA iPhone e Android: ordine ed evidenza corretti, niente scroll orizzontale; corretta una specificità CSS (riga «Hai un Android?» fra i pulsanti affiancati su iPad).
- Pubblicato su richiesta dell'utente: commit `ec4e666`, merge `e3a9002`, push; run Pages 44492511830 verde; `https://incomune.app/scarica/` risponde 200 col contenuto nuovo (controllato col download della pagina online).
- **Fatto ma NON verificato su device:** comportamento su iPhone e Android veri, in particolare il tocco dei pulsanti dentro i browser interni di WhatsApp, Instagram e Facebook.

**Stato del branch**
- `incomune-site` su `main`, pulito, allineato a `origin/main`. Ultimo commit di codice di questa pagina: `ec4e666` (merge `e3a9002`); sopra c'è il lavoro `/contatti/` di un'altra sessione.
- Worktree `wt-site-scarica` e branch `feat/2026-11-19-scarica` rimossi.

**Gate**
- Sito: `node --test scripts/*.test.mjs` → 52 test, 52 pass, 0 fail, exit 0.
- App (non toccata da questo lavoro): `npm test` exit 0; lint 0 errori, 51 warning, baseline 56 rispettata; unit 4203/4203.

**Gate aperti**
- QR da stampare con la barra finale: `https://incomune.app/scarica/` (senza barra GitHub Pages fa un 301 in più).
- Minori della review rimandati: testo di sistema >=175% a 320 px taglia «Google Play» e, al 200%, «InComune» nel titolo; aria-label «Scarica InComune su App Store» diverso dal testo visibile (anche su 404 e /inizia/); cerchio hover 240 px corto sui pulsanti larghi (desktop 480-639 px); «InComune» bianco su arancio circa 2.96:1 (come /inizia/); tablet Android in modalità desktop non riconosciuti; test AASA per sottostringa; nessun test dello stato senza JS; workflow con due `node --test` separati.
- Telefoni Android senza Google Play (Huawei HMS): evidenziato Google Play, nessun rimedio semplice dal web.

**Prossimo task**
- Smoke su telefono vero: aprire il link da WhatsApp e Instagram su iPhone e su Android e toccare il pulsante in evidenza e l'altro.

**Decisioni aperte**
- Se e quando sistemare i minori (il più rilevante per persone anziane: testo di sistema grande).

**Prompt di ripresa**
```
Riprendo la pagina incomune.app/scarica/ dal blocco «HANDOFF 19 nov 2026, 10:16» del ledger incomune-site/docs/superpowers/plans/2026-11-19-pagina-scarica.md e dal topic di memoria project_pagina_scarica_qr. La pagina è online (merge e3a9002 su main di incomune-site, pushato). Vincoli: niente commit/push sul sito senza mia richiesta, il push su main pubblica. Smoke su telefono vero da fare: aprire il link da WhatsApp e Instagram su iPhone e Android e toccare i due pulsanti. Primo passo: dammi la lista dello smoke nel formato azione/atteso/vietato, con l'indirizzo anche come QR sul PC. Se lo smoke va bene, chiedimi con AskUserQuestion se sistemare i minori rimandati partendo dal testo di sistema grande; se nei browser interni il tocco apre una pagina web dello store invece dello store, analizza la causa prima di proporre correzioni.
```
