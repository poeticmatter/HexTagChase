# Hex Tag

[github.com/poeticmatter/HexTagChase](https://github.com/poeticmatter/HexTagChase) · Play: [poeticmatter.github.io/HexTagChase](https://poeticmatter.github.io/HexTagChase/)

A two-player game of tag on a hex grid. Each turn, the chaser and the evader secretly commit a move and a prediction of where their opponent will end up. Both plans resolve at the same time. Correct predictions earn extra movement. The chaser wins by getting next to the evader from equal or higher ground. The evader wins by surviving.

Part of the game lab: [poeticmatter.github.io/game-lab](https://poeticmatter.github.io/game-lab/).

## Play modes

- **Live (P2P)**: both players are online at the same time, connected directly through PeerJS. Anyone else who opens the link watches as a spectator.
- **Async (Supabase)**: turns are saved online, so players can move whenever they like.

## Running locally

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000`. Async play needs Supabase credentials: copy `.env.example` to `.env.local` and fill in the values.

## Supabase

This game stores its data in its own table, `hextag_games`, on the Supabase project shared by the game lab. The migrations are in `supabase/migrations/`.
