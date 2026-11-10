# PROGRESS — ABNSoft Pilotage

Dernière mise à jour : 6 novembre 2026. Phases 1 à 5 terminées.

## Vérifications

| Contrôle | Résultat |
|---|---|
| `npm run lint` | 0 erreur, 0 avertissement |
| `npm run typecheck` | TypeScript strict, 0 erreur |
| `npm test` | 67 tests unitaires et d'intégration (PostgreSQL réel) — tous verts |
| `npm run test:e2e` | 6 parcours Playwright — tous verts |
| `npm run check:contrast` | 100 paires × 2 thèmes conformes WCAG AA |
| `npm run build` | build de production (`output: standalone`) |
| Production locale | serveur autonome + worker sur base vierge : santé OK, pages authentifiées 200, connexion de démonstration 404, webhook signé accepté / non signé refusé |

Les images Docker n'ont pas pu être construites dans l'environnement de développement (registre Docker inaccessible) ; leurs étapes ont été rejouées à l'identique hors conteneur (`npm ci`, build sans secret, migrations, serveur autonome, worker). À vérifier lors du premier `docker compose up --build`.

## Fonctionnalités terminées

### Accès et administration
- Connexion **Google Workspace** uniquement (claim `hd` vérifié, e-mail vérifié), sur **invitation ou approbation** ; demandes d'accès automatiques pour le domaine ; aucune inscription publique.
- Sessions en base, révocables (par l'administrateur, par l'utilisateur sur tous ses appareils, automatiquement à la désactivation).
- Rôles **Administrateur, Product Owner / Chef de projet, Développeur, Observateur / Direction** + appartenance par projet (Responsable, Membre, Lecture seule) ; contrôle dans chaque opération serveur ; projets inaccessibles invisibles (404).
- Utilisateurs : invitation, approbation/refus, changement de rôle, désactivation/réactivation, révocation de sessions, protection du dernier administrateur.
- Journal d'audit ; amorçage du premier administrateur en ligne de commande.

### Projets et tickets
- Projets avec clé immuable, responsable, membres, étiquettes, santé calculée à partir de signaux réels (retards, blocages, avancement du sprint).
- **Workflow configurable** (statuts, catégories, ordre, limites WIP) ; défaut Backlog → À faire → En cours → En revue → En test → Terminé.
- Tickets : Épopée, User Story, Tâche, Anomalie, Sous-tâche (hiérarchie validée) ; priorités Critique → Très basse ; points, échéance, assigné, rapporteur, étiquettes, jalon, version, blocage avec motif.
- Description et commentaires en Markdown assaini, **mentions** `@`, pièces jointes contrôlées, liens entre tickets (bloque, est bloqué par, lié à, duplique), observateurs, saisie de temps, fil d'activité, duplication, archivage/restauration/suppression, modifications groupées.
- Panneau de ticket latéral (`?ticket=ERP-142`) et page dédiée ; nom de branche suggéré.

### Planification
- **Kanban** : glisser-déposer (souris, tactile, clavier `Maj + ←/→`), mise à jour optimiste avec annulation en cas d'échec, filtres (texte ou clé, assigné, non assignés, type, priorité, étiquette, bloqués), couloirs (assigné, épopée), création rapide par colonne, limites WIP.
- **Backlog** : priorisation par glisser-déposer, planification dans les sprints, création rapide.
- **Sprints** : un seul actif par projet (garanti en base), objectif, dates, engagement figé au démarrage, clôture avec report vers le backlog ou le sprint suivant, **burndown à partir d'instantanés réels**, vélocité, rapport de sprint.
- **Feuille de route** : jalons et épopées sur une frise, avancement calculé à partir des tickets enfants.
- **Versions** : planifiée / en cours / publiée, tickets rattachés, **brouillon de notes** (Nouveautés, Améliorations, Corrections) modifiable — jamais publié automatiquement sur GitHub.

### Suivi
- Tableaux de bord **général**, **Product Owner** (backlog, sprint, risques) et **direction** (débit sur 12 semaines, échéances à 45 jours, initiatives) ; rapports par projet (temps de cycle médian, répartition).
- **Mes tâches**, notifications in-app (assignation, mention, commentaire, changement de statut, PR liée) avec préférences par type, observateurs.
- **Recherche** plein texte en français (racines), par clé exacte, préfixe de titre et commentaires ; palette `⌘K` ; filtres enregistrés ; tickets consultés récemment.

### GitHub
- GitHub App (aucun PAT), installation avec `state` signé, liste blanche de propriétaires, révocation et suspension gérées.
- Webhooks signés, idempotents, traités par le worker avec reprises ; évènements en échec visibles et relançables.
- Liaison des commits et PR par clé (titre, description, message, branche), limitée aux dépôts liés au projet.
- **Automatisations désactivées par défaut** et configurables par projet (PR ouverte, modifications demandées, fusion), sans retour arrière.
- Synchronisation de rattrapage (toutes les 6 h et à la demande), tableau de bord GitHub (PR ouvertes, en revue, fusionnées, activité).

### Plateforme
- Interface française (formats fr-FR, fuseau Africa/Casablanca), anglais pour la navigation ; thèmes clair et sombre ; responsive ; accessibilité WCAG 2.2 AA visée (clavier, focus, annonces, contraste).
- Sécurité : CSP à nonce, en-têtes, protection CSRF, assainissement XSS, validation des fichiers par contenu, limitation de débit, journaux structurés avec masquage des secrets.
- Docker multi-étapes (web, tools), Compose (db, migrate, web, worker), santé `/api/health`, guide de sauvegarde et de restauration.

## Reste à faire / pistes

| Sujet | Commentaire |
|---|---|
| Notifications par e-mail | Seules les notifications in-app existent ; prévoir un SMTP et un résumé quotidien. Les invitations sont à annoncer manuellement. |
| Traduction anglaise complète | L'anglais couvre le shell (navigation, menus) ; les écrans métier restent en français. |
| Temps réel | Rafraîchissement par requêtes périodiques (notifications) et au focus ; pas de WebSocket. |
| Éditeur riche | Markdown (rendu à l'affichage) ; pas d'éditeur WYSIWYG ni d'aperçu pendant la saisie. |
| Import Jira | Aucun import ; à prévoir si l'historique Jira doit être repris (CSV ou API). |
| Champs personnalisés, automatisations hors GitHub | Hors périmètre initial. |
| Antivirus des pièces jointes | Recommandé si des fichiers externes sont échangés (ClamAV). |

## Limites connues

- **Burndown** : l'historique commence à la mise en service ; aucune donnée antérieure n'est reconstituée. Instantané horaire + à chaque démarrage, ajout et clôture.
- **Limitation de débit en mémoire** : valable pour une seule instance web (le déploiement prévu).
- **Migrations** : appliquées par `scripts/db-migrate.ts` (compatible `_prisma_migrations`) afin de n'avoir aucun binaire natif Prisma ; `prisma migrate deploy` fonctionne aussi là où ses moteurs sont disponibles.
- **Auth.js v5** est publié en bêta.
- `style-src 'unsafe-inline'` reste nécessaire pour les composants Radix.
- La page `/design-system` du kit initial a été retirée de l'application ; les règles sont dans `docs/DESIGN_SYSTEM.md`.
- Données GitHub du jeu de démonstration simulées (installation et dépôt fictifs) : aucun appel réel n'est fait sans configuration de la GitHub App.

## Mise en route

**Développement** — voir [README.md](README.md#démarrage-local) :

```bash
cp .env.example .env          # AUTH_SECRET, AUTH_DEV_LOGIN="true"
npm install && npm run db:reset && npm run dev
npm run worker                # second terminal
```

**Production** — voir [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) :

1. Créer le client OAuth Google (mode Interne) — [docs/GOOGLE_OAUTH.md](docs/GOOGLE_OAUTH.md).
2. Remplir `.env` à partir de `.env.example` (secrets générés, `APP_URL` HTTPS, `ALLOWED_GOOGLE_DOMAINS`).
3. `docker compose up -d --build`, puis `docker compose run --rm migrate npm run admin:create -- email "Nom"`.
4. Reverse proxy TLS vers `127.0.0.1:3000` ; sauvegardes planifiées.
5. Créer et installer la GitHub App — [docs/GITHUB_APP.md](docs/GITHUB_APP.md) ; lier les dépôts ; activer les automatisations souhaitées.
6. Inviter l'équipe, créer les projets, ajuster le workflow — [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md).
