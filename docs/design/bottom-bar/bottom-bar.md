---
tags:
  - perso
  - memo-patte
  - bottom-bar
---

# Barre de navigation basse — refonte (2026-09-21)

Maquette de référence : `MémoPatte v2 - Bottom bar (sélection).png` (capture) et
`MémoPatte v2 - Bottom bar (sélection) - standalone.html` (version interactive,
six variantes comparées sur l'écran Carnet complet).

**Variante retenue : « Mix 2A + 1B » (couleurs de 2A, forme de 1B)**, tranchée avec
Gaelle après comparaison des six planches. Remplace la barre actuelle
(`src/shared/components/BottomNavigation.vue`), jugée trop plate.

## Ce qui change

- La barre devient une capsule flottante (fond clair, coins arrondis), plutôt qu'une
  barre pleine largeur avec filet de séparation en haut
- L'onglet actif porte un fond plein `primary` (pétrole, `#01383E`) qui couvre
  exactement la largeur de son propre onglet — jamais toute la barre. Icône et texte
  passent en `$color-on-primary` (`#f9f4ee`) sur ce fond
- L'onglet inactif reste en texte/icône `$color-text-secondary` (`#68625c`), posé
  directement sur le fond clair de la capsule, sans remplissage

## Pourquoi cette variante et pas les cinq autres

Les six planches et leur comparaison sont dans le HTML joint. Résumé de l'arbitrage :

- **3A (icônes seules)** écartée : pas de libellé texte, or l'icône patte (Carnet)
  n'est pas aussi universellement lisible que l'icône maison (Accueil) — contraire à
  l'esprit de la passe accessibilité #51 qui vient d'être faite
- **1B (capsule pétrole pleine)** et ses deux variantes allégées (verre dépoli,
  teal adouci) écartées : mesuré sur l'image, le remplissage pétrole y couvre
  ~90 % de la capsule contre ~44 % pour Mix 2A+1B — un bloc sombre qui domine
  l'écran, ce que Gaelle a signalé comme trop lourd visuellement. Le verre dépoli
  ajoute en plus une dépendance à `backdrop-filter`, au rendu variable selon la
  version du WebView Android
- **2A (capsule claire, accent réduit)** solide mais l'accent actif y est plus
  discret ; Mix 2A+1B en reprend les couleurs avec un accent plein, plus affirmé,
  sans jamais couvrir plus qu'un onglet à la fois

## Contrat technique à préserver

- Hauteur des onglets `$height-bottom-nav` (56 px) et zone de gestes
  `$padding-bottom-nav` (22 px) inchangées — verrouillées par
  `src/shared/__tests__/BottomNavigation.styles.spec.ts`
- Deux onglets seulement (Accueil, Carnet), routes `home` et `animals`, aucun
  changement de libellé ni d'icône (`ms:home`, `ms:pets`)
