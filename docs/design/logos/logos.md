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

## Fichiers dérivés (ticket #50)

Les sources ci-dessus ne sont jamais modifiées. Les fichiers corrigés vivent dans
`resources/` à la racine (convention `@capacitor/assets`), les ressources Android
dans `android/app/src/main/res/`.

| Fichier `resources/` | Contenu |
|---|---|
| `icon-foreground.png` | 1024 × 1024 RGBA, illustration nettoyée, centrée dans la zone de sécurité |
| `icon-monochrome.png` | 1024 × 1024 RGBA, silhouette blanche (alpha seul) pour l'icône thématisée |
| `icon-background.png` | 1024 × 1024, aplat pétrole `#01383E` plein bord |
| `icon-only.png` | 1024 × 1024, aplat pétrole + illustration à 80 % (icône à plat, Play Store 512 px) |
| `splash.png`, `splash-dark.png` | 2732 × 2732, pétrole + illustration centrée (identiques : le splash est pétrole dans les deux thèmes) |

### Régénérer

```sh
python3 scripts/build-icon-resources.py          # sources -> resources/ (Python 3, Pillow, numpy)
pnpm exec capacitor-assets generate --android    # resources/ -> mipmaps + splash Android
git checkout android/app/src/main/AndroidManifest.xml android/app/src/main/res/mipmap-anydpi-v26/
for d in ldpi:36 mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  magick resources/icon-monochrome.png -resize ${d#*:}x${d#*:} -define png:color-type=6 \
    android/app/src/main/res/mipmap-${d%:*}/ic_launcher_monochrome.png
done
```

Le `git checkout` restaure ce que `capacitor-assets` réécrit sans raison : le
manifest (simple reformatage) et les deux `ic_launcher*.xml`, maintenus à la main
(background en `@color/ic_launcher_background` plein bord au lieu du PNG inséré,
couche `<monochrome>`). `capacitor-assets` ne génère pas la couche monochrome :
la boucle `magick` la produit aux tailles 48 dp.

### Corrections appliquées par `scripts/build-icon-resources.py`

1. **Canevas carré.** `foreground.png` et `monochrome.png` (1312 × 1199) sont
   recadrés sur leur boîte englobante puis centrés sur 1024 × 1024 transparent.
2. **Zone de sécurité.** `capacitor-assets` insère les couches avec un `inset`
   de 16,7 % : le canevas 1024 px correspond aux 72 dp visibles de l'icône
   adaptative (108 dp). L'illustration est réduite pour que sa boîte englobante
   tienne dans 66 dp **et** qu'aucun pixel ne sorte du cercle de 66 dp (masque
   circulaire). Résultat : foreground 61,4 × 57,7 dp, monochrome 56,5 × 54,8 dp
   (sa silhouette est plus large en bas à gauche que l'illustration couleur).
3. **Background plein bord.** Aplat `#01383E`, et l'icône adaptative référence
   une couleur (`values/colors.xml`, `petrole`) plutôt qu'un PNG inséré : le
   fond couvre les 108 dp, parallaxe comprise.
4. **Halo de détourage.** Les poussières (pixels d'alpha ≤ 6 loin de
   l'illustration, 56 606 px) sont retirées ; les pixels semi-transparents,
   composés sur blanc à l'export, sont dé-composés
   (`F = (C − (1 − α)·255) / α`). Sur les pixels de bord (α ≤ 128), la
   luminance moyenne composée sur pétrole passe de 54,6 à 50,6 (pétrole = 44,7),
   le 95ᵉ centile de 106,5 à 92,8.

### Splash screen

- Android < 12 : `drawable*/splash.png` générés (thème `AppTheme.NoActionBarLaunch`,
  `android:background`).
- Android 12+ : `windowSplashScreenBackground` = `@color/petrole` et
  `windowSplashScreenAnimatedIcon` = `@mipmap/ic_launcher`, déclarés dans
  `values/styles.xml` ; `Theme.SplashScreen` (androidx core-splashscreen) les
  transmet aux attributs système dans sa variante `values-v31`. L'icône adaptative
  étant pétrole + illustration, le splash système affiche l'illustration seule sur
  fond pétrole.

### Nom affiché

`appName` de `capacitor.config.ts` et `app_name` de `values/strings.xml` valent
tous deux « MémoPatte » ; rien à changer.
