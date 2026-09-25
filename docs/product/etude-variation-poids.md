---
tags:
  - perso
  - memo-patte
  - poids
---

# Étude : afficher la variation de poids

Pour trancher « +0,3 kg vs août » et le sort de #385, le 25 septembre 2026. Synthèse de sources vétérinaires
publiées, pas un avis vétérinaire.

## En bref

- Le chiffre affiché est **déjà** la variation depuis la dernière pesée. Seul le libellé gêne : « vs août » ne
  dit ni quelle pesée, ni combien de temps s'est écoulé, or les vétérinaires lisent un écart avec sa durée [S3].
- **Recommandation** : même calcul, **daté là où il y a la place** (« +0,3 kg depuis le 25 août »), **sans date
  dans le bandeau du Carnet** (« +0,3 kg »). #385 est gardé et réécrit.

## 1. Le problème

« +0,3 kg vs août » se lit « par rapport au mois d'août », alors qu'il compare à une pesée précise. Avec deux
pesées en août, laquelle ? Sans l'année, « août » peut dater de treize mois. Et le mois ne dit pas si 0,3 kg
s'est pris en une semaine (souvent du bruit) ou en un an (une tendance).

## 2. Ce que fait l'app aujourd'hui

La référence est partout la **pesée immédiatement précédente**, même au bord d'une page de l'Historique.
Exemple : Milo, 24,5 kg le 13 septembre, 24,2 kg le 25 août.

| Écran                              | Texte affiché                                                           |
| ---------------------------------- | ----------------------------------------------------------------------- |
| Carnet, bandeau (colonne Poids)    | `24,5 kg` / `+0,3 kg vs août` ; `Première pesée` ; `—` / `Aucune pesée` |
| Carnet, section « Suivi de poids » | `24,5 kg` · `+0,3 kg vs août` : le même texte une seconde fois          |
| Historique, résumé au repos        | `Poids actuel` · `24,5 kg` · `+0,3 kg vs août`                          |
| Historique, pesée touchée          | `Pesée du 3 févr. 2026` · `17,8 kg` · `+0,8 kg`, sans référence         |
| Historique, liste                  | `13 sept. 2026` · `+0,3 kg` · `24,5 kg`                                 |
| PDF                                | courbe, puis date et poids de chaque pesée, **aucune variation**        |
| Variation nulle                    | `±0,0 kg vs août` dans le Carnet, `±0,0 kg` dans l'Historique           |

Les maquettes récentes (H1, H2, U2) écrivent `+0,3 kg vs 25 août` : c'est #385, en attente sur sa branche.

## 3. Ce qui compte pour la santé

- **Toute variation inexpliquée compte, dans les deux sens** : « Unexplained weight change » est un facteur de
  risque pour la WSAVA [S1] ; pour l'AAHA, celle mesurée « from the pet's previous assessment should prompt an
  extended assessment » [S2].
- **Le repère est un pourcentage.** Une perte est « clinically significant » au-delà de « 10% of their normal
  body weight » chez le chien [S4] ; chez le chat, « Even small decreases in the weight of a feline patient can
  signal a significant underlying disorder » [S6]. 0,3 kg, c'est 1 % d'un chien de 25 kg, 7 % d'un chat de 4 kg.
- **La durée fait partie du calcul** : perte « since last visit » divisée par le « number of wk since last weight
  measurement » ; en régime, 1 à 2 % par semaine chez le chien, 0,5 à 2 % chez le chat [S3].
- **Chat âgé : un signal connu, mais lent.** Dans une colonie de 258 chats, la perte a commencé « about 2.5 years
  before death », et « Gradual weight loss is often overlooked by owners » [S5].
- **Peser chaque mois** : « preferably monthly », chien comme chat [S7].
- **À une semaine d'écart, surtout du bruit chez un grand chien.** Aucune étude trouvée ne chiffre l'erreur d'une
  pesée à la maison. Ordre de grandeur : un chien élimine environ 20 mL d'urine par kilo et par jour [S8], un
  demi-litre pour 25 kg, plus que les « +0,3 kg » affichés. Chez un chat de 4 kg, 0,3 kg en une semaine n'est
  pas du bruit.

## 4. Ce que font d'autres apps

- **11pets** (carnet pour animaux) : une courbe, et des limites que l'utilisateur fixe : « Set the normal limits
  and get warnings when your pet is outside the range » [A1].
- **Whisker** (litière qui pèse le chat) : une courbe « so you can detect subtle changes », calculée sur 7 jours
  de pesées « to determine if a cat's weight has changed » [A2].
- **TrendWeight** (humains, pesée quotidienne) : lisse les pesées, puis « Since last week »… et un rythme « per
  week » [A3], ce que des pesées mensuelles ne permettent pas.
- **Balance Withings Body+** : les 8 dernières pesées et l'écart avec la précédente [A4], **non vérifié** (page
  lue par extrait, accès refusé).

## 5. Les options

Pesée touchée : 17,8 kg le 3 février, 17,0 kg le 20 janvier. Sur un téléphone de 360 dp, la colonne Poids du
bandeau tient environ 17 caractères par ligne (estimé sur les captures de la relecture de #385). La liste garde
`+0,3 kg` partout : sa référence est la ligne du dessous.

| Option                         | Carnet, bandeau                               | Carnet, section         | Historique, résumé          | Pesée touchée                        | PDF                         |
| ------------------------------ | --------------------------------------------- | ----------------------- | --------------------------- | ------------------------------------ | --------------------------- |
| **A** date de la référence     | `+0,3 kg vs 25 août` (2 lignes)               | `+0,3 kg vs 25 août`    | `+0,3 kg vs 25 août`        | `+0,8 kg vs 20 janv.`                | inchangé                    |
| **B** sans date                | `+0,3 kg depuis la dernière pesée` (3 lignes) | idem                    | idem                        | `+0,8 kg depuis la pesée précédente` | inchangé                    |
| **C** variation seule          | `+0,3 kg`                                     | `+0,3 kg`               | `+0,3 kg depuis le 25 août` | `+0,8 kg depuis le 20 janv.`         | inchangé                    |
| **D** tendance sur une période | `+0,6 kg en 3 mois` (limite)                  | `+0,6 kg en 3 mois`     | `+0,6 kg en 3 mois`         | `+0,8 kg`                            | `+0,6 kg en 3 mois` en tête |
| **E** variation et durée       | `+0,3 kg en 3 sem.` (limite)                  | `+0,3 kg en 3 semaines` | `+0,3 kg en 3 semaines`     | `+0,8 kg en 2 semaines`              | inchangé                    |

- **A** (#385). Pour : dit quelle pesée, l'année seulement si elle diffère ; déjà codé et dessiné. Contre : deux
  lignes dans le bandeau, doublon sur le Carnet, « vs » est une abréviation anglaise.
- **B.** Pour : référence sans ambiguïté. Contre : trop long pour le bandeau ; perd la durée, qui sépare le bruit
  d'une tendance.
- **C.** Pour : tient partout, en kg comme en livres (#352) ; plus de doublon. Le signe suffit (une flèche le
  doublerait) et se lit à voix haute. Contre : seul, le bandeau ne dit pas à quoi il compare.
- **D.** Pour : la seule qui montre la perte lente d'un chat âgé [S5]. Contre : **règle métier nouvelle** (quelle
  période ? sans pesée à son début ?), mal servie par des pesées rares, proche des « statistiques avancées » hors
  scope v1.
- **E.** Pour : suit le calcul des vétérinaires [S3]. Contre : arrondi à inventer (jours, semaines, mois), limite
  dans le bandeau.

**Règles métier nouvelles, donc à Gaelle** : le **pourcentage** (`+1,2 %`), langue des vétérinaires [S3] mais
abstrait pour un propriétaire ; une **alerte au-delà d'un seuil** (10 % [S4]), qui serait un conseil de santé,
avec ses fausses alertes (chiot qui grandit, régime prescrit).

## 6. Recommandation

**C dans le bandeau, A ailleurs, formulé « depuis le ».**

| Écran              | Rendu recommandé                                                      |
| ------------------ | --------------------------------------------------------------------- |
| Carnet, bandeau    | `+0,3 kg` · `±0,0 kg` · `Première pesée`                              |
| Carnet, section    | `+0,3 kg depuis le 25 août`                                           |
| Historique, résumé | `+0,3 kg depuis le 25 août` · `±0,0 kg depuis le 25 août`             |
| Pesée touchée      | `+0,8 kg depuis le 20 janv.`, `depuis le 20 déc. 2025` si autre année |
| Liste, PDF         | inchangés                                                             |

En anglais : `+0.3 kg since Aug 25`.

**Pourquoi.** La référence est celle des vétérinaires [S2] [S3] ; il manquait la durée, que la date donne sans
règle nouvelle. Le bandeau garde le chiffre, la section juste en dessous donne la date : plus de doublon ni de
retour à la ligne. « depuis le 25 août » est du français courant et, à ±0,0 kg, dit « stable depuis ».

**Alternative écartée : E**, plus proche du calcul vétérinaire, mais une règle d'arrondi et une maquette pour un
gain faible sur la date. D, le pourcentage et l'alerte restent possibles plus tard.

## 7. Conséquences sur les tickets

- **#385 : garder, réécrire.** Sa branche fait l'essentiel (date, année hors de l'année en cours, pesée touchée
  datée). À changer : bandeau sans date, « depuis le » au lieu de « vs », variation nulle datée hors du bandeau,
  texte construit à un seul endroit avant les livres (#352).
- **Textes** : « {delta} kg depuis le {date} » / « {delta} kg since {date} » ; le bandeau reprend le texte de la
  liste. Mettre à jour `carnet.md` et `poids.md`, noter l'écart avec H1, H2, U2 dans `poids-pages-unite.md`.
- **Maquette** : inutile ici ; nécessaire pour D, E, le pourcentage ou une alerte.
- **Questions à Gaelle** : (1) bandeau sans date ? (2) « depuis le » plutôt que le « vs » des maquettes ?
  (3) variation nulle datée ? (4) pourcentage et alerte à plus tard ? Puis une entrée au journal des décisions.

Hors sujet ici, à garder en tête : le vert d'une prise de poids se lit « bien », l'inverse pour un chien en
surpoids ; et le Carnet ne dit pas de quand date le poids affiché.

## Pour le développement

- Calcul : `src/features/weight/logic/weight-summary.ts` et `weight-history.ts`.
- Texte construit à trois endroits, à réunir avant #352 : `weightStat` (`src/features/animals/views/CarnetView.vue`),
  `describeDelta` (`src/features/weight/views/WeightSection.vue`), `describeRow` et `describeHeadline`
  (`src/features/weight/views/WeightHistoryView.vue`) ; clés `weight.delta.*` de `src/core/i18n/locales/`.
- `formatMonth` (`src/shared/utils/format.ts`) écrit le mois sans l'année ; la branche `origin/feat/poids-vs-date`
  le remplace par `formatDayMonthOrYear` et `nonBreaking`. PDF : `renderWeightSection` dans
  `src/features/settings/logic/render-carnet-pdf.ts`.

## Sources

Consultées le 25 septembre 2026.

- [S1] WSAVA, _Nutritional Assessment Guidelines_ (2011) :
  https://wsava.org/wp-content/uploads/2020/01/WSAVA-Nutrition-Assessment-Guidelines-2011-JSAP.pdf
- [S2] AAHA, _2021 Nutrition and Weight Management Guidelines_, « Nutritional Risk Factors » :
  https://www.aaha.org/resources/2021-aaha-nutrition-and-weight-management-guidelines/nutritional-risk-factors/
- [S3] AAHA, _2014 Weight Management Guidelines for Dogs and Cats_, JAAHA 50(1) :
  https://www.aaha.org/wp-content/uploads/globalassets/02-guidelines/weight-management/2014-AAHA-Weight-Management-Guidelines-for-Dogs-and-Cats
- [S4] VCA Animal Hospitals, « Weight Loss, Abnormal in Dogs » :
  https://vcahospitals.com/know-your-pet/weight-loss-abnormal-in-dogs
- [S5] S. Little, « Weight Loss in Senior Cats », notes de conférence (2013), citant l'étude d'une colonie Nestlé
  Purina : https://www.delawarevalleyacademyvm.org/pdfs/sep13/2WeightLossSeniorCats_2013.pdf
- [S6] A. K. Cook, « Unexplained weight loss in the cat », _Vet Focus_ (Royal Canin Academy) :
  https://academy.royalcanin.com/en/veterinary/unexplained-weight-loss-in-the-cat
- [S7] FEDIAF (fédération européenne des fabricants d'aliments pour animaux), fiches « healthy weight » :
  https://europeanpetfood.org/pet-food-facts/fact-sheets/nutrition/healthy-weight-for-dogs/ et
  https://europeanpetfood.org/pet-food-facts/fact-sheets/nutrition/healthy-weight-for-cats/
- [S8] _Today's Veterinary Nurse_, « Fluid Calculations: Keeping a Balance » :
  https://todaysveterinarynurse.com/internal-medicine/fluid-calculations-keeping-a-balance/
- [A1] 11pets, fonctionnalités : https://www.11pets.com/en/feature
- [A2] Whisker, SmartScale : https://www.litter-robot.com/smartscale
- [A3] TrendWeight, code source ouvert : https://github.com/ervwalter/trendweight
- [A4] Withings, « Body+ - What screens can be displayed on my scale? » (non ouverte) :
  https://support.withings.com/hc/en-us/articles/219027767-Body-What-screens-can-be-displayed-on-my-scale
