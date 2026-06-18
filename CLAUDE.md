# RegistryView

Web UI for browsing private Docker registries — lists repositories, tags, and image details with an update checker.

## Stack

- **Runtime:** Node.js 26, CommonJS
- **Web:** Express 5, Helmet, express-session
- **Database:** File-based (registries.json with AES-256-GCM encrypted passwords)
- **Auth:** Session-based, optional password gate (`UI_PASSWORD`)
- **Logging:** Winston with daily file rotation
- **Dev:** nodemon, ESLint + Stylelint + HTMLHint

## Project layout

```
src/
  server.js               — entry point
  middleware/auth.js      — requireAuth
  routes/
    auth.js               — login/logout
    registries.js         — registry CRUD
    docker.js             — registry API proxy (repos, tags, manifests)
    index.js              — about page
  services/
    registryStore.js      — file-based registry config, encrypted passwords
    dockerClient.js       — Docker Registry HTTP API v2 client
    updateChecker.js      — polls for newer image versions
  utils/
    logger.js             — Winston logger
public/                   — client-side HTML/JS/CSS
```

## Commands

```bash
npm run dev      # nodemon --env-file .env src/server.js
npm start        # node --env-file .env src/server.js
npm run lint     # eslint + stylelint + htmlhint
npm run docker:push
```

## Environment

`PORT` (3544), `NODE_ENV`, `NGINX_URL`, `AUTH_ENABLED`, `UI_USERNAME`, `UI_PASSWORD`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `DATA_DIR`, `LOG_DIR`, `LOG_LEVEL`, `HTTPS_PROXY`/`NO_PROXY`.

## Key conventions

- Registry passwords are encrypted with AES-256-GCM before being written to `registries.json` — never stored in plaintext
- `/health` is always public
- `AUTH_ENABLED=false` skips the session auth gate entirely (for trusted networks)
- Docker Registry API v2 calls are proxied through the server — the client never talks to registries directly
