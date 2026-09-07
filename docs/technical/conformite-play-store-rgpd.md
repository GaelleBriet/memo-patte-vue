# MémoPatte — Conformité Google Play et RGPD

> **Statut** : document de référence issu d'une recherche documentaire contre des sources primaires (pages officielles Google Play / Android Developers, texte du RGPD tel que reproduit par la CNIL, pages CNIL, docs Supabase, docs PostHog, docs Capacitor, docs GitHub).
> **Date de consultation de toutes les sources : 7 septembre 2026** (sauf mention contraire).
> **Avertissement** : ceci n'est pas un avis juridique. Les citations sont reproduites depuis les pages officielles ; les conclusions « pour MémoPatte » sont des interprétations à valider avant publication.
> Les points restés incertains sont regroupés dans la section 4.

## Table des matières

1. [Obligations Google Play](#1-obligations-google-play)
   - 1.1 Politique de confidentialité (User Data policy)
   - 1.2 Section « Sécurité des données » (Data safety)
   - 1.3 Suppression de compte (Account deletion)
   - 1.4 Paiements et abonnements
   - 1.5 Autres exigences (target SDK, Play Billing Library, permissions, tests, classification, App access, déclarations)
2. [Conformité RGPD](#2-conformité-rgpd)
   - 2.1 Qualification des acteurs et DPA
   - 2.2 Données traitées (et santé animale)
   - 2.3 Bases légales, durées, droits, information, registre, AIPD, mineurs, sécurité, violation
   - 2.4 Consentement analytics (PostHog)
3. [Livrables prêts à l'emploi](#3-livrables-prêts-à-lemploi)
   - 3.1 Politique de confidentialité complète
   - 3.2 Tableau des réponses Data safety
   - 3.3 Procédure de suppression de compte
   - 3.4 Check-list « avant publication »
4. [Ce que je n'ai pas pu vérifier](#4-ce-que-je-nai-pas-pu-vérifier)
5. [Index des sources](#5-index-des-sources)

Rappel du modèle produit (donné, non remis en cause) : app Android Capacitor 8 + Vue 3, carnet de santé chiens/chats, **gratuite et complète en local (SQLite), sans compte**. « MémoPatte Plus » (abonnement annuel 7,99 € ou achat unique à vie 24,99 €, via Google Play Billing) ajoute un compte Supabase Auth (email + mot de passe, Google), sauvegarde cloud Supabase (Postgres + Storage, région Europe), restauration, multi-appareil, photos sauvegardées, export PDF. Auto Backup Android actif pour les gratuits. Analytics PostHog avec consentement explicite (épic 12). Export JSON/CSV pour tous. Pas de pub, pas de vente de données.

---

## 1. Obligations Google Play

### 1.1 Politique de confidentialité (User Data policy)

**Source primaire** : Google Play Developer Policy Center, « User Data » — <https://support.google.com/googleplay/android-developer/answer/10144311> (consulté le 07/09/2026).

| Règle (texte de Google) | Ce que ça implique pour MémoPatte |
|---|---|
| « All apps must post a privacy policy link in the designated field within Play Console, and a privacy policy link or text within the app itself. » | **Obligatoire pour toutes les apps**, y compris si l'app ne collectait rien. MémoPatte doit avoir : (a) une URL de politique dans la Play Console, (b) un lien ou le texte dans l'app (ex. écran Paramètres > Confidentialité). |
| La politique doit divulguer : « Developer information and a privacy point of contact or a mechanism to submit inquiries » ; « The types of personal and sensitive user data your app accesses, collects, uses, and shares; and any parties with which any personal or sensitive user data is shared » ; « Secure data handling procedures for personal and sensitive user data » ; « The developer's data retention and deletion policy » ; et être clairement intitulée « privacy policy ». | Le livrable 3.1 couvre chaque point. L'**entité nommée dans la fiche Play doit apparaître dans la politique** (« The entity name in the Play Store listing must appear in the privacy policy »). |
| Divulgation proéminente + consentement quand la collecte « may not be within the reasonable expectation of the user » : la divulgation doit être « within the app itself, not only in the app description or on a website », apparaître « in the normal usage of the app and not require the user to navigate into a menu », et le consentement doit « require affirmative user action », ne pas être déduit d'une navigation, ni d'un message « auto-dismissing or expiring », et intervenir « before your app can begin to collect or access » la donnée. | S'applique à **PostHog** : l'écran de consentement analytics doit être un écran in-app avec bouton d'acceptation explicite, affiché **avant** toute initialisation de PostHog. Cohérent avec l'exigence RGPD (§2.4). |
| « Limit the access, collection, use and sharing of personal and sensitive user data acquired through the app to app and service functionality » ; « Handle all personal and sensitive user data securely, including transmitting it using modern cryptography » ; « Not sell personal and sensitive user data » ; « runtime permissions request whenever available ». | HTTPS partout (Supabase et PostHog sont en TLS), pas de vente, permissions demandées au moment de l'usage. |

### 1.2 Section « Sécurité des données » (Data safety)

**Source primaire** : Play Console Help, « Provide information for Google Play's Data safety section » — <https://support.google.com/googleplay/android-developer/answer/10787469> (consulté le 07/09/2026). Version grand public : <https://support.google.com/googleplay/answer/11416267> (consulté le 07/09/2026).

#### Définitions utiles (texte Google)

- **Collected** (collectée) : « Transmitting data from your app off a user's device », y compris via bibliothèques/SDK/webviews dont l'app contrôle le comportement.
- **Shared** (partagée) : « Transferring user data collected from your app to a third party » (serveur à serveur, transfert sur l'appareil vers d'autres apps, ou via SDK/webview).
- **Exemption « sur l'appareil »** : une donnée « accessed only on your device and […] not sent off your device » n'a pas à être déclarée comme collectée (page grand public 11416267).
- **Exemption « action initiée par l'utilisateur »** (pour le *partage*) : « The data is transferred to a third party based on a specific action that you initiate, where you reasonably expect the data to be shared » (11416267).
- **Exemption « traitement éphémère »** : donnée transmise mais traitée uniquement en mémoire, non stockée après la requête.
- **SDK tiers** : « Developers must disclose all data collection and sharing by third-party libraries and SDKs », y compris les adresses IP quand elles servent à inférer une localisation ou un identifiant.
- **Encryption in transit** : déclarer si les données « collected or shared by your app [are transmitted] using encryption in transit ».
- **Deletion** : indiquer si l'on « provide[s] a way for users to request that their data is deleted ».

#### Les données de santé animale relèvent-elles de la catégorie « Health » ?

Définition Google de **« Health info »** (catégorie *Health and fitness*) : **« Information about a user's health, such as medical records or symptoms. »** (10787469).

→ La définition vise **la santé de l'utilisateur** (personne). Les vaccins, traitements et poids d'un chien ou d'un chat ne sont pas « information about a user's health ». **Conclusion : ne pas cocher « Health info »** pour les données de l'animal. Elles sont déclarées, quand elles quittent l'appareil (Plus), dans la catégorie la plus proche du contenu utilisateur : **« Other user-generated content »** (catégorie *App activity*) — voir tableau 3.2. Cette interprétation est la mienne (Google n'a pas de FAQ « animal ») : elle est rappelée en §4.

Par cohérence, la **Health apps policy** de Google (<https://support.google.com/googleplay/android-developer/answer/12261419>, consultée le 07/09/2026) définit les apps de santé comme offrant « health-related features or information » ou accédant à des « health data » ; la page ne mentionne **aucun** cas vétérinaire/animal et parle de « medical device », de « diagnose, treat, cure, or prevent any medical condition » : elle vise la santé humaine. Le formulaire **Health apps declaration** (App content) est à remplir par tous (« All developers must complete the Health apps declaration form ») : MémoPatte y répondra qu'elle **n'est pas** une app de santé au sens de cette politique.

#### Réponses Data safety pré-remplies

Voir le tableau complet en **§3.2**. Résumé de la logique :

- **Utilisateur gratuit** : SQLite local uniquement → rien n'est « collecté » au sens Google (exemption sur l'appareil). Auto Backup Android envoie les données sur le Google Drive de l'utilisateur via l'OS, chiffrées de bout en bout et **illisibles par la développeuse** (« The backup data can't be read by the user or other apps on the device », Android Developers <https://developer.android.com/identity/data/autobackup>, consulté le 07/09/2026) — je considère que ce n'est pas une collecte *par l'app* (point à confirmer, §4). Export JSON/CSV = fichier créé localement à la demande de l'utilisateur.
- **PostHog (si consenti)** : collecte *optionnelle* de données d'usage (App interactions), diagnostics/crash si activés, identifiant d'appareil/installation (Device or other IDs). L'adresse IP : à désactiver côté projet PostHog (§2.4) ; si elle est conservée, la déclarer (« including IP addresses when used to infer location or identifiers »).
- **Plus** : collecte *optionnelle* (l'utilisateur choisit Plus) de : adresse email, identifiant utilisateur, photos, contenu généré (données de l'animal), à des fins « App functionality » et « Account management ». Chiffrement en transit : oui (TLS Supabase). Suppression : oui (in-app + lien web, §1.3).
- **Partage** : aucun partage à un tiers au sens Google (Supabase et PostHog sont des prestataires agissant pour la développeuse, cf. règle Google sur les « service providers » — à vérifier dans le formulaire, §4). Google Play Billing lui-même est géré par Google.

### 1.3 Suppression de compte (Account deletion)

**Source primaire** : Play Console Help, « Provide users with an in-app path to account deletion and a web link resource » — <https://support.google.com/googleplay/android-developer/answer/13327111> (consulté le 07/09/2026).

| Exigence (texte Google) | Implication MémoPatte |
|---|---|
| Concerne les apps qui « allow users to create an account from within your app ». Définition : « An app account is a unique user identity that developers provide as a user-facing feature to serve the user across applications and/or devices (can often include use of usernames, email addresses, and passwords). » | Le compte Plus (Supabase Auth, email+MDP **ou Google**) est un « app account ». **La politique s'applique dès que Plus existe**, même si le compte est optionnel et payant (Google ne fait pas d'exception pour un compte limité à un palier payant — non écrit explicitement, cf. §4). |
| Chemin de suppression **dans l'app**, « prominent (for example, within the account settings or a similar section) ». | Bouton « Supprimer mon compte » dans Paramètres > Compte MémoPatte Plus. |
| « provide a web link resource where users can request app account deletion and associated data deletion », déclaré dans le formulaire Data safety (« All developers must complete new Data deletion questions in the Data safety form on the App content page »). | Page web publique (GitHub Pages du dépôt, §3.3) dont l'URL est saisie dans Play Console > App content > Data safety > Data deletion. |
| La page web doit être « functional », « relevant in scope », le chemin de suppression « prominently featured and easily discoverable on the page », et elle doit « reference the app or developer name ». Elle doit permettre la demande « without sending the user back to the app and requiring them to re-download it ». | La page ne peut pas se contenter de dire « réinstallez l'app ». Google admet plusieurs moyens : « an additional link that initiates account deletion, a customer service email or a form they can submit a request through ». → Un **email de contact dédié** + formulaire simple suffit. |
| Portée : « all user data indicated as collected in your data safety section ». Conservation possible « for legitimate reasons such as security, fraud prevention or regulatory compliance » si l'utilisateur en est informé (politique de confidentialité). | Supprimer tout ce qui est déclaré collecté pour Plus : email, identifiant, photos, contenu. Les **factures/achats** restent chez Google (Play Billing), pas chez MémoPatte. |
| Suppression **partielle** : la page ne mentionne pas d'option « supprimer certaines données sans supprimer le compte ». | Non exigé. On peut l'offrir en plus (ex. « effacer ma sauvegarde cloud sans fermer le compte »), mais la suppression **complète** du compte doit exister. |
| Dates : questions Data deletion obligatoires depuis le 7 déc. 2023, extension finale 31 mai 2024, ensuite « Non-compliant apps may face additional enforcement actions […] such as the removal of your app from Google Play ». | En vigueur pour toute nouvelle app. |

**Côté Supabase** (sources : <https://supabase.com/docs/guides/auth/managing-user-data>, <https://supabase.com/docs/reference/javascript/auth-admin-deleteuser>, <https://supabase.com/docs/guides/storage/security/access-control>, consultées le 07/09/2026) :

1. `auth.admin.deleteUser(id)` « Requires a `service_role` key » et « should only be called on a server. Never expose your `service_role` key in the browser » → la suppression se fait dans une **Edge Function** (ou un endpoint serveur), jamais depuis l'app.
2. Le guide recommande une table `public.profiles` qui « Reference the `auth.users` table […] Specify `on delete cascade` in the reference » : toutes les tables Plus (animaux, vaccins, poids…) doivent porter `user_id references auth.users(id) on delete cascade` pour que la suppression Auth entraîne celle des lignes.
3. Contrainte Storage citée par le guide : **« You cannot delete a user if they are the owner of any objects in Supabase Storage. »** → l'Edge Function doit **d'abord** lister et supprimer les objets du bucket photos (dossier `<user_id>/…`), **puis** appeler `deleteUser`.
4. Storage est protégé par RLS sur `storage.objects` ; le modèle recommandé restreint chaque utilisateur à son dossier : `(storage.foldername(name))[1] = (select auth.jwt()->>'sub')`. Une policy `delete` est nécessaire pour que l'utilisateur (ou la fonction) puisse effacer ses fichiers.
5. Paramètre `shouldSoftDelete` : la suppression douce « allows user identification from the hashed user ID but is not reversible » — pour le droit à l'effacement, utiliser la suppression **dure** (`false`).

### 1.4 Paiements et abonnements

**Sources primaires** :
- Payments policy — <https://support.google.com/googleplay/android-developer/answer/9858738> (consulté le 07/09/2026)
- Subscriptions policy — <https://support.google.com/googleplay/android-developer/answer/9900533> (consulté le 07/09/2026)
- Play Console Help « Create and manage subscriptions » — <https://support.google.com/googleplay/android-developer/answer/140504> (consulté le 07/09/2026)
- Play Console Help « Understanding subscriptions » — <https://support.google.com/googleplay/android-developer/answer/12154973> (consulté le 07/09/2026)
- Android Developers « Subscriptions » et « Subscription lifecycle » — <https://developer.android.com/google/play/billing/subscriptions>, <https://developer.android.com/google/play/billing/lifecycle/subscriptions> (consultés le 07/09/2026)
- Android Developers « Integrate the Google Play Billing Library » — <https://developer.android.com/google/play/billing/integrate> (consulté le 07/09/2026)
- Play Console Help « Manage your app's orders and issue refunds » — <https://support.google.com/googleplay/android-developer/answer/2741495> ; Google Play Help « Apps, games & in-app purchases refund policies » — <https://support.google.com/googleplay/answer/15574908> (consultés le 07/09/2026)
- Conditions d'utilisation de Google Play (FR) — <https://play.google.com/intl/fr_fr/about/play-terms/> ; Developer Distribution Agreement — <https://play.google/developer-distribution-agreement.html> (consultés le 07/09/2026)

#### Play Billing obligatoire

Payments policy : « Play-distributed apps requiring or accepting payment for access to in-app features or services, including any app functionality, digital content or goods (collectively "in-app purchases"), must use Google Play's billing system for those transactions. » Exemples cités : « App functionality (ad-free versions, premium features) », « Cloud software and services ». → **MémoPatte Plus (abonnement et achat à vie) doit passer par Google Play Billing**. Les exceptions (biens physiques, P2P, jeux d'argent) ne s'appliquent pas.

#### Informations à afficher avant l'achat

Subscriptions policy : vous devez divulguer clairement « your offer terms, the cost of your subscription, the frequency of your billing cycle, the automatic renewal terms, whether a subscription is required to use the app, and any other material information ». Payments policy : « Developers must clearly and accurately inform users about the terms and pricing of their app or any in-app features or subscriptions offered for purchase. »

Pratiques interdites citées : abonnement mensuel « without informing users of automatic monthly charges » ; plan annuel « prominently displaying monthly pricing breakdowns » ; « Incompletely localized pricing and terms » ; SKU trompeurs type « Free Trial » ; clics multiples provoquant un abonnement accidentel.

→ **Écran Plus de MémoPatte** : afficher côte à côte « 7,99 €/an, renouvellement automatique chaque année, annulable à tout moment dans Google Play » et « 24,99 € une fois, à vie, sans renouvellement », préciser que **l'app est utilisable gratuitement sans abonnement**, prix localisé (Google Play fournit la devise). Pas de prix « au mois » pour l'annuel.

#### Offre « à vie »

Subscriptions policy : « Subscriptions must provide sustained or recurring value to users throughout the life of the subscription » et ne peuvent pas fonctionner comme des achats uniques ; les produits sans bénéfice récurrent « must use in-app products instead ». Google ne réglemente pas le mot « à vie » en tant que tel ; l'achat à vie se modélise comme un **produit unique non consommable** (« Non-consumable purchases represent permanent entitlements that a user purchases once and owns indefinitely », doc Integrate). Rappels techniques : « Both consumable and non-consumable purchases must be acknowledged within three days, or they will be automatically refunded and entitlement revoked » ; restaurer via `queryPurchasesAsync()` « when your app launches or comes to the foreground » ; les achats sont liés au **compte Google** de l'utilisateur.

→ Décision produit à documenter : la restauration de l'achat à vie se fait par compte Google (Play), tandis que la sauvegarde se fait par compte Supabase. Il faut gérer le cas « achat sur compte Google A, compte Supabase X » (droit stocké côté serveur après vérification du jeton d'achat).

#### Annulation, remboursement

- Subscriptions policy : « easy-to-use, online method to cancel the subscription », avec accès depuis les réglages du compte (lien vers le **Google Play Subscription Center** ou processus direct). Conditions Google Play (FR) : « Vous pouvez résilier un abonnement à tout moment » ; « Les abonnements sont automatiquement facturés au début de chaque période ».
- Lifecycle : à l'annulation, « User retains access until end of current billing cycle » ; état `SUBSCRIPTION_STATE_CANCELED`, révoquer l'accès à `expiryTime`.
- Remboursements : côté utilisateur, « Within 48 hours: You may be able to get a refund depending on the details of the purchase » ; « After 48 hours: Contact the developer […] The developer can help with purchase issues and can process refunds according to their policies and applicable laws » (15574908). Côté développeuse : remboursement depuis Play Console > Order management ; « You must issue refunds in accordance with your policy. It is your responsibility to notify your users of any changes to your refund policies and ensure that the policies comply with applicable laws » ; rembourser la **dernière commande** d'un abonnement entraîne « the user's subscription is removed immediately, and future recurrences are automatically canceled » (2741495).
- Droit de rétractation UE : Conditions Google Play (FR) : le consommateur dispose d'un droit de rétractation de 14 jours, mais pour le contenu numérique « vous convenez que celui-ci est mis à votre disposition immédiatement, et vous renoncez de ce fait à votre droit légal de rétractation » ; « Les Contenus de Google Play sont proposés par Google Commerce Limited » (Irlande) qui agit comme vendeur. DDA §3.4 : « Google est le marchand officiel des Produits vendus ou proposés aux utilisateurs » dans les pays listés (dont la France) ; DDA §3.8 : « Vous autorisez Google à rembourser les utilisateurs conformément aux modalités de remboursement sur Google Play ».

→ MémoPatte doit publier une **politique de remboursement** courte (dans la fiche/politique ou page web) : « Google Play gère les remboursements dans les 48 h ; au-delà, contactez [EMAIL] ; nous remboursons en cas de dysfonctionnement avéré ». Prévoir un lien in-app « Gérer mon abonnement » vers `https://play.google.com/store/account/subscriptions`.

#### Période de grâce, account hold, expiration — valeurs

| Mécanisme | Texte source | Valeur |
|---|---|---|
| Grace period | « By default, all auto-renewing base plans have grace period enabled. » ; « Specifying lengths less than the default values may reduce the number of subscriptions recovered » ; durée configurable dans Play Console (« You can specify the length of the grace period, during which the user retains subscription entitlement »). Silent grace period minimum : **1 jour (24 h)** même si réglé à 0. | Activée par défaut, durée configurable (les valeurs exactes proposées dans la console n'apparaissent pas dans la page d'aide : §4). |
| Account hold | « By default, all auto-renewing base plans and installment plans have account hold enabled and the lengths are automatically calculated. The calculation will be 60 days minus any grace period duration. » ; « The total of account hold and grace period durations must total 30 days or more. » | Par défaut 60 j − grâce ; désactivable ; minimum combiné 30 j. |
| Pause | « between one week and three months […] annual subscriptions and free trials cannot be paused ». | **Non applicable** à l'annuel de MémoPatte. |
| Resubscribe | Option de base plan : « users can repurchase an expired auto-renewing subscription in the Play Store ». | À activer. |

Ce que **l'app doit faire** par état (Lifecycle) :

| État | Accès Plus |
|---|---|
| `ACTIVE` | Accorder. |
| `IN_GRACE_PERIOD` | **Accorder** (« During the grace period, you should ensure the user still has access »). Afficher un rappel de paiement (in-app messaging Play `TRANSACTIONAL` disponible). |
| `ON_HOLD` | **Révoquer** (« During account hold, you should ensure the user does not have access »). |
| `CANCELED` | Accorder jusqu'à `expiryTime`, puis révoquer. |
| `EXPIRED` / revoked | Révoquer immédiatement, « Remove entitlement and mark purchase as invalid in backend ». |

Décision produit recommandée à l'expiration : l'app **reste utilisable en local** (données SQLite), la sync cloud et les fonctions Plus se désactivent, la sauvegarde distante est conservée [DURÉE] avant purge (voir durées §2.3) et l'utilisateur en est informé. Le jeton d'achat « is valid from subscription signup until 60 days after expiration ».

### 1.5 Autres exigences pertinentes

| Sujet | Règle (source, consultée le 07/09/2026) | Implication MémoPatte |
|---|---|---|
| **Target SDK** | « August 31, 2026: New apps and updates must target Android 16 (API level 36) or higher » ; extension possible « to November 1, 2026 » via la page Policy status. Sinon l'app n'est visible que sur les appareils « the same or lower than your apps' target API level ». — <https://support.google.com/googleplay/android-developer/answer/11926878> | **`targetSdkVersion = 36`** dans `variables.gradle` de Capacitor (vérifier que Capacitor 8 le supporte). |
| **Play Billing Library** | « By August 31, 2026: All new apps and updates must use Billing Library version 7 or later » ; extension « Until November 1, 2026 » ; PBL 8 requis au 31 août 2027. — <https://developer.android.com/google/play/billing/deprecation-faq> | Choisir un plugin Capacitor de facturation embarquant **PBL ≥ 7** (idéalement 8). À vérifier dans le plugin retenu (§4). |
| **Notifications** | Android 13+ : « supports a runtime permission for sending non-exempt […] notifications from an app: `POST_NOTIFICATIONS` » ; à déclarer dans le manifest ; bonne pratique : demander « in context » et vérifier `areNotificationsEnabled()`. — <https://developer.android.com/develop/ui/views/notifications/notification-permission>. Capacitor Local Notifications : `POST_NOTIFICATIONS` (13+), `SCHEDULE_EXACT_ALARM` (12+) pour les rappels exacts ; `USE_EXACT_ALARM` (14+) « should only be used if the use of exact alarms is central to your app's functionality ». — <https://capacitorjs.com/docs/apis/local-notifications> | Demander `POST_NOTIFICATIONS` au moment où l'utilisateur crée son premier rappel. Pour les alarmes exactes : la Play policy exige « Complete Play Console declaration to indicate app functionality » pour **Exact Alarm** (<https://support.google.com/googleplay/android-developer/answer/9888170>). Un rappel vaccinal n'a pas besoin de la seconde près → **préférer des alarmes inexactes** et ne pas déclarer `USE_EXACT_ALARM`. |
| **Photos / caméra** | Photo and Video Permissions policy : « Apps that target Android 13 or later (API level 33+) may only request the `READ_MEDIA_IMAGES` and `READ_MEDIA_VIDEO` permissions if system pickers (like the Android Photo Picker) are not sufficient » ; sinon « remove the `READ_MEDIA_IMAGES` and `READ_MEDIA_VIDEO` permissions from my app manifest » ; conformité totale exigée depuis le 28 mai 2025. — <https://support.google.com/googleplay/android-developer/answer/14115180>. Capacitor Camera : « The Camera plugin itself requires no permissions by default » ; « When picking existing images from the device gallery, the Android Photo Picker component is now used » ; `READ/WRITE_EXTERNAL_STORAGE` seulement si `saveToGallery: true`. — <https://capacitorjs.com/docs/apis/camera> | Ne **pas** déclarer `READ_MEDIA_IMAGES` ; utiliser `pickImages`/`getPhoto` (Photo Picker) ; ne pas activer `saveToGallery`. Vérifier le manifest fusionné (`merged_manifest`) avant upload. |
| **Permissions sensibles (déclaration)** | « You may only request permissions and APIs that access sensitive information that are necessary to implement current features » ; formulaires de déclaration pour SMS/Call log, localisation en arrière-plan, All files access, `QUERY_ALL_PACKAGES`, Exact alarm. — 9888170 | Aucune permission de ces familles n'est nécessaire à MémoPatte. |
| **Tests obligatoires (compte perso créé après le 13 nov. 2023)** | « Developers with personal accounts created after November 13, 2023, must run a closed test for their app with a minimum of 12 testers who have been opted in continuously for at least 14 days. » ; « Testers who opt in, test for fewer than 14 days, and then opt out do not count » ; puis demande d'accès production (questionnaire), revue « within seven days ». — <https://support.google.com/googleplay/android-developer/answer/14151465> | Si le compte Play de Gaelle a été créé après cette date : planifier **12 testeurs × 14 jours** avant toute prod. |
| **Classification du contenu (IARC)** | « You need to complete the content rating questionnaire for both your new and existing apps » ; « Misrepresentation of your app's content may result in its removal or suspension » ; resoumettre à chaque changement de fonctionnalités affectant les réponses. — <https://support.google.com/googleplay/android-developer/answer/9859655> | Questionnaire « Utility » → classement tous publics attendu (« utility programs, product catalogues or tool apps fall into this category »). |
| **Public cible** | « If you create a new app or publish an update to an existing app, you'll be required to declare your app's target age group. » Une app visant les adultes ne doit pas avoir une fiche « appealing to children » (animations enfantines, etc.). — <https://support.google.com/googleplay/android-developer/answer/9867159> | Déclarer **18 ans et plus** (cible adultes). Attention aux visuels de la fiche : illustrations d'animaux mignonnes ≠ « pour enfants », mais éviter le style « dessin animé pour enfants ». |
| **Publicités** | Déclaration Ads dans App content obligatoire (« You must declare whether or not your app contains ads ») — <https://support.google.com/googleplay/android-developer/answer/9857753> et page « Prepare your app for review » | Déclarer « ne contient pas de publicité ». |
| **App access** | « your entire app or parts of your app are restricted based on login credentials, sign in details, memberships […] » → fournir des identifiants ; jusqu'à cinq jeux d'instructions. — <https://support.google.com/googleplay/android-developer/answer/9859455> | Le compte est optionnel mais **Plus est restreint** : fournir un compte de test Supabase (email+MDP) et l'inscrire en **License testing** (« authorized users can also purchase one-time products and subscriptions without charging their accounts » — <https://support.google.com/googleplay/android-developer/answer/6062777>) avec instructions dans « Any other instructions ». |
| **Health apps declaration** | Formulaire à remplir par tous (12261419). | Répondre « pas une app de santé » (santé humaine uniquement). |
| **Identité développeur** | Pour un compte personnel, « legal name and address are taken from the Google Payments profile you linked to your developer account » ; l'email vérifié est affiché publiquement. — <https://support.google.com/googleplay/android-developer/answer/10841920> | Vérifier avant publication ce que la Play Console annonce afficher (nom, email, téléphone, adresse). L'obligation DSA « trader » et l'affichage de l'adresse n'ont pas pu être confirmés sur une page Google (§4). |
| **Sign in with Google** | Google API Services User Data Policy : « You must publish a privacy policy that fully documents how your application interacts with user data. You must list the privacy policy URL in your OAuth client configuration when your application is made available to the public. » — <https://developers.google.com/terms/api-services-user-data-policy> | Renseigner l'URL de la politique dans l'écran de consentement OAuth (Google Cloud), cf. `docs/technical/google-oauth-setup.md`. |

---

## 2. Conformité RGPD

Texte du règlement (UE) 2016/679 : EUR-Lex <https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32016R0679> ; reproduction par article sur le site de la CNIL (utilisée ici pour les citations) : chapitre I <https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre1>, II <…/chapitre2>, III <…/chapitre3>, IV <…/chapitre4> (consultés le 07/09/2026).

### 2.1 Qualification des acteurs et DPA

- **Responsable du traitement** (art. 4-7) : « la personne physique ou morale […] qui, seul ou conjointement avec d'autres, détermine les finalités et les moyens du traitement ». **Sous-traitant** (art. 4-8) : « la personne physique ou morale […] qui traite des données à caractère personnel pour le compte du responsable du traitement ». La CNIL (« Responsable du traitement, sous-traitants : comment bien identifier son rôle ? », <https://www.cnil.fr/fr/rgpd-comment-bien-identifier-son-role>) précise que le responsable « détermine à la fois les objectifs et les moyens du traitement » et donne comme exemple de sous-traitant un développeur d'application mobile assurant la maintenance pour un client.
- → **Gaelle (auto-entrepreneure) est responsable du traitement** pour les données Plus et PostHog : elle décide de collecter l'email, les photos, les données d'usage, et des durées. Une personne physique en nom propre peut être responsable de traitement (art. 4-7 : « personne physique ou morale »).
- **Sous-traitants** : Supabase (hébergement Auth/Postgres/Storage) et PostHog (analytics). Obligations du responsable (CNIL « Travailler avec un sous-traitant », <https://www.cnil.fr/fr/sous-traitant>) : choisir un prestataire qui « présente des garanties suffisantes » et conclure un **contrat écrit** contenant les mentions de l'art. 28-3 (traitement « que sur instruction documentée du responsable du traitement », confidentialité, sécurité, sous-traitance ultérieure, assistance, suppression/restitution, audit). Guide CNIL sous-traitant : <https://www.cnil.fr/sites/cnil/files/atoms/files/rgpd-guide_sous-traitant-cnil.pdf>.
- **Google** : pour Play Billing, Google est **vendeur/marchand officiel** (« Google est le marchand officiel des Produits », DDA §3.4 ; « Les Contenus de Google Play sont proposés par Google Commerce Limited », Conditions Google Play) → Google agit comme **responsable de traitement autonome** pour les paiements ; MémoPatte ne reçoit pas les données bancaires. Pour Sign in with Google, Google fournit un service d'identité à l'utilisateur sous ses propres conditions ; MémoPatte ne reçoit que l'email/identifiant via Supabase Auth. (Qualification « responsable autonome » = mon analyse, non issue d'une page Google explicite — §4.)

| Prestataire | DPA | Hébergement UE | Sous-traitants ultérieurs |
|---|---|---|---|
| **Supabase** | DPA disponible : <https://supabase.com/legal/dpa> — « Supabase acts as a processor/service provider, and Customer as controller/business under the Agreement and this DPA » ; il « supplements and forms part of the Supabase Terms of Service » ; inclut les clauses contractuelles types (SCC) ; page sécurité : « A Data Processing Agreement (DPA) is available for customers who need a formal GDPR data processing contract » (<https://supabase.com/security>). Le mode de signature (auto-incorporé aux CGU vs. document à signer) n'est pas explicite : §4. | Régions AWS : « Central EU (Frankfurt), eu-central-1 », « West EU (Paris), eu-west-3 », Irlande, Londres, Stockholm, Zurich (<https://supabase.com/docs/guides/platform/regions>). « When you create a project in an AWS region, your Postgres database, Auth service, and Storage objects are hosted in that region » (security). Chiffrement : « All customer data is encrypted at rest with AES-256 and in transit via TLS ». SOC 2 Type 2, ISO 27001. | Liste : <https://supabase.com/legal/customer-resources/subprocessor-list> (PDF « Updated June 1, 2026 » ; abonnement aux notifications, préavis « at least thirty (30) days »). |
| **PostHog** | DPA auto-service : « Head to app.posthog.com/legal inside your PostHog organization […] generate a real, valid DPA — countersigned by us » ; envoi PandaDoc pour signature ; inclut les SCC (§10.4) ; PostHog « participates in the EU-US Data Privacy Framework » (<https://posthog.com/dpa>, <https://posthog.com/docs/privacy>). | **PostHog Cloud EU existe** : « a managed version of PostHog that's hosted on servers based in Frankfurt » ; « ensuring user data never leaves EU jurisdiction » (<https://posthog.com/docs/privacy/gdpr-compliance>, <https://posthog.com/docs/privacy>). Hôte API : `https://eu.i.posthog.com` (<https://posthog.com/docs/getting-started/cloud>). | <https://posthog.com/subprocessors> : AWS « Germany (PostHog EU Cloud) », PlanetScale et Modal Labs « Germany (PostHog EU Cloud) », Wiz (Allemagne/France), **Cloudflare « Global edge locations (dynamic, worldwide) »** (point d'attention transferts : §4). |

→ **Actions** : créer le projet Supabase en région **Paris (eu-west-3) ou Francfort**, conserver une copie du DPA Supabase ; créer l'organisation PostHog sur **EU Cloud** et **signer le DPA** via app.posthog.com/legal.

### 2.2 Données traitées (et santé animale)

**Définition** (art. 4-1) : donnée à caractère personnel = « toute information se rapportant à une personne physique identifiée ou identifiable ».

| Donnée | Personnelle ? | Commentaire |
|---|---|---|
| Email, identifiant Supabase, identifiant Google | Oui | Identifient directement. |
| Données de l'animal (nom, race, vaccins, traitements, poids) | **Oui dès qu'elles sont rattachées à un compte** (Plus) : elles « se rapportent » au propriétaire identifiable (information sur son animal, ses habitudes, ses dépenses). En local sans compte, elles ne sont traitées par personne d'autre que l'utilisateur → hors périmètre de la développeuse. | Interprétation fondée sur la largeur de « toute information se rapportant à ». |
| Photos des animaux | Oui si rattachées au compte (contenu, métadonnées, éventuellement des personnes visibles). | Sauvegardées uniquement en Plus. |
| Données d'usage PostHog (événements, écrans, identifiant d'installation, modèle d'appareil) | Oui (identifiant d'appareil = personne identifiable indirectement). | IP : « IP addresses can be considered personal data under GDPR » (PostHog gdpr-compliance). |
| Achats Play | Traités par Google (marchand). MémoPatte reçoit un jeton d'achat / état d'abonnement. | Le jeton lié au compte est une donnée personnelle. |

**Données de santé (art. 9) ?** Art. 4-15 : « les données à caractère personnel relatives à la santé physique ou mentale **d'une personne physique** ». CNIL, « Qu'est-ce qu'une donnée de santé ? » (<https://www.cnil.fr/fr/quest-ce-ce-quune-donnee-de-sante>) : « les données relatives à la santé physique ou mentale, passée, présente ou future, **d'une personne physique** […] qui révèlent des informations sur l'état de santé de cette personne ». → **Les vaccins, traitements et poids d'un chien ou d'un chat ne sont pas des données de santé au sens de l'art. 9** : elles concernent un animal, pas une personne physique. Elles ne deviennent pas non plus « données de santé par croisement » du propriétaire, sauf cas très particulier (ex. traitement d'un chien d'assistance révélant un handicap du maître) — cas marginal à mentionner, pas de traitement spécifique attendu. Aucune catégorie particulière n'est donc traitée → pas de condition d'art. 9-2 à remplir, pas d'AIPD obligatoire sur ce critère.

### 2.3 Bases légales, durées, droits, information, registre, AIPD, mineurs, sécurité, violation

#### Bases légales (art. 6-1)

| Traitement | Base légale | Justification |
|---|---|---|
| Compte Plus, sauvegarde cloud, restauration, multi-appareil, photos, export PDF | **Exécution du contrat** (art. 6-1-b) | Le traitement est « nécessaire à l'exécution d'un contrat auquel la personne concernée est partie » : l'utilisateur achète Plus pour obtenir précisément ce service. |
| Vérification de l'achat Play (jeton, état d'abonnement) | Exécution du contrat (6-1-b) | Nécessaire pour ouvrir/fermer le droit Plus. |
| Analytics PostHog | **Consentement** (art. 6-1-a) — voir §2.4 pour l'articulation avec l'art. 82 loi Informatique et Libertés | Non nécessaire au service ; consentement retirable aussi simplement que donné (art. 7-3 : « aussi simple de retirer que de donner son consentement »). |
| Support par email (réponse aux demandes, remboursements) | Intérêt légitime (6-1-f) ou exécution du contrat selon le cas | Répondre à une demande de l'utilisateur. |
| Journaux techniques Supabase (logs d'accès, sécurité) | Intérêt légitime (6-1-f) | Sécurité du service ; durée courte. |
| Rappels locaux, données SQLite du mode gratuit | **Aucun traitement par la développeuse** | Tout reste sur l'appareil ; le RGPD s'applique à l'utilisateur pour son usage personnel (exemption « activité strictement personnelle », art. 2-2-c, non citée ici mais classique) — MémoPatte n'a pas accès. |

#### Durées de conservation proposées (art. 5-1-e ; CNIL « Les durées de conservation des données », <https://www.cnil.fr/fr/les-durees-de-conservation-des-donnees>)

Principe CNIL : « Les données personnelles ne peuvent pas être conservées indéfiniment » ; trois phases (base active, archivage intermédiaire, suppression/archivage définitif) ; en l'absence de texte, le responsable doit justifier la durée par la finalité.

| Donnée | Base active | Archivage / suppression | Note |
|---|---|---|---|
| Compte Plus + données synchronisées + photos | Tant que le compte existe | Suppression **immédiate** à la demande (in-app / web) ; sinon **[12] mois après expiration** du dernier droit Plus sans réactivation, après avertissement par email à J-30 | Valeur à décider par Gaelle ; 12 mois laisse le temps de réabonner et de restaurer. |
| Compte Plus jamais réactivé / inactif | — | Même règle | — |
| Jeton d'achat Play et état d'abonnement | Durée du droit + 60 jours | Puis suppression | Le jeton Play n'est plus utilisable « 60 days after expiration ». |
| Événements PostHog | **[13] mois** max (aligné sur les critères CNIL de mesure d'audience : traceur ≤ 13 mois, données ≤ 25 mois) | Suppression automatique (réglage de rétention côté projet : §4) | Voir §2.4. |
| Emails de support | Durée de traitement de la demande + **[1] an** | Suppression | Preuve en cas de litige. |
| Logs techniques Supabase | Rétention par défaut de la plateforme (courte) | — | Documenter la valeur constatée. |
| Pièces comptables (factures Play reçues par Gaelle) | 10 ans (Code de commerce, cité par la CNIL : « The Code of Commerce requires retention of billing data for 10 years ») | — | Ce sont les relevés Google, pas des données utilisateur individuelles détenues par MémoPatte. |

#### Droits des personnes et exercice

- **Accès** (art. 15), **rectification** (16), **effacement** (17-1 : « dans les meilleurs délais »), **limitation** (18), **portabilité** (20-1 : « dans un format structuré, couramment utilisé et lisible par machine »), **opposition** (21), **retrait du consentement** (7-3), **réclamation à la CNIL** (77).
- Délai : art. 12-3, « dans les meilleurs délais et en tout état de cause dans un délai d'un mois ».
- Mise en œuvre MémoPatte :
  - **Export JSON/CSV in-app** = réponse native au **droit à la portabilité** (format structuré, lisible par machine) et, en pratique, au droit d'accès pour le contenu ; compléter par une réponse manuelle par email pour les métadonnées (email, dates, achats).
  - **Suppression de compte in-app + page web** = **droit à l'effacement** ; effet immédiat côté Supabase (Edge Function §1.3) ; côté PostHog, supprimer la personne (« Click **Delete person** to remove them and all their associated data » ; l'API DELETE Persons avec `delete_events=true` ; « event data […] is cleared asynchronously during non-peak usage times (weekends on PostHog Cloud) », <https://posthog.com/docs/privacy/data-storage>).
  - **Retrait du consentement analytics** = interrupteur dans Paramètres (appelle `posthog.opt_out_capturing()`), aussi simple que l'activation.
  - Contact : [EMAIL DE CONTACT] (cité dans la politique et la fiche Play).

#### Mentions d'information obligatoires (art. 13 ; CNIL « Conformité RGPD : information des personnes et transparence », <https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence>)

Liste CNIL : « Identité et coordonnées de l'organisme (responsable du traitement de données) », « Finalités », « Base légale du traitement de données », « Caractère obligatoire ou facultatif du recueil des données », « Destinataires ou catégories de destinataires des données », « Durée de conservation des données (ou critères permettant de la déterminer) », « Droits des personnes concernées », « Coordonnées du délégué à la protection des données » (s'il existe), « Droit d'introduire une réclamation auprès de la CNIL », plus transferts hors UE le cas échéant. Moment : « au moment du recueil » pour la collecte directe. La CNIL recommande une information **par niveaux** (« mettre en avant les informations essentielles et d'offrir un accès simple » au reste) → écran de consentement PostHog et écran de création de compte avec 2-3 lignes + lien vers la politique complète (§3.1).

#### Registre des traitements (art. 30)

Art. 30-5 : l'obligation « ne s'applique pas à une entreprise ou une organisation comptant moins de 250 employés, sauf si le traitement qu'elles effectuent est susceptible de comporter un risque […], s'il n'est pas occasionnel ou s'il porte notamment sur les catégories particulières de données ». Position CNIL (<https://www.cnil.fr/fr/RGDP-le-registre-des-activites-de-traitement>) : la dérogation « est donc limitée à des cas très particuliers de traitements » ; les organismes de moins de 250 salariés doivent inscrire les traitements **non occasionnels** (« paie, gestion clients ») ; « En cas de doute sur l'application de cette dérogation à un traitement, la CNIL vous recommande de l'intégrer dans votre registre ». → La gestion des comptes Plus et l'analytics sont **non occasionnels** : **tenir un registre**, même en micro-entreprise. La CNIL fournit un **modèle simplifié (ODS)** sur la même page. Contenu minimal : responsable, finalités, catégories de personnes et de données, destinataires, transferts, durées, mesures de sécurité.

#### Analyse d'impact (AIPD, art. 35)

Art. 35-1 : obligatoire lorsqu'un traitement est « susceptible d'engendrer un risque élevé ». CNIL (<https://www.cnil.fr/fr/ce-quil-faut-savoir-sur-lanalyse-dimpact-relative-la-protection-des-donnees-aipd>) : AIPD requise si le traitement réunit **au moins deux** des neuf critères CEPD (évaluation/scoring, décision automatisée, surveillance systématique, données sensibles ou hautement personnelles, grande échelle, croisement, personnes vulnérables, technologie innovante, exclusion d'un droit/contrat). Listes CNIL : traitements obligatoires (délib. 2018-327) et exemptés (délib. 2019-118, <https://www.legifrance.gouv.fr/affichTexte.do?cidTexte=JORFTEXT000039248939>).

→ MémoPatte : pas de données sensibles (§2.2), pas de scoring, pas de surveillance, pas de grande échelle (micro-éditeur), pas de croisement, technologie standard, pas de personnes vulnérables ciblées. **Zéro critère → AIPD non requise.** Documenter cette conclusion (une page) dans le registre. La délibération 2019-118 rappelle que l'exemption d'AIPD « ne dispense pas des autres obligations du RGPD, notamment concernant la sécurité des données (article 32) ».

#### Mineurs

Art. 8-1 : consentement d'un enfant valable à partir de 16 ans, les États membres pouvant abaisser jusqu'à 13. France : **15 ans** (art. 45 loi Informatique et Libertés) — CNIL, « Recommandation 4 : rechercher le consentement d'un parent pour les mineurs de moins de 15 ans », <https://www.cnil.fr/fr/recommandation-4-rechercher-le-consentement-dun-parent-pour-les-mineurs-de-moins-de-15-ans> : pour les services en ligne reposant sur un consentement non contractuel, « le ou les titulaires de l'autorité parentale doivent donner leur accord conjointement avec celui de leur enfant si celui-ci a moins de 15 ans ». La CNIL note que ce cadre « ne s'applique pas aux traitements contractuels ».

→ MémoPatte cible des **adultes** (déclaration Play « 18+ », §1.5). Mesures proportionnées : mention dans la politique (« réservée aux personnes de 18 ans et plus ; suppression sur demande d'un parent »), pas de mécanisme de vérification d'âge (aucune obligation identifiée pour un service non destiné aux mineurs), le consentement analytics n'est demandé qu'à des utilisateurs déclarés adultes.

#### Sécurité (art. 32)

Art. 32-1 : mesures « appropriées au risque », dont « la pseudonymisation et le chiffrement des données à caractère personnel ». Guide CNIL de la sécurité des données personnelles (25 fiches, dont « Authentifier les utilisateurs », « Chiffrement », « Sauvegardes », « Traçage des opérations », « Gestion de la sous-traitance », « Cloud », « Applications mobiles », « API ») : <https://www.cnil.fr/fr/guide-de-la-securite-des-donnees-personnelles>.

Mesures MémoPatte à documenter dans le registre :
- **RLS** sur toutes les tables Plus (`user_id = auth.uid()`) et sur `storage.objects` (dossier par utilisateur) ; « By default Storage does not allow any uploads to buckets without RLS policies » (Supabase).
- Clé `service_role` uniquement côté Edge Functions ; clé `anon`/publishable dans l'app avec RLS.
- TLS en transit (Supabase, PostHog) ; AES-256 au repos chez Supabase.
- Mots de passe : politique de longueur minimale Supabase Auth ; option Google Sign-In.
- Sauvegardes : celles de la plateforme Supabase (documenter le plan) ; Auto Backup Android chiffré de bout en bout sur Android 9+ (« end-to-end encrypted on devices running Android 9 or higher using the device's PIN, pattern, or password »).
- Journalisation : logs Supabase (Auth/API) ; pas de logs applicatifs contenant des données personnelles.
- Minimisation : ne synchroniser que les tables nécessaires ; pas de collecte de contacts, localisation, etc.
- Dépôt public GitHub : **aucun secret** dans le code (clé service_role, DSN, etc.), scan de secrets activé.

#### Notification de violation (art. 33-34)

Art. 33-1 : notification à la CNIL « dans les meilleurs délais et, si possible, 72 heures au plus tard » après en avoir pris connaissance, si la violation présente un risque ; art. 34-1 : communication aux personnes si « risque élevé ». CNIL (<https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles>) : téléservice <https://notifications.cnil.fr/notifications/> ; notification en deux temps possible ; **documentation interne obligatoire de toutes les violations**, même non notifiées (nature, personnes/enregistrements concernés, conséquences, mesures). Le DPA Supabase et le DPA PostHog prévoient l'information du client en cas de violation chez le sous-traitant (clauses art. 28-3-f) → prévoir une fiche « procédure incident » d'une page.

### 2.4 Consentement analytics (PostHog)

#### Ce que PostHog collecte par défaut (docs PostHog, consultées le 07/09/2026)

- `autocapture` : « Default: true » — capture « clicks, taps, and other user interactions » sur « a, button, form, input, select, textarea, label » ; « does not automatically capture form values from form submissions » ; désactivable par `autocapture: false` (<https://posthog.com/docs/product-analytics/autocapture>, <https://posthog.com/docs/libraries/js/config>).
- `capture_pageview` / `capture_pageleave` : « Default: true ».
- `disable_session_recording` : « Default: false » (mais l'enregistrement de session doit être activé côté projet).
- `persistence` : « Default: localStorage+cookie » ; options « localStorage, sessionStorage, cookie, memory, or localStorage+cookie ».
- Identifiants : `distinct_id` et `$device_id` générés côté client ; « PostHog captures distinct_id alongside device identifiers and IP-derived geolocation by default » (<https://posthog.com/docs/privacy/data-collection>).
- **Adresse IP** : « IP addresses can be considered personal data under GDPR » ; réglage projet/organisation « Discard client IP data » ; « EU organizations automatically default to IP capture disabled » (gdpr-compliance, data-collection).
- `opt_out_capturing_by_default` : « Default: false » ; `opt_out_persistence_by_default` : « Default: false » ; `cookieless_mode: 'on_reject'` disponible ; `property_denylist`, `before_send` pour filtrer.
- Intégration Capacitor : PostHog n'a **pas** de SDK Capacitor officiel ; la doc renvoie au plugin communautaire `@capawesome/capacitor-posthog` (« built by the Capawesome team. It is not maintained by the PostHog core team ») ou à `posthog-js` dans la webview (<https://posthog.com/docs/libraries/capacitor>).

#### Le CNIL admet-elle un simple opt-out pour la mesure d'audience ?

Source : CNIL, « Cookies : solutions pour les outils de mesure d'audience », <https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies-solutions-pour-les-outils-de-mesure-daudience> (consultée le 07/09/2026). L'exemption de consentement (art. 82 loi Informatique et Libertés) s'applique **aussi aux applications mobiles** et exige cumulativement :

1. finalité « strictement limitée à la seule mesure de l'audience du site ou de l'application […] pour le compte exclusif de l'éditeur » ;
2. « servir à produire des données statistiques anonymes uniquement » ;
3. pas de « recoupement de données avec d'autres traitements », pas de « suivi global de la navigation de la personne utilisant différentes applications ou naviguant sur différents sites web » ;
4. durée de vie du traceur limitée (« treize mois ») ;
5. conservation des données « durée maximale de vingt-cinq mois » ;
6. information claire et **mécanisme d'opposition** utilisable sur tous les appareils.

La CNIL a publié des guides de configuration « exemptée » pour des solutions précises (Matomo, AT Internet/Piano, etracker, Marfeel…), par ex. <https://www.cnil.fr/sites/default/files/atoms/files/matomo_analytics_-_exemption_-_guide_de_configuration.pdf>. **Aucun guide PostHog** n'apparaît dans ces publications.

**Conclusion pour PostHog** : le produit est un outil de *product analytics* (événements par personne, profils, feature flags, session replay, `distinct_id` persistant) ; en configuration par défaut, il ne produit pas « des données statistiques anonymes uniquement » et permet le suivi individuel → **hors exemption**. Le projet a déjà choisi le consentement explicite (épic 12) : c'est la voie sûre. Un opt-out ne suffirait qu'avec une configuration très restreinte (pas d'identification, IP écartée, pas de replay, agrégation) et sans validation CNIL — ne pas s'y engager.

#### Implémentation opt-in recommandée

```ts
// Initialisation : rien ne part tant que l'utilisateur n'a pas accepté
posthog.init('<PROJECT_KEY>', {
  api_host: 'https://eu.i.posthog.com',      // EU Cloud (Francfort)
  opt_out_capturing_by_default: true,          // opt-in strict
  opt_out_persistence_by_default: true,        // pas de stockage avant consentement
  autocapture: false,                          // événements explicites uniquement
  capture_pageview: false,                     // on capture les écrans à la main si besoin
  disable_session_recording: true,
  persistence: 'localStorage',                 // pas de cookie dans la webview
  property_denylist: ['$ip'],                  // ceinture et bretelles ; désactiver aussi l'IP côté projet
})
// Écran de consentement (in-app, action positive, avant toute collecte) :
onAccept()  => posthog.opt_in_capturing()
onRefuse()  => posthog.opt_out_capturing()   // état par défaut, on ne fait rien de plus
// Paramètres > Confidentialité : interrupteur qui appelle opt_in/opt_out (retrait aussi simple que l'octroi)
```

Références : `opt_out_capturing_by_default: true` puis `posthog.opt_in_capturing()` « when users grant consent » (<https://posthog.com/docs/privacy/data-collection>). Côté projet PostHog : activer « Discard client IP data », fixer la rétention, ne **jamais** appeler `identify()` avec l'email (utiliser au plus l'UUID Supabase, ou rester anonyme), exclure les écrans où figurent des données saisies (`ph-no-capture` si autocapture réactivé).

---

## 3. Livrables prêts à l'emploi

### 3.1 Politique de confidentialité — MémoPatte

> À publier (1) à l'URL déclarée dans la Play Console (GitHub Pages du dépôt, ex. `https://gaellebriet.github.io/memo-patte-vue/confidentialite.html`), (2) dans l'app (Paramètres > Confidentialité, texte ou lien). Les crochets sont à compléter par Gaelle. Le nom d'entité doit être identique à celui affiché sur la fiche Play.

---

**Politique de confidentialité de MémoPatte**

*Dernière mise à jour : [DATE]*

**1. Qui est responsable de vos données ?**
MémoPatte est éditée par [NOM], entrepreneure individuelle (auto-entrepreneure) établie en France, [ADRESSE OU « adresse communiquée sur demande »], SIRET [SIRET]. [NOM] est responsable du traitement au sens du Règlement (UE) 2016/679 (RGPD).
Contact pour toute question relative à vos données : [EMAIL DE CONTACT].

**2. En bref**
- MémoPatte fonctionne **sans compte** : vos données (animaux, vaccins, traitements, poids, photos, rappels) sont stockées **uniquement sur votre appareil**. Nous n'y avons pas accès.
- Si vous souscrivez à **MémoPatte Plus**, vous créez un compte et vos données sont sauvegardées sur nos serveurs hébergés dans l'Union européenne, pour vous permettre de les restaurer et de les retrouver sur plusieurs appareils.
- Les statistiques d'utilisation anonymisées (PostHog) ne sont activées **que si vous l'acceptez** explicitement. Vous pouvez changer d'avis à tout moment.
- Nous n'affichons **aucune publicité** et ne **vendons jamais** vos données.

**3. Quelles données, pour quoi, sur quelle base**

| Usage | Données | Finalité | Base légale | Obligatoire ? |
|---|---|---|---|---|
| Utilisation de l'app (gratuite) | Données saisies (animaux, santé de l'animal, poids, photos, rappels) | Fonctionnement de l'app sur votre appareil | Aucun traitement par nos soins : les données restent sur votre appareil | — |
| Sauvegarde Android (Auto Backup) | Base de données locale de l'app | Restauration par Android sur un nouvel appareil | Fonction du système Android, liée à votre compte Google, chiffrée avec votre code d'écran ; nous ne pouvons pas la lire | Désactivable dans les réglages Android |
| Compte MémoPatte Plus | Adresse email, mot de passe (haché) ou identifiant Google, identifiant de compte, date de création | Créer et sécuriser votre compte | Exécution du contrat (art. 6-1-b) | Oui pour Plus |
| Sauvegarde et synchronisation Plus | Vos animaux et leur carnet (vaccins, traitements, poids, notes), vos photos | Sauvegarde cloud, restauration, multi-appareil, export PDF | Exécution du contrat (art. 6-1-b) | Oui pour Plus |
| Achat Plus | Jeton d'achat Google Play, état de l'abonnement, dates | Activer et vérifier votre accès Plus | Exécution du contrat (art. 6-1-b) | Oui pour Plus |
| Statistiques d'utilisation | Événements d'usage (écrans consultés, fonctions utilisées), identifiant d'installation aléatoire, modèle d'appareil, version d'Android et de l'app, pays approximatif. **Adresse IP non conservée.** Jamais le contenu de vos carnets ni votre email. | Comprendre l'usage pour améliorer l'app | Consentement (art. 6-1-a) | Non — activées uniquement si vous acceptez |
| Support | Votre email et le contenu de vos messages | Répondre à vos demandes, gérer les remboursements | Intérêt légitime / contrat | — |

Nous ne traitons **aucune donnée de santé humaine** : les informations de santé concernent vos animaux.

**4. Qui a accès à vos données (sous-traitants et hébergement)**

| Prestataire | Rôle | Lieu | Cadre |
|---|---|---|---|
| Supabase, Inc. | Hébergement du compte, de la base de données et des photos Plus | Union européenne (AWS, région [Paris (eu-west-3) / Francfort (eu-central-1)]) | Contrat de sous-traitance (DPA) — supabase.com/legal/dpa |
| PostHog, Inc. | Statistiques d'utilisation (si consenties) | PostHog Cloud EU (Francfort, Allemagne) | Contrat de sous-traitance (DPA) |
| Google (Google Play / Google Commerce Limited) | Vente et facturation de MémoPatte Plus, connexion « Se connecter avec Google » (si choisie) | Selon les conditions de Google | Google agit pour son propre compte ; nous ne recevons pas vos données bancaires. Politique : policies.google.com/privacy |

Aucune donnée n'est vendue ni transmise à des annonceurs. Aucun transfert hors de l'UE n'est organisé par nos soins ; les prestataires ci-dessus peuvent recourir à des sous-traitants ultérieurs listés sur leurs sites (supabase.com/legal/customer-resources/subprocessor-list, posthog.com/subprocessors), encadrés par des clauses contractuelles types le cas échéant.

**5. Combien de temps**
- Données locales : sous votre contrôle ; supprimées quand vous désinstallez l'app ou effacez ses données.
- Compte et sauvegarde Plus : tant que votre compte existe. Après la fin de votre accès Plus sans réactivation, votre sauvegarde est conservée **[12] mois** puis supprimée (vous êtes prévenu par email un mois avant). La suppression de compte efface tout immédiatement.
- Jeton d'achat : durée de l'accès Plus + 60 jours.
- Statistiques d'utilisation : **[13] mois** maximum.
- Échanges de support : [1] an après la clôture de la demande.

**6. Vos droits**
Vous disposez des droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité, ainsi que du droit de retirer votre consentement à tout moment.
- **Exporter vos données** : Paramètres > Exporter (JSON/CSV), disponible pour tous, gratuit ou Plus.
- **Supprimer votre compte Plus et toutes les données associées** : Paramètres > Compte > Supprimer mon compte, ou via la page [URL PAGE SUPPRESSION]. La suppression est immédiate et irréversible ; vos données locales restent sur votre appareil.
- **Désactiver les statistiques** : Paramètres > Confidentialité.
- Pour toute autre demande : [EMAIL DE CONTACT]. Nous répondons sous un mois.
- Vous pouvez introduire une réclamation auprès de la CNIL (www.cnil.fr).

**7. Sécurité**
Les échanges avec nos serveurs sont chiffrés (TLS). Les données Plus sont chiffrées au repos chez notre hébergeur (AES-256) et cloisonnées par utilisateur (règles d'accès au niveau de la base de données : chaque compte ne peut lire et modifier que ses propres données). Les mots de passe ne sont jamais stockés en clair. En cas de violation de données présentant un risque élevé pour vous, nous vous en informerons conformément à l'article 34 du RGPD.

**8. Mineurs**
MémoPatte s'adresse aux personnes de 18 ans et plus. Si vous pensez qu'un mineur a créé un compte, écrivez-nous à [EMAIL DE CONTACT] : nous le supprimerons.

**9. Permissions Android utilisées**
- *Notifications* : afficher vos rappels (vaccins, traitements). Demandée quand vous créez un rappel.
- *Sélecteur de photos / appareil photo* : ajouter une photo de votre animal. Nous n'accédons pas à l'ensemble de votre galerie.
Aucune localisation, aucun contact, aucun SMS.

**10. Modifications**
Cette politique peut évoluer. La date de mise à jour figure en tête ; en cas de changement important, vous en serez informé dans l'app. Historique des versions : [URL DU DÉPÔT/dossier docs].

---

### 3.2 Tableau des réponses Data safety (Play Console > App content > Data safety)

**Questions générales**

| Question Play Console | Réponse | Justification |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Oui** | Plus (email, contenu, photos) et PostHog (si consenti). |
| Is all of the user data collected by your app encrypted in transit? | **Oui** | TLS Supabase et PostHog. |
| Do you provide a way for users to request that their data is deleted? | **Oui** | Suppression de compte in-app + lien web. |
| Data deletion : « Users can request account deletion » URL | `[URL PAGE SUPPRESSION]` | §3.3. |
| Data deletion : « Users can request that some or all data be deleted » (si proposé) | Oui, via la même page/email | Suppression partielle offerte en option. |

**Types de données** (☐ = ne pas cocher ; C = Collected ; S = Shared ; Opt = optionnel ; Req = requis). « Optionnel » = l'utilisateur peut utiliser l'app sans fournir la donnée (le mode gratuit ne collecte rien).

| Catégorie / type | Gratuit sans consentement analytics | Gratuit + PostHog consenti | Plus | Déclaration finale (union) | Finalités |
|---|---|---|---|---|---|
| Personal info › **Email address** | ☐ | ☐ | C, Opt | **C, Opt** | Account management, App functionality |
| Personal info › **User IDs** | ☐ | ☐ | C, Opt | **C, Opt** | Account management, App functionality |
| Personal info › Name / Address / Phone | ☐ | ☐ | ☐ | ☐ | — |
| **Photos and videos › Photos** | ☐ | ☐ | C, Opt | **C, Opt** | App functionality |
| App activity › **App interactions** | ☐ | C, Opt | (idem si consenti) | **C, Opt** | Analytics |
| App activity › **Other user-generated content** (carnets des animaux) | ☐ | ☐ | C, Opt | **C, Opt** | App functionality |
| App activity › In-app search history / Installed apps / Other actions | ☐ | ☐ | ☐ | ☐ | — |
| App info and performance › **Crash logs** | ☐ | C, Opt (si activés) | (idem) | **C, Opt** si la capture d'erreurs PostHog est activée, sinon ☐ | Analytics |
| App info and performance › **Diagnostics** | ☐ | C, Opt (si activés) | (idem) | idem | Analytics |
| **Device or other IDs** | ☐ | C, Opt (`$device_id`/identifiant d'installation) | (idem) | **C, Opt** | Analytics |
| Location (approximate / precise) | ☐ | ☐ (IP écartée côté projet ; ne pas cocher si « Discard client IP data » est actif) | ☐ | ☐ | — |
| Financial info › Purchase history | ☐ | ☐ | ☐ (géré par Google Play, MémoPatte ne stocke qu'un jeton d'achat : à assimiler à *User IDs*) | ☐ | — (voir §4) |
| Health and fitness › **Health info** | ☐ | ☐ | ☐ | **☐** — définition Google : « Information about a **user's** health » ; santé animale ≠ santé de l'utilisateur | — |
| Contacts, Calendar, Messages, Audio, Files & docs, Web browsing | ☐ | ☐ | ☐ | ☐ | — |

**Colonne « Shared »** : rien n'est coché — aucun transfert à un tiers pour ses propres fins ; Supabase/PostHog traitent pour le compte de la développeuse (règle Google sur les prestataires à confirmer dans le formulaire, §4). L'export JSON/CSV/PDF est une action initiée par l'utilisateur.

**Autres cases** : « Data is processed ephemerally » : non. « Users can choose whether data is collected » : oui pour tous les types (opt-in Plus / consentement analytics).

### 3.3 Procédure de suppression de compte

**A. Dans l'app (Plus)** — Paramètres > Compte > *Supprimer mon compte*
1. Écran d'explication : « Cette action supprime définitivement votre compte MémoPatte Plus, votre sauvegarde cloud et vos photos sauvegardées. Vos données locales sur cet appareil sont conservées. Votre abonnement Google Play n'est pas annulé automatiquement : [lien Gérer mes abonnements] ». Deux boutons : *Annuler* / *Supprimer définitivement* (avec ressaisie du mot de passe ou reconnexion Google — réauthentification recommandée).
2. L'app appelle une **Edge Function `delete-account`** (JWT utilisateur requis) qui, avec la clé `service_role` :
   - liste et supprime les objets Storage du dossier `<user_id>/` (obligatoire avant `deleteUser`, cf. « You cannot delete a user if they are the owner of any objects in Supabase Storage ») ;
   - supprime les lignes applicatives (ou s'appuie sur `on delete cascade`) ;
   - appelle `auth.admin.deleteUser(user_id, false)` (suppression dure) ;
   - déclenche la suppression de la personne PostHog si un `distinct_id` a été associé (API DELETE Persons `delete_events=true`) ;
   - journalise la date de suppression (sans donnée personnelle) pour preuve.
3. L'app efface la session locale, désactive les fonctions Plus, affiche la confirmation. Option proposée à l'utilisateur : « Effacer aussi les données locales de cet appareil ».

**B. Page web publique** (obligatoire, URL déclarée dans Data safety) — hébergement gratuit sur **GitHub Pages** du dépôt public : « a static site hosting service that takes HTML, CSS, and JavaScript files straight from a repository on GitHub » ; URL de projet `https://<owner>.github.io/<repositoryname>` ; limites « no larger than 1 GB », « soft bandwidth limit of 100 GB per month » ; usage interdit : site « primarily directed at either facilitating commercial transactions or providing commercial software as a service » (une page d'information n'est pas concernée) — <https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages>, <https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits> (consultés le 07/09/2026).

Contenu minimal de la page `supprimer-mon-compte.html` (exigences Google : nom de l'app/développeur, chemin de suppression « prominently featured », fonctionnelle, sans obliger à réinstaller) :
1. Titre : « Supprimer votre compte MémoPatte Plus » + nom de l'éditrice [NOM].
2. Méthode 1 (recommandée) : étapes dans l'app (Paramètres > Compte > Supprimer mon compte).
3. Méthode 2 (sans l'app) : « Envoyez un email à [EMAIL DE CONTACT] depuis l'adresse de votre compte, objet "Suppression de compte MémoPatte" » — ou un lien `mailto:` pré-rempli ; possibilité d'un petit formulaire (ex. Google Forms / Tally) si souhaité, mais l'email suffit (« a customer service email or a form »).
4. Ce qui est supprimé : compte, email, sauvegarde cloud, photos, données d'usage associées ; ce qui est conservé et pourquoi : rien côté MémoPatte ; l'historique d'achat reste chez Google Play (Google est le marchand).
5. Délai : immédiat dans l'app ; sous 30 jours par email (après vérification de l'identité par email de confirmation).
6. Option de suppression **partielle** : « supprimer ma sauvegarde cloud sans fermer mon compte » (même email).
7. Rappel : l'abonnement se résilie dans Google Play (lien `https://play.google.com/store/account/subscriptions`).
8. Lien vers la politique de confidentialité.

**C. Traitement d'une demande reçue par email** : vérifier l'adresse (répondre à l'expéditeur, demander confirmation), exécuter la même Edge Function via un script admin, confirmer par email, noter la date dans le registre des demandes. Délai RGPD : un mois maximum (art. 12-3).

### 3.4 Check-list « avant publication » (ordonnée)

**A. Décisions et documents (Gaelle)**
1. Fixer le nom d'entité affiché sur Play (identique dans la politique), l'email de contact public, l'adresse à afficher (vérifier ce que la Play Console annonce publier pour un compte personnel).
2. Décider les durées : conservation de la sauvegarde après expiration [12 mois], rétention PostHog [13 mois], support [1 an].
3. Rédiger le registre des traitements (modèle CNIL ODS) : 3 fiches — Comptes Plus & sauvegarde ; Analytics ; Support/remboursements. Ajouter la note « AIPD non requise » et la procédure incident (72 h).
4. Signer/archiver le DPA PostHog (app.posthog.com/legal) et archiver le DPA Supabase (+ liste des sous-traitants ultérieurs, s'abonner aux notifications).
5. Écrire la politique de remboursement (48 h Google Play, ensuite email).

**B. Infrastructure**
6. Projet Supabase en région UE (Paris/Francfort) ; RLS activée sur toutes les tables et sur `storage.objects` ; `on delete cascade` vers `auth.users` ; aucune clé `service_role` dans l'app ni dans le dépôt.
7. Edge Function `delete-account` (Storage → lignes → Auth → PostHog) testée.
8. Organisation PostHog sur **EU Cloud**, « Discard client IP data » activé, rétention réglée, autocapture/session replay désactivés, `opt_out_capturing_by_default: true`.
9. Écran de consentement OAuth Google : URL de politique renseignée.

**C. Application**
10. `targetSdkVersion 36` ; plugin de facturation avec PBL ≥ 7 ; `queryPurchasesAsync` au lancement ; acquittement des achats < 3 jours ; gestion des états (grâce = accès, hold = coupure).
11. Manifest : `POST_NOTIFICATIONS` ; **pas** de `READ_MEDIA_IMAGES`/`READ_MEDIA_VIDEO`, pas d'`USE_EXACT_ALARM` ; vérifier le manifest fusionné.
12. Écran Plus : prix, périodicité, renouvellement automatique, mention « app utilisable gratuitement », lien « Gérer mon abonnement » (Play Subscription Center), lien CGU/politique.
13. Écran de consentement analytics in-app (action positive, avant init), interrupteur dans Paramètres.
14. Paramètres > Confidentialité : lien/texte de la politique ; Paramètres > Compte : « Supprimer mon compte » ; Paramètres > Exporter (JSON/CSV).
15. Mention « réservé aux 18 ans et plus » dans les CGU / création de compte.

**D. Play Console**
16. Publier la politique et la page de suppression sur GitHub Pages ; saisir les deux URL (Store listing > Privacy policy ; App content > Data safety > Data deletion).
17. Remplir Data safety selon §3.2 ; Ads : « no » ; Target audience : 18+ ; Content rating (IARC) ; Health apps declaration : non concerné ; App access : compte de test Plus + License testing ; Financial features / Government : non.
18. Produits : abonnement annuel (base plan auto-renouvelable, grâce + account hold par défaut, resubscribe activé) et produit unique non consommable « à vie », prix localisés.
19. Si compte personnel créé après le 13/11/2023 : test fermé avec ≥ 12 testeurs opt-in pendant ≥ 14 jours, puis demande d'accès production.
20. Vérification finale des informations d'identité affichées (nom, email, téléphone, adresse) et de leur cohérence avec la politique.

---

## 4. Ce que je n'ai pas pu vérifier

1. **Santé animale et catégorie « Health info » de Data safety** : Google ne publie aucune FAQ sur les animaux. La conclusion « ne pas cocher » repose sur la définition « Information about a **user's** health ». Risque faible mais non nul de divergence d'un relecteur Google ; en cas de rejet, cocher « Health info » ne changerait pas grand-chose (données non partagées, chiffrées, supprimables).
2. **Auto Backup Android et Data safety** : je n'ai trouvé aucune page Google indiquant explicitement si les données envoyées par l'OS sur le Google Drive de l'utilisateur (illisibles par le développeur) doivent être déclarées « collectées ». Mon interprétation (exemption : ce n'est pas l'app qui transmet à un serveur du développeur) n'est pas sourcée.
3. **Règle « service providers » dans Data safety** : la page 10787469 contient normalement une exception pour les transferts à des prestataires agissant pour le compte du développeur (non « partagé »). Je n'ai pas obtenu la citation exacte ; vérifier le libellé dans le formulaire avant de laisser « Shared » vide.
4. **DSA / statut « trader » sur Google Play** : la page Play Console dédiée (réf. 14335400) renvoie une 404 et la page « General conditions of access in the EEA » ne traite que du DMA. Je n'ai donc **pas** pu confirmer sur une source Google si un compte personnel vendant Plus dans l'UE doit déclarer un statut de professionnel et si son **adresse postale** est affichée publiquement. Seule certitude sourcée : « legal name and address are taken from the Google Payments profile » (10841920). À vérifier dans la Play Console (Paramètres > Détails du compte) avant publication ; prévoir éventuellement une adresse de domiciliation.
5. **Valeurs exactes de grâce proposées dans la console** (liste déroulante, ex. 3/7/14/30 jours) : non présentes dans les pages d'aide consultées ; seules règles sourcées : grâce activée par défaut, silent grace ≥ 24 h, grâce + hold ≥ 30 jours, hold par défaut = 60 j − grâce.
6. **Application de la politique Account deletion à un compte réservé au palier payant** : la politique dit « allow users to create an account from within your app » sans distinguer ; j'ai retenu qu'elle s'applique. Pas de texte explicite sur ce cas.
7. **Mode de signature du DPA Supabase** : la page le présente comme faisant partie des CGU ; je n'ai pas vu de bouton de signature dans le dashboard. Si un DPA signé est souhaité, contacter Supabase.
8. **Cloudflare chez PostHog EU** (« Global edge locations (dynamic, worldwide) ») : possible transit hors UE au niveau du réseau ; PostHog affirme que les données « never leave EU jurisdiction » pour le stockage. Point à mentionner comme transfert potentiel encadré par les SCC du DPA, sans certitude sur la réalité d'un transfert.
9. **Version de Play Billing Library embarquée par le plugin Capacitor** qui sera choisi (RevenueCat, cordova-plugin-purchase, @capgo…) : dépend du plugin ; à contrôler (exigence PBL ≥ 7 au 31/08/2026).
10. **Exemption « mesure d'audience » CNIL pour PostHog** : conclusion négative fondée sur les critères CNIL et les fonctions par défaut de PostHog ; aucune évaluation CNIL de PostHog n'existe dans un sens ou dans l'autre.
11. **Article 45 de la loi Informatique et Libertés** : cité via la page CNIL ; je n'ai pas fetché Légifrance pour le texte consolidé exact.
12. **Recommandation CNIL applications mobiles (version modifiée du 8 avril 2025)** : seule la page de présentation a été consultée, pas le PDF complet ; des recommandations précises (ex. sur les SDK, les permissions) pourraient ajouter des bonnes pratiques.
13. **Rétention configurable côté PostHog Cloud** (réglage projet) : non vérifiée dans la doc ; la suppression par personne est, elle, documentée.
14. **Compte Play personnel de Gaelle : date de création** — détermine l'obligation de test fermé 12 × 14 j.

---

## 5. Index des sources

Toutes consultées le **7 septembre 2026**.

**Google Play / Android**
- User Data policy — <https://support.google.com/googleplay/android-developer/answer/10144311>
- Data safety (développeurs) — <https://support.google.com/googleplay/android-developer/answer/10787469>
- Data safety (grand public) — <https://support.google.com/googleplay/answer/11416267>
- Account deletion — <https://support.google.com/googleplay/android-developer/answer/13327111>
- Payments policy — <https://support.google.com/googleplay/android-developer/answer/9858738>
- Subscriptions policy — <https://support.google.com/googleplay/android-developer/answer/9900533>
- Create and manage subscriptions — <https://support.google.com/googleplay/android-developer/answer/140504>
- Understanding subscriptions — <https://support.google.com/googleplay/android-developer/answer/12154973>
- Subscriptions (Play Billing) — <https://developer.android.com/google/play/billing/subscriptions>
- Subscription lifecycle — <https://developer.android.com/google/play/billing/lifecycle/subscriptions>
- Integrate Play Billing Library — <https://developer.android.com/google/play/billing/integrate>
- PBL deprecation FAQ — <https://developer.android.com/google/play/billing/deprecation-faq>
- Orders & refunds (développeurs) — <https://support.google.com/googleplay/android-developer/answer/2741495>
- Refund policies (utilisateurs) — <https://support.google.com/googleplay/answer/15574908>
- Conditions d'utilisation Google Play (FR) — <https://play.google.com/intl/fr_fr/about/play-terms/>
- Developer Distribution Agreement — <https://play.google/developer-distribution-agreement.html>
- Target API level — <https://support.google.com/googleplay/android-developer/answer/11926878>
- Permissions & APIs policy — <https://support.google.com/googleplay/android-developer/answer/9888170>
- Photo and Video Permissions — <https://support.google.com/googleplay/android-developer/answer/14115180>
- Notification runtime permission — <https://developer.android.com/develop/ui/views/notifications/notification-permission>
- Health apps policy — <https://support.google.com/googleplay/android-developer/answer/12261419>
- App access / Prepare for review — <https://support.google.com/googleplay/android-developer/answer/9859455>
- Closed testing (comptes personnels) — <https://support.google.com/googleplay/android-developer/answer/14151465>
- Content ratings — <https://support.google.com/googleplay/android-developer/answer/9859655>
- Target audience & content — <https://support.google.com/googleplay/android-developer/answer/9867159>
- Ads — <https://support.google.com/googleplay/android-developer/answer/9857753>
- License testing — <https://support.google.com/googleplay/android-developer/answer/6062777>
- Verify developer identity — <https://support.google.com/googleplay/android-developer/answer/10841920>
- Auto Backup — <https://developer.android.com/identity/data/autobackup>
- Google API Services User Data Policy — <https://developers.google.com/terms/api-services-user-data-policy>

**RGPD / CNIL**
- RGPD (EUR-Lex) — <https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32016R0679>
- RGPD par chapitre (CNIL) — <https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre1> … `/chapitre4`
- Registre — <https://www.cnil.fr/fr/RGDP-le-registre-des-activites-de-traitement>
- AIPD — <https://www.cnil.fr/fr/ce-quil-faut-savoir-sur-lanalyse-dimpact-relative-la-protection-des-donnees-aipd> ; délib. 2019-118 — <https://www.legifrance.gouv.fr/affichTexte.do?cidTexte=JORFTEXT000039248939>
- Donnée de santé — <https://www.cnil.fr/fr/quest-ce-ce-quune-donnee-de-sante>
- Mesure d'audience exemptée — <https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies-solutions-pour-les-outils-de-mesure-daudience> ; guide Matomo — <https://www.cnil.fr/sites/default/files/atoms/files/matomo_analytics_-_exemption_-_guide_de_configuration.pdf>
- Applications mobiles (recommandation) — <https://www.cnil.fr/fr/applications-mobiles-la-cnil-publie-ses-recommandations-pour-mieux-proteger-la-vie-privee>
- Violation de données — <https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles>
- Durées de conservation — <https://www.cnil.fr/fr/les-durees-de-conservation-des-donnees>
- Information des personnes — <https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence>
- Sous-traitant — <https://www.cnil.fr/fr/sous-traitant> ; rôles — <https://www.cnil.fr/fr/rgpd-comment-bien-identifier-son-role> ; guide — <https://www.cnil.fr/sites/cnil/files/atoms/files/rgpd-guide_sous-traitant-cnil.pdf>
- Mineurs (< 15 ans) — <https://www.cnil.fr/fr/recommandation-4-rechercher-le-consentement-dun-parent-pour-les-mineurs-de-moins-de-15-ans>
- Guide sécurité — <https://www.cnil.fr/fr/guide-de-la-securite-des-donnees-personnelles>

**Supabase**
- DPA — <https://supabase.com/legal/dpa> ; sous-traitants — <https://supabase.com/legal/customer-resources/subprocessor-list>
- Sécurité — <https://supabase.com/security> ; régions — <https://supabase.com/docs/guides/platform/regions>
- Managing user data — <https://supabase.com/docs/guides/auth/managing-user-data>
- `auth.admin.deleteUser` — <https://supabase.com/docs/reference/javascript/auth-admin-deleteuser>
- Storage access control — <https://supabase.com/docs/guides/storage/security/access-control>

**PostHog**
- DPA — <https://posthog.com/dpa> ; privacy — <https://posthog.com/docs/privacy> ; GDPR — <https://posthog.com/docs/privacy/gdpr-compliance>
- Data collection (opt-in, IP, masquage) — <https://posthog.com/docs/privacy/data-collection> ; data storage/deletion — <https://posthog.com/docs/privacy/data-storage>
- Autocapture — <https://posthog.com/docs/product-analytics/autocapture> ; config JS — <https://posthog.com/docs/libraries/js/config> ; cloud regions — <https://posthog.com/docs/getting-started/cloud> ; Capacitor — <https://posthog.com/docs/libraries/capacitor>
- Sous-traitants — <https://posthog.com/subprocessors>

**Capacitor / GitHub**
- Camera — <https://capacitorjs.com/docs/apis/camera> ; Local Notifications — <https://capacitorjs.com/docs/apis/local-notifications>
- GitHub Pages — <https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages> ; limites — <https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits>
