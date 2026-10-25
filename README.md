# Balón

Calcio a dischi multiplayer nel browser, con vista inclinata in 3D.

## Avvio

```sh
pnpm install
pnpm dev      # server di gioco su :3001 + Vite su :5173
```

Apri http://localhost:5173 (più schede = più giocatori; sulla stessa rete funziona anche con l'IP della macchina).

Build unica servita dal server di gioco:

```sh
pnpm build && pnpm start   # http://localhost:3001
```

## Comandi

- **WASD / frecce**: muovi
- **Spazio / X**: calcia (tienilo premuto e il calcio parte al contatto)
- **T**: cambia squadra

## Struttura

- `shared/game.ts`: simulazione a passo fisso (60 tick/s), fisica dei dischi, calcio, gol
- `shared/protocol.ts`: messaggi client ↔ server
- `server/index.ts`: server Bun autoritativo via WebSocket
- `client/`: rendering Three.js, interpolazione degli snapshot, input, audio sintetizzato
