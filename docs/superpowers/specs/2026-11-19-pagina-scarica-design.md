# Pagina `/scarica/`: un indirizzo per scaricare l'app

Data: 19 nov 2026 · Stato: in attesa di approvazione

## Perché
Serve un indirizzo unico, corto e stabile da stampare nei QR code e da girare come
link (WhatsApp, volantini, inviti del 20 nov), che porti chi lo apre a scaricare
InComune dallo store giusto. Oggi i pulsanti store esistono solo dentro altre pagine
(404, `/inizia/`, `reset-password`, `email-confirmed`): nessuna è adatta come
destinazione di un QR.

## Obiettivi
- `https://incomune.app/scarica/` mostra sempre **i due pulsanti** App Store e Google Play.
- Il pulsante dello store del telefono che apre la pagina sta **sopra e in evidenza**
  (iPhone e iPad → App Store; Android → Google Play). Da computer, o se il telefono non
  si riconosce, i due pulsanti sono alla pari.
- Stile del sito InComune: manifesto arancio come la home e `/inizia/`, logo "iN",
  DM Serif Display + Nunito, `store-btn` di `styles.css`.

## Non obiettivi
- Nessun salto automatico allo store (scelta dell'utente: chi scansiona deve vedere InComune).
- Nessuna analytics sul sito, nessun parametro di campagna sui link store (si può
  aggiungere dopo: `ct=` su App Store, `referrer=` su Google Play).
- Nessuna modifica alla home teaser, alla 404 o alle altre pagine.

## Anti-obiettivi
- La pagina non deve aprirsi dentro l'app: `/scarica/` **non** va aggiunto a
  `.well-known/apple-app-site-association` né agli App Links.
- Mai una pagina vuota o rotta senza JavaScript: senza JS si vedono i due pulsanti alla pari.

## Vincoli
- Repo `incomune-site`, GitHub Pages, deploy automatico a ogni push su `main`
  (push solo su richiesta esplicita).
- Link store già in uso: `https://apps.apple.com/app/id6761307454` e
  `https://play.google.com/store/apps/details?id=app.incomune`.
- Copy: niente em dash, "team di InComune", "entità".

## Approcci considerati
1. **Pagina statica HTML + 8 righe di JS che riordinano i pulsanti** (scelto). Coerente
   col resto del sito, funziona senza JS, zero dipendenze.
2. Salto automatico allo store con pagina di riserva: scartato dall'utente.
3. Servizio esterno di smart link (es. accorciatori con redirect per sistema): esce dal
   dominio, aggiunge un terzo che traccia, e il QR dipenderebbe da un servizio altrui.

## Design
- File: `scarica/index.html`, un solo file con `<style>` inline come `/inizia/`.
- Struttura (una schermata sul telefono):
  - fondo arancio con grana e "iN" in filigrana (stesso trattamento di `/inizia/`);
  - logo, titolo serif «Scarica InComune», riga «L'app della comunità di Novoli»;
  - i due `store-btn` impilati a tutta larghezza sul telefono, affiancati su PC;
    quello in evidenza più alto, l'altro con la riga «Hai un Android?» / «Hai un iPhone?»;
  - piede: «È gratis» + `incomune.app · Privacy · Termini`.
- Riconoscimento: `Android` nello user agent → Google Play; `iPhone|iPad|iPod`, oppure
  `MacIntel` con `maxTouchPoints > 1` (iPad recenti) → App Store. Il JS aggiunge una
  classe a `<html>`; l'ordine si fa in CSS (`order`), niente spostamenti di DOM.
- Meta: `og:` con l'immagine `og-image.png` già presente, `canonical`, indicizzabile
  (pagina pubblica).

## Lasciato a chi costruisce
- Testi esatti della riga sotto il titolo e del piede, dentro il tono della home.
- Misure fini (spaziature, dimensione del pulsante in evidenza).
