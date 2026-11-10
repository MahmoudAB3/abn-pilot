# ABNSoft Pilotage — Design system

> Pilotez vos projets, de l'idée à la livraison.

Ce document résume les règles visuelles appliquées dans toute l'application (tokens, composants, accessibilité). Les captures de `docs/apercus/` montrent les écrans de référence.

---

## 1. Direction visuelle

Analyse de la référence (tableau Jira « Teams in Space ») et traduction pour Pilotage :

| Référence | Pilotage |
|---|---|
| Rail global bleu saturé (#0747A6) | **Rail « Bleu Pilotage » #0A3B91**, réservé au rail : logo, recherche, création, aide, profil. Le reste de l'interface reste neutre. |
| Sidebar gris clair, item actif sur fond bleuté | Sidebar `surface-subtle`, item actif `selected` + barre d'accent 3px à gauche |
| Colonnes Kanban grises, en-tête en petites capitales + compteur | `surface-sunken`, `text-overline-caps`, compteur et limite WIP (`3 / 4`) |
| Cartes blanches, ombre 1px, rayon ~3px | `shadow-card`, `rounded-md` (4px), padding 10px |
| Étiquettes d'épopée en capitales, blanc sur couleur vive | Mêmes capitales grasses, mais **fond doux + texte foncé** → contraste AA (la référence échoue sur l'orange) |
| Icônes de type (carré coloré) et chevrons de priorité | Conservés ; chaque signal combine **forme + couleur**, jamais la couleur seule |
| Clés de tickets grises, barrées quand terminées | Monospace JetBrains Mono, barrées à l'état « Terminé » |
| Densité élevée | Corps 14px, lignes de tableau 36px, contrôles 32px |

Ce que nous évitons : dégradés, cartes surdimensionnées, rayons « bulle », espaces vides décoratifs.

---

## 2. Organisation du code

```
app/
  globals.css                 ← TOUS les tokens (clair + sombre) + base + utilitaires
  layout.tsx                  ← <html lang="fr">, nonce CSP, Providers
  (app)/layout.tsx            ← session obligatoire → AppShell (rail, sidebar, barre supérieure)
components/
  ui/                         ← fondations (style shadcn/ui, Radix + CVA)
  pilotage/                   ← composants métier (tickets, Kanban, sprints, graphiques…)
  layout/                     ← shell, navigation, recherche ⌘K, notifications, profil
lib/
  domain.ts                   ← SEUL endroit qui associe un concept métier à une couleur
  labels.ts · format.ts       ← libellés français, dates et nombres fr-FR
  i18n.tsx · utils.ts
scripts/check-contrast.mjs    ← vérifie 100 paires de tokens × 2 thèmes (WCAG AA)
```

---

## 3. Tokens

Toutes les valeurs sont des **variables CSS sémantiques** définies dans `app/globals.css`, redéfinies sous `.dark`, puis exposées à Tailwind via `@theme inline`. Aucun composant ne contient de couleur codée en dur.

### Couleurs

| Famille | Tokens (→ classes Tailwind) |
|---|---|
| Marque | `brand-50…950`, `rail`, `rail-foreground`, `rail-hover` |
| Surfaces | `background`, `surface-subtle`, `surface-sunken`, `card`, `popover`, `surface-hover`, `surface-active` |
| Texte | `foreground`, `fg-secondary`, `muted-foreground`, `fg-disabled` |
| Bordures | `border`, `border-strong`, `input`, `ring` |
| Actions | `primary` (+ `-foreground`, `-hover`, `-active`, `-text`), `secondary`, `destructive`, `selected` |
| États | `success`, `warning`, `destructive`, `info` — chacun avec `-subtle` et `-subtle-foreground` |
| Priorités | `prio-critique`, `prio-haute`, `prio-moyenne`, `prio-basse`, `prio-minimale` |
| Statuts | `status-{afaire,encours,revue,bloque,termine}-{bg,fg}` |
| Types | `type-{story,tache,bug,epic,soustache}` |
| Sprints | `sprint-{planifie,actif,termine,retard}`, `progress-track` |
| Pull requests | `pr-{ouverte,brouillon,revue,fusionnee,fermee}-{bg,fg}` |
| Étiquettes | `label-{jaune,orange,cyan,violet,vert,rose,bleu,gris}-{bg,fg}` |
| Graphiques | `chart-1…5` (ordre fixe, validé daltonisme clair & sombre), `chart-grid` |

Règles de contraste (vérifiées par `npm run check:contrast`) : texte ≥ 4.5:1 ; icônes et marques graphiques ≥ 3:1.

### Typographie

| Classe | Taille / interligne | Usage |
|---|---|---|
| `text-display` | 28 / 34 · 600 | Valeurs KPI |
| `text-h1` | 22 / 28 · 600 | Titre de page (un seul H1) |
| `text-h2` | 18 / 24 · 600 | Titre de dialogue, section |
| `text-h3` | 15 / 20 · 600 | Titre de carte |
| `text-body` | 14 / 20 | Texte courant, contrôles |
| `text-body-sm` | 13 / 18 | Métadonnées, libellés |
| `text-caption` | 12 / 16 | Légendes, horodatages |
| `text-overline-caps` | 11 / 16 · 600 · capitales | En-têtes de colonnes et de tableaux |
| `issue-key` | Mono 12 / 16 · 500 | Clés de tickets, SHA, branches |

Polices : **Inter Variable** (interface) et **JetBrains Mono Variable** (références), auto-hébergées via `@fontsource` — aucune requête vers Google Fonts.

### Mise en page

| Token | Valeur | Classe |
|---|---|---|
| Rail | 52px | `w-rail` |
| Sidebar | 232px (56px réduite) | `w-sidebar` / `w-14` |
| Barre supérieure | 48px | `h-topbar` |
| Marge de page | 24px | `px-page-x` |
| Contenu max | 1440px | `max-w-content` |
| Formulaires | 720px | `max-w-prose` |
| Panneau de détail | 480px | `max-w-panel` |
| Rayons | 2 · 3 · 4 · 6 · 8px | `rounded-xs…xl` |
| Ombres | carte · surélevé · superposition | `shadow-card`, `shadow-raised`, `shadow-overlay` |
| Points de rupture | 640 · 768 · 1024 · 1280 · 1536 | défauts Tailwind |

---

## 4. Conventions d'usage

- **Un seul bouton `primary` par zone.** `secondary` est la valeur par défaut ; `ghost` pour les barres d'outils ; `destructive` uniquement après confirmation.
- **Onglets vs contrôle segmenté** : `Tabs` quand chaque option affiche un panneau ; `SegmentedControl` pour basculer une vue (grille/liste, échelle de temps).
- **Formulaires** : toujours via `<Field>`, qui relie libellé, aide et erreur (`aria-describedby`, `aria-invalid`). Pour un `Select`, utiliser la forme fonction : `{(control) => <Select><SelectTrigger {...control} /></Select>}`.
- **Couleurs métier** : ne jamais écrire `bg-status-encours-bg` dans une page — utiliser `<StatusBadge>`, `<PriorityIcon>`, `<IssueTypeIcon>`, `<EpicLabel>`, `<PrStateBadge>`. Les correspondances vivent dans `lib/domain.ts`.
- **Détail d'un ticket** : `useIssues().open(key)` depuis n'importe quel écran ouvre le panneau latéral.
- **Création** : `useCreateIssue().openCreate()` (ou touche `C`).
- **`cn()`** : `lib/utils.ts` configure tailwind-merge avec l'échelle typographique Pilotage. Sans cela, `text-body-sm` effacerait `text-primary-foreground`. Ajouter toute nouvelle taille de texte à cette configuration.
- **Graphiques** : un seul axe Y, couleurs `chart-1…5` dans l'ordre, légende dès 2 séries, table équivalente pour lecteurs d'écran (voir `components/pilotage/charts.tsx`).

---

## 5. Accessibilité (WCAG 2.2 AA)

- Contraste vérifié par script (`npm run check:contrast`, 100 paires × 2 thèmes).
- Focus visible 2px `ring` sur tous les éléments interactifs ; lien d'évitement « Aller au contenu principal ».
- Navigation clavier complète (Radix) ; `aria-current="page"` sur l'item actif.
- **Kanban** : `Entrée` ouvre le ticket · `Maj + ←/→` change de colonne (alternative au glisser, critère 2.5.7) · `Espace` saisit/dépose · `Échap` annule. Annonces en français pour les lecteurs d'écran.
- Raccourcis : `⌘/Ctrl + K` recherche, `C` créer un ticket.
- Cibles tactiles ≥ 44px sur écrans tactiles (`data-touch-target`), tiroir de navigation sur mobile.
- `prefers-reduced-motion` respecté globalement.

---

## 6. Règles pour les nouvelles fonctionnalités

1. **Jamais de couleur codée en dur** : utiliser les tokens ; une nouvelle association métier → couleur va dans `lib/domain.ts`.
2. **Forme + couleur** pour tout signal (type, priorité, statut, blocage).
3. **Composants d'abord** : réutiliser `components/ui/` et `components/pilotage/` avant d'en créer.
4. **Textes en français** dans `lib/labels.ts` ; dates et nombres via `lib/format.ts`.
5. **Graphiques** : palette validée (`components/pilotage/charts.tsx`), un seul axe, tableau équivalent pour les lecteurs d'écran.
6. **Vérifier** : `npm run lint && npm run typecheck && npm run check:contrast`.
