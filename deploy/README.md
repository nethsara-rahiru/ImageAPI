# Run ImageAPI on the VPS

The server is entirely Node.js. Python, pip, venv, Uvicorn, and PM2 are not required. Use Node.js 24 LTS or later; check `node --version`. Get Node from https://nodejs.org/en/download if it is not installed.

## Update the existing checkout

Stop the old Python process first in the terminal where it runs (Ctrl+C). If an old systemd service starts it, stop that specific service before migrating. Do not run the Python and Node versions against the same live database.

Back up your current data directory and encryption secret before updating. Node also makes a consistent SQLite backup before its first legacy migration, under `data/backups/`. Keep the database and `data/encryption.key` together when using the local key file. If `IMAGEAPI_ENCRYPTION_KEY` is set externally, preserve that same value separately.

```bash
cd ~/imageapi-test
git fetch origin
git switch feat/image-api-starter
git pull --ff-only origin feat/image-api-starter
npm ci
```

If you already have a `.env`, retain your data directory and encryption key settings, and update its port/origin settings. Otherwise copy `.env.example` to `.env`. The settings for the SSH tunnel are:

```dotenv
HOST=127.0.0.1
PORT=8080
IMAGEAPI_PUBLIC_ORIGIN=http://127.0.0.1:8080
IMAGEAPI_SECURE_COOKIES=false
```

Start the system:

```bash
npm start
```

On your own computer, in a separate terminal:

```bash
ssh -N -L 8080:127.0.0.1:8080 dev@162.35.181.135
```

Open **http://127.0.0.1:8080**. Keep both terminals open for this interactive run. SSH carries the connection securely; the app need not expose port 8080 publicly. Existing accounts, ImageAPI keys, provider settings, and usage remain available if the original data directory and encryption key are retained.

Check the running service from another VPS terminal:

```bash
curl http://127.0.0.1:8080/health
```

The response identifies `runtime: "node"` and `version: "1.0.0"`. If the port is busy, inspect it with `sudo ss -ltnp 'sport = :8080'`. Stop only the service you intend to replace; do not kill unrelated processes. To choose another port, change both `PORT` and `IMAGEAPI_PUBLIC_ORIGIN`, and forward that port in SSH.

## Optional persistent systemd service

Review `imageapi.service` first. It assumes user/group `dev`, checkout `/home/dev/imageapi-test`, and Node at `/usr/bin/node`. Check the real Node executable with `command -v node`; if you use nvm, replace `ExecStart` with that absolute Node path. The service does not load interactive shell profiles. Its read-write directory must match `IMAGEAPI_DATA_DIR`.

Create the private data directory and install the reviewed unit:

```bash
cd ~/imageapi-test
install -d -m 700 data
sudo install -m 644 deploy/imageapi.service /etc/systemd/system/imageapi.service
sudo systemctl daemon-reload
sudo systemctl enable --now imageapi
sudo systemctl status imageapi --no-pager
```

Only start systemd after stopping the foreground `npm start` process. Inspect logs with `sudo journalctl -u imageapi -n 50 --no-pager`. After later code updates and `npm ci`, use `sudo systemctl restart imageapi`.

## Public access with HTTPS

Use a domain pointing to the VPS and an HTTPS reverse proxy. `Caddyfile.example` shows a single virtual host; merge it with existing configuration rather than replacing other sites. Keep the application listening on loopback and allow ports 80/443 at the host/provider firewall as appropriate. Set:

```dotenv
IMAGEAPI_PUBLIC_ORIGIN=https://your-domain.example
IMAGEAPI_SECURE_COOKIES=true
```

Restart ImageAPI after changing these settings. Do not enter real passwords or provider keys through public unencrypted HTTP. No domain, firewall, or TLS configuration is changed by `npm start` or by the supplied templates.

Back up both SQLite and the encryption secret before upgrades. The automatic migration backup is a safety copy, not a full backup/retention service. Once passwords or provider keys have been upgraded to Node's formats, an old Python server cannot read those upgraded secrets; rolling back requires restoring the complete pre-migration database and key together.
