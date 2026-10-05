# Maquettes de la v1

Maquettes de référence de la v1, validées par Gaelle le 2026-09-30 (révision 2 des trois lots). Chaque
fichier est une page HTML autonome : il s'ouvre dans un navigateur, sans connexion (polices, images et
scripts sont inclus). Les planches donnent leurs textes en français et en anglais.

| Fichier | Planches | Contenu |
| --- | --- | --- |
| [`lot-a-traitements-rappels.html`](lot-a-traitements-rappels.html) | V1 à V9 | Formulaire d'un traitement (créer, modifier, reporter), rappels précis, fiche (périodes, oublis, plusieurs heures), « Choisir les jours », « Donnée quand ? », arrêt, reprise, suppression, notifications |
| [`lot-b-vaccins-animaux-accueil.html`](lot-b-vaccins-animaux-accueil.html) | V10 à V18 | Formulaire d'un vaccin (propositions de noms), vaccin prévu et feuille « Fait », historique d'un vaccin, date approximative et photo d'un animal, « Ne plus suivre », accueil et « À faire », un message à la fois, bienvenue et écran d'explication des rappels |
| [`lot-c-parametres-compte-plus.html`](lot-c-parametres-compte-plus.html) | V19 à V27, D1 à D6 | Paramètres par rubriques (Rappels, Sauvegarde, Mes données), effacement des données, feuille PDF, compte e-mail et Google, inscription et « compte d'abord », écran Plus et restauration, aide et contact, suppression du compte (D1 à D6) |
| [`decaler-doses-suivantes.html`](decaler-doses-suivantes.html) | V28 à V32 | Case « Décaler aussi les doses suivantes » dans « Prochaine dose », « Fait à une autre date » et « Changer la date », ligne de décalage de l'historique et sa suppression, prise en plus (validées le 2026-10-05, voir ci-dessous) |

Les règles que ces écrans appliquent sont dans les [specs](../../product/specs/README.md). Les restes
relevés à la relecture des maquettes (teintes hors jetons, cibles tactiles de 48 px, anglais selon le
[glossaire](../../product/glossaire-fr-en.md)) se règlent dans le code.

## Décaler les doses suivantes (2026-10-05)

Le fichier reprend tout le lot A ; seules les planches nouvelles comptent ici. Il les numérote V9 à
V13, déjà pris par le lot A (V9) et le lot B (V10 à V13) : on les cite sous leur nouveau numéro.

| Dans le fichier | Numéro retenu | Contenu |
| --- | --- | --- |
| V9, V9 bis (« Décaler les doses suivantes : la case dans le formulaire ») | V28, V28 bis | Case sous « Prochaine dose », cochée, décochée, avertissement de date de fin |
| V10, V10 bis | V29, V29 bis | La case dans « Fait à une autre date », à plusieurs heures |
| V11, V11 bis | V30, V30 bis | La case dans « Changer la date » d'une prise et d'un report |
| V12, V12 bis, V12 ter | V31, V31 bis, V31 ter | Ligne de décalage, « Supprimer ce décalage », variante grisée, toasts |
| V13, V13 bis | V32, V32 bis | Prise en plus et son menu |

Corrections à appliquer dans le code (décision du 2026-10-05) : « 9 oct. 2026 · Prise en plus » avec
l'année ; libellé « Prise en plus » ; sous-titre « Jour et heure » de « Changer la date » seulement pour
un traitement à heures ; le menu d'une prise en plus n'a que « Changer la date » et « Supprimer cette
prise ».
