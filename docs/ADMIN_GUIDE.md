# Guide d'administration

Ce guide s'adresse aux **administrateurs** de Pilotage. Les sections d'administration se trouvent dans **Paramètres** (Utilisateurs et accès, Intégration GitHub, Journal d'audit) et, pour chaque projet, dans **Projet → Paramètres**.

## 1. Rôles

### Rôles d'organisation

| Rôle | Peut |
|---|---|
| **Administrateur** | tout : utilisateurs, projets, workflows, GitHub, audit ; accès à tous les projets |
| **Product Owner / Chef de projet** | créer des projets ; gérer backlog, sprints, versions et membres des projets qu'il dirige ou dont il est membre |
| **Développeur** | créer, modifier, commenter et déplacer les tickets des projets dont il est membre ; saisir du temps |
| **Observateur / Direction** | consulter tableaux de bord, rapports et projets dont il est membre ; aucune modification |

### Rôle dans un projet

Chaque personne (hors administrateurs) doit être **membre** d'un projet pour le voir. Un projet inaccessible n'apparaît nulle part (recherche, tableaux de bord, liens directs → « introuvable »).

| Appartenance | Effet |
|---|---|
| **Responsable** | droits de Product Owner sur ce projet, même pour un développeur |
| **Membre** | droits du rôle d'organisation |
| **Lecture seule** | consultation uniquement, quel que soit le rôle d'organisation |

Un Observateur ne peut être que **Lecture seule** et ne peut pas être assigné à un ticket. Les droits sont vérifiés côté serveur à chaque opération : masquer un bouton n'est jamais la seule protection.

## 2. Utilisateurs et accès

**Inviter** — *Paramètres → Utilisateurs et accès → Inviter* : adresse du domaine autorisé, rôle, projets éventuels. Aucun e-mail n'est envoyé par Pilotage : prévenez la personne, qui se connecte avec Google sur `APP_URL`. Son compte passe alors de *Invité* à *Actif*.

**Demandes d'accès** — une personne du domaine qui se connecte sans invitation crée une demande. **Approuver** (choix du rôle) ou **Refuser**. Il n'existe pas d'inscription libre.

**Changer un rôle** — effet immédiat sur toutes les opérations.

**Désactiver** — bloque la connexion et **supprime toutes les sessions** du compte. Les tickets, commentaires et l'historique restent attribués. **Réactiver** rétablit l'accès.

**Révoquer les sessions** — déconnecte la personne de tous ses appareils sans désactiver le compte (ex. ordinateur perdu).

Le **dernier administrateur actif** ne peut être ni rétrogradé ni désactivé.

## 3. Projets

**Créer** — *Projets → Nouveau projet* : nom, **clé** (2 à 10 caractères, majuscule en tête, ex. `ERP`), responsable. La clé préfixe les tickets (`ERP-142`) et **ne peut plus être modifiée** : elle figure dans les branches, commits et PR.

**Membres** — *Projet → Paramètres → Membres* : ajouter, changer le rôle (Responsable, Membre, Lecture seule), retirer.

**Workflow** — *Projet → Paramètres → Workflow* (administrateurs). Par défaut : Backlog → À faire → En cours → En revue → En test → Terminé. Chaque statut a :

- un **nom** (renommable) et une **catégorie** (Backlog, À faire, En cours, En revue, En test, Terminé) — la catégorie pilote les rapports, le burndown et les automatisations ;
- une **limite WIP** facultative, affichée sur la colonne Kanban et signalée en cas de dépassement.

On peut ajouter, réordonner et supprimer des statuts ; un statut contenant des tickets ne peut pas être supprimé (déplacez-les d'abord). Le workflow doit garder au moins un statut de catégorie *Terminé*.

**Étiquettes** — *Projet → Paramètres → Étiquettes*.

**Automatisations GitHub** — désactivées par défaut ; voir [GITHUB_APP.md](GITHUB_APP.md#5-automatisations-désactivées-par-défaut).

## 4. Sprints et versions

- Un seul sprint **actif** par projet. *Démarrer* fige l'engagement (points) ; *Terminer* propose de reporter les tickets non terminés vers le backlog ou un sprint planifié.
- Le **burndown** repose sur des instantanés réels pris par le worker (au démarrage, à chaque ajout de ticket en cours de sprint, à la clôture, puis toutes les heures). Il n'existe pas d'historique antérieur à la mise en service : aucune donnée n'est reconstituée.
- **Versions** : statut Planifiée → En cours → Publiée. Les notes sont générées en brouillon (Nouveautés, Améliorations, Corrections) à partir des tickets ; elles sont modifiables et **ne sont jamais publiées sur GitHub automatiquement**.

## 5. GitHub

*Paramètres → Intégration GitHub* : installer l'application, lier les dépôts aux projets, voir les évènements en échec (**Relancer**), lancer une synchronisation, déconnecter une installation. Procédure complète : [GITHUB_APP.md](GITHUB_APP.md).

## 6. Journal d'audit

*Paramètres → Journal d'audit* : connexions, invitations, approbations, changements de rôle, désactivations, révocations, créations de projet, modifications de workflow et d'automatisations, liaisons GitHub, suppressions de tickets. Affiché du plus récent au plus ancien, paginé. Le journal n'est pas modifiable depuis l'interface.

## 7. Tâches courantes

| Besoin | Action |
|---|---|
| Départ d'un collaborateur | Désactiver le compte (sessions supprimées immédiatement), réassigner ses tickets ouverts |
| Arrivée | Inviter avec le bon rôle et les projets |
| Poste perdu | Révoquer les sessions de la personne |
| Ticket supprimé par erreur | Les tickets sont **archivés** d'abord (restaurables depuis le ticket) ; la suppression définitive est réservée aux responsables |
| Webhook GitHub en échec | Intégration GitHub → Relancer ; sinon « Synchroniser » rattrape PR et commits |
| Premier administrateur perdu | Sur le serveur : `npm run admin:create -- email@abnsoft.ma` |
