# Web PubSub stand-in (local development only)

Microsoft has no Web PubSub emulator, so this small server plays its part locally. It speaks the same service API the
relay calls through the Web PubSub SDK, the same `/negotiate` response and the same browser protocol
(`json.webpubsub.azure.v1`), and serves the `CONTRACTS.md` §7.3 snapshot from the relay's Cosmos container. On Azure
the relay and the browser use real Web PubSub instead; only the endpoint changes. Spec:
[`infra/specs/local-development.md`](../../specs/local-development.md).

## Run

With the emulators up (`ACCEPT_EULA=Y docker compose up -d` in `infra/local/`) and the settings from
[`../env.example`](../env.example) in your environment:

```bash
uv sync
uv run standin                 # http://127.0.0.1:8787
uv run standin --no-snapshot   # without Cosmos (snapshot returns 503)
```

## Check

```bash
uv run --group check python check_standin.py   # uses Microsoft's Web PubSub SDK against the stand-in
uv run python ../check_cosmos.py               # the Cosmos emulator supports what the relay store needs
```

| Endpoint | Like |
|---|---|
| `POST /api/hubs/{hub}/groups/{group}/:send` | Web PubSub service API, send to group |
| `POST /api/hubs/{hub}/:send` | Send to everyone on the hub |
| `GET /negotiate?groups=match-<id>` | `{ baseUrl, url, token }` |
| `ws://127.0.0.1:8787/client/hubs/live` | Browser connection; the subprotocol is required |
| `GET /api/match/{id}/snapshot` | `CONTRACTS.md` §7.3 |
| `GET /health` | Connections and message counts |

Any token is accepted, and it binds to `127.0.0.1` only. Browsers on `localhost`/`127.0.0.1` ports may call the HTTP
routes.
