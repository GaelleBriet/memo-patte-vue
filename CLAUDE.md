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
4. Modèle de prix confiance : achat unique, règles claires dès l’installation, données jamais otages (export libre JSON/CSV)

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
- **Supabase** = source de vérité cloud + authentification + synchronisation
- Toute écriture se fait d’abord en local, puis est synchronisée
- Les notifications sont locales, mais les données qui permettent de les reprogrammer sont persistées (SQLite + Supabase)
- Après restauration des données, l’app doit pouvoir reconstruire toutes les notifications locales

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

- Aucun import croisé entre features (sauf via shared/ ou core/)
- Les repositories sont les seuls autorisés à parler à SQLite et Supabase
- Les stores Pinia ne contiennent aucune requête directe
- Tout texte visible passe par vue-i18n

## Conventions de code

- Composition API uniquement (`<script setup lang="ts">`)
- Nommage :
  - Composants : PascalCase
  - Stores : xxx.store.ts
  - Repositories : xxx.repository.ts
- Zod pour toutes les validations de formulaires
- Conventional Commits (feat:, fix:, chore:, etc.)

## Design & UI

- Utiliser exclusivement Vuetify 4
- Respecter le design system défini dans core/theme et styles/
- Réutiliser les composants partagés (SurfaceCard, GradientAppBar, AnimalChipSelector, DueStatusChip, etc.)
- Ne jamais recréer un composant qui existe déjà dans shared/

## Authentification

- Compte obligatoire
- L’utilisateur doit comprendre clairement pourquoi un compte est demandé :

> « Un compte est nécessaire pour que tes carnets de santé ne soient jamais perdus. »

## Ce que tu ne dois jamais faire

- Proposer Tailwind
- Proposer de supprimer SQLite
- Proposer un mode cloud-only
- Créer des features hors scope (Documents, Finances, export PDF, partage, NAC, etc.) — l’export **JSON/CSV** est, lui, dans le scope v1 (voir `docs/product/06-mvp-scope.md`)
- Mettre de la logique métier dans les composants Vue
- Hardcoder du texte (tout doit passer par i18n)

## Scope v1 (rappel)

Inclus :

- Profils animaux (chien/chat)
- Vaccins + rappels
- Traitements (vermifuges/antiparasitaires) + rappels
- Suivi de poids
- Vue consolidée multi-animaux
- Compte obligatoire + sync
- Achat unique
- Export des données (JSON, CSV) depuis Paramètres, accessible quel que soit l’état d’achat

Hors scope :

- Partage
- Export PDF
- Documents / Finances
- Espèces autres que chien/chat
- Abonnement / freemium

## Méthode de travail

- Toujours proposer le code le plus simple et lisible possible
- Respecter strictement l’architecture et les conventions
- En cas de doute sur une décision produit, se référer à `docs/technical/01-architecture-v2.md` et à `docs/product/decisions-log.md`
- Ne jamais inventer de nouvelles règles métier

## Git - règles (mises à jour le 2026-09-07)

- Tu **peux** committer et pousser toi-même, **uniquement sur une branche dédiée** (`feat/...`, `fix/...`, `chore/...`, `docs/...`), jamais sur `main`.
- **Jamais** de `git commit` ni de `git push` sur `main` (ni `HEAD:main`, ni `--force`, ni `--all`).
- Les **Pull Requests restent du ressort de l’humain** : tu ne crées pas de PR, tu ne merges pas, tu ne tagues pas.
- Ne **jamais** réécrire l’historique d’une branche déjà poussée (`reset --hard`, `rebase`, `push --force`).
- Messages au format Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`…), en français comme le reste du dépôt.
- Les hooks Husky (lint-staged, commitlint, lint + type-check au push) doivent passer : ne jamais les contourner avec `--no-verify`.
- Après un push, indiquer la branche et résumer les commits pour que l’humain ouvre la PR.
