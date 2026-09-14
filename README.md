# Povo Mappa

Mappe interattive del Polo Ferrari (Povo, UniTrento) con l'occupazione delle aule
in tempo reale, presa da EasyAcademy.

- Tre piani: Povo 1 piano terra, Povo 1 primo piano, Povo 2 piano 0
- Ogni aula è colorata per stato (occupata / libera ma occupata entro 30 min / libera / indisponibile)
- Hover su un'aula → tooltip con lezione in corso, docenti, prossimo evento, capienza
- Click → programma completo della giornata nel pannello laterale
- Selettore giorno + slider ora per vedere l'occupazione in un altro momento; "Adesso" torna al live
- Ricerca aula (cambia piano automaticamente)
- URL condivisibili: `/?floor=povo2-0&date=2026-09-14&time=10:15`

## Avvio

Richiede Node ≥ 18 (nessuna dipendenza npm).

```sh
npm start          # oppure: node server.js
# → http://localhost:3000
```

`PORT=8080 npm start` per cambiare porta.

## Come funziona il collegamento a EasyAcademy

La pagina pubblica "Occupazione delle aule" di UniTrento
(`easyacademy.unitn.it/AgendaStudentiUnitn/index.php?view=rooms`) carica i dati con una
POST non autenticata a `rooms_call.php` (`form-type=rooms&sede=E0503&date=DD-MM-YYYY`).
La sede `E0503` = "Dipartimenti - POVO". È tutto gratuito e pubblico: non ci sono API key
né login.

Quell'endpoint non espone header CORS, quindi il browser non può chiamarlo direttamente:
`server.js` fa da proxy (`GET /api/rooms?date=YYYY-MM-DD`), riduce la risposta ai soli
campi utili e la tiene in cache 10 minuti per giorno, in modo da non martellare il server
dell'università. Se EasyAcademy non risponde, viene servita l'ultima copia in cache.

Il frontend ricarica i dati ogni 5 minuti in modalità live.

## Struttura

```
server.js        proxy + static server (Node, zero dipendenze)
public/
  index.html
  style.css
  maps.js        geometria dei piani: rettangoli aule + codice EasyAcademy
  app.js         logica: fetch, stato aule, rendering SVG, tooltip, controlli
```

Per correggere o aggiungere aule basta modificare `public/maps.js`: ogni stanza è
`{ code, label, x, y, w, h }` dove `code` è il codice EasyAcademy (es. `E0503/A105`).
I codici disponibili per Povo si vedono in `/api/rooms` → `rooms`.

## Note

- Le mappe sono schematiche e non ufficiali (posizioni ricavate da mappe studentesche:
  Povo 1 da @povo.rotta, Povo 2 dalla mappa del piano 0).
- Il LAB al primo piano di Povo 1 non è gestito su EasyAcademy, quindi non ha stato.
- Deploy: qualsiasi host Node (Render, Railway, Fly, un Raspberry…) va bene; basta `node server.js`.
