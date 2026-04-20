# RegistryView

A self-hosted Docker Registry browser. Browse, inspect, and delete images and tags across multiple private registries from a single dark-themed UI.

> **Note:** RegistryView is a companion UI for the [official Docker Registry image](https://hub.docker.com/_/registry) (`registry:2`). It does not include a registry — you need to be running your own private registry for RegistryView to connect to.

## Features

- **Multi-registry support** — manage multiple private registries, each with their own credentials
- **Encrypted storage** — registry passwords are encrypted at rest using AES-256-GCM
- **Bulk deletion** — select and delete multiple tags at once across multiple repos
- **Architecture badges** — see which platforms (amd64, arm64, etc.) each tag was built for
- **Session auth** — optional login screen to protect the UI
- **Outbound proxy support** — reach registries via HTTP/HTTPS proxy with NO_PROXY support

---

## Quick Start

```yaml
services:
  registryview:
    image: baz1536/registryview:latest
    container_name: registryview
    restart: unless-stopped
    ports:
      - "3544:3544"
    environment:
      PORT: 3544
      NODE_ENV: production
      SESSION_SECRET: change-me-to-a-long-random-string
      ENCRYPTION_KEY: change-me-to-a-long-random-string
    volumes:
      - /opt/docker-volumes/registryview/data:/app/data
      - /opt/docker-volumes/registryview/logs:/app/logs
```

Create the host directories before first run:

```bash
mkdir -p /opt/docker-volumes/registryview/data
mkdir -p /opt/docker-volumes/registryview/logs
```

Then open `http://localhost:3544` in your browser and add your first registry.

---

## Environment Variables

### Server

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3544` | Port the server listens on |
| `NODE_ENV` | No | `development` | Set to `production` in Docker |

### Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_ENABLED` | No | `true` | Set to `false` to disable the login screen entirely |
| `UI_USERNAME` | If auth on | `admin` | Username for the login screen |
| `UI_PASSWORD` | If auth on | — | Password for the login screen |
| `SESSION_SECRET` | Yes | — | Long random string used to sign session cookies |

### UI

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SHOW_ENVIRONMENT` | No | `true` | Set to `false` to hide the Environment section on the About page |

### Security

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENCRYPTION_KEY` | Yes | — | Long random string used to encrypt registry passwords at rest |

> **Important:** Both `SESSION_SECRET` and `ENCRYPTION_KEY` should be long, random strings. You can generate one with:
> ```bash
> openssl rand -hex 32
> ```
> If `ENCRYPTION_KEY` changes, existing registry passwords will no longer decrypt — you will need to re-enter them.

### Storage

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATA_DIR` | No | `/app/data` | Directory to store registry configuration (registries.json) |
| `LOG_DIR` | No | `/app/logs` | Directory to write daily log files |
| `LOG_LEVEL` | No | `info` | Log verbosity: `error`, `warn`, `info`, `debug` |

### Outbound Proxy

If your registries are only reachable via an HTTP/HTTPS proxy:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HTTPS_PROXY` | No | — | Proxy URL for outbound registry connections, e.g. `http://proxy.internal:3128` |
| `HTTP_PROXY` | No | — | Fallback proxy URL for HTTP registries |
| `NO_PROXY` | No | — | Comma-separated list of hosts to bypass the proxy, e.g. `localhost,.internal,192.168.1.5` |

---

## Volumes

| Path | Description |
|------|-------------|
| `/app/data` | Registry configuration with encrypted credentials — **mount this to persist your registries** |
| `/app/logs` | Daily rotating log files |

---

## Full Docker Compose Example

```yaml
services:
  registryview:
    image: baz1536/registryview:latest
    container_name: registryview
    hostname: registryview
    restart: unless-stopped
    mem_limit: 256m
    ports:
      - "3544:3544"
    environment:
      TZ: Europe/London
      PORT: 3544
      NODE_ENV: production

      # Authentication
      AUTH_ENABLED: "true"
      UI_USERNAME: admin
      UI_PASSWORD: your-secure-password

      # Security — generate with: openssl rand -hex 32
      SESSION_SECRET: your-long-random-session-secret
      ENCRYPTION_KEY: your-long-random-encryption-key

      # Storage
      DATA_DIR: /app/data
      LOG_DIR: /app/logs
      LOG_LEVEL: info

      # Outbound proxy (optional)
      # HTTPS_PROXY: http://proxy.internal:3128
      # NO_PROXY: localhost,127.0.0.1,.internal

    volumes:
      - /opt/docker-volumes/registryview/data:/app/data
      - /opt/docker-volumes/registryview/logs:/app/logs
```

---

## Notes

- **Registry URL format** — enter hostnames only, without scheme: `docker.example.com` or `localhost:5000`. RegistryView will use `https://` for remote hosts and `http://` for localhost/IP addresses automatically.
- **Deleting images** — deletion requires the registry to have `REGISTRY_STORAGE_DELETE_ENABLED=true` set. This is off by default in the official Docker Registry image.
- **Empty repositories** — Docker Registry v2 has no API to remove repository entries from the catalog. Repos with 0 tags will remain listed until removed from the registry's storage backend directly.

---

## License

MIT
