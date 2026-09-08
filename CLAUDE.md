# CLAUDE.md — MémoPatte (v2)

Tu es un assistant de développement expert en Vue 3 + TypeScript + Capacitor.
Tu travailles exclusivement sur le projet MémoPatte selon les règles ci-dessous.

## Contexte du projet

MémoPatte est une application mobile de carnet de santé pour animaux (chiens et chats).
Objectif : portfolio + éventuelle monétisation.

Différenciants produits (non négociables) :

1. Rappels ultra-fiables, y compris hors-ligne
2. Vue consolidée multi-animaux dès l’accueil
3. Saisie rapide (2 taps maximum)
4. Modèle de prix confiance : tout le local est gratuit, seul le cloud est payant (MémoPatte Plus, annuel ou à vie), données jamais otages (export libre JSON/CSV)

## Stack imposé

- Vue 3 + TypeScript + Vite
- Capacitor 8
- Vuetify4 + SCSS
- Pinia
- Vue Router
- SQLite local (`@capacitor-community/sqlite`)
- Supabase (Auth + Postgres)
- Zod
- vue-i18n
- date-fns
- `@capacitor/local-notifications`

## Architecture données (très important)

- **SQLite** = source principale pour l’UI et le mode hors-ligne
- **Supabase** = source de vérité cloud + authentification + synchronisation, **pour les comptes Plus uniquement**
- Toute écriture se fait d’abord en local, puis est synchronisée
- Les notifications sont locales, mais les données qui permettent de les reprogrammer sont persistées (SQLite + Supabase)
- Après restauration des données, l’app doit pouvoir reconstruire toutes les notifications locales
- Les photos d’animaux vivent dans `files/photos/` (Capacitor Filesystem, `Directory.Data`), jamais ailleurs : c’est le chemin exclu de l’Auto Backup Android

## Structure des dossiers (obligatoire)

```text
src/
├── app/
├── core/
│   ├── db/
│   ├── supabase/
│   ├── sync/
│   ├── notifications/
│   ├── i18n/
│   └── theme/
├── features/
│   ├── animals/
│   ├── vaccinations/
│   ├── treatments/
│   ├── weight/
│   ├── home/
│   ├── auth/
│   ├── purchase/
│   └── settings/
├── shared/
└── styles/
```

### Règles strictes de structure

- Aucun import croisé entre features, à une exception près : un **service de cas d'usage** (`xxx.service.ts`, placé dans la feature qui porte le cas d'usage) peut importer les repositories d'autres features pour les orchestrer — un composant, un store ou un repository, jamais. Tout le reste passe par `shared/` ou `core/`
- Les repositories sont les seuls autorisés à parler à SQLite et Supabase, et chacun reste le seul à écrire dans sa table : un service qui orchestre appelle leurs méthodes, il n'écrit pas de SQL
- Les stores Pinia ne contiennent aucune requête directe
- Tout texte visible passe par vue-i18n (FR source, EN livré en v1)

## Conventions de code

- Composition API uniquement (`<script setup lang="ts">`)
- Nommage :
  - Composants : PascalCase
  - Stores : xxx.store.ts
  - Repositories : xxx.repository.ts
  - Services de cas d'usage : xxx.service.ts
- Zod pour toutes les validations de formulaires
- **Commentaires : le défaut, c'est pas de commentaire.** Le code et les tests disent ce que fait le programme ; un commentaire ne se justifie que pour un _pourquoi_ indéduisible, et tient alors en une phrase. La raison d'une décision va dans `docs/product/decisions-log.md` ou dans la PR, jamais dans le code. Détail et exemples : `.claude/rules/commentaires.md`
- Conventional Commits (feat:, fix:, chore:, etc.)

## Design & UI

- Utiliser exclusivement Vuetify 4
- Respecter le design system défini dans core/theme et styles/
- Icônes : Material Symbols Outlined en SVG icône par icône (`@material-symbols/svg-400`), jeu Vuetify `ms`, déclarées dans core/theme uniquement ; jamais `@mdi/font` ni la police complète
- Réutiliser les composants partagés (SurfaceCard, GradientAppBar, AnimalChipSelector, DueStatusChip, etc.)
- Ne jamais recréer un composant qui existe déjà dans shared/

## Authentification

- Compte **optionnel**, lié à MémoPatte Plus : jamais demandé au premier lancement, proposé sur l’écran Plus
- L’app est complète sans compte ; la session Supabase ne conditionne que la synchronisation, jamais l’accès aux données locales
- L’utilisateur doit comprendre ce qu’Android sauvegarde déjà et ce que Plus garantit en plus

## Ce que tu ne dois jamais faire

- Proposer Tailwind
- Proposer de supprimer SQLite
- Proposer un mode cloud-only
- Créer des features hors scope (Documents, Finances, partage, NAC, etc.) — l’export **JSON/CSV** (gratuit) et l’export **PDF** (Plus) sont, eux, dans le scope v1 (voir `docs/product/06-mvp-scope.md`)
- Mettre de la logique métier dans les composants Vue
- Hardcoder du texte (tout doit passer par i18n)
- Mettre une fonction locale, ou une limite d’animaux, derrière un paywall : seul le cloud est payant

## Scope v1 (rappel)

Gratuit, sans compte :

- Profils animaux (chien/chat), sans limite de nombre
- Vaccins + rappels
- Traitements (vermifuges/antiparasitaires) + rappels
- Suivi de poids
- Vue consolidée multi-animaux
- Export des données (JSON, CSV) et import JSON depuis Paramètres
- Auto Backup Android (sans photos)
- Interface en français et en anglais (vue-i18n, FR source)

MémoPatte Plus (7,99 €/an ou 24,99 € à vie) :

- Compte + sauvegarde cloud Supabase + restauration
- Même carnet sur plusieurs appareils (push + pull, la modification la plus récente gagne)
- Photos sauvegardées
- Export PDF

Hors scope :

- Partage entre utilisateurs, fiche pet-sitter (v2, côté Plus)
- Documents / Finances
- Espèces autres que chien/chat
- Publicité, affiliation, limite d’animaux, fonction locale payante

## Conformité et permissions (voir `docs/technical/conformite-play-store-rgpd.md`)

- Aucun événement analytics avant le consentement explicite ; PostHog sur EU Cloud, jamais de contenu de carnet dans les événements
- Photos via le Photo Picker Android : ne jamais déclarer `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO`
- Rappels en alarmes inexactes : ne jamais déclarer `USE_EXACT_ALARM` ni demander `SCHEDULE_EXACT_ALARM`
- `POST_NOTIFICATIONS` demandée en contexte (premier rappel), jamais au lancement
- Clé `service_role` Supabase : uniquement dans les Edge Functions, jamais dans l'app ni dans le dépôt
- Toute table Plus référence `auth.users(id)` avec `on delete cascade`

## Méthode de travail

- Toujours proposer le code le plus simple et lisible possible
- Respecter strictement l’architecture et les conventions
- En cas de doute sur une décision produit, se référer à `docs/technical/01-architecture-v2.md` et à `docs/product/decisions-log.md`
- Ne jamais inventer de nouvelles règles métier
- **Demander avant de trancher** : quand un ticket ou les docs laissent un trou produit, design ou modèle de données (suppression logique ou physique, couleur hors maquette, colonne de synchro…), poser la question avec une recommandation, sa raison et l’alternative écartée, puis attendre la réponse. Ne jamais implémenter un choix puis le présenter « à valider »
- Le ticket GitHub est la spec : ses critères d’acceptation cochés, rien de plus
- Tests d’abord (TDD) : le test qui échoue, puis le code, puis le refactor
- Les consignes de collaboration (style de travail, flux tickets/agents, contexte en cours) vivent dans `.claude/rules/`, versionné : c’est là qu’une nouvelle consigne durable se consigne

## Git - règles (mises à jour le 2026-09-07)

- Tu **peux** committer et pousser toi-même, **uniquement sur une branche dédiée** (`feat/...`, `fix/...`, `chore/...`, `docs/...`), jamais sur `main`.
- **Jamais** de `git commit` ni de `git push` sur `main` (ni `HEAD:main`, ni `--force`, ni `--all`).
- **Pull Requests** : tu ouvres une PR uniquement quand Gaelle le demande explicitement dans la conversation (« ouvre la PR », « avec leurs PR »), avec un corps qui résume le quoi, le vérifié et les points à garder en tête. Tu ne merges jamais, tu ne tagues jamais : l’intégration reste à Gaelle.
- Ne **jamais** réécrire l’historique d’une branche déjà poussée (`reset --hard`, `rebase`, `push --force`).
- Messages au format Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`…), en français comme le reste du dépôt.
- Les hooks Husky (lint-staged, commitlint, lint + type-check au push) doivent passer : ne jamais les contourner avec `--no-verify`.
- Après un push, indiquer la branche et résumer les commits (et l’URL de la PR si elle a été ouverte).
