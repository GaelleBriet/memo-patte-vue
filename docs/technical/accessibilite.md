# Accessibilité et responsive (ticket #51)

Passe faite avant publication, le 2026-09-15, sur le carnet de démo (`pnpm dev:data`), plus un
animal sans rappel pour les états « Tout est à jour » et sections vides.
Mesures dans Chromium headless (émulation mobile), pas encore sur appareil : voir « Reste à vérifier ».

Référentiel : WCAG 2.2 niveau AA pour les contrastes (4,5:1 texte courant, 3:1 texte ≥ 24 px ou
≥ 18,66 px gras, 3:1 composants d'interface et icônes porteuses de sens) ; zone de tap de 48 dp
(Material), 44 px au minimum ; aucun texte sous 12 px.

## 1. Contrastes

Ratios calculés sur les couleurs réellement rendues (couleur calculée du texte, fond composé des ancêtres),
puis recoupés avec les tokens. Le texte principal hérite de l'opacité « haute emphase » de Vuetify
(87 %) : `#221B16` à 87 % rend `#3E3731` sur le fond (10,59:1) et `#3F3834` sur une carte (11,23:1).

Les paires conformes sont verrouillées par `src/core/theme/__tests__/contrast.spec.ts`, qui lit
`_tokens.scss` et le thème Vuetify : une couleur modifiée qui passe sous le seuil fait échouer le test.

### Corrigé le 2026-09-15 (décision de Gaelle, voir `docs/product/decisions-log.md`)

| Élément | Token | Avant | Après |
| --- | --- | --- | --- |
| Sous-titre des formulaires (« Pour Milo »), « Optionnel », légende « Ajouter une photo » | `$color-hint` | `#857F79` sur `#F9F3E9` : 3,58 | `#736E67` : 4,58 |
| Compteur de section, libellés des stats du Carnet, « Poids actuel » | `$color-text-meta` | `#79736D` sur `#F9F3E9` : 4,24 | `#736E67` : 4,58 |
| Placeholder d'un champ | `$color-placeholder` | `#97918A` sur `#FEFCF9` : 3,05 | `#77716A` : 4,71 |

### Bordures de contrôle, volontairement sous 3:1

Assombries « avec douceur » : même teinte, luminosité baissée jusqu'à 2:1 environ sur leur fond réel,
sans aller jusqu'aux 3:1 de WCAG 1.4.11 pour garder le rendu doux des maquettes. Le test impose un
plancher de 2:1 pour qu'elles ne repâlissent pas.

| Élément | Token | Fond | Avant | Après |
| --- | --- | --- | --- | --- |
| Bordure d'un champ | `$color-field-border` | `#F9F3E9` | `#DBD7D1` : 1,30 | `#B6ADA1` : 2,01 |
| Bordure du sélecteur à boutons | `$color-segmented-border` | `#F9F3E9` | `#CECAC3` : 1,48 | `#B4ADA3` : 2,01 |
| Pastille radio non cochée (export) | `$color-radio-border` | `#FEFCF9` | `#C1BDB7` : 1,83 | `#B9B4AE` : 2,01 |

### Non conforme, laissé tel quel

Barre d'urgence « Aujourd'hui » (`today`, `#D38D38` sur `#FEFCF9`) : 2,69 pour 3 attendus. Le badge texte
porte l'information, la barre est redondante.

Exemptés (WCAG 1.4.3 ne s'applique pas aux contrôles inactifs), listés pour mémoire :

| Élément | Texte / fond | Ratio |
| --- | --- | --- |
| Bouton plein désactivé (`$color-disabled-text` / `$color-disabled-surface`) | `#6E6862` / `#E1DDD8` | 4,07 |
| Ligne de réglage désactivée (`$color-settings-row-disabled`) | `#9A948D` / `#FEFCF9` | 2,93 |
| Champs verrouillés de la feuille pesée sans animal (opacité 0,55) | `#A39D95` / `#F9F3E9` | 2,43 |

Décoratifs, sans exigence : filet de carte et de chip (`#ECE9E5`, 1,10), cercle pointillé et patte de la
photo (`#A2BDC0` 1,80, `#90ABAD` 2,38 ; le bouton est nommé par sa légende), poignée des feuilles
(`#C1BDB7` 1,69 ; le voile et le retour Android ferment aussi la feuille).

### Paires conformes

| Élément | Texte / fond | Ratio |
| --- | --- | --- |
| Texte principal / fond, carte (token opaque) | `#221B16` / `#F9F3E9`, `#FEFCF9` | 15,39 / 16,59 |
| Titre, icônes du header / pétrole | `#F9F3E9` / `#01383E` | 11,63 |
| Sous-titre du header / pétrole | `#B9D0D1` / `#01383E` | 7,95 |
| Chip et segment cochés / pétrole | `#F9F4EE` / `#01383E` | 11,73 |
| Texte des boutons pleins (on-primary Vuetify) | `#FFFFFF` / `#01383E` | 12,83 |
| Lien, astérisque, « Annuler », prochaine dose / fond, carte, barre d'actions | `#01383E` / `#F9F3E9`, `#FEFCF9`, `#FCFAF7` | 11,63 / 12,53 / 12,32 |
| Badge « En retard », bandeau retard | `#972622` / `#FFE3DF` | 6,61 |
| Badge « Aujourd'hui » | `#834200` / `#FDF3E5` | 6,97 |
| Badge « Demain » / « Dans n jours » | `#265331` / `#EDF7EE` | 8,10 |
| Badge « À jour » | `#2F5437` / `#DFF3E2` | 7,39 |
| Badge de fréquence, « Pas de rappel » | `#5C5751` / `#F2F0EC` | 6,28 |
| Coche « Tout est à jour » (icône) | `#2B6339` / `#D8EFDC` | 5,87 |
| Stat « en retard » (12 px gras) / fond | `#C0453D` / `#F9F3E9` | 4,57 |
| Prochaine dose en retard / carte | `#C0453D` / `#FEFCF9` | 4,93 |
| Prochaine dose aujourd'hui / carte | `#834200` / `#FEFCF9` | 7,47 |
| Barres d'urgence retard, bientôt / carte | `#C0453D`, `#5C8664` / `#FEFCF9` | 4,93 / 4,06 |
| Texte secondaire / fond, carte, carte cochée, bandeau | `#68625C` / `#F9F3E9`, `#FEFCF9`, `#DCF0F1`, `#F2F0EC` | 5,45 / 5,88 / 5,09 / 5,29 |
| Texte méta sur carte et sur le fond (prochaine dose, mois, compteur, stats) | `#736E67` / `#FEFCF9`, `#F9F3E9` | 4,94 / 4,58 |
| Sous-titre hint, « Optionnel » / fond | `#736E67` / `#F9F3E9` | 4,58 |
| Placeholder / champ | `#77716A` / `#FEFCF9` | 4,71 |
| Label de champ | `#5C5751` / `#F9F3E9` | 6,48 |
| Suffixe « kg », « Tous les » / champ, fond | `#413933` / `#FEFCF9`, `#F9F3E9` | 11,04 / 10,24 |
| Segment non coché | `#3E3630` / `#FEFCF9` | 11,55 |
| Deltas de poids +, −, nul / fond | `#2F5437`, `#5A544D`, `#736E67` / `#F9F3E9` | 7,78 / 6,77 / 4,58 |
| Deltas de poids +, −, nul / carte | idem / `#FEFCF9` | 8,39 / 7,30 / 4,94 |
| Valeurs de la courbe, dates des pesées | `#2F2722`, `#342C26` / `#FEFCF9` | 14,30 / 13,37 |
| Icône « une seule pesée » | `#798A8B` / `#FEFCF9` | 3,52 |
| Bandeau « rappels désactivés » : titre, lien | `#47413C`, `#01383E` / `#F2F0EC` | 8,83 / 11,27 |
| Toast | `#F9F4EE` / `#2B221A` | 14,26 |
| Chevron des réglages (icône) | `#857F79` / `#FEFCF9` | 3,86 |
| Carte de choix cochée : libellé, icône | `#221B16`, `#01383E` / `#DCF0F1` | 14,38 / 10,86 |
| Icône de l'écran d'explication | `#01383E` / `#B9E4E7` | 9,36 |
| Erreurs / fond, carte ; icône d'erreur d'import | `#B3261E` / `#F9F3E9`, `#FEFCF9`, `#F9DEDC` | 5,92 / 6,38 / 5,14 |
| Bouton « Remplacer » | `#FFFFFF` / `#B3261E` | 6,54 |

## 2. Zones de tap

Mesure par test de cible (`elementFromPoint` sur une grille de 2 px) : la zone réellement tapable, pseudo-
éléments compris et recouvrements déduits. Écrans : accueil (tous les animaux, un animal, tout est à jour,
rappels désactivés), feuille « Pour quel animal ? », feuille pesée avec et sans animal, Carnet (données,
sections vides, feuille photo), formulaires animal (création, édition, erreurs), vaccin et traitement
(création, édition), suivi de poids, Paramètres, feuilles export et import (choix, erreur, confirmation),
écran d'explication des notifications, toast.

Corrigé sans changement de rendu (pseudo-élément transparent, mixin `src/styles/_tap-target.scss`) :

| Contrôle | Avant | Après |
| --- | --- | --- |
| Chips animal (accueil, Carnet, feuille pesée) | 42 px de haut | 48 px |
| Chip « + » | 42 × 42 | 48 × 48 |
| « Annuler » des formulaires | 36 px de haut | 48 px |
| « Ajouter un vaccin ou un traitement » (Tout est à jour) | 23 px de haut | 48 px |
| Poignée des feuilles | 96 × 44 | 96 × 48 |
| Croix des feuilles | 44 × 44 | 48 × 48 |
| « Plus tard » (écran d'explication) | 44 px de haut | 48 px |
| « Annuler » / « Remplacer » (confirmation d'import) | 44 px de haut | 48 px |
| « Retirer la photo » (formulaire animal) | 28 px de haut (taille `small`, non mesuré : état avec photo) | 48 px, vers le bas |
| Bouton de nouvel essai du suivi de poids | 36 px de haut (défaut Vuetify, non mesuré : état d’erreur) | 48 px |

Reste sous 48 px : options du sélecteur à boutons (espèce, type, unité), 46 px dans une pilule bordée de
48 px. Au-dessus du minimum de 44 px ; l'agrandir déborderait sur la bordure et changerait l'arrondi.

## 3. Tailles de police

Passés à 12 px le 2026-09-15 (décision de Gaelle) :

| Texte | Avant | Après |
| --- | --- | --- |
| Libellés de la barre du bas (« Accueil », « Carnet », défaut Vuetify 0,6875rem) | 11 px | 12 px |
| Libellés et sous-libellés des stats du Carnet | 11,5 px | 12 px |
| « Poids actuel » | 11,5 px | 12 px |
| Mois sous la courbe | 11,5 px | 12 px |
| Valeurs au-dessus de la courbe (SVG mis à l'échelle de sa carte) | 11 unités, 9,6 à 12,1 px rendus selon la largeur | 12 px rendus à toute largeur |

La taille des valeurs est recalculée par `WeightSparkline` depuis la largeur rendue du SVG.

Police système agrandie, simulée à 130 % (toutes les tailles de police calculées multipliées, comme le
zoom texte de la WebView Android) à 360 × 640 et 412 × 915. Corrigé, sans effet à 100 % :

- titre d'une ligne de rappel, de vaccin ou de traitement : un mot trop long pour la colonne débordait sous
  le badge ; il passe à la ligne (`overflow-wrap: anywhere`) ;
- option du sélecteur à boutons : « Antiparasitaire » était rogné ; une option garde au moins la largeur
  de son libellé ;
- prénom du header du Carnet : les jambages étaient rognés par le `overflow: hidden` de l'ellipse.

Aucun contrôle inutilisable ni texte masqué à 130 % sur les écrans listés au §2.

## 4. Responsive

360 × 640, 412 × 915 et 600 × 1000 : aucun défilement horizontal du document, aucun élément hors écran
(hors rangées défilantes voulues), aucun chevauchement relevé. Le passage à 130 % ci-dessus a été vérifié
aux deux tailles de téléphone.

## 5. Lecteur d'écran

Vérifié sur l'arbre d'accessibilité de Chromium. Déjà en place : boutons icône nommés (Paramètres,
Retour, Modifier la fiche, Ajouter un animal, Fermer, photo de l'animal), titres h1 / h2, feuilles en
`dialog` nommé par leur titre, erreurs de champ reliées par `aria-describedby`, bandeau de retard en
`role="status"`, erreurs d'enregistrement en `role="alert"`, courbe en `role="img"` nommée.

Corrigé :

- **Toast** : la région `role="status"` de Vuetify naît avec le message, et une région créée déjà remplie
  n'est pas toujours annoncée. `AppToast` garde une région masquée visuellement, présente dès le
  lancement, et cache la sienne aux lecteurs d'écran pour éviter la double annonce ;
- **Chips animal** : elles étaient lues comme de simples textes, sans rôle ni état. Sur l'accueil (filtre
  désélectionnable), chaque chip est un bouton à bascule (`aria-pressed`) ; sur le Carnet et la feuille
  pesée (un animal toujours choisi), un bouton radio dans un `radiogroup` (`aria-checked`) ;
- **Ordre de lecture des feuilles** : la poignée « Fermer » était lue avant le titre. Elle est désormais
  dernière dans le DOM (toujours dessinée en haut) et masquée aux lecteurs d'écran quand la croix est
  affichée, qui porte déjà « Fermer » ;
- **Feuilles export et import** : le libellé du groupe de choix était lu deux fois (paragraphe masqué
  visuellement, puis nom du groupe) ; il n'est plus lu qu'en nom du groupe ;
- **Envoi refusé** (formulaires, feuille pesée) : le focus reste sur le bouton et rien n'est annoncé. Le
  focus va au premier champ en erreur, qui lit son message.

## Reste à vérifier sur appareil

- TalkBack : annonce du toast, lecture des chips (bouton à bascule sur l'accueil, radio sur le Carnet et la feuille pesée), ordre de lecture d'une
  feuille ouverte, focus sur le premier champ en erreur après un envoi refusé ;
- Paramètres Android « Taille de police » au maximum et « Taille d'affichage » agrandie : la simulation ne
  reproduit pas exactement le zoom texte de la WebView (hauteurs de ligne en px, icônes) ;
- zones de tap au doigt sur les chips du header, dont la zone agrandie déborde de 3 px sur le header.
