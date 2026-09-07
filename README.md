# MémoPatte

Le carnet de santé qui ne vous laisse jamais rien oublier — même
avec plusieurs animaux, même hors-ligne.

## Statut

🚧 En développement — pas encore publié sur le Play Store.

## Le projet

MémoPatte est une application mobile de suivi de santé pour animaux
de compagnie (poids, vaccins, vermifuges), pensée autour de quatre
principes :

- **Rappels fiables, y compris hors-ligne** — les notifications sont
  locales et ne dépendent d’aucune connexion internet.
- **Vue consolidée multi-animaux** — un seul écran d’accueil pour
  tous vos animaux et leurs prochaines échéances.
- **Gratuit sur votre téléphone, sans compte** — animaux illimités,
  rappels, poids, export libre (JSON, CSV). Seul le cloud est payant :
  MémoPatte Plus (annuel ou à vie) ajoute la sauvegarde, la
  restauration, le multi-appareil, les photos et l’export PDF.
- **Données jamais otages** — rien de ce qui est saisi n’est jamais
  verrouillé, avec ou sans Plus.

## Stack technique

- [Vue 3](https://vuejs.org/) + TypeScript + Vite
- [Capacitor 8](https://capacitorjs.com/) — Android uniquement (v1)
- [Vuetify 4](https://vuetifyjs.com/) + SCSS
- [Pinia](https://pinia.vuejs.org/) — gestion d’état
- [Vue Router](https://router.vuejs.org/)
- SQLite local (`@capacitor-community/sqlite`) — offline-first
- [Supabase](https://supabase.com/) — Auth + Postgres (source de vérité cloud)
- [`@capacitor/local-notifications`](https://capacitorjs.com/docs/apis/local-notifications) — rappels hors-ligne

## Architecture données

- **SQLite** = source principale pour l’UI et le mode hors-ligne
- **Supabase** = authentification + synchronisation + backup (comptes Plus)
- Les notifications sont locales, mais les données qui permettent
  de les reprogrammer sont persistées et synchronisées

## Développement

Le projet utilise **pnpm** (version épinglée par `packageManager` dans `package.json`)
et **Node 26** (`.nvmrc`, lu par la CI et par [fnm](https://github.com/Schniz/fnm)).
Pour Android : JDK 21, le SDK Android (platform 36) et `adb`.

```bash
fnm use                          # ou : fnm install, la première fois
pnpm install --frozen-lockfile
cp .env.example .env             # clés Supabase, fichier jamais versionné

pnpm dev                         # développement web (Vite)
pnpm dev:mobile                  # build + install sur le téléphone, hot reload via adb
pnpm cap:sync                    # build de prod + synchronisation Capacitor
pnpm cap:open:android            # ouvre le projet dans Android Studio
```

Avant de committer :

```bash
pnpm lint                        # oxlint + eslint, avec --fix
pnpm type-check                  # vue-tsc
pnpm test:unit:run               # vitest
pnpm build                       # type-check + build de prod (dist/)
pnpm check                       # tout ça d'un coup, plus le formatage
```

Ces vérifications tournent aussi dans les hooks Husky (`pre-commit`, `pre-push`) et dans la CI sur chaque PR.

Installation sur une nouvelle machine, débogage Chrome DevTools, pièges connus :
voir [`docs/technical/commandes-utiles.md`](docs/technical/commandes-utiles.md).

## Conventions

Les messages de commit suivent [Conventional Commits](https://www.conventionalcommits.org/fr/) (feat:, fix:, chore:...).

## À propos

Projet portfolio développé en solo, de la recherche produit à la publication sur le Google Play Store.
