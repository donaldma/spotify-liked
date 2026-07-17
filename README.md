# Spotify Liked

Generate playlists (release period / today / week / month / year / custom range) from your Spotify liked songs.

## Setup

```
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

- `VITE_CLIENT_ID` — your app's client ID from the [Spotify developer dashboard](https://developer.spotify.com/dashboard)
- `VITE_REDIRECT_URI` — must exactly match a redirect URI registered in the dashboard. For local dev use `http://127.0.0.1:8080` (Spotify no longer allows `localhost`; loopback must be the literal IP)

Auth uses the Authorization Code + PKCE flow with refresh tokens, so no client secret is needed.

## Development

```
npm run serve
```

Open http://127.0.0.1:8080 (the host matters — it must match the redirect URI).

## Production

```
npm run build
```

Outputs to `dist/`. When deploying (e.g. Netlify), set `VITE_CLIENT_ID` and `VITE_REDIRECT_URI` (the deployed URL) as build-time env vars, and register that URL as a redirect URI in the Spotify dashboard.

## Tests & lint

```
npm test
npm run lint
```
