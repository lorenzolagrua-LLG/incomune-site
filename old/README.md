# old/: versioni storiche dei documenti legali

Archivio delle versioni precedenti di Privacy Policy e Termini, mantenute per audit/storico.

Le versioni live sono in `/privacy-policy/index.html` e `/termini/index.html`. GitHub Pages serve anche questa cartella: le pagine live collegano le versioni precedenti ancora rilevanti (righe «In vigore dal ... vale la versione del ...»).

Suffisso file = data dell'ultimo aggiornamento del contenuto (badge interno al documento), non data di archiviazione. Fanno eccezione le copie `*-20261101.html`: il suffisso è la `version` (`2026-11-01`, data di entrata in vigore) con cui il testo era stato registrato in `legal_document_versions`.

**Copie `*-20261101.html`: testo pubblicato il 17 ottobre 2026 e sostituito prima dell'entrata in vigore.** Il 17 ottobre 2026 sono stati pubblicati (sito `8f21ee6`) Termini e Privacy da far entrare in vigore il 1° novembre 2026, e sul prod sono state registrate le righe `2026-11-01` con l'avviso in app. Il 21 ottobre 2026, prima dell'entrata in vigore, quel testo è stato sostituito da un testo unico, sempre in vigore dal 1° novembre 2026, che aggiunge le pagine di anteprima degli eventi condivisi; dopo la pubblicazione le righe `2026-11-01` del prod si aggiornano (`site_commit`, `sha256`, sintesi e motivo) al testo unico, senza righe nuove. Le copie restano servite e collegate dall'intestazione delle pagine live, così chi ha visto l'avviso del 17 ottobre trova il testo annunciato. Sono byte per byte i blob di `8f21ee6:termini/index.html` e `8f21ee6:privacy-policy/index.html`, e i loro `sha256` sono quelli registrati sul prod il 17 ottobre 2026 (dopo l'update le righe hanno gli `sha256` del testo unico):

| Copia | Blob | sha256 registrato fino all'update |
|---|---|---|
| `termini-20261101.html` | `8f21ee6:termini/index.html` | `419185e34e26bee5ad42bfb488a6f6bc2bc858d62ea9e7d5f3ef4625a7d1f793` |
| `privacy-policy-20261101.html` | `8f21ee6:privacy-policy/index.html` | `11642ed6e28bf14e47df2d61357488b9741032ba2aa559fd7988f98ca630d38e` |

Verifica sul blob o sulla pagina servita, mai sul file di un checkout Windows (`core.autocrlf` può cambiarne i fine riga):

```bash
git show origin/main:old/termini-20261101.html | sha256sum   # = 419185e3...
git show 8f21ee6:termini/index.html | sha256sum              # stesso valore
curl -s https://incomune.app/old/termini-20261101.html | sha256sum
```

Le copie byte per byte sono marcate `-text` in `.gitattributes`, così git non ne tocca mai i fine riga.

Le copie più vecchie non sono byte per byte: `termini-20260928.html` e `privacy-policy-20260930.html` differiscono dal blob registrato sul prod per il link Instagram del footer (il loro `sha256` si verifica solo con `git show 2684c17:termini/index.html` e `git show 7b373d0:privacy-policy/index.html`); `privacy-policy-20260928.html` coincide con `2684c17:privacy-policy/index.html`.

| File | Origine | Data contenuto |
|---|---|---|
| `privacy-policy-20260429.md` | repo app `InComune` | 29 apr 2026 |
| `privacy-policy-20260429.html` | repo app `InComune` | 29 apr 2026 |
| `terms-and-conditions-20260429.md` | repo app `InComune` | 29 apr 2026 |
| `termini-20260523.html` | root sito (duplicato di `termini/index.html`, mai linkato) | 23 mag 2026 |
| `privacy-policy-20260617.html` | `privacy-policy/index.html` (archiviata prima dell'aggiunta della sezione prenotazioni) | 17 giu 2026 |
| `privacy-policy-20260814.html` | `privacy-policy/index.html` (archiviata prima dell'aggiunta della sezione iscrizioni agli eventi) | 14 ago 2026 |
| `termini-20260917.html` | `termini/index.html` (archiviata prima dell'aggiunta delle clausole sulle iscrizioni agli eventi) | 17 set 2026 |
| `privacy-policy-20260919.html` | `privacy-policy/index.html` (archiviata prima dell'aggiunta dei biglietti in Google Wallet) | 19 set 2026 |
| `termini-20260919.html` | `termini/index.html` (archiviata prima dell'aggiunta della clausola sui biglietti in Google Wallet) | 19 set 2026 |
| `privacy-policy-20260928.html` | `privacy-policy/index.html` al commit `2684c17` (recuperata da git l'11 ott 2026: sostituita dalla versione del 30 set senza snapshot) | 28 set 2026 |
| `privacy-policy-20260930.html` | `privacy-policy/index.html` (archiviata prima dell'aggiunta degli eventi con posti a sedere) | 30 set 2026 |
| `termini-20260928.html` | `termini/index.html` (archiviata prima dell'aggiunta della clausola sugli eventi con posti a sedere) | 28 set 2026 |
| `termini-20261101.html` | `termini/index.html` al commit `8f21ee6`, byte per byte: testo pubblicato il 17 ottobre 2026 per entrare in vigore il 1° novembre, sostituito il 21 ottobre prima dell'entrata in vigore dal testo unico con le anteprime (vedi sopra) | 17 ott 2026, mai entrato in vigore |
| `privacy-policy-20261101.html` | `privacy-policy/index.html` al commit `8f21ee6`, byte per byte: testo pubblicato il 17 ottobre 2026 per entrare in vigore il 1° novembre, sostituito il 21 ottobre prima dell'entrata in vigore dal testo unico con le anteprime (vedi sopra) | 17 ott 2026, mai entrato in vigore |

Quando aggiorni il documento canonico (`privacy-policy/index.html` o `termini/index.html`) con modifiche sostanziali, considera di snapshottare la versione attuale qui prima di sovrascriverla.
