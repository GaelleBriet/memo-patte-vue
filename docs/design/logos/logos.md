---
tags:
  - perso
  - memo-patte
  - design
---

# Logos MémoPatte

Art de marque : une patte crème sur fond pétrole, dont le coussinet central
contient un golden retriever et un chat pétrole avec un cœur corail. Même
illustration que celle utilisée sur l'écran de premier lancement (état A5 de
`../accueil-v2/accueil.md`).

## Fichiers fournis

| Fichier | Dimensions | Fond | Usage prévu |
|---|---|---|---|
| `icone.png` | 1254 × 1254 | opaque, squircle pétrole sur blanc | icône « à plat » : Play Store, aperçus, docs |
| `background.png` | 1254 × 1254 | opaque, squircle pétrole sur blanc | couche **background** de l'icône adaptative Android |
| `foreground.png` | 1312 × 1199 | transparent | couche **foreground** de l'icône adaptative Android |
| `monochrome.png` | 1312 × 1199 | transparent, aplat pétrole | couche **monochrome** (icône thématisée Android 13+) |

## Points à corriger avant intégration Android

Repérés en inspectant les fichiers — à traiter dans le ticket
« icône, splash screen, nom affiché » (#50) :

1. **Couches non carrées.** `foreground.png` et `monochrome.png` sont en
   1312 × 1199. Une icône adaptative attend des couches **carrées** (108 dp,
   soit 432 px en xxxhdpi) ; il faut recadrer sur un canevas carré, sinon
   Android déforme ou recadre l'illustration.
2. **Zone de sécurité.** Sur une icône adaptative, seuls les 66 % centraux sont
   garantis visibles (le masque du constructeur peut être cercle, squircle,
   goutte…). L'illustration occupe aujourd'hui presque toute la surface : les
   coussinets extérieurs de la patte seront rognés. Prévoir une marge.
3. **Coins blancs sur le background.** `background.png` est un squircle pétrole
   posé sur du blanc. Une fois masqué par Android, les coins blancs
   réapparaissent en bordure. La couche background doit être un **aplat pétrole
   plein bord** (`#01383E`), pas une forme détourée.
4. **Halo sur le foreground.** `foreground.png` conserve des pixels blancs
   résiduels autour de l'illustration (détourage imparfait), visibles sur fond
   sombre. À nettoyer.
5. **Monochrome coloré.** `monochrome.png` est un aplat pétrole. Android
   re-teinte cette couche selon le thème de l'utilisateur, donc la couleur n'a
   pas d'importance, mais l'aplat doit rester une silhouette lisible une fois
   réduite — les moustaches et le trait de séparation chien/chat risquent de
   disparaître en petite taille.

## Deux variantes d'illustration existent

Les maquettes v2 embarquent deux versions de l'art de marque :

- **Variante A** — chien + chat sur fond crème organique, avec des feuillages,
  sans patte.
- **Variante B** — chien + chat dans la patte, identique à l'icône.

**C'est la variante B qui est retenue** sur l'écran de premier lancement, ce qui
aligne l'illustration d'onboarding et l'icône installée. La variante A n'existe
que dans le fichier de maquette, elle n'a pas été exportée ici.

## Splash screen

Non fourni comme fichier dédié. La cohérence avec la v2 demande un fond
`#01383E` (même pétrole que le header) et l'illustration centrée — à produire
depuis `foreground.png` une fois nettoyé.

## Fiche Play Store

L'icône haute résolution attendue par Google Play est un **PNG 32 bits de
512 × 512**. `icone.png` (1254 × 1254) sert de source, il faut la redimensionner.
