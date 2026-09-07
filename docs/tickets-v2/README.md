---
tags:
  - perso
  - memo-patte
  - design
---

# Mise à jour des tickets GitHub pour les maquettes v2

Corps de tickets réécrits d'après `../accueil-v2/accueil.md`,
`../carnet-v2/carnet.md` et `../logos/logos.md`.

L'édition des issues n'a pas pu être appliquée automatiquement (permission
refusée côté outil). Commande pour appliquer un ticket :

```bash
gh issue edit 36 --body-file docs/design/tickets-v2/issue-36.md
```

Ou tout appliquer d'un coup :

```bash
for n in 15 16 17 33 34 36 37 48 50 54; do gh issue edit $n --body-file "docs/design/tickets-v2/issue-$n.md"; done
```

## Ce qui change dans chaque ticket

| Issue | Titre | Nature de la mise à jour |
|---|---|---|
| [#36](https://github.com/GaelleBriet/memo-patte-vue/issues/36) | feat(home): écran d'accueil conforme à la maquette (5 états) | chemins v2 ; header sans salutation ni date ; carte unique ; état vide allégé ; libellés d'échéance exacts ; détail de l'état A5 |
| [#17](https://github.com/GaelleBriet/memo-patte-vue/issues/17) | feat(animals): écran Carnet — profil animal détaillé | chemins v2 ; stats en 3 colonnes sans cadre ; ligne d'ajout dans la carte ; états vides par section ; photos réelles (C3) |
| [#33](https://github.com/GaelleBriet/memo-patte-vue/issues/33) | feat(home): coquille de navigation | barre pleine largeur au lieu de la pilule flottante ; couleurs actif/inactif ; zone de gestes |
| [#34](https://github.com/GaelleBriet/memo-patte-vue/issues/34) | feat(home): sélecteur d'animaux en chips | chemins v2 ; avatar photo ; état sélectionné pétrole ; deux comportements (filtre vs changement d'animal) |
| [#37](https://github.com/GaelleBriet/memo-patte-vue/issues/37) | feat(home): section Actions rapides | chemin v2 ; format tuile icône + libellé ; toast de démo écarté |
| [#16](https://github.com/GaelleBriet/memo-patte-vue/issues/16) | feat(animals): écran liste des animaux | l'état vide renvoie à l'état A5 v2 et à ses textes |
| [#15](https://github.com/GaelleBriet/memo-patte-vue/issues/15) | feat(animals): création de profil animal | la photo alimente les avatars du Carnet et des chips |
| [#48](https://github.com/GaelleBriet/memo-patte-vue/issues/48) | feat(settings): écran de paramètres | chemin v2 ; écran non maquetté, reprendre les tokens |
| [#50](https://github.com/GaelleBriet/memo-patte-vue/issues/50) | chore(release): icône, splash screen, nom affiché | sources `logos/` ; couches adaptatives ; splash pétrole ; **4 défauts à corriger** |
| [#54](https://github.com/GaelleBriet/memo-patte-vue/issues/54) | chore(release): fiche Play Store | icône 512 × 512 à produire depuis `logos/icone.png` |
| [#70](https://github.com/GaelleBriet/memo-patte-vue/issues/70) *(nouveau)* | chore(theme): aligner le design system sur les maquettes v2 | ticket créé — palette, polices, icônes, tokens SCSS ; bloquant pour #36 et #17 |

## Ticket ajouté : alignement du design system

Le thème actuel (`src/core/theme/vuetify.ts`) déclarait `primary: #0F766E` et
l'icon set `mdi`, alors que la v2 tourne autour de `#01383E` sur fond crème,
avec `Space Grotesk` + `Inter` et les icônes Material Symbols Outlined. Aucun
ticket ne portait cet alignement alors qu'il bloque #36 et #17.

Créé sous la numérotation d'épic `0.3` (transverse, même logique que 0.1/0.2 —
setup Supabase) : **[#70](https://github.com/GaelleBriet/memo-patte-vue/issues/70)**
— `chore(theme): aligner le design system (thème Vuetify, polices, icônes) sur
les maquettes v2`. Corps sauvegardé dans
[`issue-70-new.md`](issue-70-new.md).

Point non tranché dans le ticket, à décider avant de l'attaquer : garder `mdi`
et retraduire les icônes de la maquette vers leurs équivalents, ou migrer vers
Material Symbols Outlined.
