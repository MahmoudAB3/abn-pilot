# Intégration GitHub (GitHub App)

Pilotage utilise une **GitHub App** propre à l'organisation — jamais de jeton personnel. Les jetons d'installation sont de courte durée et générés à la demande à partir de la clé privée de l'application.

## 1. Créer l'application

GitHub → **Settings** de l'organisation → **Developer settings → GitHub Apps → New GitHub App**.

| Champ | Valeur |
|---|---|
| GitHub App name | `ABNSoft Pilotage` (le *slug* en découle, ex. `abnsoft-pilotage`) |
| Homepage URL | `https://pilotage.abnsoft.ma` |
| Callback URL | *(laisser vide — pas d'identification d'utilisateur via GitHub)* |
| Setup URL | `https://pilotage.abnsoft.ma/api/github/setup` |
| Redirect on update | ✅ coché |
| Webhook → Active | ✅ |
| Webhook URL | `https://pilotage.abnsoft.ma/api/github/webhook` |
| Webhook secret | `openssl rand -hex 32` (même valeur que `GITHUB_WEBHOOK_SECRET`) |
| Where can this GitHub App be installed? | **Only on this account** |

### Permissions (dépôt), toutes en lecture seule

| Permission | Accès | Usage |
|---|---|---|
| Metadata | Read-only | obligatoire (liste des dépôts) |
| Contents | Read-only | commits (synchronisation et événements `push`) |
| Pull requests | Read-only | PR, statut, revues |

Aucune permission d'écriture : Pilotage ne modifie jamais GitHub et **ne publie jamais de release**. Les notes de version sont rédigées dans Pilotage et copiées manuellement.

### Événements à cocher

`Push`, `Pull request`, `Pull request review`, `Repository`. Les événements `installation` et `installation_repositories` sont toujours envoyés aux GitHub Apps.

Après création : notez l'**App ID**, générez une **clé privée** (fichier `.pem`).

## 2. Configurer Pilotage

```dotenv
GITHUB_APP_ID="123456"
GITHUB_APP_SLUG="abnsoft-pilotage"
GITHUB_WEBHOOK_SECRET="…"
# Clé PEM sur une ligne : remplacer les retours à la ligne par \n
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE…\n-----END RSA PRIVATE KEY-----\n"
# Recommandé : seuls ces comptes peuvent être connectés
GITHUB_ALLOWED_OWNERS="abnsoft"
```

Conversion de la clé : `awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' cle.pem`.

Redémarrez `web` **et** `worker` après modification.

## 3. Installer et lier les dépôts

1. **Paramètres → Intégration GitHub → Installer l'application** (administrateurs). Pilotage redirige vers GitHub avec un paramètre `state` signé (HMAC, 10 minutes) qui lie l'installation à l'administrateur connecté.
2. Choisissez les dépôts. GitHub revient sur la *Setup URL* ; Pilotage revérifie l'installation auprès de l'API GitHub et vérifie le propriétaire (`GITHUB_ALLOWED_OWNERS`).
3. Toujours dans **Paramètres → Intégration GitHub**, liez chaque dépôt à un ou plusieurs projets. Une synchronisation initiale est mise en file.

## 4. Liaison des tickets

Une clé de ticket (`ERP-142`) présente dans :

- le **titre ou la description d'une PR**, le **message d'un commit** (sensible à la casse : `ERP-142`) ;
- le **nom d'une branche** (insensible à la casse : `feature/erp-142-export-pdf`)

lie la PR ou le commit au ticket, **uniquement** si le projet du ticket est lié au dépôt. Le panneau du ticket propose un nom de branche (`feature/ERP-142-export-pdf`, `fix/…` pour une anomalie).

## 5. Automatisations (désactivées par défaut)

Configurables par projet dans **Paramètres du projet → Automatisations GitHub** (administrateurs) :

| Règle | Effet |
|---|---|
| PR ouverte → *En revue* | à l'ouverture (hors brouillon) ou au passage « prête pour revue » |
| Modifications demandées → *En cours* | sur une revue `changes_requested` |
| PR fusionnée → statut choisi | ex. *En test* ou *Terminé* |

Garde-fous : une automatisation ne fait **jamais reculer** un ticket (sauf la règle « modifications demandées »), n'agit que sur les tickets liés, est tracée dans l'activité du ticket (« via GitHub ») et n'est **jamais rejouée** par la synchronisation de rattrapage.

## 6. Fiabilité

| Mécanisme | Détail |
|---|---|
| Signature | `X-Hub-Signature-256` vérifiée en temps constant ; 401 sinon. |
| Idempotence | `X-GitHub-Delivery` unique : une livraison rejouée renvoie 200 « Déjà reçu. » sans retraitement. |
| Traitement asynchrone | Le webhook répond 202 immédiatement ; le **worker** traite la file (verrouillage `SKIP LOCKED`). |
| Reprise | Échecs relancés avec délai exponentiel (8 tentatives max.), puis visibles dans **Paramètres → Intégration GitHub** avec un bouton « Relancer ». |
| Ordre | Un événement plus ancien que l'état connu d'une PR ne l'écrase pas. |
| Rattrapage | Toutes les 6 h (et à la demande), PR et commits récents sont relus via l'API pour combler un webhook perdu. |
| Révocation | Désinstallation → installation marquée révoquée, dépôts déliés, historique conservé. Suspension → événements ignorés jusqu'à la levée. |

## 7. Tester en local

Exposez votre poste (ex. `cloudflared tunnel --url http://localhost:3000`) et mettez temporairement l'URL du tunnel dans *Webhook URL*. **Advanced → Recent Deliveries** dans GitHub permet de rejouer une livraison : Pilotage répondra « Déjà reçu. ».
