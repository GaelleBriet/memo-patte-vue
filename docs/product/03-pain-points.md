---
tags:
  - perso
  - memo-patte
  - pain-points
---


# Synthèse des pain points

## Règle d'entrée dans ce tableau
Un pain point n'entre ici que s'il apparaît dans au moins deux
sources différentes (un avis Play Store + un entretien, ou deux
entretiens, etc.). Un avis isolé reste une hypothèse à noter dans
la fiche concurrent concernée, pas encore un pattern validé.

## Sources disponibles au 2026-08-11
- Entretiens (3, échantillon réduit) : Claudia, Émilie, Gaelle
  (`02-customer-discovery/entretiens/`)
- Fiches concurrents (7 exploitables) : 11Pets, 2Sire, Animoo,
  DogCat, Medika, Mon Compagnon, ZOOVET
- `01-competitors/divers.md` : avis Play Store non rattachés à une
  app précise (app non identifiée dans le fichier source)
- `appet.md` référencé mais vide (contenu manquant) — non exploité

⚠️ Échantillon entretien très réduit (3 personnes) et contradictoire :
Claudia et Émilie (dont 8 animaux) ne rapportent aucune douleur ni
intérêt pour une app ; seule Gaelle rapporte un oubli réel (rdv
véto raté). Les pain points ci-dessous s'appuient donc surtout sur
les avis Play Store, complétés quand c'est possible par les
entretiens. À lire avec cette limite en tête.

## Tableau de synthèse

| Pain point                                                                                        | Sources                                                                                                                                                                                            | Fréquence observée                               | Gravité perçue                                                                              |
|---------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------|---------------------------------------------------------------------------------------------|
| Rappels qui fonctionnent vraiment = valeur n°1 ("ne plus rien oublier")                           | 11Pets, 2Sire, Medika, ZOOVET (fiches, cité en positif) + divers.md (2 témoignages directs) + entretien Gaelle (oubli faute de rappel fiable)                                                      | Élevée (revient dans presque toutes les sources) | Forte — motif principal de satisfaction quand ça marche, et de désinstallation quand ça bug |
| Fiabilité technique des rappels/notifications (bugs, notifications non reçues, pertes de données) | Mon Compagnon (avis), ZOOVET (avis), divers.md (avis), Animoo (positionnement produit, bugs à ne pas reproduire)                                                                                   | Élevée                                           | Forte — sape la fonctionnalité coeur                                                        |
| Modèle payant perçu comme abusif ou changeant brutalement les règles (freemium → tout bloqué)     | Medika (avis : "devient payant, on ne peut plus rien faire sans payer : bloquant"), 11Pets (avis : abonnement 66€ jugé trop cher), entretien Gaelle (refuse l'abonnement, accepte un achat unique) | Moyenne (3 sources indépendantes)                | Forte — motif de désinstallation ou de rejet avant même l'usage                             |
| Multi-animaux verrouillé derrière un abonnement premium                                           | 11Pets (fiche : gratuit = 1 animal), Animoo (fiche : "animaux illimités" en option payante)                                                                                                        | Moyenne (2 fiches produit)                       | Moyenne                                                                                     |
| Absence de vue consolidée multi-animaux (rappels/infos de tous les animaux d'un coup)             | divers.md (avis : "dommage que je peux pas voir les rappels de tout mes animaux en même temps"), entretien Gaelle (difficile de suivre plusieurs animaux avec des traitements différents)          | Faible-moyenne (2 sources)                       | Moyenne — friction plutôt que blocage                                                       |
| Ergonomie confuse pour saisir une info simple (poids, date de naissance, etc.)                    | Mon Compagnon (avis), 2Sire (parcours testé : "je ne trouve pas où enregistrer le poids"), divers.md (avis : "je tourne dans tous les onglets")                                                    | Moyenne (3 sources)                              | Moyenne                                                                                     |
| Partage du carnet avec pet-sitter/famille perçu comme rassurant                                   | 2Sire (fiche), Animoo (fiche, payant), divers.md (2 témoignages)                                                                                                                                   | Moyenne (3 sources)                              | Faible-moyenne — appréciable, pas un déclencheur d'achat à lui seul                         |
| Export PDF apprécié (utile en visite véto)                                                        | Medika (avis), ZOOVET (absence citée en frustration), Animoo (fonctionnalité payante)                                                                                                              | Faible-moyenne (3 sources)                       | Faible                                                                                      |

## Hypothèses à 1 seule source (à surveiller, pas encore confirmées)
- Impossibilité de saisir une date rétroactive/antérieure au mois en
  cours : rend l'historique inexploitable, un utilisateur dit avoir
  désinstallé pour ce motif (divers.md, 2 témoignages mais dans le
  même document non attribué à une app précise — donc compté comme
  1 seule source au sens de la règle).
- Dépendance à l'adoption de l'outil par le vétérinaire (ZOOVET,
  positionnement produit) — aucun recoupement trouvé côté entretiens
  ou autres avis.

## Point non tranché (clos le 2026-09-07)
Clos : `04-differenciation.md` répond aux deux profils sans choisir (fiabilité + clarté du prix), et le modèle du 2026-09-07 rend le multi-animaux gratuit et illimité pour tout le monde. Texte d'origine conservé ci-dessous.

Le nombre d'animaux seul ne semble pas être le pain (Émilie, 8
animaux, ne rapporte aucune difficulté). Le signal le plus net porte
sur l'absence de vue consolidée une fois qu'un outil est en place,
et sur la fiabilité des rappels plus que sur leur simple existence.
Decision sur le persona prioritaire (désorganisation perso vs
gestion multi-animaux) toujours en attente.

## Prochaine étape
Le tableau contient maintenant 3 lignes confirmées par ≥2 sources
indépendantes dont au moins un avis + un entretien ou deux avis de
provenance différente (rappels fiables, fiabilité technique, modèle
payant). Ça satisfait la barre fixée avant `04-differenciation.md`,
mais avec un bémol : le volet "entretien terrain" de cette validation
repose presque entièrement sur une seule personne (Gaelle). À garder
en tête en abordant la différenciation.
