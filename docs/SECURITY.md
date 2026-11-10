# Sécurité

## Modèle de menace

Application interne, une dizaine d'utilisateurs authentifiés, exposée sur Internet derrière TLS. Risques principaux : accès d'une personne extérieure, élévation de droits entre rôles ou projets, injection de contenu (commentaires, descriptions, PR GitHub), falsification de webhooks, fuite de secrets.

## Mesures

| Domaine | Mesure | Où |
|---|---|---|
| **Identité** | Google OIDC uniquement ; claim `hd` vérifié ; e-mail vérifié ; invitation ou approbation obligatoire ; aucune inscription publique | `server/auth/` |
| **Sessions** | En base, cookie `HttpOnly` + `SameSite=Lax` + `Secure` (HTTPS) ; expiration configurable ; révocation immédiate (désactivation, révocation, « tous les appareils ») | Auth.js, `modules/admin` |
| **Autorisation** | Matrice RBAC unique ; contrôle dans chaque service ; rôle et organisation relus en base à chaque requête ; projets inaccessibles → 404 ; aucun identifiant d'organisation, rôle ou droit accepté du client | `server/authz.ts` |
| **Validation** | Zod sur toute entrée (actions, routes, payloads GitHub) | `modules/*/schemas.ts` |
| **CSRF** | Server actions : contrôle d'origine natif de Next.js ; routes POST maison : vérification `Origin` ; Auth.js : jeton CSRF ; webhook : signature HMAC | `app/api/*` |
| **XSS** | Markdown rendu côté serveur puis assaini (DOMPurify) ; liens `javascript:` refusés ; React échappe le reste ; **CSP stricte à nonce** (`strict-dynamic`, `object-src 'none'`, `frame-ancestors 'none'`) | `lib/markdown.ts`, `middleware.ts` |
| **En-têtes** | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` ; HSTS au proxy | `middleware.ts` |
| **Pièces jointes** | Taille max. (`UPLOAD_MAX_BYTES`) ; type déterminé par le **contenu** (signature binaire), pas par l'extension ; liste blanche ; nom de stockage aléatoire hors du dossier public ; téléchargement après contrôle d'accès avec `Content-Disposition` et CSP `sandbox` | `modules/issues/attachments.ts` |
| **Débit** | Limitation par IP ou par utilisateur : connexion (20/min), recherche (120/min), téléversement (30/min), webhook (600/min) | `server/rate-limit.ts` |
| **GitHub** | GitHub App (pas de PAT), permissions en lecture seule ; signature `X-Hub-Signature-256` en temps constant ; idempotence par livraison ; `state` d'installation signé ; installation revérifiée via l'API ; liste blanche de propriétaires | `modules/github/` |
| **Secrets** | Uniquement par variables d'environnement, validées au démarrage ; jamais dans le dépôt ; masqués dans les journaux | `server/env.ts`, `server/logger.ts` |
| **Audit** | Connexions, invitations, rôles, désactivations, sessions, projets, workflows, automatisations, GitHub, suppressions | `server/audit.ts` |
| **Démonstration** | Connexion de développement et jeu de démonstration refusés en production | `server/env.ts`, `prisma/seed.ts` |

## Couverture par les tests

Les tests d'intégration (PostgreSQL réel) vérifient notamment : refus des comptes hors domaine ou sans `hd`, demandes d'accès, désactivation qui coupe les sessions, isolement des projets (lecture, écriture, recherche), droits de chaque rôle, impossibilité d'assigner un observateur, protection du dernier administrateur, signature et idempotence des webhooks, refus d'un événement dont l'installation ne correspond pas au dépôt, automatisations désactivées par défaut, assainissement du Markdown.

## Limites connues

- La limitation de débit est **en mémoire** (une instance web) ; à remplacer par un stockage partagé si l'on déploie plusieurs instances.
- `style-src` autorise `'unsafe-inline'` (styles en ligne des composants Radix).
- Les pièces jointes ne passent pas par un antivirus ; ajouter ClamAV si des fichiers externes sont échangés.
- Auth.js v5 est encore publié en bêta ; suivre ses mises à jour de sécurité.

## Signaler un problème

Contactez l'administrateur de Pilotage ; ne publiez pas de détail dans un ticket visible par tous.
