---
tags:
  - memo-patte
  - product
---

# Specs fonctionnelles de la v1

Ce que l'app doit faire, domaine par domaine, écrit avant le code (décision du 2026-09-28 : plus de
développement sans spec validée). Les [principes produit](../principes.md) tranchent quand une spec
hésite ; le schéma qui les porte est dans le
[modèle de données v2](../../technical/modele-de-donnees-v2.md) ; les écrans sont dans les
[maquettes v1](../../design/v1-specs/README.md).

| Spec | Préfixe des règles |
| --- | --- |
| [Traitements](traitements.md) | TR- |
| [Rappels et notifications](rappels.md) | RA- |
| [Vaccins](vaccins.md) | VA- |
| [Animaux et poids](animaux.md) | AN- |
| [Accueil et « À faire »](accueil.md) | AC- |
| [Données : exports, import, sauvegarde](donnees.md) | DO- |
| [MémoPatte Plus et compte](plus-et-compte.md) | PL- |
| [Paramètres et premier lancement](parametres-et-premier-lancement.md) | PR- (premier lancement), PA- (Paramètres) |

## Lire une spec

- Chaque règle porte un numéro stable (« TR-13 », « AC-5 ») et cite sa source entre parenthèses.
- Les décisions sont datées en fin de fichier (« Décisions de la spec »), avec leur raison et
  l'alternative écartée ; « Traitements Q6 » désigne la décision Q6 de la spec Traitements.
- Un ticket cite, dans ses critères d'acceptation, les règles qu'il livre (« TR-14 : une dose non
  renseignée n'est jamais un retard ») : le ticket et ces règles font sa spec.

## Renvois

Les specs renvoient à des documents de démarche (parcours, matrice des fonctionnalités, plan de
livraison, relectures des maquettes) qui restent dans le coffre de notes de Gaelle, hors du dépôt :

| Renvoi | Sens |
| --- | --- |
| « P5 Q1 », « P3 R5 » | Décision Q1 ou règle R5 du parcours 5 ou 3 ; « parcours 5 » renvoie au même document |
| « Sophie (P1) », « P2 » | Les deux personas : P1, cœur de cible de la v1 ; P2, ensuite |
| « G1 » à « G8 » | Décisions de la matrice des fonctionnalités |
| « M1 » à « M8 » | Choix du [modèle de données v2](../../technical/modele-de-donnees-v2.md), dans le dépôt |
| « T1 » à « T8 », « QP1 » à « QP3 », « R9 » | Points techniques, questions produit et risques du plan de livraison |
| « QA-n », « QC-n », « N… », « U… », « planche B · V15 » | Relectures des maquettes des lots A, B et C ; les planches V1 à V27 et D1 à D6 sont dans le dépôt ([`docs/design/v1-specs/`](../../design/v1-specs/README.md)) |
| « planche Q3 » | Planches antérieures des doses quotidiennes, dans le coffre |
| « décision du 2026-09-25 » | Entrée du [journal des décisions](../decisions-log.md), dans le dépôt |
| « #409 » | Ticket GitHub |

Les chemins cités sous la forme `technical/…`, `design/…` ou `product/…` renvoient au coffre de
notes ; seuls ceux qui commencent par `docs/`, et les liens, pointent dans le dépôt.
