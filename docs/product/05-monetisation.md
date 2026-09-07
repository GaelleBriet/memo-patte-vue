---
tags:
  - perso
  - memo-patte
  - monetisation
---


# Monétisation

## Options envisageables
- **Freemium** : attention, source n°1 de frustration identifiée
  chez la concurrence si mal exécuté (voir fiche Medika dans
  01-competitors/). Si retenu, les règles doivent être annoncées
  clairement dès l'installation et ne jamais changer rétroactivement.
- **Achat unique** : modèle utilisé par Medika. Génère de la
  confiance (pas d'abonnement récurrent), mais revenu non récurrent
  et plafonné.
- **Don libre / tip jar** : friction quasi nulle, cohérent avec un
  positionnement confiance, mais revenu très faible à attendre.
- **Abonnement** : nécessite une vraie valeur qui se renouvelle
  (sync cloud multi-appareil, sauvegarde automatique...), sinon
  perçu comme injustifié.
- **Publicité** : à éviter. Aucun concurrent identifié dans l'audit
  ne l'utilise, et plusieurs mettent en avant l'absence de pub comme
  argument de vente. Peu cohérent sur une app de santé animale.
- **Partenariats / affiliation** (assurance, alimentation) : c'est
  le modèle de Mon Compagnon (Solly Azar), mais ça suppose une
  audience déjà existante. Pas adapté en phase portfolio.
- **Vente ou partage de données** : à exclure. Risque RGPD et
  contraire à toute logique de confiance/différenciation sur ce
  créneau.

## Contrainte de cohérence
Le modèle de monétisation choisi doit être cohérent avec le
différenciant retenu dans `04-differenciation.md`. Si le
différenciant est la confiance/transparence, un freemium agressif
serait contradictoire avec le positionnement du produit lui-même.

## Attentes réalistes
Sans budget marketing ni audience existante au lancement, le revenu
réel sera probablement marginal, quel que soit le modèle retenu. La
monétisation ne doit pas être le critère de succès principal de ce
projet (voir `00-vision.md`), le revenu freelance reste la priorité.

## Décision initiale du 2026-08-11 (remplacée le 2026-09-07, conservée pour l'historique)
Achat unique, prix annoncé clairement dès l'installation, qui
débloque l'app en entier — pas de palier caché, pas de limite
artificielle sur le nombre d'animaux.

Règle d'or ajoutée le 2026-09-07 (après lecture de
`recherche-globale.md`) : **on ne verrouille jamais rétroactivement
ce que l'utilisateur a déjà**. Les données saisies restent lisibles
et exportables (JSON, CSV) quel que soit l'état d'achat, et une
fonctionnalité déjà incluse ne repasse jamais derrière un paywall.
Cette formulation laisse la porte ouverte à une fonctionnalité
payante *nouvelle* en v2 (ex. stockage de documents), sans trahir
la promesse : c'est le piège 11pets, contourné par la règle plutôt
que par l'interdiction de toute évolution.

Raisons :
- Découle directement du différenciant retenu dans
  `04-differenciation.md` ("modèle de prix confiance... pas
  d'abonnement") : un abonnement ou un freemium qui débloque au
  compte-goutte contredirait le positionnement choisi.
- Verrouiller le multi-animaux derrière un palier payant est
  exactement le pain point identifié chez 11Pets et Animoo dans
  `03-pain-points.md` — l'un des différenciants retenus est
  justement la vue consolidée multi-animaux. Le proposer en
  option payante annulerait ce différenciant pour la partie de la
  cible qui en a le plus besoin.
- Cohérent avec le retour de Medika en avis positif après achat
  ("après achat à 7,99€ : fantastique, nombre illimité de
  profils") — le modèle qui fonctionne le mieux chez le concurrent
  le plus proche est déjà celui-ci.
- Cohérent avec l'entretien Gaelle (aversion à l'abonnement,
  préférence pour un achat unique "pour un truc qui marche").

Options écartées :
- **Freemium** / **abonnement** : contredisent le principe
  directeur retenu et sont la source n°1 de frustration identifiée
  chez la concurrence (Medika, 11Pets).
- **Don libre** : cohérent avec la confiance mais revenu trop
  marginal, et n'apporte pas de signal clair sur la valeur perçue.
- **Publicité, affiliation, vente de données** : déjà écartés plus
  haut, aucune raison de revenir dessus.

Non tranché à ce stade : le montant exact du prix. À fixer plus
près du lancement, avec 7,99€ (Medika) comme point de repère bas et
13,99€/an-équivalent (Medika en abonnement) comme plafond haut à ne
pas dépasser pour un achat unique.

## Décision du 2026-09-07 : gratuit = local, Plus = cloud

Validée par Gaelle après lecture de `recherche-globale.md` et
discussion des trois chemins possibles (app payante avec essai, v1
entièrement gratuite, hybride avec le cloud comme verrou).

**Règle** : tout ce qui vit sur le téléphone est gratuit, tout ce
qui passe par le cloud est dans MémoPatte Plus.

| | MémoPatte (gratuit, sans compte) | MémoPatte Plus |
|---|---|---|
| Animaux illimités, vaccins, traitements, poids, rappels hors-ligne, accueil consolidé | oui | oui |
| Export JSON/CSV | oui | oui |
| Sauvegarde | Auto Backup Android (best effort, sans photos) | cloud Supabase garanti, restauration à la demande |
| Plusieurs appareils, photos sauvegardées | non | oui |
| Export PDF | non | oui |
| v2 : fiche pet-sitter partageable, documents | non | oui |

**Paiement** : 7,99 €/an ou 24,99 € à vie, même contenu. L'annuel
finance le seul coût récurrent réel (Supabase) ; le « à vie » sert
les personnes qui refusent l'abonnement et vaut environ trois ans
d'annuel, puisqu'il ne finance pas le récurrent.

**Pourquoi ce modèle plutôt que l'achat unique du 11 août** :
- Le coût suit le revenu : un utilisateur gratuit ne touche jamais
  Supabase, donc coûte zéro quel que soit leur nombre. Le tier
  gratuit Supabase tient longtemps ; s'il faut passer à Pro
  (~25 $/mois), une cinquantaine d'abonnés annuels le couvrent.
- Aucun différenciant n'est cassé : pas de limite d'animaux, rappels
  complets, export libre. Le seul verrou est un service qui tourne
  vraiment, pas une fonction locale déguisée.
- Une base gratuite permanente et complète nourrit le bouche-à-oreille,
  seul levier sans budget d'acquisition.
- Ça s'explique en une phrase sur l'écran Plus et la fiche Play Store.

**Ce qui est assumé** : la promesse « aucune donnée jamais perdue »
devient une promesse Plus. Pour les gratuits, l'Auto Backup Android
et l'export libre couvrent l'essentiel sans serveur, et un rappel
doux à exporter ou passer Plus est prévu après quelques semaines.

**Alternatives écartées le 2026-09-07** :
- App payante avec essai de 30 jours puis lecture seule : revenu dès
  la v1, mais la base gratuite s'éteint après un mois.
- V1 entièrement gratuite, monétisation en v2 seulement : refusée,
  Gaelle veut pouvoir couvrir les frais Supabase dès la v1.
- Hybride « gratuit 1-2 animaux » de la recherche : reproduit le pain
  point 11pets/Animoo.
