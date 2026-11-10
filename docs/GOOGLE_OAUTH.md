# Configuration de la connexion Google (OIDC)

Pilotage n'accepte que des comptes **Google Workspace** des domaines listés dans `ALLOWED_GOOGLE_DOMAINS`, et uniquement pour des personnes **invitées ou approuvées** par un administrateur. Il n'y a ni inscription publique ni mot de passe local.

## 1. Créer le client OAuth

1. Ouvrez la [Google Cloud Console](https://console.cloud.google.com/) avec un compte administrateur de l'organisation et créez (ou choisissez) un projet, par exemple `abnsoft-pilotage`.
2. **APIs et services → Écran de consentement OAuth** (ou *Google Auth Platform → Branding*) :
   - Type d'utilisateur : **Interne**. Seuls les comptes de votre Workspace peuvent alors se connecter — une première barrière, en plus du contrôle applicatif.
   - Nom : `ABNSoft Pilotage` ; adresse d'assistance et domaine autorisé (`abnsoft.ma`).
   - Champs d'application : `openid`, `email`, `profile` (aucun autre n'est nécessaire).
3. **APIs et services → Identifiants → Créer des identifiants → ID client OAuth** :
   - Type : **Application Web**.
   - Origines JavaScript autorisées : `https://pilotage.abnsoft.ma` (votre `APP_URL`).
   - URI de redirection autorisés : `https://pilotage.abnsoft.ma/api/auth/callback/google`
   - Pour le développement local, ajoutez aussi `http://localhost:3000` et `http://localhost:3000/api/auth/callback/google`.
4. Copiez l'**ID client** et le **code secret** dans `.env` :

```dotenv
AUTH_GOOGLE_ID="1234567890-xxxx.apps.googleusercontent.com"
AUTH_GOOGLE_SECRET="GOCSPX-…"
ALLOWED_GOOGLE_DOMAINS="abnsoft.ma"
AUTH_SECRET="$(openssl rand -base64 32)"
APP_URL="https://pilotage.abnsoft.ma"
```

Plusieurs domaines Workspace peuvent être autorisés : `ALLOWED_GOOGLE_DOMAINS="abnsoft.ma,abnsoft.fr"`.

## 2. Ce que vérifie l'application

À chaque connexion (`server/auth/policy.ts`, testé unitairement) :

| Contrôle | Détail |
|---|---|
| Jeton d'identité | Signature (JWKS Google), émetteur, audience, expiration, `state` et PKCE — vérifiés par Auth.js. |
| E-mail vérifié | `email_verified` doit valoir `true`. |
| Domaine | Le claim **`hd`** doit figurer dans `ALLOWED_GOOGLE_DOMAINS`. Le suffixe de l'adresse n'est **jamais** utilisé seul : un compte Gmail personnel n'a pas de `hd` et est refusé. |
| Invitation | Un compte d'organisation (statut *Invité* ou *Actif*) doit exister. Sinon une **demande d'accès** est enregistrée et la personne voit « Votre demande d'accès a été transmise ». |
| Désactivation | Un compte désactivé est refusé ; ses sessions ont déjà été supprimées. |

Le paramètre `hd` envoyé à Google n'est qu'un indice d'interface (préselection du compte) ; la décision repose sur le claim reçu.

## 3. Premier administrateur

Aucun compte n'existe après l'installation. Créez le premier administrateur en ligne de commande :

```bash
npm run admin:create -- prenom.nom@abnsoft.ma "Prénom Nom"
# avec Docker :
docker compose run --rm migrate npm run admin:create -- prenom.nom@abnsoft.ma "Prénom Nom"
```

Le compte est créé au statut *Invité* et devient *Actif* à sa première connexion Google. Les autres membres sont ensuite invités depuis **Paramètres → Utilisateurs et accès**.

## 4. Sessions

- Sessions stockées en base (`Session`), cookie `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS.
- Durée maximale `SESSION_MAX_AGE_HOURS` (168 h par défaut), prolongée au plus une fois par heure d'activité.
- Révocation immédiate : désactivation d'un compte, « Révoquer les sessions » (administrateur) ou « Se déconnecter partout » (profil).

## 5. Dépannage

| Message affiché | Cause probable |
|---|---|
| « La connexion Google n'est pas configurée sur ce serveur. » | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` absents. |
| `redirect_uri_mismatch` (page Google) | L'URI de redirection ne correspond pas exactement à `APP_URL/api/auth/callback/google` (schéma, port, barre finale). |
| « Seuls les comptes Google Workspace de l'organisation sont acceptés. » | Compte personnel ou domaine absent de `ALLOWED_GOOGLE_DOMAINS`. |
| « Votre demande d'accès a été transmise… » | Personne non invitée : approuvez-la dans **Paramètres → Utilisateurs et accès → Demandes d'accès**. |
| Boucle de redirection derrière un proxy | Le proxy doit transmettre `Host` et `X-Forwarded-Proto: https`. |
