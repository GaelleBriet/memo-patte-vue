---
tags:
  - perso
  - memo-patte
  - product
---

# Spec fonctionnelle — Vaccins (validée le 2026-09-30)

Suivi : cadrage produit. Sources : [principes](../principes.md) (1, 2), parcours 2, 6, 8, matrice des
fonctionnalités ; spec [rappels](rappels.md) ; décisions du 2026-09-23 (historique complet, raccourcis)
et du 2026-09-24 (modèle « vaccin + injections », tête) ; ticket #283. Une règle marquée **(à
valider)** renvoie à une question ouverte.

## 1. Problème

Le vaccin se fait chez le vétérinaire, qui relance souvent lui-même (entretiens). MémoPatte sert à
garder l'historique sous la main (« le carnet que le vétérinaire consulte », 2026-09-23), à prévenir
assez tôt pour prendre rendez-vous, et à suivre la primo-vaccination d'un jeune animal.

## 2. Objectifs

1. Sophie a pour chaque animal ses vaccins, leur prochain rappel et leur historique complet.
2. Elle est prévenue assez tôt pour obtenir un rendez-vous.
3. Noter une injection en sortant du cabinet prend quelques gestes.

**Hors objectifs** : proposer une date de rappel ou une durée de validité (principe 2 ; la liste de
vaccins ne propose aucune durée) ; calendrier vaccinal imposé ; certificat officiel ou passeport européen.

## 3. Vocabulaire

| Terme | Sens |
| --- | --- |
| **Vaccin** | Ce qui est injecté à un animal, sous le nom que Sophie lui donne (« CHPPi », « Rage »). Un vaccin a une liste d'injections. |
| **Injection** | Un vaccin fait à une date, avec le prochain rappel choisi ce jour-là. |
| **Prochain rappel** | L'échéance choisie à la dernière injection (la « tête »), ou, pour un vaccin encore sans injection, la date du rendez-vous prévu (VA-3) ; peut être vide (« Pas de rappel ») seulement s'il y a une injection (VA-12). |
| **Statut** | « À jour » (rappel à venir), « En retard » (rappel passé), « Pas de rappel », « Prévu le … » (jamais fait, rendez-vous à venir ou du jour). |

## 4. Règles

### 4.1 Créer

- **VA-1** Champs : nom (1 à 80 caractères, texte libre), date de la dernière injection **facultative**,
  prochain rappel (facultatif s'il y a une injection, obligatoire sinon). Sans injection, le prochain
  rappel est la date du rendez-vous ; avec une injection, il se choisit par les raccourcis de VA-6,
  comptés depuis la date d'injection saisie. Bouton « Créer ». (Existant ; #409 ; Q1 ; lot B révisé)
- **VA-2** Un nom déjà présent chez cet animal déclenche « C'est un rappel de Rage ? » : « Oui » ajoute
  une injection au vaccin existant, « Non » crée un autre vaccin, y compris quand le nom vient des
  propositions de VA-4. (Existant ; relecture du lot B, question 15)
- **VA-3** Un vaccin peut être créé **sans injection** encore faite, avec seulement son prochain rappel
  (rendez-vous prévu) : il apparaît dans « À faire » avec prévenance et rappels ; le jour venu, « C'est
  fait » note la première injection et demande le rappel suivant. (Spec Q1, 2026-09-29)
- **VA-4** Le nom se saisit dans un **champ texte avec propositions** pendant la frappe : d'abord les
  noms déjà utilisés dans le carnet, puis les **combinaisons courantes pour l'espèce, nommées par leurs
  maladies** (« Carré, hépatite, parvovirose, parainfluenza »), retrouvables aussi par leurs sigles
  (« CHPPi », « DHPPi », « rage »). Sophie choisit une proposition ou garde son texte, toujours accepté.
  Aucune durée proposée (principe 2). La liste est intégrée à l'app et régénérée à chaque version depuis
  la base publique de l'ANMV (data.gouv.fr, licence CC BY, source citée). Recherche par nom commercial
  (celui du passeport) : piste, après vérification juridique de l'usage des marques. (Spec Q2 ; étude
  `technical/etude-liste-vaccins.md`, 2026-09-29)

### 4.2 Noter une injection

- **VA-5** Depuis « À faire », la feuille du soin ou la fiche : « Fait aujourd'hui » ou « Fait à une
  autre date » (sur la fiche, « C'est fait » et le lien « Fait à une autre date » à côté). (Existant ;
  G2)
- **VA-6** Puis le prochain rappel, par raccourcis sans rien de présélectionné : « Dans 1 mois »,
  « Dans 1 an », « Dans 3 ans », « Autre date », « Pas de rappel ». Le rappel se choisit à chaque
  injection, jamais recopié de la précédente. (2026-09-23, point 4 ; P8 Q2)
- **VA-7** Depuis une notification, « C'est fait » ouvre cette même feuille (date, prochain rappel) ;
  rien n'est noté sans ce choix. (Spec Rappels RA-18)
- **VA-8** Noter une injection retire les notifications de l'échéance et programme celles du nouveau
  rappel. (Spec Rappels)

### 4.3 Historique

- **VA-9** Historique complet, sans limite de durée ; chaque injection avec le rappel choisi ce jour-là
  (« Rappel prévu le 2 juin 2027 », « Sans rappel prévu »). (2026-09-23, point 1 ; relecture du lot B ;
  textes revus le 2026-09-30, sans le verbe « fixer », spec Traitements Q13)
- **VA-10** « Ajouter une injection passée » : demande la date (jamais future ; toute date passée
  acceptée, même avant la naissance, qui peut être approximative) ; l'injection se range à sa place sans
  toucher au prochain rappel. Si elle devient la dernière (vaccin « Prévu » sans injection, ou injection
  plus récente que les autres), elle recopie le prochain rappel en cours ; si ce rappel tombe le jour de
  l'injection ou avant, l'injection l'a fait : l'app demande le rappel suivant, comme « C'est fait »
  (VA-6). Le rappel prévu du vaccin n'est jamais effacé, pour que VA-14 le retrouve. (P2 Q2 ; revue du
  modèle, 2026-09-29 ; 2026-10-07)
- **VA-11** Une injection antérieure à la dernière ne devient jamais la tête. (2026-09-24, §10.3)

### 4.4 Modifier, corriger, supprimer

- **VA-12** « Modifier » : nom, prochain rappel (reporter, ou vider = « Pas de rappel », seulement si le
  vaccin a au moins une injection : un vaccin a toujours une injection ou un prochain rappel, VA-1).
  (Existant ; « Modifier sert aussi à reporter », 2026-09-23)
- **VA-13** Menu ⋮ d'une injection : changer la date, supprimer ; toast « Annuler ». Pour la dernière
  injection, un rappel « dans 1 mois / 1 an / 3 ans » suit la nouvelle date ; un rappel « autre date »
  est redemandé seulement si la nouvelle date l'atteint ou le dépasse. (Existant ; décision du
  2026-09-25, point 2 ; raccourci « Dans 1 mois », P8 Q2, confirmé : relecture de cohérence du 2026-09-30, validé en bloc)
- **VA-14** Supprimer la seule injection garde le vaccin, qui redevient « Prévu » : avec son rendez-vous
  prévu s'il en avait un (VA-10), sinon avec le rappel de l'injection supprimée (« Prévu le 14 mars
  2027 ») ; sans l'un ni l'autre, l'app propose plutôt « Supprimer ce vaccin » (un vaccin sans injection
  ni rappel n'existe pas, VA-1). (Spec Q1, Q5 ; même règle que les traitements, TR-26)
- **VA-15** « Supprimer ce vaccin », dans le menu ⋮ de la fiche, jamais en lien rouge (comme TR-33) :
  confirmation (« Supprimer Rage ? Ses injections et ses rappels seront supprimés du carnet. »), puis
  « Annuler » ; suppression logique en base. (G1 ; lot B révisé)

### 4.5 Affichage

- **VA-16** Section « Vaccins » du Carnet : une ligne par vaccin, statut (« À jour », « En retard »,
  « Pas de rappel », « Prévu le 5 oct. » pour un vaccin jamais fait) et sous-titre (« Prochain rappel le
  14 mars 2027 », « Premier vaccin · aucune injection notée », « Échéance passée »), les retards en
  tête. Le jour du rendez-vous, le Carnet garde « Prévu le 5 oct. » (« Aujourd'hui » seulement dans
  « À faire » et sur la fiche). Le jour du rappel d'un vaccin déjà injecté, le badge dit
  « Aujourd'hui » en ambre, comme la fiche (#600). Animal qu'on ne suit plus : sous-titre « Dernière injection le 12 janv.
  2026 », ou « Premier vaccin · aucune injection notée » pour un vaccin jamais fait, sans badge (plus
  aucun rappel, AN-9 ; relecture de cohérence du 2026-09-30, validé en bloc). (Existant, décisions du 2026-09-09 et 2026-09-16 ; sous-titres : spec Q3 ;
  lot B révisé)
- **VA-17** Fiche : prochain rappel, « C'est fait » et « Fait à une autre date », liste des injections.
  « Prochain rappel » est le seul libellé, y compris pour un vaccin jamais fait. Le jour même, la carte
  dit « Prochain rappel · Aujourd'hui » en ambre ; en retard, « Prochain rappel · En retard depuis le
  5 oct. » (spec Q4). (Existant ; G2 ; relecture du lot B ; lot B révisé)
- **VA-18** « À faire » et notifications : spec Accueil et spec Rappels (prévenance 2 semaines, heure
  commune des vaccins). Dans « À faire », un vaccin jamais fait porte « Prévu le 5 oct. », puis
  « Aujourd'hui » le jour même, en tête des soins du jour (sans heure) ; seconde ligne « Premier vaccin ·
  Pixel ». (Spec Accueil AC-6, AC-8 ; relecture du lot B, questions 5 et 12)

## 5. Données (besoins)

- Vaccin : animal (figé), nom, suppression logique.
- Injection : date, prochain rappel choisi ce jour-là (ou aucun), suppression logique.
- Synchronisé (Plus), exporté (JSON, CSV, PDF avec l'historique regroupé).
- Nom en texte (proposition choisie ou texte libre, VA-4) ; prochain rappel porté par le vaccin tant
  qu'aucune injection n'existe (VA-3).

## 6. Critères d'acceptation (extraits prioritaires)

1. **Étant donné** un CHPPi dont le rappel est le 15 mars, **quand** Sophie touche « C'est fait » le 12
   et choisit « Dans 1 an », **alors** l'injection du 12 mars est notée et le prochain rappel est le
   12 mars de l'année suivante.
2. **Étant donné** la feuille « Fait » d'un vaccin, **quand** elle s'ouvre, **alors** aucun raccourci
   n'est présélectionné, et « Dans 1 mois » est proposé.
3. **Étant donné** un vaccin avec une injection en 2026, **quand** Sophie ajoute une injection passée
   de 2024, **alors** elle apparaît dans l'historique et le prochain rappel ne change pas.
4. **Étant donné** un vaccin « Rage » existant, **quand** Sophie crée un vaccin « Rage » pour le même
   animal, **alors** l'app demande « C'est un rappel de Rage ? ».
5. **Étant donné** la suppression d'un vaccin confirmée, **quand** Sophie touche « Annuler », **alors**
   le vaccin et son historique reviennent, avec leurs rappels.

## 7. Décisions de la spec

- 2026-09-29 — **Q1 : un vaccin peut être créé sans injection**, avec seulement son prochain rappel
  (VA-1, VA-3, VA-14). Raison : même principe que « Première prise le » ; la primo-vaccination d'un
  chaton commence par un rendez-vous (parcours 8). Écartée : injection obligatoire (premier vaccin noté
  seulement après coup, sans rappel). Conséquence : supprimer la seule injection garde le vaccin.

- 2026-09-29 — **Q1 bis : un vaccin jamais fait a le statut neutre « Prévu le 5 oct. »** (VA-16) ; le
  lendemain du rendez-vous sans injection notée, il passe « En retard » (jamais le jour même, TR-11). Raison : « À jour » mentirait (animal pas
  encore vacciné), la date est ce que Sophie veut voir. Écartées : « En attente » sans date ;
  « À jour ». Libellé et couleur à valider sur la maquette.

- 2026-09-29 — **Q2 : en v1, suggestions tirées du carnet** (noms déjà utilisés) ; **une étude est à
  prévoir** pour une vraie liste de vaccins (#283), idéalement incluse en v1 si elle aboutit à temps
  (Gaelle). L'étude doit trouver une source vétérinaire fiable et datée (produits courants par espèce,
  valences, protocoles), dire si la liste porte seulement des noms ou aussi des durées de rappel, et
  comment respecter le principe 2 (ne jamais proposer une date fausse). Écartées pour l'instant : une
  liste de noms non sourcée ; #283 complet sans source.
- 2026-09-29 — **Q2 bis, qui remplace Q2 : la liste de vaccins entre dans la v1** (étude faite le jour même) sous forme de
  propositions dans un champ texte (VA-4), idée de Gaelle : l'utilisatrice ne sait pas toujours quelle
  combinaison est la sienne ; elle tape ce qu'elle a sous les yeux. Pas d'API : la base officielle est un
  fichier republié (irrégulièrement) sur data.gouv.fr ; l'app reste hors ligne, la liste est régénérée
  à chaque version. Écartés : un sélecteur fermé de lignes (l'utilisatrice ne saurait pas laquelle
  choisir) ; des durées proposées (non univoques selon le produit, principe 2) ; les noms commerciaux
  (marques, à vérifier).

- 2026-09-29 — **Q3 : sous-titres des vaccins dans le Carnet** (VA-16) : « Prochain rappel le 14 mars
  2027 », « Premier vaccin · aucune injection notée », « Échéance passée », au lieu de « Valide jusqu'à
  juil. 2027 ». Raison : l'app connaît le rappel saisi, pas la validité, que le vétérinaire écrit
  (rage : `technical/etude-liste-vaccins.md` §1.4) ; principes 1 et 2. Écartée : « Valide jusqu'à »
  (texte actuel, venu de la maquette du Carnet v2, jamais décidé). (Relecture du lot B, question 7.)
- 2026-09-29 — **Relecture du lot B, points validés en bloc** : « Prochain rappel » seul libellé, même
  sans injection (VA-17) ; historique « Rappel prévu le … » / « Sans rappel prévu » (VA-9, textes revus
  le 2026-09-30) ; date
  d'une injection passée jamais future, même avant la naissance (VA-10) ; nom déjà présent : question
  existante « C'est un rappel de … ? » (VA-2). (`technical/relecture-maquettes-lot-B.md`.)

- 2026-09-30 — **Q4 : carte d'un vaccin en retard, « En retard depuis le 5 oct. »** (VA-17). Raison :
  même forme que la carte d'un traitement en retard (TR-10) ; la date du rendez-vous manqué reste
  visible sans passer pour une date à venir. Écartée : « En retard · 1 j » (maquette V11 quinquies), la
  date n'apparaît plus nulle part. (Vérification du lot B révisé, U3.)

- 2026-09-30 — **Lot B révisé, points validés en bloc** : formulaire d'un vaccin avec les raccourcis
  de VA-6 à la place du champ date, « Dans 1 an » compté depuis la date d'injection saisie ; vaccin d'un
  animal qu'on ne suit plus : sous-titre « Dernière injection le … », sans badge (VA-16) ; le jour J, la
  carte dit « Prochain rappel · Aujourd'hui » en ambre ; « Supprimer ce vaccin » dans le menu ⋮ ;
  « Créer » sur les formulaires de création. (`technical/relecture-maquettes-lot-B-rev1.md`.)

- 2026-09-30 — **Q5 : un vaccin qui perd sa seule injection garde un rappel** (VA-14) : son
  rendez-vous prévu s'il en avait un, sinon le rappel de l'injection supprimée. Raison : le rappel vient
  du vétérinaire ; corriger une erreur de saisie ne doit pas le perdre, et le cas le plus courant (vaccin
  créé avec son injection) n'a pas de rendez-vous prévu. Écartée : le rendez-vous prévu seul (le rappel
  disparaît, l'app propose de supprimer le vaccin). (Relecture de cohérence du 2026-09-30 ; plan, R9 ;
  planches B · V12, V11.)

- 2026-10-07 — **Injection passée qui dépasse le rappel en cours** (VA-10) : devenue la dernière le
  jour du rappel en cours ou après, elle demande le rappel suivant, avec les raccourcis de « C'est fait ».
  Raison : recopier un rappel antérieur laissait le vaccin « En retard » sur un rappel déjà fait.
  Écartée : recopier le rappel en cours dans tous les cas (règle d'avant). (Bilan de #575, question 4.)

## 8. Questions ouvertes

Aucune. Spec « Vaccins » validée le 2026-09-30.
