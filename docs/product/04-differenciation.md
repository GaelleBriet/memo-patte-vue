---
tags:
  - perso
  - memo-patte
  - differenciation
---


# Choix de différenciation

À remplir seulement après que `03-pain-points.md` contient des
pain points validés par au moins une source terrain.

Statut : validé par Gaelle le 2026-08-11. Basé sur les pain points
confirmés dans `03-pain-points.md`.

## Différenciants retenus

### 1. Rappels ultra-fiables, y compris hors-ligne
- Pain point adressé : "Rappels qui fonctionnent vraiment" (valeur
  n°1 tous azimuts) + "Fiabilité technique" (bugs, notifs non
  reçues, pertes de données) — les deux pain points les plus
  fortement confirmés du tableau.
- Réalisable en solo : notifications locales natives, pas besoin de
  serveur ni de connexion internet pour la fonctionnalité coeur.
  Complexité technique raisonnable, bon terrain pour montrer un
  soin d'exécution en portfolio (c'est justement ce qui manque à
  la concurrence).

### 2. Vue "tous mes animaux" consolidée dès l'écran d'accueil
- Pain point adressé : absence de vue consolidée multi-animaux
  (divers.md + entretien Gaelle).
- Réalisable en solo : écran d'accueil listant chaque animal avec
  son prochain rappel, pas de complexité technique majeure. Note :
  ce n'est pas "gérer beaucoup d'animaux" qui est le pain (Émilie a
  8 animaux sans souci), c'est l'absence de vue d'ensemble une fois
  qu'un outil est utilisé.

### 3. Saisie rapide, sans réflexion (poids, date, traitement en 2 taps)
- Pain point adressé : ergonomie confuse pour saisir une info
  simple (Mon Compagnon, 2Sire, divers.md).
- Réalisable en solo : travail de design/UX plutôt que de dev
  lourd, cohérent avec l'objectif portfolio (montrer une réflexion
  UX, pas juste du code).

### 4. Modèle de prix "confiance" : règles annoncées dès l'installation, jamais de changement rétroactif, pas d'abonnement
- Pain point adressé : modèle payant perçu comme abusif / freemium
  qui bascule brutalement (Medika, 11Pets, entretien Gaelle).
- Réalisable en solo : c'est un choix de règles commerciales, pas
  une contrainte technique. Cohérent avec `05-monetisation.md` qui
  pointait déjà ce risque avant même les entretiens.

## Différenciants étudiés et écartés

- **Partage pet-sitter / famille** : valeur confirmée par 3 sources
  (2Sire, Animoo, divers.md) mais **contredit `00-vision.md`**
  ("ne doit pas inclure de fonctionnalités de partage entre
  utilisateurs"). Décision de Gaelle le 2026-08-11 : on garde
  l'exclusion telle quelle pour le MVP (comptes liés/permissions =
  complexité disproportionnée pour un portfolio), à reconsidérer en
  v2 seulement si l'app trouve son public.
- **Export PDF** : valorisé (Medika, ZOOVET, Animoo) mais déjà
  proposé par plusieurs concurrents, pas un vrai vide sur le marché
  → candidat feature secondaire (v2), pas un pilier de
  différenciation.
- **Couverture NAC / espèces exotiques** : déjà couvert par DogCat
  et Medika → écarté.
- **Suivi des chaleurs / stérilisation** : mentionné dans
  divers.md mais 1 seule source, pas assez validé → watchlist, pas
  un pilier pour l'instant.
- **Partenariat / affiliation assurance** (façon Mon Compagnon) :
  suppose une audience déjà existante, pas adapté en phase
  portfolio (déjà écarté dans `05-monetisation.md`) → écarté.

## Principe directeur retenu (proposition)
"Le carnet de santé qui ne vous laisse jamais rien oublier — même
avec plusieurs animaux, même hors-ligne — sans jamais changer les
règles du jeu sur le prix."

Cette formulation répond à la question du persona (désorganisation
perso vs gestion multi-animaux) sans trancher entre les deux :
le point commun aux deux profils, confirmé par les données, c'est
la fiabilité des rappels et la clarté du prix — pas le nombre
d'animaux en lui-même.

## Statut
Différenciants et principe directeur validés par Gaelle le
2026-08-11, y compris l'arbitrage sur le partage pet-sitter/famille
(exclu du MVP, candidat v2).
