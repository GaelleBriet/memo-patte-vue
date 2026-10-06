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
| Ne plus suivre           | stop following                   | archive, unfollow                        | « Ne plus suivre Luna » = Stop following Luna ; distinct de « Supprimer » (delete) |
| Suivre de nouveau        | follow again                     | —                                        | « Suivre Luna de nouveau » = Follow Luna again                          |
| Motif (départ)           | reason                           | —                                        | Décès = Passed away, Chez quelqu'un d'autre = With someone else, Autre = Other |
| Date du départ           | departure date                   | —                                        |                                                                         |
| Rappel                   | reminder                         | alert, notification                       | « notification » ne désigne que l'objet Android                          |
| Soin (accueil)           | reminder                         | care                                     | ce qui est à faire sur l'accueil : « 1 soin en retard » = 1 overdue reminder ; le FR dit « soin », l'EN garde « reminder » |
| Rappels précis           | exact reminders                  | precise reminders                        | seul nom de l'option ; le réglage Android s'appelle « Alarms & reminders » |
| Peut arriver en retard   | may arrive late                  | less precise                             | remplace « Moins précis » (2026-10-06) ; « Peut arriver en retard : les rappels précis sont désactivés » ; Paramètres « Désactivés · tes rappels peuvent arriver en retard » = Off · your reminders may arrive late |
| Échéance                 | due date                         | deadline, expiry                          | « En retard » = overdue, « Échéance passée » = due date has passed       |
| Vaccin                   | vaccine                          | vaccination, shot, jab                    | `vaccination` reste le nom du dossier de code, pas du texte              |
| Date d'injection         | injection date                   | vaccination date                          |                                                                         |
| Rappel (vaccin)          | booster                          | reminder, second shot                     | l'injection qui renouvelle un vaccin ; « reminder » reste l'alerte       |
| Prochain rappel (vaccin) | next reminder                    | valid until                              | texte actuel de l'app ; écart avec « booster » relevé à la relecture du lot B, à régler à part |
| Prévu (vaccin)           | planned                          | pending, up to date                      | vaccin sans injection : « Prévu le 5 oct. » = Planned Oct 5             |
| Maladies (noms de vaccins) | anglais britannique             | leukemia, panleukopenia                  | décision de Gaelle du 2026-10-06 (#283) : carré = distemper, hépatite = hepatitis, parvovirose = parvovirus, leptospirose = leptospirosis, rage = rabies, toux du chenil = kennel cough, leishmaniose = leishmaniosis, typhus = panleucopenia (graphie BSAVA et VMD), coryza = cat flu, leucose = feline leukaemia, chlamydiose = chlamydia |
| Combinaisons courantes   | common combinations              | —                                        | propositions du nom d'un vaccin : « Dans ton carnet » = In your health record, « Déjà utilisé pour Milo » = Already used for Milo |
| Traitement               | treatment                        | medication, med                           |                                                                         |
| Vermifuge                | dewormer                         | worming tablet                            |                                                                         |
| Antiparasitaire          | parasite control                 | flea & tick, antiparasitic                | « flea & tick » exclut vers et acariens (tranché par Gaelle, 2026-09-16) |
| Médicament (type)        | medication                       | —                                        | type de traitement seulement ; « traitement » reste « treatment », jamais « medication » |
| Posologie                | dosage                           | dose                                     | « dose » est la prise ; « ½ comprimé » = ½ tablet                       |
| Période                  | period                           | —                                        | « Aucune prise dans cette période pour l'instant » = No doses in this period yet |
| Première prise le        | first dose on                    | start date                               |                                                                         |
| Heures du traitement     | treatment times                  | —                                        | « Ajouter une heure » = Add a time                                      |
| Date de fin              | end date                         | —                                        |                                                                         |
| Prise / dose             | dose                             | intake                                    |                                                                         |
| Noter une prise          | log a dose                       | record, register, mark as done            | « noter l'injection » = log the injection                                |
| Donnée / oubliée         | given / missed                   | forgotten                                | état d'une prise ; « Toutes données » = All given, « Choisir les jours » = Choose days |
| Non renseignée           | not logged                       | not recorded                             | « 3 doses non renseignées » = 3 doses not logged                        |
| À renseigner             | To log                           | To record                                | groupe et badge de « À faire »                                          |
| Dose du jour             | today's dose                     | daily dose                               | « Dose du jour · 28 sept. à 20 h » = Today's dose · Sep 28 at 8 pm      |
| Prise en plus            | extra dose                       | additional dose                          | « 9 oct. 2026 · Prise en plus » = Oct 9, 2026 · Extra dose               |
| Reportée au …            | postponed to …                   | —                                        | « Reportée au 14 oct. (prévue le 10 oct.) » = Postponed to Oct 14 (was due Oct 10) |
| Décalage (des doses suivantes) | move (following doses moved) | shift                                    | « Doses suivantes décalées · prochaine le 26 oct. » = Following doses moved · next on Oct 26 ; « Décaler aussi les doses suivantes » = Also move the following doses |
| Fréquence                | frequency                        | interval, how often                       |                                                                         |
| Traitements terminés     | Finished treatments              | Stopped, Past, Completed treatments      | les traitements arrêtés ou arrivés à leur date de fin                   |
| Pesée                    | weigh-in                         | weighing, weight entry, weight log        | « Ajouter une pesée » = Add a weigh-in, partout                          |
| Poids                    | weight                           | —                                         | kg ou lb selon Paramètres, séparateur décimal localisé (`shared/format`) |
| Unité de poids           | weight unit                      | —                                         | réglage de Paramètres                                                   |
| Kilogrammes (kg)         | kilograms (kg)                   | kilos, kgs                                | « kg » s'écrit pareil dans les deux langues                              |
| Livres (lb)              | pounds (lb)                      | lbs                                       | « lb » reste invariable au pluriel                                       |
| Poids à l'arrivée        | weight on arrival                | starting weight                           | « starting weight » est réservé au champ `initialWeightKg` du formulaire |
| Suivi de poids           | weight tracking                  | weight monitoring                         |                                                                         |
| Sauvegarde (cloud)       | backup (nom) / back up (verbe)   | save, saving                              | « save » est réservé au bouton Enregistrer d'un formulaire               |
| Sauvegarde cloud         | cloud backup                     | online backup                            | le FR dit « sauvegarde cloud » partout, jamais « sauvegarde en ligne »  |
| Exporter une copie       | export a copy                    | save a copy, back up                     | ouvre le partage d'Android ; « Sauvegarder une copie » écarté en FR (confusion avec la sauvegarde) |
| Effacer les données de ce téléphone | erase this phone's data          | delete, wipe                             | « supprimer » (delete) reste pour un objet ou le compte                 |
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

**Tournures neutres** (Traitements Q12, 2026-09-29) : un texte adressé à la
personne ne s'accorde ni au féminin ni au masculin, puisque l'app ne sait pas qui
tient le carnet (« Pour un rappel à l'heure pile », pas « Pour être prévenue » ;
« la dernière prise certaine », pas « dont tu es sûre » ; « J'ai déjà MémoPatte
Plus », pas « Je suis déjà abonné »). L'app ne connaît pas non plus le sexe de
l'animal : « Chez quelqu'un d'autre », et en anglais le nom (« Luna's »), jamais
« her » ni « his ».

## Typographie

- **Français** : espace insécable (U+00A0) avant `!` `?` `;` `:` `%` et à
  l'intérieur des guillemets `«` `»`. Un test le vérifie
  (`src/core/i18n/__tests__/locales.spec.ts`).
- **Anglais** : jamais d'espace avant une ponctuation, guillemets courbes `“ ”`,
  apostrophe courbe `’`.
- **Nombres, dates, poids** : jamais formatés à la main dans un composant, tout
  passe par `src/shared/format.ts`, qui suit la langue courante ; un poids passe
  par `src/shared/domain/weight-display.ts`, qui suit aussi l'unité choisie.
- **Unités** : espace insécable (U+00A0) entre le nombre et son unité, dans les
  deux langues (`24,5 kg`, `54.0 lb`).
