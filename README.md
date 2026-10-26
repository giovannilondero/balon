# Balón

Calcio a dischi multiplayer nel browser, con vista inclinata in 3D.

## Avvio

```sh
pnpm install
pnpm dev      # server di gioco su :3001 + Vite su :5173
```

Apri http://localhost:5173 (più schede = più giocatori; sulla stessa rete funziona anche con l'IP della macchina).

## Partite

- **Rete locale**: elencata e accessibile solo a chi è sulla stessa rete di chi l'ha creata
  (stesso IP pubblico visto dal server; se il server gira in LAN, tutti gli IP privati contano come stessa rete).
- **Online con codice**: non elencata, si entra con il codice di 4 lettere o col link d'invito (`?p=CODICE`).

Chi crea la partita è l'host: sceglie la durata e la avvia. A tempo scaduto in parità si va al golden goal.
Se cadi (reload, app in background, rete) hai 20 secondi per rientrare al tuo posto.

Dietro un reverse proxy imposta `TRUST_PROXY=1`, così il server legge l'IP reale da `X-Forwarded-For`.

Build unica servita dal server di gioco:

```sh
pnpm build && pnpm start   # http://localhost:3001
```

## Comandi

- **WASD / frecce**: muovi
- **Spazio / X**: calcia (tienilo premuto e il calcio parte al contatto)
- **T**: cambia squadra
- **Mobile**: stick a sinistra (appare dove appoggi il pollice), pulsante CALCIA a destra

## Struttura

- `shared/game.ts`: simulazione a passo fisso (60 tick/s), fisica dei dischi, calcio, gol
- `shared/protocol.ts`: messaggi client ↔ server
- `server/index.ts`: server Bun autoritativo via WebSocket, sessioni e riconnessione
- `server/rooms.ts`, `server/network.ts`: stanze e riconoscimento della rete del client
- `client/`: rendering Three.js, interpolazione degli snapshot, lobby, HUD, input tastiera/touch, audio sintetizzato
- `scripts/icons.ts`: genera favicon e icone PWA in `client/public/` (`pnpm icons`)
