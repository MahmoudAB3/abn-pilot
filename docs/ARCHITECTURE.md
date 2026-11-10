# Architecture

Un monolithe Next.js modulaire, une base PostgreSQL, un worker. C'est volontairement simple pour une équipe de six : pas de microservices, pas de broker, pas de cache externe.

## 1. Vue d'ensemble

```
app/                    Routes (App Router) — pages serveur + îlots clients
  (app)/…               Écrans authentifiés (shell commun)
  api/…                 Auth.js, webhook GitHub, pièces jointes, recherche, santé
  connexion/            Seule page publique
modules/<domaine>/      Logique métier, une couche par domaine
  service.ts            Fonctions serveur : autorisation + validation + transaction + audit
  schemas.ts            Schémas Zod partagés (formulaires et serveur)
  actions.ts            Server actions minces : action(schema, handler) → ActionResult
server/                 Transverse : db, env, session, authz, audit, logger, jobs, erreurs
worker/index.ts         Processus de fond (même code que web)
components/             ui/ (fondations) · pilotage/ (métier) · layout/ (shell)
lib/                    Code isomorphe : format fr-FR, libellés, clés de tickets, rangs, markdown
prisma/                 Schéma, migrations SQL versionnées, jeu de démonstration
scripts/                Migrations, réinitialisation, amorçage administrateur, contraste
tests/                  unit/ · integration/ (PostgreSQL réel) · e2e/ (Playwright)
```

Domaines : `projects`, `issues`, `sprints`, `releases` (jalons, feuille de route, versions), `notifications`, `search`, `reporting`, `github`, `admin`.

## 2. Flux d'une modification

```
Composant client ──(server action / fetch)──► actions.ts
                                               │ getUserCtx() : session en base + appartenance ACTIVE
                                               │ schéma Zod (entrée non fiable)
                                               ▼
                                            service.ts
                                               │ assertProject(ctx, projet, "permission")  ← RBAC
                                               │ db.$transaction : écriture + IssueActivity + AuditLog
                                               │ notify() (filtrée par accès et préférences)
                                               ▼
                                            ActionResult { ok, data | error }
```

Règles :

- **Aucune donnée d'autorisation ne vient du client** : organisation, rôle et droits sont relus en base à chaque requête (`server/session.ts`, `server/authz.ts`). Un identifiant fourni (ticket, sprint, statut…) est toujours rechargé et rattaché au projet vérifié.
- Les **pages serveur** appellent les mêmes services que les actions ; les listes sont filtrées en SQL par `visibleProjectsWhere(ctx)`.
- Le Kanban applique les déplacements de façon **optimiste** (TanStack Query) et annule en cas de refus serveur.

## 3. Données

37 modèles Prisma (`prisma/schema.prisma`). Points notables :

| Sujet | Choix |
|---|---|
| Clés de tickets | `Project.issueCounter` incrémenté par `UPDATE … RETURNING` dans la transaction de création : pas de doublon sous concurrence. Clé de projet au format contrôlé (CHECK) et immuable (aucune opération ne la modifie). |
| Ordre | Rangs fractionnaires (`lib/rank.ts`) : un déplacement ne réécrit qu'une ligne. |
| Hiérarchie | Épopée → Story/Tâche/Anomalie → Sous-tâche, validée par `hierarchyError()`. |
| Historique | `IssueActivity` (fil lisible), `IssueStatusHistory` (temps de cycle, débit), `SprintSnapshot` (burndown). |
| Suppression | Archivage (`archivedAt`) puis suppression définitive réservée aux responsables. |
| Recherche | Colonnes `tsvector` générées (configuration `french`) + index GIN sur tickets et commentaires ; index préfixe sur le titre. |
| Invariants SQL | Un seul sprint `ACTIVE` par projet (index unique partiel) ; une liaison GitHub vise exactement une cible (CHECK) ; format des clés (CHECK). |
| GitHub | Installations, dépôts, PR, commits et liaisons normalisés ; `GitHubWebhookEvent.deliveryId` unique (idempotence). |

Les contraintes non exprimables en Prisma sont dans `prisma/migrations/*_constraints/migration.sql`.

### Migrations

Le moteur de schéma Prisma (binaire natif) n'est pas requis : `scripts/db-migrate.ts` applique les fichiers `migration.sql` dans l'ordre, chacun dans une transaction, sous verrou consultatif, et tient la table standard `_prisma_migrations` (compatible `prisma migrate deploy`). Nouvelle migration : modifier le schéma puis `npm run db:new -- nom` (diff hors ligne contre `schema.snapshot.prisma`).

## 4. Authentification

Auth.js v5, fournisseur Google, **sessions en base** (révocables), adaptateur Prisma. La décision de connexion est une fonction pure (`server/auth/policy.ts`) : e-mail vérifié, claim `hd` autorisé, invitation existante, compte non désactivé. Le middleware ne fait qu'une redirection de confort ; la vraie vérification a lieu côté serveur à chaque requête. Détails : [GOOGLE_OAUTH.md](GOOGLE_OAUTH.md).

## 5. Tâches de fond

PostgreSQL sert de file : `GitHubWebhookEvent` (livraisons) et `Job` (tâches internes, `dedupeKey`). Le worker réclame des lots avec `FOR UPDATE SKIP LOCKED`, relance avec délai exponentiel (8 tentatives), libère les verrous orphelins après 10 minutes et planifie :

| Tâche | Fréquence |
|---|---|
| `sprints.snapshot` | toutes les heures |
| `github.sync_all` | toutes les 6 h |
| `maintenance.prune` | quotidienne (évènements et tâches traités depuis plus de 14 j, sessions expirées) |

Si le worker est arrêté, l'application reste utilisable ; les webhooks s'accumulent et sont traités au redémarrage.

## 6. Intégration GitHub

`webhook.ts` (signature, idempotence, 202) → `processor.ts` (installation, dépôts, push, PR, revues, liaisons, automatisations) ; `sync.ts` (rattrapage via l'API, sans automatisations). Détails : [GITHUB_APP.md](GITHUB_APP.md).

## 7. Interface

Next.js App Router : pages serveur, îlots clients pour le Kanban (dnd-kit), le backlog, les formulaires (React Hook Form + Zod) et le panneau de ticket (`?ticket=ERP-142`, chargé via `/api/issues/[key]`). Filtres dans l'URL, appliqués côté serveur. Design system : [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## 8. Phases de réalisation

| Phase | Contenu | État |
|---|---|---|
| 1 | Socle : schéma, migrations, auth Google + invitations, RBAC, projets, workflow, tickets, Kanban | ✅ |
| 2 | Backlog, sprints, burndown à instantanés, recherche, notifications, mentions, pièces jointes | ✅ |
| 3 | GitHub App : webhooks, liaisons, automatisations, synchronisation, tableau GitHub | ✅ |
| 4 | Jalons, feuille de route, versions et notes, tableaux de bord (général, PO, direction), rapports | ✅ |
| 5 | Durcissement, audit, tests e2e, Docker, documentation | ✅ |
