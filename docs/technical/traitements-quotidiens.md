# Traitements quotidiens, doses non renseignées et date de fin

Spec validée avec Gaelle le 2026-09-28, section par section, après son test d'un vermifuge « tous les
jours » (captures du Carnet, de la fiche et de la feuille « Fait »). Maquette attendue : planches Q1 à
Q9 (Claude Design), qui fixeront les textes et la mise en forme. Elle complète
`proposition-historique-rappels.md` §10, qui reste la référence du modèle « plan + prises + tête ».

## 1. Le problème

Un traitement quotidien, dernière prise le 2 sept., ouvert le 28 sept. :

- la fiche et la feuille « Fait » annoncent « Prochaine dose le 3 sept. », une date passée, et le Carnet
  « En retard · 25 j » ;
- « Fait aujourd'hui » semble remplir la dose du 3 alors qu'il note le 28 ;
- les jours du 3 au 27 ne laissent aucune trace, et rien ne permet de dire s'ils ont été donnés ou
  oubliés ;
- un traitement n'a pas de fin, alors qu'une cure (un vermifuge de 3 à 5 jours chez un chaton) en a une ;
- chaque échéance reçoit trois notifications (J−3, J, J+3) : un traitement quotidien en recevrait trois
  par jour.

Le modèle actuel a été pensé pour des rythmes mensuels, où une échéance manquée est une dose à donner
dès que possible. Pour un rythme court, une échéance manquée est une dose passée, pas une dose à donner.

## 2. Décisions

1. **Dose du moment** : la dernière échéance prévue jusqu'à aujourd'hui inclus. Jamais une date passée
   présentée comme « prochaine dose ».
   - Quotidien, dernière prise le 2, le 28 : « Dose du jour · 28 sept. » (la date, pas « aujourd'hui ») ;
     après la prise : « Prochaine dose · demain, 29 sept. ».
   - Hebdomadaire ou mensuel dont la dose du moment est passée : elle reste « en retard », comme
     aujourd'hui.
2. **Doses non renseignées** : échéances passées couvertes par aucune prise (§4.2). Ce ne sont pas des
   retards : elles ne comptent ni dans le badge « En retard » ni dans le compteur de l'Accueil.
3. **Bandeau** « N doses non renseignées · du … au … », avec « Toutes données » et « Choisir les jours ».
   Il reste tant qu'une échéance non renseignée existe, même après la dose du jour ; il ne disparaît
   jamais seul.
4. **« Choisir les jours »** : on coche les jours donnés, les autres deviennent « oubliée » ; la
   validation annonce le résultat (« Valider : 20 données, 5 oubliées »).
5. **Historique** : une seule liste ; les oublis en gris, regroupés quand ils se suivent. « Dernière
   prise » désigne la dernière prise donnée.
6. **Date de fin** optionnelle, toutes fréquences. Aucune échéance après elle. Le traitement passe seul
   dans « Traitements terminés » quand chaque échéance jusqu'à elle a un état ; sinon il reste en cours
   avec son bandeau. « xx jours » au lieu d'une date : plus tard, si le besoin se confirme.
7. **Carnet et « À faire »** : une ligne par traitement ; le badge dit la dose du moment (« Aujourd'hui »,
   « En retard · 6 j », la date), une seconde ligne dit « 25 doses non renseignées ».
8. **Notifications** : intervalle de moins d'une semaine (tous les 1 à 6 jours), une seule notification
   le jour même à 9 h, sans J−3 ni relance ; les autres rythmes et les vaccins gardent les trois. Rien
   après la date de fin. L'heure de prise est le ticket #447.

Alternatives écartées, dans l'ordre des questions posées : compter les doses non renseignées comme des
retards (c'est ce qui induisait en erreur) ; un bandeau qui disparaît à la première prise notée (on ne
pourrait plus remettre le carnet en conformité le lendemain) ; un seul bouton « laisser non renseigné »
sans état par jour (on ne distingue plus l'oubli du « pas eu le temps de noter ») ; un nombre de prises
au lieu d'une date de fin (ambigu dès qu'une prise est oubliée) ; une relance le lendemain pour un
quotidien (elle tombe le matin de la dose suivante).

## 3. Données

### 3.1 Deux colonnes

- `treatment.end_date` : date civile, `NULL` = pas de fin. Propriété du plan, comme la fréquence.
- `treatment_dose.status` : `'given'` ou `'missed'`, `NOT NULL DEFAULT 'given'`, contrôlé par un
  `CHECK`. Toutes les prises existantes deviennent `given`.

Un jour oublié est une ligne de prise comme une autre : `given_on` = le jour oublié, `next_due_date` et
fréquence recopiée calculées comme pour une prise donnée. La tête (§10.3 de la proposition historique)
reste l'événement le plus récent, donné ou oublié : c'est elle qui fait avancer le calendrier.

### 3.2 Ce qui ne se stocke pas

- **Les doses non renseignées** : calculées (§4.2). Rien à écrire, rien à synchroniser, rien à
  corriger quand une prise change de date.
- **« Terminé » par date de fin** : calculé (§4.3). `stopped_on` garde son sens d'arrêt manuel ;
  l'app n'écrit rien seule en arrière-plan, ce qui évite qu'une écriture automatique gagne à la synchro
  contre une modification faite sur un autre appareil.

### 3.3 Migrations et formats

- **SQLite v9** : `ALTER TABLE … ADD COLUMN` pour les deux colonnes (ajout seul, pas de
  reconstruction). Les déclencheurs d'outbox n'ont pas à changer s'ils ne listent pas les colonnes : à
  vérifier.
- **Supabase** : mêmes colonnes et même `CHECK` sur les tables miroir ; merge avec Gaelle présente,
  comme #383 et #409.
- **Synchro** : les ports des deux tables mappent les nouvelles colonnes ; rien d'autre ne change
  (règle « la modification la plus récente gagne » par ligne).
- **Export JSON v3** : `endDate` sur le traitement, `status` sur la prise. L'import accepte v1, v2
  (`status` = `given`, `endDate` = `null`) et v3. `docs/technical/export-format.md` à jour.
- **CSV** : colonne « statut » sur les prises, colonne « date de fin » sur les traitements (titres
  techniques jusqu'à #416).
- **PDF** : prises données regroupées comme aujourd'hui, oublis regroupés à part (« oubliée : 5, 6
  sept. »).

## 4. Calcul

Un module pur dans `shared/domain/` : le Carnet, « À faire », la fiche, la feuille « Fait » et les
notifications en ont tous besoin, et `features/home` ne peut pas importer `features/treatments`. Il ne
lit jamais l'horloge (le jour est un paramètre, comme `buildReminders`).

### 4.1 Échéances

À partir d'une prise, les échéances sont `next_due_date + k × fréquence recopiée` (k = 0, 1, 2…),
toujours comptées depuis `next_due_date` et jamais de proche en proche (un 31 ne dérive pas vers le 28 ;
`occurrenceDates` de `treatment-reminders.ts` fait déjà ainsi). Aucune échéance après `end_date`.

### 4.2 Écarts entre deux prises

**Une prise couvre la dernière échéance tombée à sa date ou avant.** Pour deux prises consécutives A
puis B (tri de la tête : date, `created_at`, `id`), les échéances de A antérieures ou égales à la date
de B se partagent ainsi : la dernière est couverte par B, les précédentes sont non renseignées. Après
la tête, même règle avec « aujourd'hui » à la place de B, sauf que la dernière échéance est alors la
**dose du moment** et non une échéance couverte. Une fois la date de fin passée, il n'y a plus de dose
du moment : toute échéance jusqu'à la date de fin sans prise est non renseignée.

Exemples :

| Rythme | Prises | Aujourd'hui | Non renseignées | Dose du moment |
| --- | --- | --- | --- | --- |
| quotidien | 1, 2 sept. | 28 sept. | 3 → 27 sept. | 28 sept., aujourd'hui |
| quotidien | 1, 2, 28 sept. | 28 sept. | 3 → 27 sept. | 29 sept., demain |
| mensuel | 2 août, 28 sept. (en retard) | 28 sept. | aucune (le 28 couvre le 2 sept.) | 28 oct. |
| mensuel | 2 juil. | 28 sept. | 2 août | 2 sept., en retard |
| hebdomadaire | 1 sept. | 28 sept. | 8, 15 sept. | 22 sept., en retard |

Conséquences voulues :

- une prise donnée en avance ne crée aucun écart ;
- un report manuel (« Modifier », `next_due_date` de la tête) déplace les échéances suivantes ;
- une fréquence changée ne touche pas les prises déjà notées : chaque paire utilise la fréquence
  recopiée sur sa prise A ;
- corriger la date d'une prise ou en supprimer une recalcule les écarts sans rien écrire ;
- un traitement arrêté n'a ni dose du moment ni bandeau ; à la reprise, la nouvelle prochaine dose est
  écrite sur la tête (§10.4), donc l'écart d'avant l'arrêt n'est pas réclamé ;
- des écarts anciens dans l'historique comptent aussi : le bandeau dit le total et la première et la
  dernière date, « Choisir les jours » les montre tous, par mois.

### 4.3 États rendus

Pour un traitement : la dose du moment (date et statut `overdue` / `today` / `tomorrow` / `later`, ou
aucune si terminé ou arrêté), la liste des dates non renseignées, et `ended` (date de fin passée et
aucune échéance jusqu'à elle sans état). Le Carnet et l'Accueil passent la date de la dose du moment à
`buildReminders` à la place de `nextDueDate`.

## 5. Gestes

| Geste | Écriture |
| --- | --- |
| « Fait aujourd'hui » | une prise `given` à la date du jour (inchangé) |
| « Fait à une autre date » | une prise `given` à cette date (inchangé) |
| « Toutes données » | une prise `given` par date non renseignée, en un seul `runMany` |
| « Choisir les jours » | une prise par date non renseignée, `given` ou `missed`, en un seul `runMany` |
| « Annuler » (toast) | pierre tombale sur toutes les prises du geste, en un seul `runMany` |
| Corriger une prise | date (inchangé), suppression (inchangé), et `given` ↔ `missed` |

Tout ou rien : une écriture interrompue ne laisse pas une partie des jours notés. Le repository des
prises reste le seul à écrire dans `treatment_dose`.

## 6. Notifications

`treatmentReminders` : si la fréquence est en jours et vaut moins de 7, seule la notification du jour
même est programmée pour chaque échéance ; sinon les trois, comme aujourd'hui. Les échéances après
`end_date` ne sont pas programmées. Les échéances passées ne sonnent jamais (déjà le cas). Le plafond
de 400 et la fenêtre de 60 jours ne changent pas : un quotidien sur 60 jours en prend 60, au lieu de 180.

## 7. Tests

- Module pur : tableau du §4.2 et ses conséquences, mois à 31 jours, date de fin, report manuel,
  fréquence changée entre deux prises, prise en avance, écart sur deux mois, plusieurs écarts.
- Repository : `runMany` des gestes groupés et de leur annulation, `status` par défaut, `CHECK`.
- Migration v9 sur une base v8 remplie : aucune ligne perdue, statut `given` partout.
- Import v1 / v2 / v3, export v3, CSV, PDF avec oublis.
- Notifications : quotidien (une par jour), tous les 6 jours, hebdomadaire (trois), date de fin.
- Vues : fiche, feuille, Carnet, « À faire » et compteur, selon les planches Q1 à Q9.

## 8. Découpage proposé

1. **Notifications des rythmes courts** (§6, sans la date de fin) : indépendant, corrige dès maintenant
   les trois notifications par jour.
2. **Données** : migration v9, Supabase, repositories, ports de synchro, export v3 et import, CSV
   (merge avec Gaelle présente).
3. **Calcul** (§4) et **affichage** : dose du moment dans la fiche, la feuille, le Carnet, « À faire »
   et le compteur ; bandeau en lecture seule (planches Q2, Q5, Q6, Q7).
4. **Gestes** : « Toutes données », « Choisir les jours », oubliée ↔ donnée, « Annuler » groupé (Q3,
   Q4).
5. **Date de fin** : formulaire, « terminé » calculé, rappels bornés (Q1, Q8).
6. **PDF** : oublis regroupés.

Puis #447 (heure de prise).
