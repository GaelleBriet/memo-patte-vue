# Play Console et RevenueCat : guide pas à pas — tickets [#47](https://github.com/GaelleBriet/memo-patte-vue/issues/47) et [#53](https://github.com/GaelleBriet/memo-patte-vue/issues/53)

Vérifié le 2026-09-26 dans les pages d'aide officielles citées à chaque étape. Libellés en
français quand la page d'aide FR les donne, sinon en anglais entre guillemets. **[NC]** = non
confirmé par une source.

## Valeurs de MémoPatte

| Quoi                   | Valeur                                                                    |
| ---------------------- | ------------------------------------------------------------------------- |
| Nom de paquet (Play)   | `com.gaellebriet.memopatte` (jamais la variante `.dev`)                   |
| Abonnement             | `memopatte_plus`, forfaits `monthly` (1,49 €) et `annual` (9,99 €)        |
| Achat à vie            | `memopatte_plus_lifetime` (29,99 €), produit ponctuel non consommable     |
| Entitlement RevenueCat | `plus`, rattaché aux trois produits                                       |
| Offering RevenueCat    | `default`, packages `$rc_monthly`, `$rc_annual`, `$rc_lifetime`           |
| Clé dans `.env`        | `VITE_REVENUECAT_GOOGLE_KEY=goog_…` (clé publique, jamais commitée)       |
| Play Billing Library   | 8.3.0 via `purchases-capacitor` 13.5.1 : exigence « 8 ou plus » remplie   |

## 0. Type de compte et D-U-N-S

- **Personnel** : « student, hobbyist, or amateur developer ». Créé après le 13/11/2023, il doit
  faire tourner un **test fermé de 12 testeurs inscrits sans interruption pendant 14 jours**
  avant la production, puis une demande d'accès (examen « seven days or less »).
  [14151465](https://support.google.com/googleplay/android-developer/answer/14151465)
- **Organisation** : pour une entreprise, sans test fermé obligatoire. Demande un **D-U-N-S**,
  le site web, le téléphone de l'organisation et un téléphone développeur **public**. Le nom
  légal et l'adresse du profil de paiement doivent être **identiques** à ceux de la fiche D&B.
  [13628312](https://support.google.com/googleplay/android-developer/answer/13628312) ·
  [13634885](https://support.google.com/googleplay/android-developer/answer/13634885)
- **Changer de type** : un compte personnel peut passer en organisation (profil de paiement
  organisation, site vérifié, 72 h d'attente avant de soumettre une app) ; l'inverse est
  impossible. [16260648](https://support.google.com/googleplay/android-developer/answer/16260648)
  Si l'obligation de test fermé disparaît après le passage : **[NC]**, des retours de la
  communauté disent qu'elle peut rester.
- **D-U-N-S en France** : attribué gratuitement par Altares (partenaire exclusif de D&B) à partir
  du SIREN, avec un délai après la création. Le formulaire de D&B
  ([get-a-duns](https://www.dnb.com/duns/get-a-duns.html) › International › Google developer ›
  France) renvoie vers [Altares](https://www.altares.com/fr/nos-data/duns-number/). Google annonce
  « jusqu'à 30 jours ». Autre porte d'entrée, gratuite :
  [l'outil de recherche d'Apple](https://developer.apple.com/enroll/duns-lookup/) (« up to 5
  business days » pour un nouveau numéro, mise à jour d'une fiche par
  [le support D&B](https://support.dnb.com/?CUST=APPLEDEV)). Ne jamais payer l'option accélérée.
- **Adresse publique** : une app qui vend affiche l'**adresse complète** du profil de paiement,
  quel que soit le type de compte (« merchant accounts … must show their full address on Google
  Play »). [13634081](https://support.google.com/googleplay/android-developer/answer/13634081)

## A. Compte Play Console

1. **Inscription** : <https://play.google.com/apps/publish/signup>. 18 ans minimum, Contrat
   relatif à la distribution pour les développeurs, **25 USD une fois** (carte prépayée refusée).
   Le compte est lié à un profil de paiement Google dès sa création.
   [6112435](https://support.google.com/googleplay/android-developer/answer/6112435?hl=fr)
2. **Vérifications** : e-mail et téléphone (+33…) par code à 6 chiffres ; documents qui
   correspondent **exactement** au profil de paiement (organisation : Kbis, avis SIRENE ou
   certificat de TVA, et pièce d'identité du représentant). Délai : « up to 5 days ».
   [10841920](https://support.google.com/googleplay/android-developer/answer/10841920) ·
   [15633622](https://support.google.com/googleplay/android-developer/answer/15633622?co=GENIE.CountryCode%3DFR)
3. **Vérification de l'appareil** (compte personnel neuf) : Accueil › « Verify that you have
   access to an Android mobile device », avec l'app Play Console sur un Android 10 ou plus.
   [14316361](https://support.google.com/googleplay/android-developer/answer/14316361)
4. Ce qui est public : page **Profil de développeur**.

## B. Profil de paiement

1. **Paramètres › Profil de paiement › Créer un profil de paiement** : nom légal, adresse légale
   (pas de boîte postale), contact, site web, e-mail du support, nom sur les relevés de carte. Le
   pays ne se change plus ensuite.
   [7161426](https://support.google.com/googleplay/android-developer/answer/7161426?hl=fr)
2. **Compte bancaire** : Paramètres › « Payments settings » › « How you get paid » › « Add payment
   method » (IBAN, BIC). Dépôt test de moins de 1 US$ « Google Deposit », jusqu'à **3 jours
   ouvrés**, à confirmer par « Fix » › montant › Verify.
   [7161440](https://support.google.com/googleplay/android-developer/answer/7161440) ·
   [7161378](https://support.google.com/googleplay/android-developer/answer/7161378)
3. **Fiscalité** : formulaire US **W-8BEN** (« [pays] tax info » › Edit › « Add tax info »).
   La **TVA UE** des achats Play est calculée, facturée et reversée par Google. Champ SIRET et
   numéro de TVA d'une micro en franchise : **[NC]**, à voir avec le comptable.
   [7163598](https://support.google.com/googleplay/android-developer/answer/7163598) ·
   [138000](https://support.google.com/googleplay/android-developer/answer/138000)

## C. App et premier AAB

1. **Toutes les applications › Créer une application** : français (France), « MémoPatte »,
   Application, **Gratuite** (une app gratuite ne devient jamais payante, les achats intégrés
   n'en ont pas besoin), trois déclarations. Le nom de paquet est fixé par le premier AAB,
   définitivement. [9859152](https://support.google.com/googleplay/android-developer/answer/9859152?hl=fr)
2. **AAB signé** (#53) : clé d'importation créée au premier bundle release (Android Studio ›
   Build › Generate Signed Bundle/APK › Create new…), jamais commitée. Un bundle debug est refusé.
   [app-signing](https://developer.android.com/studio/publish/app-signing)
3. **Facturation** : les produits ne se créent qu'après la publication d'une version qui contient
   la Billing Library, sur n'importe quel canal, test interne compris.
   [getting-ready](https://developer.android.com/google/play/billing/getting-ready)
4. **Tester et publier › Tests › Tests internes** › « Create new release » › importer l'AAB ›
   publier. Onglet **Testeurs** › Créer une liste de diffusion (100 max) ; le lien d'inscription
   apparaît après publication.
   [9845334](https://support.google.com/googleplay/android-developer/answer/9845334?hl=fr)
5. **Play App Signing** : signature hybride avec clés générées par Google. Empreintes dans
   **Protégé avec Play › Distribution sur le Play Store › Accéder à la signature d'application
   Play** : **trois empreintes** à déclarer chez les fournisseurs d'API, dont le client OAuth
   Android de #65. [9842756](https://support.google.com/googleplay/android-developer/answer/9842756?hl=fr)

## D. Produits

1. **Monétiser avec Play › Produits › Abonnements › Créer un abonnement** : ID `memopatte_plus`
   (définitif), puis **Ajouter un forfait de base** `monthly` et `annual`, renouvellement
   automatique, délai de grâce et blocage de compte par défaut, **Se réabonner** activé, prix,
   **Activer**. Aucune offre, donc aucun essai.
   [140504](https://support.google.com/googleplay/android-developer/answer/140504?hl=fr)
2. **Monétiser avec Play › Produits › Produits ponctuels › Créer un produit ponctuel** : ID
   `memopatte_plus_lifetime`, option d'achat de type **Acheter** (la première est rétrocompatible,
   ce qu'il faut pour l'import RevenueCat), 29,99 €, **Activer**. « Non consommable » n'est pas un
   réglage Play : il se règle dans RevenueCat (F4).
   [16430488](https://support.google.com/googleplay/android-developer/answer/16430488?hl=fr)
3. **Prix** : la saisie groupée se fait **hors taxes** et Play ajoute la TVA du pays. Contrôler
   le prix final français dans le tableau (1,49 € TTC ≈ 1,24 € HT à 20 %).

## E. Testeurs

1. **Paramètres › Test de licence** › Créer une liste › Enregistrer. Il faut une app publiée sur un
   canal (le test interne suffit).
   [6062777](https://support.google.com/googleplay/android-developer/answer/6062777?hl=fr)
2. Les achats de test utilisent des moyens de paiement fictifs ; renouvellement mensuel en 5 min,
   annuel en 30 min. Un testeur de licence peut installer une build debug hors Play **si son nom de
   paquet est celui de Play**. [billing/test](https://developer.android.com/google/play/billing/test)

## F. RevenueCat

1. **Projet** : Projects › **+ Create new project**, puis ajouter l'app Play Store (Package Name
   `com.gaellebriet.memopatte`). [connect-a-store](https://www.revenuecat.com/docs/projects/connect-a-store)
2. **Compte de service Google** (dans le projet Google Cloud « MémoPatte ») : activer « Google Play
   Android Developer API », « Google Play Developer Reporting API » et « Cloud Pub/Sub API » ;
   **IAM & Admin › Service Accounts › Create Service Account**, rôles **Pub/Sub Editor** et
   **Monitoring Viewer** ; ⋮ › **Manage keys › Add key › JSON**. RevenueCat fournit aussi un script
   Cloud Shell qui fait tout.
   [creating-play-service-credentials](https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials)
3. **Play Console › Utilisateurs et autorisations** › inviter le `client_email` du JSON avec :
   afficher les infos des applications, afficher les données financières, gérer les commandes et
   abonnements, gérer la présence sur le Play Store.
4. **RevenueCat** › l'app Play › « Service Account Credentials JSON » › déposer le fichier. Valide
   en **36 h au plus**, souvent moins de 24 h ; modifier puis enregistrer la description d'un
   produit dans Play peut accélérer.
5. **Produits** : Product catalog › Products › **+ New › Import Products**
   (`memopatte_plus:monthly`, `memopatte_plus:annual`, `memopatte_plus_lifetime`). **Marquer le
   produit à vie non consommable**, sinon l'achat est consommé et ne se restaure pas.
   [android-products](https://www.revenuecat.com/docs/getting-started/entitlements/android-products)
6. **Entitlement** `plus` (Entitlements › + New › Attach des trois produits), **offering**
   `default` avec les trois packages, marquée offering par défaut.
   [offerings](https://www.revenuecat.com/docs/offerings/overview)
7. **Clé publique** : Project Settings › API keys › clé de l'app (`goog_…`), dans `.env`. Jamais de
   clé `sk_` dans l'app, jamais de clé Test Store dans une build envoyée sur Play.
   [configuring-sdk](https://www.revenuecat.com/docs/getting-started/configuring-sdk)
8. **Notifications en temps réel**, au moins 36 h après l'étape 4 : RevenueCat › app Play › Pub/Sub
   Topic › **Connect to Google** › copier le topic ; Play Console › **Monétiser › Configuration de
   la monétisation** › activer les notifications en temps réel, coller le topic, « toutes les
   notifications », envoyer un message test. En cas d'échec, rôle **Pub/Sub Publisher** à
   `google-play-developer-notifications@system.gserviceaccount.com` sur le topic.
   [google-server-notifications](https://www.revenuecat.com/docs/platform-resources/server-notifications/google-server-notifications)
9. **Webhook** (plus tard, Edge Function Supabase) : Integrations › Webhooks.
   [webhooks](https://www.revenuecat.com/docs/integrations/webhooks)

## Ordre et délais

1. D-U-N-S d'abord si compte organisation (jusqu'à 30 jours).
2. Compte Play, puis vérifications (jusqu'à 5 jours).
3. Pendant les vérifications : compte et projet RevenueCat, compte de service Google Cloud,
   clé d'importation et AAB release (#53).
4. Dès l'accès : inviter le compte de service (lance les 36 h), profil de paiement, IBAN (dépôt
   test jusqu'à 3 jours ouvrés), W-8BEN.
5. App, AAB en test interne (quelques minutes), produits, testeurs de licence.
6. RevenueCat : JSON, import, non consommable, entitlement, offering, clé `goog_`.
7. 36 h après le JSON : notifications en temps réel, puis premier achat de test.

## Suites côté code et questions ouvertes

- **`launchMode="singleTask"`** de `MainActivity` : RevenueCat avertit que tout autre mode que
  `standard` ou `singleTop` peut annuler un achat quand l'app passe en arrière-plan (validation
  dans l'app bancaire). [#418](https://github.com/GaelleBriet/memo-patte-vue/issues/418), à traiter
  avant le premier achat de test, après #384.
  [installation/capacitor](https://www.revenuecat.com/docs/getting-started/installation/capacitor)
- **Achats de test** : ils demandent le nom de paquet de Play, donc la vraie app, alors que la
  règle de test sur le téléphone l'interdit. À trancher avec Gaelle avant le premier achat de test.
- **Prix hors de France** : la TVA diffère dans l'UE, le prix TTC affiché aussi. Question produit
  à poser au moment de #47.
- **Déclaration « Health apps »** (Règles › Contenu de l'app) : proposer « My app doesn't provide
  any health features » ou la catégorie « Medication and Treatment Management » reste à trancher ;
  ne pas choisir la catégorie Play « Médecine » sans en décider.
  [14738291](https://support.google.com/googleplay/android-developer/answer/14738291)

**Non confirmé** : statut « trader » DSA déclaré à part sur Play, champ SIRET, numéro de TVA d'une
micro en franchise, durée par défaut du délai de grâce, saisie HT ou TTC dans le crayon par pays,
ID RevenueCat du produit à vie avec son option d'achat, libellés exacts des boutons RevenueCat,
invitation du compte de service avant la première app, compte de facturation Google Cloud requis
pour Pub/Sub, levée du test fermé après passage d'un compte personnel en organisation.
