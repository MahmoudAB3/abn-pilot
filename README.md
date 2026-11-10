# ABNSoft Pilotage

*Pilotez vos projets, de l'idée à la livraison.*

Outil interne de gestion de projets Agile d'**ABN Software Synergie** — alternative à Jira et Linear pour une petite équipe : tickets, Kanban, backlog, sprints, feuille de route, versions, tableaux de bord et intégration GitHub. Interface en français (anglais disponible pour la navigation).

| Document | Pour |
|---|---|
| [PROGRESS.md](PROGRESS.md) | état d'avancement, limites connues |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | mise en production (Docker Compose), sauvegardes |
| [docs/GOOGLE_OAUTH.md](docs/GOOGLE_OAUTH.md) | connexion Google Workspace |
| [docs/GITHUB_APP.md](docs/GITHUB_APP.md) | GitHub App et webhooks |
| [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) | rôles, utilisateurs, projets, workflow |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | structure du code, données, tâches de fond |
| [docs/SECURITY.md](docs/SECURITY.md) | mesures de sécurité |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | tokens, composants, accessibilité |

## Pile

Next.js 15 (App Router) · TypeScript strict · Tailwind CSS 4 · composants style shadcn/ui (Radix) · Lucide · TanStack Query · dnd-kit · React Hook Form + Zod · PostgreSQL 16 + Prisma 6 (adaptateur `pg`) · Auth.js v5 (Google OIDC) · GitHub App (Octokit) · pino · Vitest · Playwright.

## Démarrage local

Prérequis : Node.js 22, PostgreSQL 16 (local ou `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16-alpine`).

```bash
cp .env.example .env
# Renseigner AUTH_SECRET (openssl rand -base64 32) et, pour la démo, AUTH_DEV_LOGIN="true"
npm install
npm run db:reset        # crée le schéma + jeu de démonstration (refusé en production)
npm run dev             # http://localhost:3000
npm run worker          # dans un second terminal : webhooks GitHub, instantanés, synchronisation
```

Avec `AUTH_DEV_LOGIN="true"` (développement uniquement), la page de connexion propose un sélecteur des comptes de démonstration — un par rôle :

| Compte | Rôle |
|---|---|
| Omar Berrada | Administrateur |
| Karim El Idrissi | Product Owner |
| Yasmine Benali, Mehdi Tazi, Sofia Haddad | Développeurs |
| Nadia Ouazzani | Observatrice (direction) |

Le jeu de démonstration contient deux projets (`ERP`, `PCL`), des épopées, un sprint terminé et un sprint actif, un backlog, une version, des jalons et une activité GitHub simulée. **Ces données servent uniquement à la démonstration** ; en production la base démarre vide (voir *Premier administrateur* dans [docs/GOOGLE_OAUTH.md](docs/GOOGLE_OAUTH.md#3-premier-administrateur)).

Pour une vraie connexion Google en local, ajoutez `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` et l'URI `http://localhost:3000/api/auth/callback/google`.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` / `build` / `start` | serveur de développement, build de production, serveur de production |
| `npm run worker` | processus de fond |
| `npm run lint` · `typecheck` | ESLint (next + jsx-a11y) · TypeScript strict |
| `npm test` | tests unitaires et d'intégration (Vitest, PostgreSQL réel, base `pilotage_test`) |
| `npm run test:e2e` | parcours Playwright (base `pilotage_e2e`, serveur sur le port 3200) |
| `npm run check:contrast` | contraste WCAG AA des tokens, clair et sombre |
| `npm run db:migrate` | applique les migrations en attente |
| `npm run db:new -- nom` | génère une migration à partir des changements de `schema.prisma` |
| `npm run db:seed` · `db:reset` | jeu de démonstration · réinitialisation complète (développement) |
| `npm run admin:create -- email "Nom"` | crée ou promeut un administrateur |

Les tests créent, migrent et vident leurs propres bases (`TEST_DATABASE_URL`, `E2E_DATABASE_URL` ; par défaut `pilotage_test` et `pilotage_e2e` sur `localhost`) et ne touchent jamais `DATABASE_URL`. L'utilisateur PostgreSQL doit pouvoir créer des bases. Pour Playwright, `PLAYWRIGHT_CHROMIUM_EXECUTABLE` permet d'utiliser un Chromium déjà installé.

## Organisation du code

```
app/            routes : (app)/ écrans authentifiés · api/ · connexion/
modules/        logique métier par domaine (service.ts, schemas.ts, actions.ts)
server/         db, env, session, authz (RBAC), audit, journalisation, file de tâches
worker/         processus de fond
components/     ui/ · pilotage/ · layout/
lib/            formatage fr-FR, libellés, clés de tickets, rangs, markdown
prisma/         schéma, migrations, démonstration
tests/          unit/ · integration/ · e2e/
```

Règle d'or : **toute opération passe par un service de `modules/` qui vérifie les droits** (`assertProject`, `assertOrg`). Les composants ne décident jamais de ce qu'un utilisateur peut faire ; ils se contentent de masquer ce qu'il ne peut pas faire. Détails dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Ajouter une fonctionnalité

1. Schéma : modifier `prisma/schema.prisma`, puis `npm run db:new -- ma_modification` et `npm run db:migrate`.
2. Service : fonction dans `modules/<domaine>/service.ts` — `assertProject(ctx, …, "permission")`, transaction, `IssueActivity`/`audit` si pertinent.
3. Action : `export const xAction = action(schema, async (input, ctx) => service(ctx, input))` dans `actions.ts` (fonction **async** obligatoire).
4. Interface : composants existants, textes français dans `lib/labels.ts`, couleurs via `lib/domain.ts`.
5. Tests : intégration pour les droits et invariants ; e2e pour un parcours critique.
6. `npm run lint && npm run typecheck && npm test && npm run build`.

## Déploiement

```bash
cp .env.example .env    # puis renseigner les secrets
docker compose up -d --build
docker compose run --rm migrate npm run admin:create -- prenom.nom@abnsoft.ma "Prénom Nom"
```

Voir [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
