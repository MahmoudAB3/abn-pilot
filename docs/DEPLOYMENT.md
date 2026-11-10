# Guide de déploiement

Cible : **un serveur Linux** (2 vCPU, 4 Go de RAM suffisent pour une dizaine d'utilisateurs) avec Docker Engine et le plugin Compose, derrière un reverse proxy TLS. Pas de Kubernetes ni de file de messages externe : PostgreSQL sert aussi de file de tâches.

## 1. Architecture d'exécution

```
           HTTPS                     HTTP (127.0.0.1:3000)
Utilisateurs ──► Reverse proxy TLS ──► web (Next.js, node server.js)
GitHub ───────►  (Caddy / Nginx)          │  ▲
                                          ▼  │ file de tâches (SKIP LOCKED)
                                     PostgreSQL 16 ◄── worker (webhooks, synchro, instantanés, purge)
                                          ▲
                              migrate (exécuté une fois à chaque déploiement)
```

| Service | Image (cible) | Rôle |
|---|---|---|
| `db` | `postgres:16-alpine` | données ; volume `pgdata` |
| `migrate` | `tools` | applique les migrations puis s'arrête (verrou consultatif : sûr si lancé deux fois) |
| `web` | `web` | interface et API ; volume `uploads` pour les pièces jointes |
| `worker` | `tools` | traitement des webhooks GitHub, synchronisation toutes les 6 h, instantanés de sprint toutes les heures, purge quotidienne |

## 2. Première installation

```bash
git clone <dépôt> /opt/pilotage && cd /opt/pilotage
cp .env.example .env
chmod 600 .env
```

Renseignez au minimum :

| Variable | Valeur |
|---|---|
| `APP_URL` | `https://pilotage.abnsoft.ma` |
| `POSTGRES_PASSWORD` | `openssl rand -base64 24` |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | voir [GOOGLE_OAUTH.md](GOOGLE_OAUTH.md) |
| `ALLOWED_GOOGLE_DOMAINS` | `abnsoft.ma` |
| `GITHUB_*` | voir [GITHUB_APP.md](GITHUB_APP.md) (facultatif au démarrage) |

`DATABASE_URL` est construite par `docker-compose.yml` à partir de `POSTGRES_PASSWORD` ; `AUTH_DEV_LOGIN` est sans effet en production.

```bash
docker compose up -d --build
docker compose ps                      # web « healthy », migrate « exited (0) »
docker compose logs -f web worker      # journaux JSON (pino)
docker compose run --rm migrate npm run admin:create -- prenom.nom@abnsoft.ma "Prénom Nom"
```

Connectez-vous avec ce compte Google, puis invitez l'équipe (**Paramètres → Utilisateurs et accès**).

## 3. Reverse proxy

Le proxy doit transmettre `Host`, `X-Forwarded-For` et `X-Forwarded-Proto`, et ajouter HSTS (le TLS se termine au proxy).

**Caddy** (certificat automatique) :

```caddy
pilotage.abnsoft.ma {
  encode zstd gzip
  header Strict-Transport-Security "max-age=63072000; includeSubDomains"
  request_body { max_size 12MB }
  reverse_proxy 127.0.0.1:3000
}
```

**Nginx** :

```nginx
server {
  listen 443 ssl http2;
  server_name pilotage.abnsoft.ma;
  ssl_certificate     /etc/letsencrypt/live/pilotage.abnsoft.ma/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/pilotage.abnsoft.ma/privkey.pem;
  add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
  client_max_body_size 12m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

`X-Forwarded-For` doit être **écrasé** par le proxy (et non complété) : il sert à la limitation de débit.

## 4. Mises à jour

```bash
cd /opt/pilotage
git pull
docker compose up -d --build   # reconstruit, rejoue migrate, redémarre web et worker
```

Les migrations sont versionnées dans `prisma/migrations/` et appliquées dans l'ordre, chacune dans une transaction. Faites une sauvegarde avant toute mise à jour comportant une migration.

## 5. Sauvegardes

À sauvegarder : la base **et** le volume des pièces jointes. `.env` (secrets) se conserve à part, dans un coffre.

```bash
# Base — format personnalisé compressé
docker compose exec -T db pg_dump -U pilotage -d pilotage -Fc > /var/backups/pilotage/db-$(date +%F).dump

# Pièces jointes
docker run --rm -v pilotage_uploads:/data -v /var/backups/pilotage:/backup alpine \
  tar czf /backup/uploads-$(date +%F).tgz -C /data .
```

Exemple de cron quotidien (`/etc/cron.d/pilotage`) avec 30 jours de rétention :

```cron
15 2 * * * root cd /opt/pilotage && docker compose exec -T db pg_dump -U pilotage -d pilotage -Fc > /var/backups/pilotage/db-$(date +\%F).dump && find /var/backups/pilotage -mtime +30 -delete
```

Copiez les sauvegardes hors du serveur (stockage objet, autre site) et **testez une restauration chaque trimestre**.

### Restauration

```bash
docker compose stop web worker
docker compose exec -T db dropdb -U pilotage pilotage
docker compose exec -T db createdb -U pilotage pilotage
docker compose exec -T db pg_restore -U pilotage -d pilotage --no-owner < /var/backups/pilotage/db-AAAA-MM-JJ.dump
docker run --rm -v pilotage_uploads:/data -v /var/backups/pilotage:/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/uploads-AAAA-MM-JJ.tgz -C /data"
docker compose up -d
```

## 6. Supervision

- `GET /api/health` → `200 {"status":"ok"}` ou `503 {"status":"degraded"}` si la base est injoignable (utilisé par le healthcheck Docker).
- Journaux JSON sur la sortie standard (`docker compose logs`) ; les secrets, cookies et en-têtes d'autorisation sont masqués. Niveau via `LOG_LEVEL`.
- **Paramètres → Intégration GitHub** affiche les évènements en échec et la dernière synchronisation.
- **Paramètres → Journal d'audit** trace connexions, invitations, changements de rôle, liaisons GitHub, suppressions.

## 7. Sans Docker

Node.js 22 et PostgreSQL 16 :

```bash
npm ci && npm run build
npm run db:migrate
NODE_ENV=production PORT=3000 HOSTNAME=127.0.0.1 node .next/standalone/server.js   # cp -r .next/static .next/standalone/.next/
NODE_ENV=production npm run worker
```

Supervisez les deux processus avec systemd (`Restart=always`).

## 8. Liste de contrôle de mise en production

- [ ] `APP_URL` en HTTPS ; HSTS au proxy
- [ ] `AUTH_SECRET` et `POSTGRES_PASSWORD` générés aléatoirement, `.env` en `chmod 600`
- [ ] Écran de consentement Google en mode **Interne** ; `ALLOWED_GOOGLE_DOMAINS` renseigné
- [ ] GitHub App installable **uniquement sur ce compte**, `GITHUB_ALLOWED_OWNERS` renseigné
- [ ] Port 3000 lié à `127.0.0.1` uniquement (valeur par défaut du compose) ; PostgreSQL non exposé
- [ ] Sauvegardes planifiées, copiées hors site, restauration testée
- [ ] Premier administrateur créé, aucun jeu de démonstration chargé (`db:seed` est refusé en production)
