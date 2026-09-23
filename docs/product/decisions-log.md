---
tags:
  - perso
  - memo-patte
  - decision-log
---


# Journal des décisions

Format : AAAA-MM-JJ — Décision — Raison — Alternative écartée (si
pertinent)

## Historique

2026-08-10 — Choix du principe de départ : exécution propre d'abord,
différenciant décidé après recherche de pain points, pas avant. —
Éviter de construire un différenciant artificiel non validé par du
terrain. — Alternative écartée : partir directement sur une
fonctionnalité "originale" sans validation.

2026-08-11 — Validation de `03-pain-points.md` avec seulement 3
entretiens (échantillon réduit et contradictoire : 2/3 ne
rapportent aucune douleur). Décision de compléter la table avec
les avis Play Store (`01-competitors/divers.md` + fiches
concurrents) plutôt que d'attendre plus d'entretiens. — Gaelle a
choisi d'avancer avec les retours disponibles plutôt que de
retarder le projet. — Alternative écartée : suspendre la synthèse
en attendant 2-3 entretiens supplémentaires. Point de vigilance
laissé ouvert : le volet "terrain" (entretiens) de la validation
repose presque entièrement sur une seule personne (Gaelle) ; le
choix du persona prioritaire (désorganisation perso vs gestion
multi-animaux) n'est pas encore tranché.

2026-08-11 — Validation de `04-differenciation.md` : 4
différenciants retenus (rappels fiables y compris hors-ligne, vue
consolidée multi-animaux, saisie rapide, modèle de prix confiance
sans abonnement). — Choisis parce qu'ils adressent les pain points
les plus fortement confirmés et qu'ils sont réalisables en solo. —
Alternative écartée : partage pet-sitter/famille, pourtant valorisé
par 3 sources terrain, mais contredit `00-vision.md` ("pas de
fonctionnalités de partage entre utilisateurs"). Gaelle a choisi de
garder l'exclusion de la vision pour le MVP (complexité
disproportionnée : comptes liés, permissions), en gardant l'option
ouverte pour une v2 si l'app trouve son public. Le choix de persona
resté ouvert dans `03-pain-points.md` n'a pas été tranché
directement : le principe directeur retenu (fiabilité + clarté du
prix) répond aux deux profils sans forcer un choix.

2026-08-11 — Validation de `05-monetisation.md` : achat unique,
prix annoncé dès l'installation, débloque l'app en entier (pas de
palier multi-animaux payant). — Découle directement du
différenciant "modèle de prix confiance" de `04-differenciation.md`
et évite de reproduire le pain point "multi-animaux verrouillé
derrière un abonnement" (11Pets, Animoo). — Alternatives écartées :
freemium et abonnement, contraires au principe directeur retenu.
Montant exact du prix non fixé, à décider plus près du lancement.

2026-08-11 — Validation de `06-mvp-scope.md` par Gaelle. Phase
préparation produit terminée : les 4 fichiers gate (pain points,
différenciation, monétisation, scope MVP) sont tous validés. Le
projet peut passer en phase technique (stack, architecture, code) —
c'était la seule condition posée dans `CLAUDE.md` pour lever cette
restriction. Restent non tranchés (portés dans le scope) : montant
exact du prix, confirmation explicite que le v1 est en français
uniquement.

2026-08-11 — Choix du stack technique : Flutter (Dart), Android +
iOS dès le départ. — Écarté : React Native (pas d'appétence de
Gaelle pour l'écosystème), Kotlin natif/KMP (pas connu du tout,
et natif seul ne couvre pas iOS sans doubler le travail), app
Vue/Angular packagée en APK via Capacitor (risque élevé sur le
différenciant n°1 "rappels fiables hors-ligne" — les notifications
locales en arrière-plan sont un point faible connu des webviews
packagées, surtout côté iOS ; rendu moins "app native" pour la
valeur portfolio). Flutter dispose d'un plugin mature
(`flutter_local_notifications`) bien adapté au besoin, et Dart est
accessible venant d'un master en dev.

2026-08-11 — Réouverture partielle de l'exclusion "cloud/sync" de
`06-mvp-scope.md` : ajout d'un backup optionnel (Firebase
Auth + Firestore) dans le scope v1. — Raison : en discutant
l'architecture offline-first, le risque de perte totale de
l'historique de santé d'un animal en cas de désinstallation/reset/
changement de téléphone est apparu comme réel et pas couvert de
façon fiable par le seul auto-backup OS. La raison initiale de
l'exclusion ("pas nécessaire pour la fonctionnalité coeur") ne
prenait pas ce risque en compte. — Alternative écartée : export/
import JSON manuel (jugé trop complexe pour l'utilisateur cible) et
serveur auto-hébergé (charge de maintenance disproportionnée pour
un projet solo, alors qu'un BaaS géré comme Firebase couvre le
besoin gratuitement à ce stade). Gaelle a choisi d'inclure ça dans
le v1 plutôt qu'en v1.1, en acceptant l'impact sur le délai.

2026-08-13 — Écart identifié entre `docs/design/PetCare - Ma Vision`
(fichier de design importé, étiqueté "Proposition libre" dans
l'outil) et `06-mvp-scope.md` validé : ce fichier propose une IA à
4 sections (Accueil, Carnet de santé, Documents, Finances) alors que
le scope v1 ne couvre que profil animal + vaccins + vermifuges +
poids. Deux des 4 sections (Documents, Finances) et l'export PDF du
carnet n'existent pas dans le scope validé (l'export PDF y est même
explicitement exclu). — Décision de Gaelle : ne pas rouvrir
`06-mvp-scope.md` maintenant. On construit l'écran d'accueil (et les
suivants) en respectant strictement le scope v1 actuel (vaccins,
vermifuges, poids, multi-animaux), et on met de côté Documents /
Finances / toilettage / RDV comme candidats possibles pour une phase
ultérieure — pas décidé comme acté pour une v2, juste pas écarté
définitivement. `docs/design/PetCare - Ma Vision` reste une
référence de style (couleurs, typo, composants visuels) à réutiliser
pour les écrans du v1, pas un plan de fonctionnalités à implémenter
tel quel.

2026-08-13 — Nom de l'application choisi : **MémoPatte** (repo git :
`memo-patte`). — Piste initiale "Fidèle" écartée pour ambiguïté
("histoire de couple") et parce que la racine "fidèle" entre en
collision fréquente avec l'existant : "Pattes Fidèles" s'est révélé
être un nom commercial déjà utilisé par une entreprise, avec 3
dépôts à l'INPI, et "Fidèlo Pattes" présentait le même risque de
confusion malgré l'orthographe modifiée (réutilisation des deux
mêmes racines). "MémoPatte" est un mot inventé, confirmé libre
(Play Store + INPI), et colle plus directement au différenciant n°1
("rappels ultra-fiables, ne jamais rien oublier") que ne le faisait
"Fidèle" (thème de la loyauté, plus indirect). — Alternatives
écartées : Fidèle, PattesFidèles, FidèleCompagnon, FidèleAmi,
CroqFidèle, Fidèlo Pattes, Vigipatte, Vétali, Griffo.

2026-08-14 — Validation de `docs/technical/01-architecture.md` par
Gaelle : Flutter/Riverpod/Drift/go_router/flutter_local_notifications/
in_app_purchase/Firebase, organisation feature-first (animals,
vaccinations, treatments, weight, home, purchase, backup). Le
document passe de "proposition" à validé, le développement peut
démarrer. Restent non tranchés (non bloquants sauf mention contraire) :
nom exact des tables/colonnes Drift ; comportement si refus de la
permission notifications (à définir avant l'écran d'onboarding) ;
timing du mur d'achat (bloquant avant d'attaquer la feature
`purchase` spécifiquement, sans impact sur le reste).

2026-08-14 — Feature `purchase` mise de côté pour l'instant : Gaelle
priorise les autres épics (animals, notifications, vaccinations,
treatments, weight, home) avant de s'y attaquer. — Pas un
changement de scope, juste un réordonnancement du travail. Le
ticket 7.0 (timing du mur d'achat) reste à trancher avant de
reprendre cette épic.

2026-08-14 — Décision sur le refus de la permission notifications
(point laissé ouvert le 2026-08-14 dans la validation de
`01-architecture.md`) : l'app n'est jamais bloquée si l'utilisateur
refuse. On affiche un écran d'explication *avant* de déclencher la
popup système ("priming"), pour ne pas griller la demande native au
mauvais moment (sur iOS, une fois refusée, seule une redirection
vers les réglages système permet d'y revenir). En cas de refus, un
bandeau discret et persistant sur l'écran d'accueil informe que les
rappels sont désactivés, avec un lien direct vers les réglages
système de l'app. Pas de reprompt automatique périodique. — Raison :
cohérent avec la promesse "achat unique débloque tout" de
`05-monetisation.md` (bloquer l'app créerait un deuxième mur non
prévu) et avec l'esprit "confiance" du produit (pas de harcèlement
via reprompt). L'app reste utilisable comme carnet passif (dates,
poids) même sans rappels actifs. — Alternative écartée : bloquer
l'accès à l'app tant que la permission n'est pas accordée, jugé trop
radical et contraire à l'esprit du produit.

2026-08-14 — Retrait temporaire de `in_app_purchase` du `pubspec.yaml`
(gardé dans le choix de stack de `01-architecture.md`, juste pas
installé pour l'instant). — Découvert en testant le premier build
Android réel (ticket 0.3, sur téléphone physique) : `in_app_purchase_android`
0.5.2 (dernière version dispo sur pub.dev, rien de plus récent) fait
échouer `assembleDebug` (`mergeLibDexDebug` /
`bundleLibRuntimeToDirDebug`) avec Android Gradle Plugin 9.1.0 — la
version prise par défaut par le scaffold Flutter 3.47. Confirmé par
test d'isolation (build échoue avec la dépendance, réussit sans).
Incompatibilité d'écosystème large en ce moment, pas propre à ce
plugin (voir flutter/flutter#175688, fluttercommunity/wakelock_plus#117
sur AGP 9). — Alternatives écartées : downgrader AGP (touche toute la
config Android, risque d'ouvrir d'autres incompatibilités ailleurs) ;
attendre un correctif du plugin (bloquerait tout test sur téléphone en
attendant). Gaelle a choisi l'option la plus réversible : retirer la
dépendance maintenant, la remettre (`flutter pub add in_app_purchase`)
au démarrage de l'épic 7 (`purchase`) — voir note ajoutée sur le
ticket 7.1 dans `02-tickets-v1.md`. Cohérent avec la décision du même
jour de mettre l'épic `purchase` de côté pour l'instant. Point de
vigilance : revérifier à ce moment-là si le plugin ou AGP ont bougé
entre-temps.

2026-08-15 — Gaelle signale que l'app codée (épics 0-3) ne ressemble
pas à `docs/design/PetCare - Ma Vision`, en particulier l'absence de
barre de navigation persistante en bas et la navigation
création/consultation d'animal qui passe par un bouton flottant en
bas à droite plutôt que par le sélecteur d'animal en haut de l'écran
d'accueil, comme sur la maquette. Diagnostic : ni l'un ni l'autre
n'a jamais été ticketé — l'écran d'accueil actuel est le placeholder
explicite du ticket 0.3 (jamais remplacé, l'épic 6 qui devait le
faire n'a pas encore été attaquée) et aucun ticket, dans aucune épic,
ne portait la coquille de navigation globale visible sur les 4
écrans "onglettés" de la maquette (Accueil/Carnet/Documents/
Finances). — Décisions prises pour combler ce trou (détail dans
l'épic 6 de `02-tickets-v1.md`, tickets 6.0 et 6.4 ajoutés) :
1) Reconfirmation que Documents, Finances, "Toilettage"/"RDV" (liste
   "À faire aujourd'hui" de l'accueil) et l'export PDF du carnet
   restent hors scope v1 — cohérent avec la mise de côté du
   2026-08-13 et l'exclusion de l'export PDF actée dans
   `06-mvp-scope.md`. Ces éléments de la maquette ne doivent pas
   être construits, même partiellement.
2) La barre de navigation du bas n'affiche donc que 2 onglets
   (Accueil, Carnet) — pas d'onglets "Documents"/"Finances"
   désactivés ou griffés "bientôt" : seuls les onglets qui mènent à
   quelque chose apparaissent. Alternative écartée : afficher les 4
   onglets de la maquette avec 2 désactivés, jugé plus fidèle
   visuellement mais introduisant de l'UI qui ne mène nulle part.
Gaelle autorise explicitement la création d'un épic si besoin pour
combler ce trou ; pas de nouvel épic créé, le travail est rattaché à
l'épic 6 existant (déjà nommé `home`, périmètre naturel de la
coquille de nav et de l'écran d'accueil) plutôt qu'un épic
supplémentaire pour éviter d'éclater le sujet.

2026-08-21 — Décision de restart technique complet : abandon de Flutter au profit de Vue 3 + Capacitor.
Raison : préférence personnelle forte pour la lisibilité du code et la structure (Dart/Flutter jugés trop imbriqués et difficiles à lire). Le projet est développé en vibe coding avec Claude ; un stack plus lisible améliore fortement la productivité.  Alternative écartée : continuer en Flutter en allégeant la structure (considéré comme un compromis insatisfaisant).

2026-08-21 — Choix du stack front : Vue 3 + TypeScript + Vite + Capacitor 8 + Vuetify 4 + SCSS.
Raison : Vuetify apporte Material Design, transitions et icônes de façon native ; SCSS permet un contrôle fin du design system sans Tailwind. — Alternative écartée : Tailwind (jugé trop utilitaire et moins aligné avec le design Material souhaité).

2026-08-21 — Changement de principe fondamental sur le compte utilisateur : passage de « pas de compte obligatoire » à **compte obligatoire**.
Raison : le risque de perte totale des données (désinstallation, reset téléphone, changement d’appareil) est jugé inacceptable. L’export local a été écarté car trop complexe pour une partie de la cible. — Alternative écartée : backup cloud purement optionnel (trop d’utilisateurs ne l’activeraient pas) et export fichier local.

2026-08-21 — Architecture données retenue : **offline-first hybride**.
- SQLite local (via Capacitor) = source principale pour l’UI et le fonctionnement hors-ligne.
- Supabase (Postgres + Auth) = source de vérité cloud + authentification + synchronisation.
Raison : conserve le différenciant n°1 (rappels fiables hors-ligne) tout en éliminant le risque de perte de données grâce au compte obligatoire. — Alternative écartée : cloud-only (casse l’offline) et offline-only (risque de perte de données).

2026-08-21 — Hébergement backend : Supabase (région Europe).
Raison : Auth + base Postgres + Row Level Security + free tier généreux + simplicité pour un projet solo. Keep-alive simple prévu pour éviter la pause automatique des projets Free. — Alternatives écartées : Neon seul (pas d’Auth), PlanetScale (plus cher, moins adapté), VPS Infomaniak + Dokploy (trop de charge d’infra pour l’instant).

2026-08-21 — Les 4 différenciants produit restent valides, avec reformulation du positionnement « confiance » :
1. Rappels ultra-fiables y compris hors-ligne
2. Vue consolidée multi-animaux
3. Saisie rapide
4. Modèle de prix confiance (achat unique, règles claires)
Le compte obligatoire est désormais présenté comme un argument de sécurité des données, pas comme une friction gratuite.

2026-08-22 — Cible de publication restreinte à Android uniquement.
Raison : simplification du projet (pas de Mac nécessaire, pas de compte Apple Developer, pas de contraintes App Store). iOS devient un possible v2 si l’app trouve son public.
2026-08-25 — Méthode d'authentification (point laissé ouvert dans
`06-mvp-scope.md`) : **email + mot de passe ET Google OAuth**, les deux dès la
v1. — Raison : email/mot de passe ne quitte jamais l'app et ne demande aucune
configuration native, Google OAuth offre la meilleure UX sur Android (le compte
est déjà présent sur l'appareil). Supabase gère plusieurs providers sur un même
compte, donc les deux cohabitent sans migration. — Alternative écartée : magic
link, jugé le plus fragile sur mobile (l'utilisateur quitte l'app vers son
client mail et doit revenir via un deep link, à chaque connexion, avec du réseau
obligatoire à chaque fois). Point de vigilance : Google OAuth impose une
configuration native réelle (Google Cloud Console, empreintes SHA-1 debug ET
release, plugin Capacitor, schéma de redirection) — à vérifier tôt, l'ancien
projet Flutter avait été surpris par une incompatibilité de plugin de ce type
(cf. `in_app_purchase` vs AGP, 2026-08-14).

2026-08-25 — Moment de la demande de compte (point laissé ouvert dans
`06-mvp-scope.md`) : **immédiatement au premier lancement**, précédé d'un écran
d'explication (même principe de « priming » que celui retenu le 2026-08-14 pour
les notifications). — Raison : principalement technique. Autoriser la création
d'un animal avant le compte impose d'écrire une migration anonyme →
authentifié, qui devrait cohabiter avec la file de synchronisation de l'épic 8 ;
c'est une source classique de perte de données, dans une app dont l'argument
central est justement qu'aucune donnée ne sera jamais perdue. Le premier animal
créé serait précisément le seul non protégé. — Alternative écartée : demander le
compte après la création du premier animal (moins de friction à l'installation,
mais complexité et risque disproportionnés).

2026-08-25 — Comportement de la garde de navigation quand la session Supabase
est expirée et l'appareil hors-ligne : la garde vérifie un **drapeau local
persistant « cet appareil a déjà été authentifié »**, et non la validité de la
session Supabase. — Raison : Supabase Auth déconnecte l'utilisateur lorsque les
tentatives de rafraîchissement du token échouent de façon répétée (comportement
documenté). Sans cette parade, une personne en zone blanche plusieurs jours
serait éjectée de son propre carnet de santé, ce qui contredit frontalement le
différenciant n°1 (« rappels ultra-fiables, y compris hors-ligne »). L'app lit
SQLite de toute façon : la session Supabase ne conditionne que la
synchronisation, jamais l'accès aux données locales. — Alternative écartée :
exiger une session Supabase valide (plus simple à coder, mais casse l'usage
hors-ligne). Impact direct sur le ticket 1.3 (garde de navigation).

2026-08-26 — Nouvelles maquettes **v2** pour l'Accueil et le Carnet : elles
deviennent la référence unique d'implémentation, les maquettes v1 passent en
archive (`docs/design/accueil-v1`, `docs/design/carnet-v1`). Spécifications
réécrites d'après les planches livrées dans `docs/design/accueil-v2/accueil.md`
et `docs/design/carnet-v2/carnet.md`, index dans `docs/design/README.md`. — Ce
qui change concrètement : header pétrole plein `#01383E` portant la marque
(« MémoPatte » + « Foyer de … ») au lieu de la salutation et de la date ; une
seule carte par section avec des lignes séparées par des filets, au lieu d'une
carte par rappel ; états vides discrets (ligne « Tout est à jour » + lien
d'ajout) au lieu de grandes cartes illustrées ; bottom navigation pleine
largeur au lieu d'une pilule flottante ; bandeau de stats en 3 colonnes sans
cadre sur le Carnet ; écran de premier lancement plein écran avec l'illustration
de marque et les textes « Bienvenue sur MémoPatte » / « Créer mon premier
animal ». Les états restent au même nombre (5 sur l'accueil, A1→A5 ; 3 planches
sur le carnet, C1→C3, dont une avec photos réelles). Les contraintes v1
conservées : chips à cheval sur le hero, sélection très visible, 2 onglets
seulement, rien hors scope (ni Documents, ni Finances, ni export PDF). Le lapin
« Nala » des maquettes v1 a disparu du jeu d'exemple, ce qui remet les planches
en accord avec la limitation chien/chat de `06-mvp-scope.md`. — Tickets GitHub
concernés : #36, #17, #33, #34, #37, #16, #15, #48, #50, #54 ; les corps
réécrits sont prêts dans `docs/design/tickets-v2/`, restent à appliquer.

2026-08-26 — Ajout des fichiers de logo dans `docs/design/logos/` (icône à
plat, couches background / foreground / monochrome pour l'icône adaptative
Android) et choix de la variante d'illustration : **la patte contenant le chien
et le chat**, la même que sur l'icône, plutôt que la variante « chien + chat sur
fond organique avec feuillages » présente dans le fichier de maquette. — Raison :
l'écran de premier lancement et l'icône installée montrent alors la même image,
ce qui renforce la reconnaissance de la marque au moment où l'utilisateur
découvre l'app. — Point de vigilance technique consigné dans
`docs/design/logos/logos.md` et reporté sur le ticket #50 : les couches livrées
ne sont pas carrées, l'illustration déborde de la zone de sécurité des 66 %, le
background est un squircle détouré sur blanc (coins blancs après masquage) et le
foreground garde un halo de détourage. Ces quatre points doivent être corrigés
avant l'intégration Android, sinon l'icône sera rognée ou cerclée de blanc.

2026-09-07 — Reprise du projet après une pause. Lecture critique de
`docs/product/recherche-globale.md` (benchmark tarifaire FR/US, avis
utilisateurs, segment B2B) au regard des décisions déjà actées. Une
seule recommandation reprise : **l'export libre des données (JSON +
CSV) entre dans le scope v1**, rattaché au différenciant n°4, qui
devient « prix confiance + données jamais otages ». — Raison : c'est
la réponse directe au pain point n°1 documenté du secteur (données
perdues ou verrouillées après changement de modèle, cas 11pets),
elle coûte un ticket (sérialisation de SQLite, aucun serveur) et
rend vérifiable la promesse « jamais de changement rétroactif ».
Nuance par rapport au 2026-08-21 : l'export avait été écarté comme
*mécanisme de sauvegarde* (le compte joue ce rôle) ; il est retenu
ici comme *preuve de portabilité*, les deux décisions coexistent.
Règle d'or ajoutée à `05-monetisation.md` : on ne verrouille jamais
rétroactivement ce que l'utilisateur a déjà, ce qui laisse la place
à une fonctionnalité payante nouvelle en v2 sans trahir la promesse.
— Écarté : export PDF, qui reste en v2 (fonction distincte, mise en
page). Ticket GitHub #80 (`feat(settings): export des données en
JSON et CSV`, 10.3, épic 10).
Restent **à trancher** (recommandations de la même lecture, non
validées) : refus du modèle hybride gratuit/annuel/à vie proposé par
la recherche au profit de l'achat unique déjà acté ; timing du mur
d'achat (proposition : essai complet puis lecture seule + export) ;
montant du prix (proposition : 9,99 €) ; fiche d'urgence, scan IA
et B2B maintenus hors v1.

2026-09-07 — La documentation (`docs/product`, `docs/design`,
`docs/technical`, `docs/tickets-v2`) et `CLAUDE.md` sont désormais
versionnés dans le dépôt. — Raison : travail sur plusieurs machines,
et la doc fait partie du portfolio (recherche produit → code). —
Restent hors dépôt : les notes d'entretien nominatives
(`02-customer-discovery/entretiens/`, dépôt public, personnes
privées), les bundles HTML interactifs des maquettes (> 1 Mo,
générés ; les PNG et les specs suffisent), et l'empreinte SHA-1 du
keystore debug retirée de `google-oauth-setup.md`. `docs/` est
ajouté à `.prettierignore` pour que lint-staged ne reformate pas les
fichiers Obsidian.

2026-09-07 — Politique git assouplie pour l'agent : Claude peut
committer et pousser lui-même **sur une branche dédiée**. Restent
interdits : tout commit ou push sur `main`, la création de PR, le
merge, le tag, la réécriture d'historique. Les PR restent créées et
mergées par Gaelle. — Raison : fluidifier le vibe coding sans perdre
le contrôle de l'intégration. Consigné dans `CLAUDE.md`.

2026-09-07 — Suppression de `docs/tickets-v2/` : les corps de tickets
étaient tous déjà appliqués sur GitHub (vérifié issue par issue), et
GitHub est la seule source de vérité des tickets. Plus aucun ticket
ne sera rédigé dans la doc.

2026-09-07 — **Monétisation v1 : « tout le local est gratuit, seul le
cloud est payant ».** Remplace l'achat unique du 2026-08-11 et le
compte obligatoire du 2026-08-21. MémoPatte (gratuit, sans compte) :
animaux illimités, vaccins, traitements, poids, rappels hors-ligne,
accueil consolidé, export JSON/CSV, Auto Backup Android sans photos.
MémoPatte Plus (7,99 €/an ou 24,99 € à vie, même contenu) : compte,
sauvegarde cloud Supabase, restauration, multi-appareil, photos
sauvegardées, export PDF (déplacé de v2 vers Plus v1). — Raison : le
coût suit le revenu (un gratuit ne touche jamais Supabase), aucun
différenciant n'est cassé (pas de limite d'animaux, rappels complets,
export libre), l'annuel paie un service qui tourne vraiment, la base
gratuite permanente nourrit le bouche-à-oreille. Assumé : la promesse
« aucune donnée jamais perdue » devient une promesse Plus ; pour les
gratuits, Auto Backup Android + export libre + rappel doux. —
Alternatives écartées : app payante avec essai 30 jours puis lecture
seule (base gratuite qui s'éteint) ; v1 entièrement gratuite avec
monétisation en v2 (Gaelle veut couvrir Supabase dès la v1) ; hybride
« 1-2 animaux gratuits » (pain point 11pets/Animoo). — Conséquences :
le compte n'est plus demandé au premier lancement (rouvre le
2026-08-25) ; à la souscription, envoi complet de la base locale vers
le compte ; « jamais d'abonnement » devient « jamais de fonction
locale derrière un abonnement ». Non tranché : import JSON (v1 ou
v1.1), comportement à l'expiration de l'abonnement. Tickets à
retoucher : épic 1 (#6 à #8), #40, #41, #43 à #47, #48 (fait le
2026-09-07, #45 devient l'écran Plus) ; tickets créés : #81 export PDF
(10.4), #82 Auto Backup Android (0.4), #83 envoi initial des données
locales à la souscription (8.6).
Prix remplacés le 2026-09-15 : 1,49 €/mois, 9,99 €/an ou 29,99 € à vie (voir
l'entrée « MémoPatte Plus en trois offres »).

2026-09-07 — Compléments à la décision monétisation, validés par Gaelle :
**multi-appareil dans Plus dès la v1** (implique un pull dans la sync,
#39 révisé : UUID + `updated_at` par ligne, la modification la plus
récente gagne, pas de temps réel) ; **import JSON en v1** (#84, 10.5,
filet gratuit pour qui n'a pas Plus) ; **langues v1 = français et
anglais** (l'i18n est déjà en place). — Photos : convention
`files/photos/` exclue de l'Auto Backup Android, bucket Supabase
Storage privé `animal-photos` avec RLS par utilisateur (#85, 8.7),
détail dans `docs/technical/01-architecture-v2.md`. Règles Auto Backup
écrites dans `android/app/src/main/res/xml/` et documentées dans
`docs/technical/auto-backup-android.md` (#82 reste ouvert pour la
vérification sur appareil). — Ménage doc : `01-architecture-v2.md.md`
renommé, point persona de `03-pain-points.md` clos, ligne de prix
obsolète de `05-monetisation.md` marquée, index `docs/design/README.md`
créé. Restent à trancher : comportement à l'expiration de
l'abonnement, déclencheurs du rappel doux vers Plus, jeu d'icônes (#70).

2026-09-07 — Conformité Google Play et RGPD : recherche documentée
dans `docs/technical/conformite-play-store-rgpd.md` (politique de
confidentialité rédigée, tableau Data safety, procédure de suppression
de compte, check-list avant publication). Conclusions retenues : la
santé animale n'est ni « Health info » au sens Play ni donnée de santé
au sens de l'art. 9 RGPD ; pas d'AIPD ; registre des traitements à
tenir malgré la micro-entreprise ; PostHog en opt-in strict sur EU
Cloud ; Supabase en région UE avec RLS partout ; suppression de compte
obligatoire dès que Plus existe. — Tickets créés : #86 (11.6, politique,
page de suppression, déclarations Play Console), #87 (1.6, suppression
du compte via Edge Function), #88 (11.7, registre, DPA, paramétrage
prestataires). Exigences ajoutées à #10, #45, #47, #48, #66, #67.
Non vérifié, à trancher avant publication : affichage de l'adresse
postale sur Play pour un compte personnel, date de création du compte
Play (test fermé 12 × 14 jours), durées de conservation.

2026-09-07 — Plugins de billing : comparatif documenté dans
`docs/technical/billing-plugins-capacitor.md` et résumé dans #43.
Recommandation : `@revenuecat/purchases-capacitor` (Capacitor 8 et
Billing Library 8 vérifiés, entitlement unique pour l'annuel et le
« à vie », statut et restauration gérés, gratuit à l'échelle du projet),
repli `@capgo/native-purchases` + vérification maison sur Supabase.
**Choix non encore acté par Gaelle.**

2026-09-07 — Billing : **RevenueCat** (`@revenuecat/purchases-capacitor`)
retenu par Gaelle après comparaison avec Capgo, Adapty, Purchasely et
l'option Stripe. — Raison : le seul pont mature vers Play Billing qui
couvre les deux produits sous un droit unique, avec statut, restauration
et vérification serveur incluses ; Adapty est équivalent mais son SDK
Capacitor a un mois ; Capgo laisse l'app faire confiance au téléphone
sans date d'expiration ; Purchasely n'a ni plugin Capacitor ni offre
gratuite ; Stripe imposerait d'être marchand (TVA OSS, litiges) pour
aucune économie de commission. — RGPD : RevenueCat est un sous-traitant
hébergé aux États-Unis sous clauses contractuelles types, pseudonymisé
au maximum (UUID Supabase seul, pas d'email, pas d'identifiant
publicitaire ni d'IP), initialisé uniquement à l'ouverture de l'écran
Plus pour qu'un utilisateur gratuit ne génère jamais de donnée chez
lui ; ajouté à la politique de confidentialité et à Data safety (#86),
supprimé avec le compte (#87). Pas d'intégration serveur RevenueCat →
PostHog, qui contournerait le consentement (#66). — Tickets : #43 acté,
#44, #45 mis à jour, #89 créé (9.5, webhook → `plus_entitlements`,
RLS de la sync). Le choix est réversible : les achats vivent chez
Google, changer de prestataire se résume à un plugin et un webhook.
Reste à faire avant tout code de l'épic 9 : un build Gradle avec le
plugin sur une machine équipée du SDK Android.

2026-09-07 — Trois derniers points tranchés par Gaelle avant le code :
1) **Icônes : Material Symbols Outlined en SVG, icône par icône**
(`@material-symbols/svg-400`, jeu Vuetify personnalisé), `@mdi/font`
retiré. — Raison : fidélité aux maquettes v2 (icônes `vaccines`,
`pest_control`, `monitor_weight` sans équivalent mdi), bundle limité aux
icônes utilisées, rien chargé depuis Google Fonts à l'exécution. —
Écarté : garder mdi et retraduire (infidèle), la police Material
Symbols complète (plusieurs Mo). #70 n'a plus de point bloquant.
2) **Expiration de l'abonnement** : grâce = accès conservé + bannière
paiement unique ; expiré ou account hold = sync coupée, local intact,
bannière unique, « Réactiver Plus » dans Paramètres ; cloud conservé
tant que le compte existe, purgé après 12 mois sans sync avec email un
mois avant (durée à confirmer en 11.7). Détail dans #43.
3) **Rappel doux vers Plus** : déclencheurs de valeur (première photo,
deuxième animal ou dixième entrée, premier export) plus un seul
déclencheur temporel à 30 jours ; un rappel par déclencheur, 30 jours
minimum entre deux, jamais modal, « Ne plus me le proposer » définitif.
Détail dans #45.
Reportés volontairement après le code, à reprendre avant publication :
affichage de l'adresse postale sur Play pour un compte personnel, date
de création du compte Play (test fermé 12 × 14 jours), durées de
conservation (12 mois sauvegarde, 13 mois analytics).

2026-09-07 — Les rôles Vuetify `error`, `warning` et `success` reçoivent
une palette dédiée, distincte des couleurs d'urgence métier `overdue`,
`today` et `soon`. — Raison : une erreur de saisie n'est pas un vaccin en
retard, et les deux peuvent apparaître sur le même écran ; réutiliser la
même teinte brouillerait la lecture de l'urgence, qui doit se faire en
moins d'une seconde. Valeurs et contrastes (tous ≥ 4,5:1, WCAG AA) dans
`docs/design/accueil-v2/accueil.md`, section « Rôles système (hors
maquette) ». — Alternative écartée : garder l'alias des couleurs
d'urgence, retenu faute de mieux à l'implémentation de #70. `info` et
`secondary` restent non définis, faute d'usage.

2026-09-08 — **Chaque logique est testée là où elle vit**, pas dans un
module générique de calcul de dates. Le ticket 2.4 (#13) est fermé : son
critère « tests sur la logique de calcul des dates de rappel » ne pouvait
pas être satisfait dans `core/notifications`, qui reçoit un `Reminder`
déjà daté et dont le service est par ailleurs couvert par 12 tests (mock
du plugin Capacitor inclus, livrés avec 2.1). Ce critère devient un
critère d'acceptation explicite de 4.5 (#23, échéance d'un vaccin) et de
5.5 (#28, échéance récurrente et reprogrammation après une prise). —
Raison : le calcul dépend du domaine (une échéance de vaccin et une
fréquence de vermifuge n'ont pas la même règle), le factoriser dans
`core/` reviendrait à inventer une règle métier que la spec ne donne
pas. — Alternative écartée : garder #13 ouvert comme rappel jusqu'à ce
que le calcul existe, ce qui aurait laissé un ticket sans travail
réalisable pendant deux épics.

2026-09-08 — **La photo d'animal sort du ticket 3.2** (#15, création de
profil) vers un ticket dédié 3.7 (#101) : Photo Picker Android sans
`READ_MEDIA_IMAGES`, copie sous `files/photos/` en `Directory.Data`,
suppression de l'ancien fichier au remplacement, redimensionnement avant
écriture. La colonne `animal.photo_path` et le champ Zod `photoPath`
existent déjà depuis 3.1, il n'y a pas de migration. Sans photo, le
dégradé de couleur par animal prévu par les maquettes v2 reste le rendu
par défaut. — Raison : c'est un travail de permissions et de système de
fichiers, qui se vérifie sur appareil réel comme #82 ; le garder dans
3.2 en aurait fait le plus gros ticket de l'épic et aurait bloqué 3.3 et
3.4, qui n'attendent que la liste des animaux. — Alternative écartée :
tout livrer dans 3.2.

2026-09-08 — **Un store Pinia `animals.store.ts`** (3.6, #100) devient le
seul point de consommation de `animals.repository.ts` côté UI : liste des
animaux vivants, animal sélectionné partagé entre l'accueil (filtre,
`null` = tous les animaux) et le Carnet (toujours un animal actif),
états de chargement et d'erreur pour que l'état vide A5 ne clignote pas
au démarrage. — Raison : 3.2, 3.3, 3.4, 7.2 et 7.4 ont tous besoin de la
même liste ; sans ce ticket, le premier écran livré imposait sa forme aux
quatre autres. — Alternative écartée : laisser 3.2 créer le store au
passage. Les stores des épics 4, 5 et 6 ne sont **pas** créés par
symétrie : `01-architecture-v2.md` ne prescrit pas un store par feature,
et c'est le Carnet (3.4, #17) — premier écran à afficher vaccins,
traitements et poids ensemble — qui dira s'il faut un store par domaine
ou un seul store « carnet de l'animal consulté ».

2026-09-08 — **Quatre décisions prises par Gaelle à l'issue du lot 2**,
chacune posée en question avec recommandation avant d'être implémentée.

1) **Palette des dégradés d'avatar : six entrées.** Les deux relevées au
pixel sur les maquettes v2 (Milo fauve `#D1A378 → #C58D63`, Luna gris
ardoise `#B8BEC6 → #A2A9B3`) plus quatre construites sur la même
géométrie — deux tons voisins d'une teinte douce, clair vers foncé,
angle 160° : rosé, olive, bleu, mauve. — Raison : le scope v1 ne limite
pas le nombre d'animaux, et au-delà de deux, des avatars identiques
annulent l'intérêt du dégradé, qui sert à distinguer d'un coup d'œil. —
Alternative écartée : n'expédier que les deux dégradés de la maquette et
faire tourner la palette dessus, plus fidèle mais deux animaux auraient
pu être visuellement identiques dans la rangée de chips. Les valeurs
vivent dans `src/shared/animal-avatar-gradient.ts` ; aucun test ne fige
de valeur hexadécimale, la palette reste donc modifiable à une constante
près.

2) **La suppression d'un animal marque aussi son carnet.**
`animals.remove()` marquera les vaccins, puis les traitements et les
pesées, avec `deleted_at`, dans une transaction. — Raison : c'est la
seule option qui rende la propagation Plus correcte. Sans elle, le
tombstone de l'animal se propage mais pas celui de ses enfants, et le
jour où une purge effacerait physiquement les animaux tombstonés, le
`ON DELETE CASCADE` supprimerait des lignes `vaccination` que le cloud
tient encore pour vivantes — résurrection au prochain pull. — Alternative
écartée : une jointure sur `deleted_at IS NULL` à chaque lecture, moins
coûteuse aujourd'hui mais que chaque futur écran devrait penser à
écrire, en laissant le cloud incohérent. À implémenter dans 3.3 (#16),
pas dans 4.1 (#19) : le comportement appartient au repository des
animaux.

3) **Contrat du store animals : `load()` ne lève pas, les écritures
lèvent.** `create`, `update` et `remove` propagent leur erreur ; `load()`
la range dans `store.error` pour une bannière. — Raison : TypeScript
n'oblige jamais à lire une valeur de retour, donc
`await store.create(input); router.back()` compilait et naviguait sur un
échec ; et `error` étant un état global, deux opérations en vol
pouvaient faire afficher l'erreur de l'autre. Les écrans de formulaire
ont de toute façon besoin d'un `try/catch` pour rester sur le
formulaire. — Alternative écartée : garder les quatre actions
non-levantes, qui évitait tout `try/catch` mais laissait passer les
échecs d'écriture silencieusement.

4) **Point de composition des repositories : une fabrique paresseuse
dans le repository, appelée depuis `main.ts`.** `getAnimalsRepository()`
est exportée par `animals.repository.ts` — seul fichier avec `core/` que
la règle ESLint `app/repository-only-data-access` autorise à ouvrir la
base — et `main.ts` appelle `provideAnimalsRepository(...)`. — Raison :
la composition reste là où l'architecture la place, le store ne connaît
que le type de son repository, et les tests gardent leur double. —
Alternative écartée : un registre de repositories dans `core/db/`, qui
ferait connaître les features à `core/`, à rebours de l'architecture.
Ce motif vaut pour les quatre repositories suivants. Piège à ne pas
reproduire : mémoïser `getDb().then(...)` mettrait en cache une promesse
**rejetée** et annulerait le réessai documenté de `sqlite.ts:29` — le
cache doit revenir à `null` sur rejet.

2026-09-08 — **Six dernières décisions du lot 2**, posées une par une à
Gaelle après les revues croisées.

5) **Le rattachement d'un vaccin à son animal est figé à la création.**
`animal_id` sort du `SET` de `vaccinations.repository.update`, et
`animalId` est exclu du type d'entrée (`vaccinationUpdateSchema`), pour
que le compilateur refuse le champ au lieu de l'avaler. — Raison : la
capacité n'était pas demandée par le ticket 4.1, et elle rendrait
incohérent un rappel déjà programmé quand 4.4 (#22) branchera les
notifications — le rappel resterait attaché à l'ancien animal. Corriger
une saisie sur le mauvais animal coûte deux taps (supprimer, recréer),
ce qui reste dans le différenciant « saisie rapide ». — Alternative
écartée : garder le déplacement avec un test, et charger #22 de
reprogrammer le rappel. Le type d'entrée est exclu plutôt que documenté
« ignoré » parce que le formulaire de 4.2 (#20) se construira sur ces
types : un champ présent dans le type serait apparu dans l'écran.

6) **`AnimalChipSelector` garde son décalage à cheval, mais sans
conditions cachées.** Le composant crée son propre contexte de
formatage pour que sa marge négative ne puisse plus fusionner avec celle
du parent, et rend son empilement explicite au lieu de compter sur
l'absence de contexte chez le header. — Raison : le composant est utilisé
à l'identique sur l'accueil et le Carnet ; sortir le décalage vers les
écrans le dupliquerait, et le premier qui l'oublierait casserait la
maquette. On supprime les conditions cachées plutôt que de les déplacer.
— Alternative écartée : confier le décalage aux écrans appelants.

7) **`mandatory` reste à `true`, c'est le JSDoc qui est corrigé.** Le
composant ne promet plus « il y a toujours un animal actif » mais « la
désélection est impossible ; c'est à l'écran de fournir un animal
actif ». — Raison : dans Vuetify 4, seul `'force'` sélectionne d'office
le premier élément ; l'employer ferait choisir l'animal consulté par un
composant de `shared/` qui ne connaît rien au métier, soit une décision
produit déguisée en détail technique. Le Carnet, lui, sait toujours quel
animal il consulte. — Alternatives écartées : passer à `'force'`, ou
ajouter un avertissement console en développement.

8) **La zone de gestes Android reste définie dans `_tokens.scss`.**
`$padding-bottom-nav: 22px` demeure la source ; le TypeScript de la
bottom nav la recopie, avec le commentaire qui relie les deux. — Raison :
Vuetify fait `Number(props.height)` et s'en sert pour décaler `VMain`,
donc le total doit exister comme nombre JS — la recopie est inévitable,
seul son domicile est en jeu. `_tokens.scss` est le domicile documenté
de la géométrie, et cette valeur reviendra ailleurs (marges basses,
feuilles modales) : la loger dans un composant la rendrait introuvable.
— Alternative écartée : faire du TS la source et supprimer le token. À ne
surtout pas faire : garder le token **sans** l'utiliser, ce qui rendrait
la duplication silencieuse.

9) **`PRAGMA foreign_keys = ON` sera activé explicitement** dans
`openDatabase()` (ticket #103). — Raison : le plugin l'active déjà de
lui-même à chaque ouverture (`Database.java:282-284`, avant
`onUpgrade`), donc la contrainte est réellement appliquée aujourd'hui —
mais la garantie est empruntée à un détail d'implémentation qu'une
montée de version pourrait retirer en silence, et le code de production
est la seule des deux couches à ne pas la déclarer (les tests, eux,
activent le PRAGMA à la main). — Alternative écartée : un simple
commentaire documentant la dépendance.

10) **Le poids du chunk d'entrée est assumé jusqu'à mesure sur
appareil.** Brancher le store fait entrer `@capacitor-community/sqlite`
dans le bundle initial : 268 → 364 kB (97 → 124 kB gzip). — Raison :
dans une app Capacitor le bundle est local, pas téléchargé — le surcoût
est du temps de parse, pas du réseau — et l'app a besoin de SQLite dès
le premier écran. Optimiser sans mesure serait deviner. À vérifier avec
les autres tests sur appareil (#82, zone de gestes). — Alternative
écartée : un import différé dans `main.ts`, qui aurait été recopié par
les quatre repositories suivants sans qu'on sache s'il sert.

2026-09-08 — **La version 1 des migrations a été amendée** (ajout de
`animal.deleted_at`) au lieu d'ajouter une v2. — Raison : aucune base
installée n'était encore en version 1, une migration v2 n'aurait mis à
jour aucun appareil réel. — Alternative écartée : une migration v2, qui
aurait laissé une entrée vide dans l'historique du schéma. La règle
reste inchangée pour la suite : une version publiée ne se modifie plus.

2026-09-08 — **Un service de cas d'usage peut orchestrer les repositories
de plusieurs features** (`xxx.service.ts`, placé dans la feature qui
porte le cas d'usage) ; un composant, un store ou un repository, jamais.
La cascade logique de suppression (#102) vivra donc dans
`src/features/animals/animal-deletion.service.ts`, et chaque repository
enfant gagnera un `markDeletedByAnimal()` : il reste le seul à écrire
dans sa table, le service n'écrit aucun SQL. — Raison : l'interdiction
absolue d'import croisé ne laissait que des mauvaises sorties pour une
app d'un seul dev, jamais destinée à être découpée en paquets — un
`core/` qui dépend des features, ou une interface de contrat dans
`shared/` avec du câblage dans `main.ts` pour ce qui est un appel de
fonction. La règle qui paie vraiment — un seul fichier connaît les
colonnes d'une table — est conservée et rendue explicite. —
Alternatives écartées : le trigger SQLite `AFTER UPDATE ON animal`,
impossible à oublier mais invisible depuis `src/` et difficile à
tester ; et la jointure `deleted_at IS NULL` à chaque lecture, déjà
écartée le même jour.

2026-09-08 — **`DbClient` recevra `runMany(statements)`, pas un
`transaction(fn)` à callback** (ticket #111). — Raison : le plugin
enveloppe déjà chaque appel dans sa propre transaction (`transaction`
vaut `true` par défaut sur `run`, `execute` et `executeSet`) ; ce qui
manque n'est pas la transaction mais le moyen d'y faire tenir plusieurs
écritures, et `executeSet` fait exactement ça. L'appelant ne tenant
jamais une transaction ouverte, il ne peut pas oublier de la fermer, et
la question des transactions imbriquées ne se pose pas. Les usages
connus (#102, #84, #40, #38) sont tous des paquets d'écritures connues
d'avance. — Alternatives écartées : le `transaction(fn)` des ORM, qui
imposerait un garde-fou ou des `SAVEPOINT` (SQLite ne fait pas de
transactions imbriquées) pour un besoin de lecture au milieu qu'aucun
ticket n'a aujourd'hui ; et `begin()` / `commit()` / `rollback()` nus,
seul cas où un `catch` qui oublie le rollback laisse la base en
transaction ouverte.

2026-09-09 — **La maquette donne la vision complète de l'écran, le ticket
dit ce qu'on construit.** Le formulaire animal (#15) est livré sans le
cercle photo que montre `animal.md`, la photo étant le sujet de #101. —
Raison : rien à l'écran ne doit mentir ; un bouton inerte ou un sélecteur
sans persistance serait pire que l'absence. — Alternative écartée : le
cercle vide non cliquable comme réservation d'espace.

2026-09-09 — **Un vaccin sans échéance porte le badge « Pas de rappel »**
(neutre, sans icône) et la ligne « Pas de rappel programmé ». Le Carnet ne
gagne pas d'état « À venir » : il dit la validité (À jour / En retard),
l'Accueil dit l'urgence au jour près. — Raison : `due_date` peut être
`NULL` par construction, et ni « À jour » ni « En retard » n'est vrai dans
ce cas ; dupliquer l'urgence sur le Carnet l'aurait dite en moins précis.
— Alternative écartée : un troisième badge « À venir » demandé par le
texte initial de #21, réaligné sur la maquette.

2026-09-09 — **Pas d'écran « liste des animaux » (#16 requalifié)** : les
chips de l'Accueil et du Carnet sont la liste, un tap ouvre le profil,
l'état vide est A5. — Raison : la bottom nav n'a que deux onglets et cet
écran n'y a aucune place ; les Paramètres seraient le pire endroit pour
l'objet central de l'app. — Alternative gardée en réserve : une entrée
« Tous mes animaux » en fin de rangée de chips, si le débordement se
constate après #36.

2026-09-09 — **La cascade de suppression se fait par constructeurs
d'instruction** : chaque repository enfant expose
`markDeletedByAnimalStatement(animalId, deletedAt)` sans l'exécuter,
`animals.remove(id, cascade, deletedAt)` joue le tout dans un `runMany`,
et `animal-deletion.service.ts` fixe la date unique et orchestre. —
Raison : un service n'importe pas `core/db` (ESLint) et un repository
n'écrit pas dans la table d'un autre ; c'est le seul découpage qui donne
une transaction sans casser l'une des deux règles. — Alternative écartée :
le service appelant `runMany` lui-même.

2026-09-09 — **La fréquence d'un traitement est un couple valeur + unité**
(`day` / `week` / `month`), deux types seulement (`deworming`,
`antiparasitic`), et `next_due_date` est **stockée**, calculée par le
repository à chaque écriture. — Raison : quatre semaines ne font pas un
mois (29/03 contre 01/04 pour la même dernière prise), un enum de libellés
aurait figé la liste des produits, et l'accueil comme les notifications
doivent lire l'échéance sans recalculer. — Alternative écartée : un enum
`mensuel | trimestriel | …` avec table de conversion.

2026-09-09 — **Un store Pinia par domaine** (`vaccinations.store.ts`,
puis `weight`, `treatments`), même contrat qu'`animals.store.ts`
(`load` ne lève pas, les écritures lèvent). — Raison : un store « carnet »
unique aurait couplé trois épics et le Carnet est le seul écran à les
réunir. — Alternative écartée : le store carnet, question laissée ouverte
depuis le lot 2.

2026-09-09 — **L'échéance d'un vaccin est saisie, optionnelle, jamais
calculée.** Le ticket #20 disait « calculée ou saisie » ; rien ne permet
de la calculer (pas de fréquence sur un vaccin). — Alternative écartée :
inventer une règle de rappel par nom de vaccin.

2026-09-09 — **Un vaccin, une pesée, un traitement ne changent jamais
d'animal** : les schémas d'édition retirent `animalId`, les formulaires
n'ont aucun sélecteur d'animal, l'animal vient de la route et s'affiche
comme un fait. — Raison : décision prise pour les vaccins le 2026-09-08,
étendue à l'identique pour ne pas avoir trois comportements.

2026-09-09 — **Un écran composite (Carnet, Accueil) importe les
composants de section des autres features ; chaque section n'utilise
que son propre store.** — Raison : la règle « aucun import croisé »
n'avait d'exception que pour les services orchestrant des repositories,
et un écran qui réunit vaccins, traitements et poids ne peut pas exister
sans en importer quelque chose ; faire porter la lecture par des
sections propriétaires de leur store garde le couplage à un seul
endroit, l'écran. — Alternative écartée : une feature `carnet/` à part,
qui aurait le même besoin d'imports sans le dire.

2026-09-09 — **La logique commune à plusieurs écrans vit dans
`shared/`** : `reminders.ts` (statuts d'échéance) y déménage depuis
`features/home/`, rejoint par `animal-age.ts` et `weight-chart.ts`. —
Raison : le Carnet et l'Accueil calculent les mêmes statuts ; dupliquer
la règle des quatre statuts serait la faire diverger. — Alternative
écartée : la laisser dans `home/` et l'importer depuis `animals/`,
import croisé qu'aucune règle ne couvre.

2026-09-09 — **Pas de contrôle mort** : une ligne ou un lien dont la
destination n'existe pas encore (« Voir l'historique » avant #31,
« Ajouter une pesée » avant #30) n'est pas rendu, même si la maquette le
montre ; la PR documente l'écart. — Raison : un bouton qui ne fait rien
est un bug pour la personne qui l'utilise, pas un état intermédiaire. —
Alternative écartée : rendre le contrôle inerte ou grisé.

2026-09-09 — **L'icône adaptative est calibrée en dp, pas en pourcentage
du canevas source.** `@capacitor/assets` génère des couches de 192 px
insérées à 16,7 %, donc le canevas correspond aux 72 dp visibles ; la
contrainte retenue est « aucun pixel hors du cercle de 66 dp ». —
Raison : « 66 % de 1024 » aurait donné une patte à 44 % de l'icône
finale, et le masque cercle est le plus sévère. — Alternative écartée :
remplir la seule boîte de 66 dp, 7 % plus grand mais rogné sur cercle.

2026-09-13 — **`core/dev/` importe les repositories des features**, seule
exception à « `core/` ne dépend pas des features » (écarté le 2026-09-08
pour la cascade de suppression). Les fixtures de développement (#157)
orchestrent les quatre repositories pour peupler le carnet de démo, sans
appartenir à aucune feature ; la règle ESLint
`app/core-independent-of-features` interdit l'import partout ailleurs
dans `core/`. — Raison : le module est importé derrière
`import.meta.env.DEV` et ne part jamais en production (`pnpm test:build`
le vérifie en CI) ; l'argument du 2026-09-08 porte sur le code livré, pas
sur un outil de dev. Le ticket place le module dans `core/dev/`. —
Alternative écartée : `app/dev/`, qui aurait évité l'exception de nom
mais dispersé les outils transverses hors de `core/` sans changer la
dépendance réelle vers les features.

2026-09-14 — **Le keep-alive Supabase exécute une requête Postgres.** Le
workflow appelle la fonction `public.keep_alive()` (`select 1`, sans lecture
de données) via `POST /rest/v1/rpc/keep_alive`, au lieu de `/auth/v1/settings`.
— Raison : le ping de la configuration Auth a réussi les 31/08, 07/09 et
10/09, et le projet s'est pourtant mis en pause avant le 14/09 ; il ne
touche pas la base, qui n'a encore aucune table (#187). — Alternative
écartée : interroger une vraie table, qui n'existe pas encore et qu'il
faudrait exposer à `anon`.

2026-09-14 — **Une seule teinte de retard dans toute l'app** : `#FFE3DF` /
`#972622`, celle du Carnet, pour le badge « En retard » (`shared/DueStatusChip`)
et le bandeau « N rappels en retard » de l'accueil (#167). Le thème la porte
seul (`overdue-container` / `on-overdue-container`), sans copie dans les tokens
SCSS. — Raison : un même statut ne doit pas avoir deux couleurs ; `#FFF0ED`
jugé trop clair. — Alternative écartée : garder un badge et un bandeau pâles à
l'accueil, un badge plein au Carnet.

2026-09-15 — **Imports entre features : trois exceptions écrites et
vérifiées par ESLint** (#205). Toute feature importe le store et les types
de `features/animals` ; un écran composite (`CarnetView`, `HomeView`)
importe les sections **et les feuilles** d'autres features ; un service de
cas d'usage importe leurs repositories **et leurs schémas**. La règle
`app/feature-imports` s'appuie sur `@typescript-eslint/no-restricted-imports`
pour se cumuler aux interdits d'accès aux données portés par
`no-restricted-imports` ; sections et feuilles sont reconnues à leur nom
(`*Section.vue`, `*Sheet.vue`) ; les specs ne sont pas contrôlées, car un
spec d'écran composite monte les vraies sections et doit fournir leurs
repositories. — Raison : décision de Gaelle du 2026-09-14, l'animal est
l'entité racine et « on ne cloisonne pas trop » ; la règle décrit le code
existant sans déplacement de fichier. — Alternative écartée : déplacer les
écrans composites et services dans `src/app/`, plus de fichiers bougés pour
la même dépendance réelle.

2026-09-15 — **La SQLite du navigateur ne part plus dans l'APK** (#156) :
l'import de `jeep-sqlite` est gardé par `import.meta.env.DEV`, et un plugin
Vite de build retire `sql-wasm.wasm` de `dist/` ; `pnpm test:build` échoue
s'ils reviennent. `pnpm preview` n'a donc plus de base. — Raison : ~960 Ko
jamais chargés sur Android, et une seule condition compile le chunk hors du
bundle sans toucher au build natif. — Alternative écartée : sortir le wasm de
`public/` pour le servir par un middleware Vite de dev, et le chunk par
`build.rollupOptions.external` ou un `define` de plateforme : un déplacement
de fichier et plus de configuration pour le même résultat.

2026-09-15 — **Deux notifications par échéance, à 9 h : trois jours avant et le
jour même** (vaccins et traitements, #22, #27). — Raison : trois jours laissent le
temps de prendre rendez-vous chez le vétérinaire, le jour même rattrape un oubli ;
l'écran d'explication promet « on te prévient avant le rappel ». Les alarmes
restent inexactes (conformité Play Store) : l'heure peut glisser de quelques
minutes. — Alternatives écartées : une seule notification le jour même (souvent
trop tard pour un vaccin) ; un délai réglable dans les Paramètres (option absente
des maquettes).
Complétée le 2026-09-15 : une relance à J+3 s'ajoute aux deux notifications (voir
l'entrée « Relance à J+3 et traitements au rythme de leur fréquence »).

2026-09-15 — **Maquettes notifications et Paramètres validées**
(`docs/design/notifs-rappels-parametres/`) : écran d'explication plein écran avant
la popup système, bandeau neutre « Les rappels sont désactivés » au-dessus de
« À faire » sur l'Accueil, Paramètres en écran poussé depuis l'icône du header. Les
sections Paramètres sans destination existante (MémoPatte Plus, Compte, Export PDF,
Confidentialité) arrivent avec leurs tickets. — Raison : un contrôle qui ne mène
nulle part est un bug (décision du 2026-09-09). — Alternative écartée : afficher
tout l'écran de la maquette avec des entrées inertes.

2026-09-15 — **Relance à J+3 et traitements au rythme de leur fréquence**
(#22, #27). Chaque échéance reçoit une relance unique trois jours après, à 9 h
heure locale, puis plus rien. Un traitement dont la prise n'est pas notée
continue de sonner sur les échéances suivantes, calculées depuis `nextDueDate`
et la fréquence ; `nextDueDate` n'est pas modifiée en base, l'échéance affichée
reste la vraie. La première échéance à venir de chaque vaccin ou traitement est
toujours programmée, quelle que soit sa distance ; les cycles suivants d'un
traitement ne le sont que sur 60 jours, 400 rappels au plus, les plus proches
d'abord, et chaque synchro remplit la suite. — Raison : décision de Gaelle ; un
rappel manqué sans relance ne se rattrape pas, et un traitement doit rester
fiable même quand l'app n'est pas rouverte (différenciant n° 1), sous le
plafond d'alarmes d'Android (~500) au-delà duquel le plugin fait planter l'app.
— Alternatives écartées : une relance seule, sans poursuivre les cycles d'un
traitement non noté (il se tairait après la première prise oubliée) ; rien
après l'échéance (un oubli passe inaperçu).

2026-09-15 — **MémoPatte Plus en trois offres au même contenu : abonnement
mensuel 1,49 €/mois, abonnement annuel 9,99 €/an, achat non consommable « à vie »
29,99 €.** Remplace « 7,99 €/an ou 24,99 € à vie » du 2026-09-07. Les abonnements
Google Play sont annulables à tout moment, l'accès restant ouvert jusqu'à la fin
de la période payée. L'annuel est l'offre mise en avant (≈ 44 % d'économie par
rapport au mensuel), le « à vie » vaut environ trois ans d'annuel. Les trois
produits donnent le même entitlement RevenueCat `plus`
(`@revenuecat/purchases-capacitor`, choisi le même jour). Le reste du modèle ne
change pas : local gratuit sans compte ni limite, Plus = cloud + export PDF, pas
d'essai, pas de paywall bloquant, expiration = sync coupée, local intact. —
Raison : décision de Gaelle ; l'écart avec le mensuel doit rester assez net pour
que l'annuel soit le choix évident, sans monter en haut de fourchette pour une
offre qui ne vend que le cloud. — Alternatives écartées : 1,49 / 14,99 / 39,99 (annuel
seulement 16 % moins cher que le mensuel, haut de fourchette pour une offre qui
ne vend que le cloud face à des concurrents francophones gratuits) ;
0,99 / 7,99 / 24,99.

2026-09-15 — **Passe accessibilité (#51) : textes secondaires portés au contraste
AA, bordures de contrôle assombries sans aller jusqu'à 3:1, aucun texte sous
12 px, focus sur le premier champ en erreur.** `$color-hint` et `$color-text-meta`
passent à `#736E67` (4,58:1 sur le fond), `$color-placeholder` à `#77716A`
(4,71:1). Les bordures gardent leur teinte chaude, assombries jusqu'à 2:1 environ :
champ `#B6ADA1`, sélecteur à boutons `#B4ADA3`, pastille radio `#B9B4AE`, avec un
plancher de 2:1 testé. Barre du bas, stats du Carnet, « Poids actuel », mois et
valeurs de la courbe passent à 12 px. Après un envoi refusé, le focus va au
premier champ en erreur, qui lit son message. — Raison : décision de Gaelle ;
un texte lisible par tous est un minimum avant publication, mais des bordures à
3:1 durciraient le rendu doux des maquettes alors que le label et la surface du
champ l'identifient déjà. — Alternatives écartées : bordures à 3:1 (`#908A84`,
rendu trop marqué) ; garder les tailles de maquette sous 12 px ; laisser le focus
sur le bouton d'envoi (rien n'annonce l'erreur au lecteur d'écran).

2026-09-15 — **Import d'un export depuis l'écran de bienvenue (#239).** Sous
« Créer mon premier animal », un lien texte discret « Importer un export
MémoPatte » ouvre directement le sélecteur de documents et suit le même parcours
que dans les Paramètres : validation, import direct puisque la base est vide,
toast, puis écran d'explication des rappels si le carnet importé a des échéances.
L'Accueil réutilise la feuille d'import des Paramètres, sans la dupliquer. —
Raison : décision de Gaelle ; l'écran de bienvenue n'a ni header ni accès aux
Paramètres, et quelqu'un qui change de téléphone ne doit pas créer un faux animal
pour retrouver son carnet. — Alternatives écartées : un bouton secondaire de même
poids que la création (détourne le premier lancement de la plupart des gens) ;
un accès aux Paramètres sur l'écran de bienvenue (deux taps de plus, import
difficile à trouver).

2026-09-15 — **Les rappels respectent le réglage Android de l'utilisateur sur
l'écran verrouillé : la visibilité du canal n'est pas forcée.** Le contenu d'un
rappel (nom de l'animal, soin) s'affiche ou se masque sur l'écran verrouillé selon
ce que l'utilisateur a choisi dans Android. — Raison : décision de Gaelle ; c'est
un réglage de confidentialité qui appartient à l'utilisateur, et le système le
propose déjà. — Alternatives écartées : forcer une visibilité publique (expose le
carnet sans l'accord de l'utilisateur) ou privée (masque un rappel que
l'utilisateur veut lire d'un coup d'œil).

2026-09-16 — **Outillage (#90) : on reste en pnpm 10.34.5, malgré la clôture de
la demande de support pnpm 11 chez Dependabot.** Node (`.nvmrc` 26.8.1,
`engines.node >=24.12.0`) et les quatre actions GitHub (`actions/checkout@v7`,
`actions/setup-node@v7`, `pnpm/action-setup@v6`, `googleapis/release-please-action@v5`)
sont déjà chacun sur la dernière majeure disponible : rien à monter.
`dependabot-core#14794` a été fermée le 2026-09-15 et un support est arrivé le
2026-07-29 (`dependabot-core#15710`, pnpm 11.17.0 embarqué), mais il est annoncé
comme beta et la page officielle des écosystèmes supportés liste toujours
pnpm v7 à v10. — Raison : pnpm 11 n'est pas un changement de numéro, c'est une
migration — `onlyBuiltDependencies` est supprimé au profit de `allowBuilds`, dont
dépend la compilation de `sharp` pour `@capacitor/assets` ; `minimumReleaseAge`
passe à un jour et `blockExoticSubdeps` à `true` par défaut ; `.npmrc` est
réservé à l'authentification et au registre ; le lockfile change de format. Rien
de tout cela ne se vérifie ici : le comportement qui compte, Dependabot ouvrant
ses PR hebdomadaires contre un lockfile pnpm 11, ne s'observe que sur le dépôt et
sur plusieurs semaines. — Alternatives écartées : monter en pnpm 11 maintenant
(migration non vérifiable localement, pour zéro gain fonctionnel) ; monter en
pnpm 12, où un réglage inconnu de `pnpm-workspace.yaml` fait désormais échouer la
commande. **À rouvrir quand la page des écosystèmes supportés listera pnpm 11.**

2026-09-16 — **« Gérer mon abonnement · Google Play » vit dans la section
MémoPatte Plus, pas dans Confidentialité.** — Raison : décision de Gaelle ; c'est
une action d'abonnement, elle se lit à côté du statut Plus et de « Restaurer mon
achat », et le relevé de textes la range avec le compte, qui n'existe pas encore.
— Alternative écartée : la laisser dans Confidentialité comme le relevé, où elle
voisine les statistiques d'usage, sans rapport.

2026-09-16 — **Le souvenir d'un abonnement échu s'efface au bout de 30 jours.**
Une fois l'expiration confirmée par Google Play, le bandeau « Ta sauvegarde cloud
est en pause » reste affiché 30 jours, puis l'app oublie : retour à « Découvrir
MémoPatte Plus », et plus aucun appel à Google Play au lancement pour cet
utilisateur. Un utilisateur qui n'a jamais payé ne voit jamais le bandeau ; une
réactivation, un achat à vie ou une connexion à un autre compte effacent le
souvenir tout de suite. Le délai court depuis la fin réelle de l'abonnement quand
elle est connue, sinon depuis la confirmation de Google Play. L'oubli se fait à la
lecture de la préférence locale, pas par une purge écrite : le comportement est le
même et il n'y a pas d'écriture au lancement. — Raison : décision de Gaelle ; au
bout d'un mois, quelqu'un qui n'a pas renouvelé a choisi, et lui rappeler
indéfiniment qu'il a laissé tomber Plus est du harcèlement commercial ; l'appel au
store à chaque lancement n'a plus de contrepartie. — Alternatives écartées : garder
le souvenir pour toujours (bandeau permanent, appel réseau à vie) ; l'effacer dès
la confirmation d'expiration (l'utilisateur ne saurait jamais que sa sauvegarde
s'est arrêtée).

2026-09-16 — **Le rappel doux vers MémoPatte Plus s'en tient aux trois moments de
valeur de la maquette, sans déclencheur temporel.** Première photo ajoutée,
deuxième animal ou dixième entrée, premier export : une carte en tête de la liste
du Carnet, jamais sur l'Accueil pour rester à distance du bandeau des rappels en
retard. Jamais modale, une seule à la fois, un rappel par déclencheur, jamais deux
à moins de 30 jours d'écart, et « Ne plus me le proposer » coupe définitivement.
Rien ne s'affiche pour un abonné Plus, ni pour un ancien abonné dont l'abonnement
a expiré — celui-là a déjà le bandeau « Ta sauvegarde cloud est en pause » dans les
Paramètres. — Raison : décision de Gaelle ; un rappel qui tombe au bout de 30 jours
d'installation arrive sans raison, alors que les trois autres arrivent au moment où
l'utilisateur voit lui-même la valeur de son carnet, et deux sollicitations
commerciales dans le même écran seraient du harcèlement. — Alternative écartée :
ajouter « 30 jours après l'installation » comme quatrième rappel, tel que le
proposait le ticket 9.2.

2026-09-16 — **Les chips d'animaux suivent l'ordre de création, sur l'Accueil comme
sur le Carnet.** `animals.repository.list()` trie par `created_at`, et départage par
nom deux animaux créés dans la même milliseconde, cas d'un import. — Raison :
décision de Gaelle ; l'animal principal, presque toujours créé en premier, garde sa
place en tête et se tape sans regarder, alors que l'ordre alphabétique le déplaçait
à chaque nouvel animal. — Alternatives écartées : l'ordre alphabétique (la première
chip change quand on ajoute un animal) ; le dernier animal consulté en tête (la
rangée bouge toute seule entre deux ouvertures de l'app).

2026-09-16 — **On n'affiche jamais le mot « vaccin » devant le nom saisi, ni en
français ni en anglais (#282).** `home.reminder.vaccination` rend le nom seul, et
les titres de notification `reminders.vaccination.*` perdent eux aussi le type, dans
les deux langues. Le type reste porté par l'icône de la ligne sur l'Accueil.
Écart assumé à la maquette de l'Accueil, qui montre
« Vaccin CHPPiL ». — Raison : décision de Gaelle ; la plupart des gens saisissent
déjà « Vaccin antirabique » ou « Rabies vaccine », et le préfixe donnait « Vaccin
Vaccin antirabique ». — Alternatives écartées : garder le préfixe et retirer le mot
à la saisie (on corrige ce que l'utilisateur a écrit) ; ne corriger que le français
(les deux langues divergeaient depuis le 2026-09-15).

2026-09-16 — **Sur l'écran de consentement, « Refuser » et « Accepter » ont le même
poids visuel.** Les deux sont des boutons à contour pétrole, côte à côte et de même
largeur ; écart assumé à la planche A1, qui donne « Accepter » en plein pétrole. —
Raison : exigence du ticket #67 ; un consentement analytics n'est libre que si le
refus est aussi facile à donner que l'accord, et un bouton plein face à un bouton
fade est précisément le dark pattern que le RGPD vise. — Alternative écartée :
suivre la maquette (refus visuellement dévalué, consentement contestable).

2026-09-16 — **La carte Vaccins du Carnet est triée par échéance, la plus urgente en
tête.** Le départage est celui de `buildReminders` (échéance, puis nom, puis
identifiant) : deux vaccins de même échéance tombent donc dans le même ordre sur
l'Accueil et sur le Carnet. Un vaccin sans rappel programmé va en fin de liste. —
Raison : la planche C1 montre « CHPPi · En retard » avant « Rage · À jour », et la
carte suivait jusqu'ici l'ordre du repository (dernière injection d'abord), ce qui
pouvait enterrer un retard sous des vaccins à jour. — Alternative écartée : garder
l'ordre de saisie et compter sur la seule barre corail pour signaler le retard.

2026-09-16 — **La déconnexion garde l'achat Plus et la préférence « Ne plus me
proposer Plus » ; seul le changement de compte efface tout (#287).** `signOut()`
efface le compte enregistré et les compteurs d'usage ; `memopatte.plus.status` et
`memopatte.plus.nudge` restent. L'effacement complet a lieu dans `record()`, quand
un autre `userId` prend la main sur l'appareil. — Raison : décision de Gaelle ;
l'abonnement appartient au compte Google Play de l'appareil, pas au compte
MémoPatte, et `verifyKnownStatus()` court-circuite sur « aucun droit connu » : un
statut effacé n'était jamais revérifié, l'abonné repartait « gratuit » jusqu'à ce
qu'il pense à « Restaurer mon achat ». « Ne plus me proposer Plus » est une
préférence, pas de l'état de compte. — Alternative écartée : tout effacer à la
déconnexion comme le demandait le ticket (le risque « le compte suivant hérite »
n'existe qu'au changement de compte, où l'effacement complet reste en place).

2026-09-16 — **L'exception « données des animaux » est actée, pas supprimée (#295), et
resserrée à la lecture.** Toute feature peut importer `useAnimalsStore` et
`animal.schema` ; `provideAnimalsRepository` et les autres modules de
`features/animals` restent interdits, et la règle ESLint le dit maintenant nommément
(`allowImportNames: ['useAnimalsStore']`). Six fichiers de quatre features s'en
servent, plus `app/reminders-sync.ts` ; tous n'appellent que `load`, `select`,
`byId`, `animals`, `selectedAnimal`, `hasLoaded`, `error`. — Raison : l'animal est le
pivot du modèle, tout écran qui affiche un vaccin, une pesée ou un traitement a
besoin de son nom et de la sélection courante ; l'exception vivait dans
`eslint.config.ts` sans être écrite nulle part. — Alternative écartée : un
`useAnimals()` en lecture seule dans `shared/`, qui ajouterait une couche
d'indirection sans rien garantir de plus (elle exposerait le même store). — Pour
revenir dessus : retirer les deux négations et le motif `useAnimalsStore` de
`featureImportsRule` dans `eslint.config.ts`, la ligne de CLAUDE.md, et remonter
l'accès dans `shared/`.

2026-09-16 — **Les imports dynamiques sont couverts par une règle maison qui délègue à
`no-restricted-imports` (#294), pas par oxlint.** `tools/eslint/dynamic-imports.ts`
réutilise la règle d'ESLint et lui passe les nœuds `ImportExpression` qu'elle ne
visite pas ; elle est posée sous deux noms, à côté de chaque interdit existant. —
Raison : les motifs restent écrits une seule fois, dans `eslint.config.ts`, où la
matrice par feature est construite à partir du contenu de `src/features/` ; et une
violation n'est signalée que par un seul linter. — Alternative écartée : oxlint, qui
visite bien `ImportExpression`, mais dont la configuration est un JSON statique : il
aurait fallu y recopier toute la matrice et accepter un double diagnostic sur les
imports statiques.

2026-09-16 — **Un fichier d'import qui rattache une entrée à un autre animal est
refusé en entier** (#293). Le rattachement d'un vaccin, d'un traitement ou d'une
pesée est figé à la création (2026-09-09) ; un export édité à la main pouvait
pourtant les déplacer, `restoreStatement` mettant `animal_id` dans son `SET`.
L'import s'arrête désormais avant toute écriture, avec un motif d'erreur dédié
(« Ce fichier rattache une entrée de ton carnet à un autre animal. »), et
`animal_id` sort du `SET` des trois `restoreStatement`. — Raison : c'est déjà le
traitement des deux autres incohérences de fichier (identifiant en double,
`animalId` orphelin), un déplacement ne peut pas naître d'un usage normal de
l'app, et la synchronisation rejouera ces mêmes instructions (le pull « n'a pas à
gérer de déplacement »). — Alternative écartée : ignorer la seule entrée fautive
et importer le reste, c'est-à-dire appliquer à moitié un fichier incohérent sans
que rien ne le dise. — Pour revenir dessus : retirer le contrôle
`findReattached` de `shared/import-plan.ts` et remettre `animal_id` au `SET`.

2026-09-16 — **L'échéance d'un traitement importée fait foi, elle n'est jamais
recalculée** (#293), tranché par Gaelle. `nextDueDate` du fichier est écrite telle
quelle, sans être comparée à `lastDoseDate` + `frequency`. — Raison : la ligne
voyage entière, exactement ce que fera la synchronisation Plus, donc import et
pull se comportent à l'identique ; et l'app ne réécrit jamais en silence une
donnée que l'utilisateur a exportée. Pour tout fichier produit par MémoPatte les
deux comportements coïncident, le repository calculant l'échéance à chaque
écriture. — Alternatives écartées : recalculer à l'import, qui ferait de l'import
le seul endroit qui corrige une valeur sans le dire et divergerait de la synchro ;
refuser le fichier en cas d'écart, qui rejetterait des exports valides si la règle
de calcul évoluait. — Conséquence assumée : un fichier édité à la main peut dater
un rappel n'importe quand, `nextDueDate` n'étant bornée que par son format.

2026-09-18 — **Masquage de `animalName` dans les URL envoyées à PostHog**, trouvé
en revue robustesse/sécurité du lot analytics (#68/#69). PostHog enrichit chaque
`capture()`, y compris le nouveau `$pageview`, avec `$current_url` lu sur
`location.href` ; or `shared/notification-priming.ts` route vers l'écran de
priming avec `?animalName=<nom>` en query après création d'un vaccin/traitement,
donc le nom réel d'un animal partait en clair vers PostHog EU Cloud. Corrigé par
`mask_personal_data_properties: true` + `custom_personal_data_properties:
['animalName']` dans `postHogConfig()` (`core/analytics/analytics.ts`) — mécanisme
documenté de posthog-js, qui remplace la valeur du paramètre par `<masked>` dans
`$current_url` sans désactiver la propriété. — Raison : viole directement CLAUDE.md
(« jamais de contenu de carnet dans les événements ») ; `capture_pageview: false`
ne coupe que le pageview automatique du SDK, pas cet enrichissement sur les
captures manuelles. — Alternative écartée : un `before_send` maison qui retire la
query string de `$current_url`/`$referrer`, plus de code pour un besoin déjà
couvert par une option native. Le nom du paramètre (`ANIMAL_NAME_QUERY_PARAM`) vit
dans `shared/animal-name-query-param.ts`, un module sans dépendance, plutôt que
dans `notification-priming.ts` : l'importer depuis `core/analytics` aurait tiré
`core/notifications/permission.ts` (donc `@capacitor/local-notifications`) dans le
chunk chargé au démarrage — un essai de build l'a fait passer à 233 Ko avant
correction. — Pour revenir dessus : retirer les deux clés de `postHogConfig()`.

2026-09-18 — **Quatre décisions prises en autonomie pour le ticket #81 (export PDF
du carnet, Plus)**, consignées ici faute de session d'autonomie déclarée par
Gaelle en cours pour les recueillir ailleurs.

1) **Bibliothèque PDF : `jsPDF`.** — Raison : ses polices standard (Helvetica,
encodage WinAnsi) couvrent les caractères accentués français sans embarquer de
fichier de police, contrairement à `pdfmake` dont le rendu correct exige de
charger sa table `vfs_fonts` (plusieurs centaines de Ko à plus d'1 Mo pour un jeu
complet) ; le tracé de la courbe de poids est fait à la main avec les primitives
vectorielles de `jsPDF` (`line`, `circle`) à partir de `shared/weight-chart.ts`
déjà utilisé par `WeightSparkline.vue`, sans bibliothèque de graphique
supplémentaire. — Mesuré : le chunk `PdfExportSheet` (jsPDF inclus) pèse 400 Ko
(129 Ko gzip) au build. `jsPDF` référence `html2canvas` pour sa méthode `.html()`
(non utilisée ici) via un `import()` dynamique déjà isolé par Vite dans son propre
chunk, jamais chargé. Le reste du poids est assumé jusqu'à mesure sur appareil
(écrans Carnet et Paramètres, tous deux visités par un compte gratuit), dans le
même esprit que le 2026-09-08 pour `@capacitor-community/sqlite` : optimiser sans
mesure serait deviner. — Alternative écartée : `pdfmake`, au rendu plus riche
mais plus lourd pour ce besoin, et un tracé de courbe en `<canvas>` converti en
image, qui aurait ajouté une étape de rendu DOM à une génération par ailleurs
synchrone.

2) **Depuis Paramètres, un seul animal exporte directement ; plusieurs animaux
ouvrent un sélecteur.** La feuille `PdfExportSheet.vue` réutilise `ChoiceCards.vue`
(déjà au service de l'import JSON/CSV) pour choisir l'animal quand il y en a
plus d'un, et saute cette étape sinon. — Raison : le ticket ne précise pas ce
point, resté hors du scope maquette (l'export PDF a rejoint le v1 après le gel
des maquettes, 2026-09-07) ; réutiliser un composant déjà éprouvé pour le même
usage (choisir une option avant de lancer un export) respecte « saisie rapide »
sans inventer de nouvelle identité visuelle. — Alternative écartée : toujours
afficher le sélecteur, même à un seul animal, plus uniforme mais un tap de plus
pour le cas le plus courant (un seul animal).

3) **Depuis le Carnet, une icône dans l'en-tête ouvre directement l'export du seul
animal consulté**, à côté du crayon d'édition existant, avec le même style de
bouton (`v-btn icon variant="text"`). — Raison : le ticket demande un point
d'entrée depuis le Carnet (3.4) sans le maquetter — comme l'écran Paramètres
lui-même (2026-09-07) — et l'icône reprend un bouton déjà présent au même endroit
plutôt que d'inventer un nouvel emplacement. — Alternative écartée : une ligne
dans une liste d'actions du Carnet, qui n'existe pas aujourd'hui et aurait
demandé de construire un emplacement pour un seul usage.

4) **Nouvelle exception d'architecture : le statut Plus se lit comme l'entité
animal.** `usePurchaseStore` (seul, comme `useAnimalsStore`) devient importable
par toute feature ; `eslint.config.ts` porte la même forme que l'exception du
2026-09-16 (`PURCHASE_STORE_READ_ONLY`), testée dans
`eslint-feature-imports.spec.ts`. — Raison : sans elle, aucun écran hors de
`features/purchase` ne peut savoir si le compte est Plus pour gater une
fonctionnalité payante — exactement le rôle que joue déjà l'exception animaux
pour le contenu du carnet — et l'export PDF est la première fonctionnalité v1 à
en avoir besoin. — Alternative écartée : un composant `*Section.vue` ou
`*Sheet.vue` intermédiaire qui envelopperait chaque bouton gaté d'un slot, plus
de code pour le même accès en lecture seule. — Pour revenir dessus : retirer
`PURCHASE_STORE_READ_ONLY` et la ligne `'!@/features/purchase/purchase.store'`
de `featureImportsRule` dans `eslint.config.ts`.

2026-09-19 — **Trois garde-fous manquants trouvés en relisant
`docs/technical/proposition-sync.md` avant tranchage, tous corrigés dans le
document.** (1) Le trigger SQLite de remplissage de `sync_outbox` faisait
`ON CONFLICT DO NOTHING` : une deuxième modification pendant qu'une ligne était
déjà en file n'avançait pas `queued_at`, donc la garde de fin d'entrée (§3.3) ne
pouvait pas détecter qu'une valeur plus récente restait à envoyer, et supprimait
l'entrée après un acquittement qui ne portait que sur l'ancienne. (2) L'`upsert`
du push n'avait aucune garde comparant les horodatages avant d'écraser : un
appareil resté longtemps hors-ligne pouvait régresser une ligne déjà mise à jour
par un autre appareil, valeur que récupérerait telle quelle un appareil
restaurant pour la première fois. (3) L'application du pull en local n'était
décrite qu'en prose (« remplace la ligne locale »), sans garantie que comparaison
et écriture se fassent dans la même instruction — une modification locale
survenue pendant l'attente réseau d'un cycle pouvait être écrasée par le lot en
cours d'application. — Raison, commune aux trois : toute écriture qui peut entrer
en concurrence avec une autre doit comparer et écrire en une seule instruction
SQL (`on conflict … do update … where excluded.updated_at > table.updated_at` ;
trigger en `on conflict … do update set queued_at = excluded.queued_at`), jamais
lecture puis décision puis écriture séparées. — Pas d'alternative pesée : ce ne
sont pas des choix produit mais des extraits qui ne faisaient pas encore ce que
le texte autour décrivait déjà (« la plus récente gagne »). — Pour revenir
dessus : retirer les `where` ajoutés au push et au pull, et remettre
`ON CONFLICT DO NOTHING` sur le trigger (`git revert` du commit qui introduit ce
correctif).

2026-09-19 — **Épic sync, décision §7-1 tranchée avec Gaelle (deux horodatages) : la
reco de `docs/technical/proposition-sync.md` est retenue.** `updated_at` (horloge de
l'appareil) arbitre le conflit, `server_updated_at` (horloge Postgres, posée par
trigger) sert seul de curseur de pull. — Raison : un curseur assis sur l'horloge d'un
appareil rate définitivement les lignes d'un téléphone en retard, sans aucun signal.
Deux pistes plus lourdes ont été considérées et écartées pendant la revue : une
horloge logique hybride (HLC) ou des vecteurs de version régleraient aussi le
problème sans dépendre d'une horloge de référence, mais demandent à chaque appareil
de maintenir un état supplémentaire — complexité sans usage réel pour un compte et
une poignée d'appareils. — Alternative écartée : le `updated_at` unique que suppose
la note de #39, une colonne de moins mais silencieusement faux dès qu'une horloge
d'appareil dérive. — Pour revenir dessus : retirer `server_updated_at` et son
trigger, refaire le pull sur `updated_at` seul, en connaissance de la perte de
données silencieuse que ça réintroduit.

2026-09-19 — **Épic sync, décision §7-2 tranchée avec Gaelle (horloge d'appareil
partie dans le futur) : la reco est retenue.** Un trigger Postgres ramène à `now()`
tout `updated_at` reçu à plus de 24 h dans le futur. — Raison : sans ça, une ligne
datée par erreur loin dans le futur (horloge d'appareil déréglée) gagnerait pour
toujours face à « la plus récente gagne », et plus aucune modification depuis un
autre appareil ne pourrait jamais la faire évoluer. — Alternative écartée : refuser
l'écriture — plus strict, mais l'utilisateur se retrouverait bloqué sans comprendre
pourquoi ni pouvoir s'en sortir depuis l'app, l'horloge du téléphone n'étant pas
quelque chose qu'on pense à vérifier. — Pour revenir dessus : retirer la clause
d'écrêtage du trigger `before insert or update` (§1.3).

2026-09-19 — **Épic sync, décision §7-3 tranchée avec Gaelle (où remplir
`sync_outbox`) : la reco est retenue.** Des triggers SQLite (`AFTER INSERT`/
`AFTER UPDATE` sur les quatre tables), conditionnés par `sync_state.enabled`,
déclarés dans `src/core/db/migrations.ts`. — Raison : aucun chemin d'écriture ne
peut être oublié (cascade, import, fixtures), et le critère « sans compte, aucune
entrée » est garanti par la base elle-même plutôt que par une discipline de code à
maintenir. Un trigger avait été écarté le 2026-09-08 pour la cascade de
suppression ; la raison d'alors (logique métier invisible depuis `src/`) ne vaut
pas ici, c'est de la plomberie déclarée dans `migrations.ts`, pas une règle
métier. — Alternative écartée : un appel explicite dans chaque repository — plus
lisible pris isolément, mais cinq repositories à trois mutations chacun plus les
services, et la connaissance de la synchro se répand dans toutes les features. —
Pour revenir dessus : retirer les huit triggers et le `WHEN`, appeler la mise en
file explicitement depuis chaque repository.

2026-09-19 — **Épic sync, décision §7-4 tranchée avec Gaelle (suppression contre
modification) : la reco est retenue.** Aucun cas particulier : une suppression est
une modification comme une autre, elle écrit `deleted_at` **et** `updated_at`, donc
« la plus récente gagne » s'applique telle quelle — une modification postérieure à
une suppression fait réapparaître la ligne sur un autre appareil, une suppression
postérieure l'emporte. — Raison : une seule règle à comprendre et à tester, déjà
celle de l'import JSON ; cohérence entre les deux mécanismes plutôt que deux
modèles mentaux. — Alternative écartée : la pierre tombale l'emporte toujours,
plus rassurant sur le papier, mais une suppression faite par erreur (ou par
confusion) depuis un autre appareil deviendrait irréversible, sans recours. — Pour
revenir dessus : dans la logique d'application du pull, traiter `deleted_at` non
nul comme prioritaire sur toute comparaison d'`updated_at`.

2026-09-19 — **Épic sync, décision §7-5 tranchée avec Gaelle (un animal qui
réapparaît ramène-t-il son carnet) : la reco est retenue.** Oui, avec la règle déjà
écrite pour l'import : les lignes (vaccins, traitements, poids) portant exactement
le même `deleted_at` que l'animal reviennent avec lui ; celles supprimées
séparément, avec un `deleted_at` différent, restent supprimées. — Raison : import
et synchronisation doivent se comporter à l'identique, sinon deux modèles mentaux
à maintenir pour la même situation. — Alternative écartée : l'animal revient vide —
plus simple à coder (pas de comparaison de `deleted_at` entre lignes), mais la
cascade de suppression deviendrait une perte définitive du carnet même quand
l'animal lui-même revient. — Pour revenir dessus : à la réapparition d'un animal,
ne pas comparer le `deleted_at` des lignes enfants, les laisser supprimées.

2026-09-19 — **Épic sync, décision §7-6 tranchée avec Gaelle (« Remplacer » à la
restauration) : la reco est retenue.** Effacement physique des lignes locales,
puis pull complet — pas de pierre tombale. — Raison : ces lignes n'ont jamais
quitté l'appareil, leur pierre tombale n'aurait aucun destinataire à synchroniser
et ne ferait qu'encombrer le compte cloud sans objet. — Alternative écartée : la
pierre tombale comme à l'import, cohérente avec #84, mais remplit le cloud de
lignes mortes pour rien. Dans les deux cas, action irréversible : confirmation
explicite à l'écran avant d'effacer. — Pour revenir dessus : marquer `deleted_at`
au lieu de supprimer physiquement avant le pull complet.

2026-09-19 — **Épic sync, décision §7-7 tranchée avec Gaelle (rétention du cloud
après expiration) : la reco est retenue, confirme le point laissé « à confirmer
en 11.7 » par l'entrée du 2026-09-07 (point 2, « purgé après 12 mois sans sync »).**
Rétention de **12 mois après l'expiration du dernier droit Plus**, pas 12 mois
sans synchronisation : lecture maintenue pendant ce délai (la restauration marche
encore), écriture coupée dès l'expiration, un email un mois avant l'échéance. La
durée est affichée à l'utilisateur. — Raison : le déclencheur est vérifiable côté
serveur seul, sans dépendre qu'un appareil se reconnecte pour faire avancer un
compteur ; c'est aussi déjà ce que dit la politique de confidentialité, donc les
deux documents s'accordent maintenant. — Alternative écartée : « 12 mois sans
sync » (version du 2026-09-07) — plus généreux dans l'esprit, mais un utilisateur
qui réinstalle sans se reconnecter verrait son délai courir en réalité, sans rien
pour l'en informer. — Pour revenir dessus : recalculer la purge sur la dernière
date de synchronisation plutôt que sur la date d'expiration du droit Plus, et
mettre à jour la politique de confidentialité en conséquence.

2026-09-19 — **Épic sync, décision §7-8 tranchée avec Gaelle (`@capacitor/network`)
: la reco est retenue.** Ajouter la dépendance pour détecter le retour du réseau.
— Raison : `navigator.onLine` dans une WebView Android ne détecte ni portail
captif ni sortie de mode Doze ; sans le plugin, la reprise après un retour de
réseau dépend du seul backoff (jusqu'à 15 minutes d'attente avant qu'un cycle ne
reparte de lui-même). — Alternative écartée : s'en passer — une dépendance et un
`cap sync` de moins, mais la synchronisation aurait l'air en panne juste après le
retour du réseau. — Pour revenir dessus : retirer la dépendance et le listener,
laisser le seul backoff gérer la reprise.

2026-09-19 — **Épic sync, décision §7-9 tranchée avec Gaelle (chemin des photos
dans le bucket) : la reco est retenue.** `<user_id>/<nom du fichier local>` — le
nom local est déjà un UUID propre à la photo. — Raison : le chemin se déduit
d'`animal.photo_path` seul, sans colonne supplémentaire ; une photo remplacée
devient un objet différent, donc aucun cache périmé à invalider. — Alternative
écartée : `<user_id>/<animal_id>.jpg`, ce que suppose le ticket #85 — jamais
d'objet orphelin puisque lié à l'animal, mais `photo_path` contient aujourd'hui un
UUID propre à la photo et pas l'`animal_id`, donc il aurait fallu une colonne
`photo_uploaded_at` en plus pour savoir si l'objet distant est à jour, et un objet
écrasé peut rester affiché depuis le cache. — Pour revenir dessus : renommer le
chemin des objets Storage vers `<user_id>/<animal_id>.jpg` et ajouter la colonne
`photo_uploaded_at`.

2026-09-19 — **Épic sync, décision §7-10 tranchée avec Gaelle (purge des pierres
tombales) : la reco est retenue.** Aucune purge, ni en local ni côté serveur, en
v1. — Raison : le volume est dérisoire (quelques lignes par animal supprimé), et
toute purge crée un risque réel de résurrection — un appareil resté longtemps
hors-ligne avec une modification en attente pourrait faire réapparaître une ligne
déjà purgée ailleurs, scénario déjà identifié le 2026-09-08. Ferme le « reste à
définir » de `docs/technical/01-architecture-v2.md`. — Alternative écartée :
purger au-delà de 90 jours — gagne quelques kilo-octets de stockage contre ce
risque de résurrection. — Pour revenir dessus : ajouter une purge programmée
au-delà d'un seuil, en acceptant le risque de résurrection identifié.

2026-09-19 — **Épic sync : les dix décisions de `docs/technical/proposition-sync.md`
§7 sont toutes tranchées avec Gaelle** (voir les dix entrées ci-dessus, §7-1 à
§7-10), en plus des trois garde-fous d'écriture atomique corrigés le même jour.
Le document passe au statut « architecture validée ». — Reste hors de ce
document, non commencé : toute l'implémentation (lots A à E du §6), qui dépend
notamment d'un projet Supabase encore sans table (#187) et des clés RevenueCat/
PostHog encore à fournir par Gaelle.

2026-09-19 — **Deux décisions prises en réorganisant `features/*` et `shared/`
par rôle technique** (demande de Gaelle après lecture de `features/animals/` et
`shared/` dans son IDE, schéma/service/repository/store/vues/composables à plat
dans un seul dossier).

1) **Convention de sous-dossiers par rôle technique dans chaque
`features/<nom>/`** : `store/` (`xxx.store.ts`), `repository/`
(`xxx.repository.ts`), `service/` (`*.service.ts`), `schema/` (`*.schema.ts`),
`composables/` (`use-*.ts`), `views/` (tous les `.vue`, écrans et
sous-composants confondus), `logic/` (le reste des `.ts` propres à la feature,
fourre-tout assumé), `__tests__/` inchangé. `shared/` suit le même principe
avec `components/`, `composables/`, `domain/` (logique métier MémoPatte),
`utils/` (générique, sans connaissance métier) ; `form/` et `__tests__/`
gardent leur organisation existante. — Raison : `store/repository/service/vues`
était la demande explicite de Gaelle sur l'exemple `animals/` ; étendue aux
sept autres features et aux catégories `schema/composables/logic` pour rester
cohérent partout plutôt que de n'organiser qu'un dossier. — Alternative
écartée : un découpage par concept dans `shared/` calqué sur `form/` (un
dossier par patron réutilisable plutôt que par rôle technique) — écarté pour
garder une seule règle simple et prévisible dans tout le dépôt plutôt que deux
logiques différentes selon le dossier. — Pour revenir dessus : purement
mécanique (fichiers déplacés par `git mv`, imports mis à jour), `git revert`
des commits du lot `chore/reorganisation-dossiers-par-role`.

2) **Dans `featureImportsRule` (`eslint.config.ts`) : `'../**'` devient
`'../../**'`, et chaque exception vers un chemin imbriqué excepte aussi son
dossier intermédiaire, pas seulement le fichier** (`!@/features/animals/store`
en plus de `!@/features/animals/store/animals.store`, symétriquement pour
`animals/schema`, `purchase/store`, et les globs `repository`/`schema`/
`service`/`views` de la variante « services » et des écrans composites). —
Raison : une fois une feature répartie en sous-dossiers, un fichier de
`views/` qui importe un fichier de `schema/` de la MÊME feature utilise
forcément `../schema/...` (un niveau) ; l'ancienne règle bloquait tout import
relatif commençant par `..`, qu'il reste dans la feature ou parte vers une
autre, une confusion qu'elle ne faisait pas tant que chaque feature était
plate. Seul un import relatif à deux niveaux ou plus quitte réellement une
feature (`../../<autre-feature>/...`), d'où le nouveau seuil. Pour les
exceptions par chemin exact, le moteur `ignore` que `no-restricted-imports`
utilise applique la règle gitignore : impossible de réinclure un fichier si
son dossier parent reste exclu par une règle plus générale ailleurs dans le
même `group` — d'où le dossier intermédiaire excepté en plus du fichier,
vérifié à la main avant d'écrire la règle définitive. — Alternative écartée :
garder chaque feature à plat pour éviter la question, contraire à la demande
de Gaelle. — Pour revenir dessus : remettre `'../**'` et retirer les négations
de dossier intermédiaire ; nécessaire seulement si la structure redevient
plate.

2026-09-22 — **Ticket #65, plugin Capacitor pour la connexion Google : `@capawesome/capacitor-google-sign-in`,
tranché avec Gaelle.** Les deux candidats identifiés le 2026-09-19 exposent le même flux Credential
Manager → ID token attendu par `signInWithIdToken`, tous deux compatibles Capacitor 8 et activement
maintenus. — Raison : MémoPatte n'a besoin que de Google aujourd'hui, aucun document produit ne
prévoit Apple ou un autre réseau ; un plugin mono-provider (~135 Ko) a moins de surface à auditer et
rien à mal configurer par oubli. — Alternative écartée : `@capgo/capacitor-social-login` — 10× plus de
téléchargements hebdomadaires et tout aussi actif, mais son seul vrai atout (mutualiser plusieurs
providers) ne sert à rien tant qu'aucun autre réseau n'est prévu, et il existe précisément parce que le
plugin multi-provider précédent (`codetrix-studio/capacitor-google-auth`) est tombé à l'abandon — un
risque à ne pas payer pour une fonctionnalité inutilisée. — Pour revenir dessus : retirer
`@capawesome/capacitor-google-sign-in`, installer `@capgo/capacitor-social-login` à la place ; aucun
code natif n'est encore écrit à cette date, donc pas de migration à prévoir.

2026-09-23 — **Retours de Gaelle après une navigation dans l'app sur son téléphone, tranchés avec
elle.**

1) **`pnpm dev:mobile` régénère la liste des plugins natifs avant chaque lancement** (`cap update
android`, une seconde, sans build web ; `cap:sync` complet seulement sur un dépôt jamais
synchronisé). — Raison : la liste datait du 2026-09-07 dans le dépôt principal, cinq plugins étaient
« not implemented on android » en dev. — Alternative écartée : une consigne « relancer `cap:sync`
après un ajout de plugin », qui repose sur la mémoire. — Livré par la PR #338.

2) **Avec un seul animal, l'accueil sélectionne sa chip, qui ne se désélectionne pas, et « Ajouter
un poids » ne demande plus l'animal** (#339). — Raison : avec un seul animal, « tous » et l'animal
sont la même chose ; traitement et vaccin sautaient déjà ce choix, la pesée non. — Alternative
écartée : garder la chip désélectionnable, qui ramène à l'état jugé confus.

3) **Courbe de poids : axe du temps proportionnel partout, piste C dans le Carnet (plus haut, plus
bas, pastille de la dernière pesée, sans graduation), piste D dans l'Historique (repères en kg
ronds, sélection d'une pesée au toucher)** (#340). — Raison : les pesées étaient espacées à
intervalle régulier quelle que soit leur date, la pente ne voulait rien dire ; le Carnet est un
aperçu lu en une seconde, l'Historique l'écran où l'on creuse. — Alternatives écartées : la piste B
(repères en kg) partout, plus proche de la maquette mais chargée pour la petite carte du Carnet ;
une bibliothèque de graphiques, inutile pour une seule courbe. — Pour revenir dessus : les pistes
sont des variantes d'un même calcul dans `shared/domain/weight-chart.ts`.

4) **L'icône d'export PDF porte une pastille Plus tant que l'utilisateur n'est pas abonné** (#341).
— Raison : le tap menait à l'écran Plus sans rien annoncer. — Alternative écartée : un libellé
« PDF · Plus », plus explicite mais trop large à côté du nom de l'animal.

5) **Écran Plus revu sur maquette Claude Design avant code : titre qui nomme la fonction payante
d'où l'on vient, bouton d'achat visible sans défiler, comparatif Android remplacé par une seule
ligne** (#342). — Raison : trop de texte, bouton d'achat hors de l'écran ; la ligne garde la règle
de CLAUDE.md (l'utilisateur comprend ce qu'Android sauvegarde déjà et ce que Plus garantit), cœur
du modèle « prix confiance ». — Alternative écartée : retirer toute mention d'Android.

6) **Les exports JSON, CSV et PDF proposent « Enregistrer sur le téléphone » et « Partager ».
L'enregistrement écrit directement dans le dossier Documents du téléphone avec `@capacitor/filesystem`
(déjà installé) et demande l'accès au stockage sur Android 7 à 10** (#343). — Raison : la feuille de
partage seule n'enregistre pas sur le téléphone ; l'écriture directe est la sauvegarde en un tap
voulue par Gaelle, sans permission sur Android 11 et plus ni code natif. — Alternatives écartées :
la fenêtre système « Enregistrer sous », qui ajoute un tap et un plugin natif à maintenir ; ne
proposer que « Partager » sur Android 7 à 10 pour éviter la permission, refusé par Gaelle. —
Correction : une première version de ce point affirmait que `@capacitor/filesystem` ne sait pas
écrire dans un dossier public sur Android 11 et plus ; c'est faux pour les fichiers que l'app crée
elle-même (doc du plugin et code de la 8.1.3).

7) **La fenêtre d'affichage de la liste « À faire » (un vaccin à 337 jours s'y affiche) se décide
en session de brainstorming, après le lot en cours** (#344).

8) **Le bouton « Ouvrir » du toast qui confirme un enregistrement (maquette B3) est reporté à plus
tard** (#349), hors du lot de #343. — Raison : il demande un outil d'ouverture de fichier absent de
l'app (nouvelle dépendance et réglage Android), et le toast dit déjà où se trouve le fichier ; Gaelle
le veut, mais plus tard. — Alternative écartée : l'ajouter dans ce lot.

9) **Courbe de poids, cas limites** (#340) : l'étiquette « max » passe sous son point quand elle
chevaucherait la pastille ; les mois sont espacés de 1, 2, 3, 6 ou 12 mois pour ne jamais dépasser
six libellés ; le dernier mois ne déborde jamais, il se cale sur la fin de l'axe ; la courbe du
Carnet gagne une dizaine de pixels pour que « min » ne touche pas les mois ; l'échelle de
l'Historique peut descendre jusqu'à 0 kg quand les données s'en approchent. — Raison : la page de
propositions n'avait pas prévu ces données (pesées récentes au plus haut, 20 mois d'historique,
chiot de 5 à 30 kg), et les étiquettes se chevauchaient ou sortaient de la carte. — Alternatives
écartées : descendre la pastille ; ne pas écrire le dernier mois.

10) **Historique du poids par pages de pesées, glisser pour remonter le temps** (#351) : l'Historique
seulement, le Carnet reste un aperçu de toute la période ; une page s'adapte au nombre de pesées
plutôt qu'à une durée fixe de 12 mois ; glisser change de page, toucher lit une pesée, appui long
puis glisser les parcourt ; l'échelle s'adapte à chaque page. Le nombre de pesées par page et le
libellé de période attendent une maquette. — Raison : seize mois tassés dans une courbe ne se
lisent plus. — Alternative écartée : une fenêtre fixe de 12 mois, qui laisse un adulte pesé
rarement avec deux points.

11) **Écran Plus, cas sans planche** (#342) : au premier chargement, « Connexion à Google Play… »
plutôt qu'un état « indisponible » avant d'avoir demandé ; « Restaurer mes achats » partout ;
« Retour » neutre après un achat ; le sous-titre dit « …restent gratuits, sans compte ni
abonnement. », qui porte l'exigence Google de dire si un abonnement est nécessaire. — Alternative
écartée : garder la seule mention « sans compte », qui ne faisait que sous-entendre la gratuité
sans abonnement.

12) **Noms des fichiers exportés** (#343) : `carnet-<nom>-AAAAMMJJ-HHmm.pdf` pour un animal
(`health-record-…` en anglais, nom simplifié en minuscules ASCII), `carnet-memopatte-…` pour tous
les animaux (#356), `memopatte-export-AAAAMMJJ-HHmm.json` ou `.zip` ; heure sur 24 h, même format
dans toutes les langues ; une seule tentative d'écriture, un suffixe ` (n)` seulement pour deux
exports dans la même minute. — Raison : la date seule obligeait à retenter sous d'autres noms et
laissait des fichiers vides quand le téléphone était plein. — Alternatives écartées : l'heure sur
12 h, ambiguë sans « am / pm » et qui casse le tri ; jamais le nom de l'animal, qui rend deux PDF
indiscernables.

13) **Depuis les Paramètres, l'export PDF exportera tous les animaux dans un seul PDF** (#356) ;
depuis le Carnet, l'animal affiché. En attendant, les Paramètres gardent le choix de l'animal, sans
carte fichier.

14) **Un seul style de toast, celui de la maquette B3 (pétrole)**, pour toute l'app (#354).

15) **Unité de poids au choix (kg ou lb) dans les Paramètres, suivie par toute l'app** (#352) ;
unités, unité par défaut et exports restent à trancher sur maquette. **Relecture complète des
textes anglais** (#353).

2026-09-23 — **Cycle de vie d'un rappel, séance de brainstorming avec Gaelle** (#344, #364).

1) **Historique complet des vaccins et des traitements, sans limite de durée.** — Raison : c'est le
carnet de santé que le véto consulte, et le volume est dérisoire (un vermifuge mensuel, douze
lignes par an). — Alternatives écartées : la dernière date seulement, qui efface une injection du
carnet quand on refait un vaccin ; deux ans d'historique pour les vermifuges et antiparasitaires,
écartés au profit de tout garder. Le PDF regroupe les prises répétées d'un traitement au lieu
d'aligner des lignes identiques ; le JSON garde chaque prise.

2) **Les médicaments au sens large (cure, traitement chronique) sont un sujet à part** (#365) :
extension du périmètre v1, qui ne cite que vaccins, vermifuges et antiparasitaires.

3) **Un rappel se marque « fait » depuis la liste « À faire », depuis le Carnet et depuis un bouton
« C'est fait » de la notification**, qui ouvre l'app (`@capacitor/local-notifications` lance
l'activité). Pour un vermifuge ou un antiparasitaire, le bouton note la prise du jour en un tap ;
pour un vaccin, il ouvre la feuille « Fait » du vaccin.

4) **Vaccin fait : date de l'injection, puis prochain rappel par raccourcis « Dans 1 an · Dans
3 ans · Autre date · Pas de rappel », rien de présélectionné**, quitte à dépasser deux taps. — Raison :
après une primo-vaccination les rappels s'espacent, un intervalle repris de la fois précédente
tromperait. — Alternative écartée : proposer le même intervalle que la dernière fois.

5) **Traitement fait : une prise à la date du jour ou à une date passée, l'échéance suivante
recalculée depuis la date réelle de la prise.**

6) **La feuille d'un rappel propose « Fait aujourd'hui », « Fait à une autre date », « Modifier »
(qui sert aussi à reporter) et, pour un traitement, « Arrêter ce traitement »** (plus de rappels,
historique gardé). — Alternatives écartées : un bouton « Reporter » dédié ; « Ignorer ce rappel »,
qui ôterait leur fiabilité aux rappels.

7) **« À faire » montre les rappels en retard et ceux des 30 prochains jours** ; quand rien n'y
tombe, l'état « Tout est à jour » annonce le prochain rappel plus lointain. — Alternatives
écartées : une fenêtre par type ; tout afficher par sections.

8) **Modèle de données de l'historique : non tranché.** Deux approches : deux tables d'historique
(`vaccination_injection`, `treatment_dose`) ou une nouvelle ligne `vaccination` par injection avec
une table de prises pour les traitements. Gaelle penche pour la seconde et veut comparer ; un
document de comparaison est préparé (`docs/technical/proposition-historique-rappels.md`).

2026-09-23 — **Finitions de #344, #350 et #354, tranchées avec Gaelle.**

1) **« À faire », état « Tout est à jour »** (#344) : quand un rappel existe au-delà de la fenêtre de
30 jours, la ligne « Prochain rappel : … » remplace « Aucun rappel à venir… », qui ne reste que s'il
n'existe aucun rappel ; la date de cette ligne ne se coupe jamais. — Raison : les deux phrases ensemble
se contredisaient (« aucun rappel à venir » puis un prochain rappel). — Alternative écartée :
reformuler la première phrase, qui aurait redit la seconde.

2) **Courbe de poids du PDF** (#350) : ligne de base et traits des mois en gris de bordure de champ
(`#B6ADA1`, déjà dans la palette), pour qu'ils restent visibles à l'impression ; le Carnet garde son
gris pâle. Plus d'écart entre le titre « Poids » et la courbe. — Alternative écartée : le gris du
Carnet, qui risquait de disparaître sur une imprimante laser.

3) **Aucune étiquette de la courbe ne touche la ligne de base** (Carnet et PDF) : « min » reste sous
son point, la courbe réserve la place nécessaire. Application de la règle « aucun chevauchement »
déjà validée pour la courbe (#340), révélée par le gris plus visible du PDF.

4) **Toasts** (#354) : style pétrole de la maquette B3 pour toute l'app ; 24 px au-dessus de la barre
du bas, et toujours au-dessus de toute barre fixe du bas (le bouton d'achat de l'écran Plus n'est plus
recouvert) ; 56 px de haut sans bouton ; trois tonalités : réussite (pétrole, coche), information
(pétrole, icône d'information), échec (couleur système `error` du thème, texte et icône blancs).
— Raison : une coche sur un message d'échec trompait ; Gaelle veut une couleur sémantique d'échec.
— Alternatives écartées : 12 px au-dessus de la barre ; un toast compact ; une couleur d'échec hors
palette.

