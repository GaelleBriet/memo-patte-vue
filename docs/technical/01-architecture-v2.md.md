---
tags:
  - perso
  - memo-patte
  - architecture
---
# Architecture technique v2 — MémoPatte

Ce document remplace `01-architecture.md` (version Flutter).  
Il découle des décisions du 2026-08-21 (restart Vue + compte obligatoire + offline-first hybride).

Statut : proposition à valider.

## Principes directeurs

- **Offline-first** : l’application doit fonctionner pleinement sans réseau (lecture, écriture, rappels).
- **Compte optionnel, lié à Plus** (décision du 2026-09-07, remplace « compte obligatoire ») : l'app est complète sans compte ; le compte n'existe que pour la sauvegarde cloud, la restauration et le multi-appareil de MémoPatte Plus.
- **Source de vérité double** :
  - Locale (SQLite) → ce que l’utilisateur voit et utilise au quotidien.
  - Cloud (Supabase) → backup + synchronisation + authentification, **pour les comptes Plus uniquement**.
- **Feature-first** : organisation du code par fonctionnalité métier.
- **Simplicité** : architecture lisible et prévisible pour le vibe coding avec Claude.

## Stack retenue

| Besoin                | Choix                            | Pourquoi                                                    |
|-----------------------|----------------------------------|-------------------------------------------------------------|
| Framework             | Vue 3 + TypeScript + Vite        | Lisibilité, Composition API, excellent avec les IA          |
| Mobile                | Capacitor 8                      | Accès natif (SQLite, notifications, etc.)                   |
| UI                    | Vuetify4 + SCSS                  | Material Design, transitions, icônes, contrôle fin via SCSS |
| État                  | Pinia                            | Simple et clair                                             |
| Router                | Vue Router                       | Standard                                                    |
| Base locale           | `@capacitor-community/sqlite`    | Offline-first fiable                                        |
| Base cloud + Auth     | Supabase (Postgres + Auth)       | Auth + RLS + free tier + région Europe                      |
| Notifications locales | `@capacitor/local-notifications` | Rappels hors-ligne                                          |
| Validation            | Zod                              | Schémas partagés et typés                                   |
| i18n                  | vue-i18n                         | FR (source) + EN préparé                                    |
| Dates                 | date-fns                         | Léger et fiable                                             |

## Architecture données

```
App mobile 
│ 
├── SQLite (local) 
│ └── Source principale pour l’UI et le mode hors-ligne 
│ 
└── Sync (quand réseau disponible) 
│ 
▼ 
Supabase (Postgres + Auth) 
└── Source de vérité cloud + backup + authentification
```

### Règles de synchronisation

- Toute écriture se fait d’abord en local (SQLite).
- La synchronisation vers Supabase se déclenche dès que le réseau est disponible (avec debounce).
- Au premier lancement sur un nouvel appareil : restauration depuis Supabase si un compte Plus existe ; sinon, l'Auto Backup Android (`android:allowBackup`, ≤ 25 Mo, base SQLite incluse, photos exclues) restaure les données locales sans serveur.
- À la souscription Plus : envoi complet de la base locale vers le compte (pas de réconciliation, le local fait foi).
- Les notifications locales sont toujours gérées depuis les données locales.

## Structure des dossiers

```text
src/
├── app/                    # Point d’entrée, plugins, router, layouts
├── core/
│   ├── db/                 # SQLite (connexion, migrations, schema)
│   ├── supabase/           # Client Supabase + auth helpers
│   ├── sync/               # Logique de synchronisation local ↔ cloud
│   ├── notifications/      # Service notifications locales
│   ├── i18n/
│   └── theme/              # Vuetify + tokens SCSS
├── features/
│   ├── animals/
│   ├── vaccinations/
│   ├── treatments/
│   ├── weight/
│   ├── home/
│   ├── auth/               # Écrans de connexion / création de compte
│   ├── purchase/
│   └── settings/
├── shared/                 # Composants UI réutilisables + types communs
└── styles/                 # settings.scss, overrides, etc.

```

### Règles strictes

- Aucun import croisé entre features (sauf via shared/ ou core/).
- Les repositories sont les seuls autorisés à parler à SQLite et à Supabase.
- Les stores Pinia ne contiennent aucune requête SQL/API directe.
- Tout texte visible passe par vue-i18n.

## Authentification & compte

- Compte **optionnel**, proposé uniquement sur l'écran MémoPatte Plus, jamais au premier lancement.
- Méthodes : email + mot de passe et Google (via Supabase Auth).
- La garde de navigation ne conditionne jamais l'accès aux données locales ; la session Supabase ne sert qu'à la synchronisation.
- Message sur l'écran Plus :
> « Android sauvegarde déjà tes carnets sur ton Drive. Avec Plus, MémoPatte les garde aussi en sécurité, avec les photos, et les retrouve sur tous tes appareils. »

## Notifications

- Les notifications sont **exécutées localement** via `@capacitor/local-notifications`.
- Les règles et échéances qui permettent de les générer (date, heure, animal, type, fréquence, etc.) sont des **données métier** persistées dans SQLite et synchronisées vers Supabase.
- Après toute restauration de données (nouveau téléphone, réinstallation…), l’application doit pouvoir **reconstruire automatiquement** l’ensemble des notifications locales à partir des données restaurées.
- On stocke également les identifiants des notifications locales déjà programmées afin de pouvoir les annuler proprement en cas de modification ou suppression.

## Monétisation

- Gratuit = tout le local (animaux illimités, rappels, poids, export JSON/CSV). Plus = tout le cloud (compte, sauvegarde, restauration, multi-appareil, photos) + export PDF.
- Deux produits Play Billing pour le même contenu : abonnement annuel 7,99 € et achat non consommable « à vie » 24,99 €.
- L'état Plus est stocké localement (avec vérification Play au lancement) ; un utilisateur dont l'abonnement expire garde tout en local et perd seulement la sync.

## Ce qui reste à trancher

- Plugin Capacitor de billing compatible Capacitor 8 (ticket 9.0).
- Stratégie exacte de keep-alive Supabase Free (cron simple recommandé, déjà en place).
- Comportement à l'expiration de l'abonnement (délai de grâce Play, message).
- Exclusion des photos de l'Auto Backup Android (règles `fullBackupContent`).
