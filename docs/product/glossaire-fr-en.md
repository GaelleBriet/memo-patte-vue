---
tags:
  - perso
  - memo-patte
  - i18n
---

# Glossaire FR → EN

Le français est la langue source, l'anglais est livré en v1. Ce tableau fixe le
terme anglais retenu pour chaque notion du produit : tout nouveau texte le suit,
et une relecture s'y réfère plutôt que de rouvrir le débat.

| Notion (FR)              | Terme EN retenu                  | À ne pas utiliser                        | Note                                                                    |
| ------------------------ | -------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| Carnet (de santé)        | health record                    | logbook, booklet, records tout seul       | `nav.animals` garde « Records » : contrainte de largeur de l'onglet      |
| Animal                   | pet                              | animal                                    | « animal » n'est pas faux, mais froid dans un texte qui tutoie           |
| Chien / chat             | dog / cat                        | —                                         |                                                                         |
| Fiche (de l'animal)      | profile                          | sheet, form, file                         |                                                                         |
| Rappel                   | reminder                         | alert, notification                       | « notification » ne désigne que l'objet Android                          |
| Échéance                 | due date                         | deadline, expiry                          | « En retard » = overdue, « Échéance passée » = due date has passed       |
| Vaccin                   | vaccine                          | vaccination, shot, jab                    | `vaccination` reste le nom du dossier de code, pas du texte              |
| Date d'injection         | injection date                   | vaccination date                          |                                                                         |
| Rappel (vaccin)          | booster                          | reminder, second shot                     | l'injection qui renouvelle un vaccin ; « reminder » reste l'alerte       |
| Traitement               | treatment                        | medication, med                           |                                                                         |
| Vermifuge                | dewormer                         | worming tablet                            |                                                                         |
| Antiparasitaire          | parasite control                 | flea & tick, antiparasitic                | « flea & tick » exclut vers et acariens (tranché par Gaelle, 2026-09-16) |
| Prise / dose             | dose                             | intake                                    |                                                                         |
| Noter une prise          | log a dose                       | record, register, mark as done            | « noter l'injection » = log the injection                                |
| Fréquence                | frequency                        | interval, how often                       |                                                                         |
| Traitements terminés     | Finished treatments              | Stopped treatments, Past treatments       | la liste des traitements arrêtés                                         |
| Pesée                    | weigh-in                         | weighing, weight entry, weight log        | « Ajouter une pesée » = Add a weigh-in, partout                          |
| Poids                    | weight                           | —                                         | kg dans les deux langues, séparateur décimal localisé (`shared/format`)  |
| Poids à l'arrivée        | weight on arrival                | starting weight                           | « starting weight » est réservé au champ `initialWeightKg` du formulaire |
| Suivi de poids           | weight tracking                  | weight monitoring                         |                                                                         |
| Sauvegarde (cloud)       | backup (nom) / back up (verbe)   | save, saving                              | « save » est réservé au bouton Enregistrer d'un formulaire               |
| Restaurer / restauration | restore                          | recover, get back, retrieve               |                                                                         |
| Synchronisation          | sync                             | synchronisation                           |                                                                         |
| Abonnement               | subscription                     | plan, membership                          |                                                                         |
| Plus mensuel / annuel    | Monthly Plus / Annual Plus       | Plus monthly, Plus yearly, yearly Plus    | « /month », « /year » pour les prix, « annual » pour le nom de l'offre   |
| Plus à vie               | Lifetime Plus                    | Plus lifetime, forever Plus               |                                                                         |
| Découvrir (Plus)         | explore                          | discover                                  | « discover » est un gallicisme dans un CTA anglais                       |
| Export / exporter        | export                           | dump, extract                             |                                                                         |
| Import / importer        | import                           | upload, load                              |                                                                         |
| Paramètres               | settings                         | preferences, options                      | « in settings » pour les réglages Android aussi                          |
| Statistiques d'usage     | usage statistics                 | analytics, telemetry                      | mot à mot volontaire : c'est un texte de consentement                    |
| Foyer                    | your pets                        | household                                 | « household » est administratif là où le français est chaleureux         |
| Plus tard (bouton)       | Not now                          | Later                                     |                                                                         |
| Réessayer                | Try again                        | Retry                                     |                                                                         |
| Créer (bouton)           | Create                           | Add, Save                                 | les trois formulaires en création ; « Save » est réservé à l'édition     |

## Ton

Le français tutoie et reste chaleureux ; l'anglais doit être aussi direct, donc
contracté (`isn't`, `couldn't`, `we've`, `you're`) et à la deuxième personne.
Pas de voix passive administrative, pas de « please ».

## Typographie

- **Français** : espace insécable (U+00A0) avant `!` `?` `;` `:` `%` et à
  l'intérieur des guillemets `«` `»`. Un test le vérifie
  (`src/core/i18n/__tests__/locales.spec.ts`).
- **Anglais** : jamais d'espace avant une ponctuation, guillemets courbes `“ ”`,
  apostrophe courbe `’`.
- **Nombres, dates, poids** : jamais formatés à la main dans un composant, tout
  passe par `src/shared/format.ts`, qui suit la langue courante.
