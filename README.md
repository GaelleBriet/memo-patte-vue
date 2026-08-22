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
- **Données protégées** — un compte est requis pour que l’historique
  de santé ne soit jamais perdu, même en cas de changement de téléphone.
- **Prix transparent** — achat unique annoncé dès l’installation,
  jamais d’abonnement ni de palier qui change après coup.

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
- **Supabase** = authentification + synchronisation + backup
- Les notifications sont locales, mais les données qui permettent
  de les reprogrammer sont persistées et synchronisées

## Développement

```bash
npm install
npm run dev          # développement web
npx cap sync         # synchronisation Capacitor
npx cap run android  # lancement sur Android
```

## Conventions

Les messages de commit suivent [Conventional Commits](https://www.conventionalcommits.org/fr/) (feat:, fix:, chore:...).

## À propos

Projet portfolio développé en solo, de la recherche produit à la publication sur le Google Play Store.
