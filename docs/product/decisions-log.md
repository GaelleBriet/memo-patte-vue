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
