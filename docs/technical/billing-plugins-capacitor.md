# Plugins de billing Google Play pour Capacitor 8 — ticket [#43](https://github.com/GaelleBriet/memo-patte-vue/issues/43)

Recherche menée le **2026-09-07** contre des sources primaires (registre npm, dépôts GitHub, docs
RevenueCat / Capgo / Fovea, docs Google Play Billing, docs Supabase). Toutes les URL citées ont été
consultées ce jour-là ; les faits non vérifiables sont regroupés en fin de document.

Besoin : vendre **MémoPatte Plus** sous deux formes pour le même contenu — abonnement annuel
(7,99 €) et achat non consommable « à vie » (24,99 €) — sur Android uniquement, depuis une app
Capacitor 8 / Vue 3, développeuse solo, budget zéro. Fonctions attendues : lister les offres avec
prix localisé, acheter, connaître le statut (actif / expiré / à vie / aucun), restaurer, revérifier
au lancement, gérer expiration et période de grâce.

---

## 1. Le critère n°1 : la toolchain Android réelle du projet

Ce que le projet compile aujourd'hui (fichiers `android/` générés par `@capacitor/android@8.5.0`,
identiques au template Capacitor 8) :

| Élément                | Valeur dans MémoPatte                     | Template Capacitor 8 (`main`)                                                                                                                    |
|------------------------|-------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|
| Android Gradle Plugin  | `8.13.0` (`android/build.gradle`)         | `8.13.0` — [android-template/build.gradle](https://github.com/ionic-team/capacitor/blob/main/android-template/build.gradle)                       |
| Gradle wrapper         | `8.14.3`                                  | `8.14.3` — [gradle-wrapper.properties](https://github.com/ionic-team/capacitor/blob/main/android-template/gradle/wrapper/gradle-wrapper.properties) |
| compileSdk / targetSdk | 36 / 36 (`android/variables.gradle`)      | 36 / 36 — [variables.gradle](https://github.com/ionic-team/capacitor/blob/main/android-template/variables.gradle)                                 |
| minSdk                 | 24                                        | 24                                                                                                                                               |
| Kotlin                 | aucun plugin Kotlin appliqué dans l'app   | `kotlin_version = '2.2.20'` si le projet utilise Kotlin — [Updating to 8.0](https://capacitorjs.com/docs/updating/8-0)                            |
| cordova-android simulé | `14.0.1`                                  | `14.0.1`                                                                                                                                         |

Conséquence : **l'incident Flutter du 2026-08-14 (AGP 9.1.0) ne se reproduit pas mécaniquement
ici** — Capacitor 8 impose AGP 8.13, pas AGP 9. Les trois plugins étudiés ci-dessous compilent
eux-mêmes avec AGP 8.13.x et compileSdk 36, donc exactement la même génération d'outils.

Deuxième contrainte, côté Google : depuis le **31 août 2026**, toute nouvelle app ou mise à jour
doit embarquer **Play Billing Library ≥ 8** (extension possible jusqu'au 1er novembre 2026 ; la v8
sera à son tour refusée le 31 août 2027, la v9 le 31 août 2028) — source
[deprecation-faq](https://developer.android.com/google/play/billing/deprecation-faq). Version
courante de la bibliothèque : **9.1.0** (2026-06-18) — source
[release-notes](https://developer.android.com/google/play/billing/release-notes). Un plugin encore
en Billing 7 est donc **disqualifié d'office**.

---

## 2. Synthèse comparative

| Critère                                   | RevenueCat `@revenuecat/purchases-capacitor`                                             | Capgo `@capgo/native-purchases`                                          | Fovea `capacitor-plugin-cdv-purchase`                                                   | `@capacitor-community/in-app-purchases`  | Plugin maison (Billing 9.1.0)               |
|-------------------------------------------|------------------------------------------------------------------------------------------|--------------------------------------------------------------------------|-----------------------------------------------------------------------------------------|------------------------------------------|---------------------------------------------|
| Version `latest` / date                   | 13.5.0 / 2026-09-03                                                                      | 8.7.0 / 2026-08-24                                                       | 13.18.0 / 2026-07-16                                                                    | **n'existe pas sur npm** (404)           | —                                           |
| `peerDependencies` `@capacitor/core`      | `>=8.0.0`                                                                                | `>=8.0.0`                                                                | `^6.0.0 \|\| ^7.0.0 \|\| ^8.0.0`                                                         | —                                        | —                                           |
| Licence                                   | MIT                                                                                      | MPL-2.0                                                                  | MIT                                                                                     | —                                        | —                                           |
| Mainteneur                                | RevenueCat (entreprise)                                                                  | Cap-go (organisation, plugin « free »)                                   | Fovea (J.-C. Hoelt, iaptic)                                                             | —                                        | Gaelle                                      |
| Dernier commit `main`                     | 2026-09-04                                                                               | 2026-09-01                                                               | 2026-07-30 (push 2026-09-03)                                                            | —                                        | —                                           |
| Issues ouvertes (hors PR)                 | 8, aucune bloquante Android                                                              | 0                                                                        | ~117, aucune AGP/Gradle/Kotlin                                                          | —                                        | —                                           |
| Play Billing Library embarquée            | **8.3.0** (via purchases-android 10.19.1)                                                | **8.3.0** dans le tarball 8.7.0 ; 9.1.0 sur `main` (non publié)          | **9.0.0**                                                                               | —                                        | 9.1.0                                       |
| AGP / compileSdk du plugin                | AGP 8.13.2, compileSdk 36, minSdk 24, Kotlin 2.2.20, JVM 21 ; fix AGP 9 (13.2.5)         | AGP 8.13.0, compileSdk 36, minSdk 24, Java 21                            | fallback AGP 8.7.3 / compileSdk 35 / minSdk 23, surchargé par `rootProject.ext`         | —                                        | au choix                                    |
| Abonnements Android                       | ✅ (id `sub:basePlan`)                                                                    | ✅ (`planIdentifier` obligatoire)                                         | ✅ `PAID_SUBSCRIPTION`                                                                   | —                                        | ✅ à coder                                   |
| Non consommable Android                   | ✅ (à déclarer « non-consumable » dans le dashboard, sinon consommé)                      | ✅ `PURCHASE_TYPE.INAPP`, `isConsumable:false` par défaut                 | ✅ `NON_CONSUMABLE` (pas `NON_RENEWING_SUBSCRIPTION`, consommé sur Android)              | —                                        | ✅ à coder                                   |
| Un même « droit » pour les deux produits  | ✅ natif (entitlement)                                                                    | à coder côté app                                                         | à coder côté app                                                                        | —                                        | à coder                                     |
| Statut abonnement (expiration, grâce)     | ✅ `isActive`, `expirationDate`, `willRenew`, `billingIssueDetectedAt`                    | ❌ sur Android : ni `isActive` ni `expirationDate` ; présence dans `getPurchases()` seulement | partiel : `owned()` local ; `expiryDate`, `isExpired`, `isBillingRetryPeriod` **avec validateur** | —                                        | présence dans `queryPurchasesAsync` seulement |
| Restore                                   | ✅ `restorePurchases()` → `customerInfo`                                                  | `restorePurchases()` ne renvoie rien ; lire `getPurchases()`             | ✅ `store.restorePurchases()` + `store.owned()`                                          | —                                        | `queryPurchasesAsync`                       |
| Acknowledge (obligatoire sous 3 jours)    | automatique                                                                              | automatique (`autoAcknowledgePurchases` défaut `true`)                   | à l'appel de `finish()`                                                                 | —                                        | à coder                                     |
| Validation serveur incluse                | ✅ backend RevenueCat + webhooks + API REST                                               | ❌ (Play Developer API à appeler soi-même)                                | via iaptic (gratuit ≤ 100 tx/mois) ou validateur custom                                 | —                                        | ❌                                           |
| Coût                                      | 0 € jusqu'à 2 500 $ de MTR/mois, puis 1 %                                                | 0 €                                                                      | 0 € (plugin) ; iaptic 0 € ≤ 100 tx/mois                                                 | —                                        | temps                                       |
| Dépendance à un tiers en production       | **oui** (SaaS obligatoire)                                                               | non                                                                      | non (oui si iaptic)                                                                     | —                                        | non                                         |

Sources par colonne : registre npm des quatre paquets (JSON `https://registry.npmjs.org/<paquet>`,
revérifié par curl le 2026-09-07) ; détails dans les sections 3.x.

Ajout du 2026-09-07 à la demande de Gaelle : **Adapty** (`@adapty/capacitor`), même famille que
RevenueCat (SaaS d'abonnements avec backend), comparé en §3.6 ; le volet « données personnelles
chez l'intermédiaire » des trois options SaaS/plugin est en §4.5. **Purchasely** (français, hébergé en UE) est étudié en §3.7 et écarté : pas de plugin Capacitor, pas d'offre gratuite.

---

## 3. Options une par une

### 3.1 `@revenuecat/purchases-capacitor` (RevenueCat)

**Faits vérifiés**

| Point                     | Valeur                                                                                                                                                                          | Source                                                                                                                                                              |
|---------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Version / date            | 13.5.0, 2026-09-03 ; 8 releases entre le 16/07 et le 03/09/2026                                                                                                                 | [registry.npmjs.org/@revenuecat/purchases-capacitor](https://registry.npmjs.org/@revenuecat/purchases-capacitor)                                                     |
| peerDependency            | `@capacitor/core >=8.0.0` ; dépend de `@revenuecat/purchases-typescript-internal-esm 18.33.1`                                                                                   | idem                                                                                                                                                                |
| Support Capacitor 8       | depuis 12.0.0 (2025-12-29, « Add support for Capacitor 8 (#632) ») ; issue « Capacitor 8 support » #627 fermée le 2025-12-29                                                     | [CHANGELOG.md](https://github.com/RevenueCat/purchases-capacitor/blob/main/CHANGELOG.md), [issues](https://github.com/RevenueCat/purchases-capacitor/issues?q=%22Capacitor+8%22) |
| Toolchain du plugin       | `android/build.gradle` : compileSdk 36, minSdk 24, Kotlin 2.2.20, AGP 8.13.2, JVM 21 ; 13.2.5 (2026-07-30) : « fix: support AGP 9 built-in Kotlin and new DSL »                  | [android/build.gradle](https://github.com/RevenueCat/purchases-capacitor/blob/main/android/build.gradle), CHANGELOG                                                  |
| Billing Library           | 13.0.0 (2026-04-15) : « updates to Billing Library 8.3.0 with min SDK supported of Android 6 (API 23) » ; `libs.versions.toml` de purchases-android : `billingClient = "8.3.0"` | [release 13.0.0](https://github.com/RevenueCat/purchases-capacitor/releases/tag/13.0.0), [purchases-android libs.versions.toml](https://github.com/RevenueCat/purchases-android/blob/main/gradle/libs.versions.toml) |
| Issues ouvertes           | 8 hors PR ; seule issue toolchain : #881 (warning Kotlin de dépréciation, « not a production problem »)                                                                        | [issues ouvertes](https://github.com/RevenueCat/purchases-capacitor/issues)                                                                                          |
| Tarif                     | « Pay nothing for up to $2,500 in monthly tracked revenue », puis 1 % du MTR ; le MTR « includes the revenue from all purchases and renewals including non-subscription products » | [pricing](https://www.revenuecat.com/pricing), [account-management](https://www.revenuecat.com/docs/welcome/set-up-revenuecat/account-management)                    |
| Webhooks                  | « Webhooks are available on our Pro plan » (le plan gratuit *est* le plan Pro sous 2 500 $)                                                                                     | [webhooks](https://www.revenuecat.com/docs/integrations/webhooks)                                                                                                    |
| Entitlement partagé       | « multiple products may unlock the same entitlement » ; « non-consumable […] purchases that are attached to an entitlement will unlock that content forever »                   | [entitlements](https://www.revenuecat.com/docs/getting-started/entitlements)                                                                                         |
| Produit « à vie » Android | « If you don't configure it as a non-consumable, we will automatically `consume` the purchase » ; avec Billing 8, un achat consommé n'est plus restaurable (release 11.0.0/13.0.0) | [android-products](https://www.revenuecat.com/docs/getting-started/entitlements/android-products), [release 13.0.0](https://github.com/RevenueCat/purchases-capacitor/releases/tag/13.0.0) |
| Statut                    | `EntitlementInfo` : `isActive`, `willRenew`, `expirationDate` (« can be null for lifetime access »), `unsubscribeDetectedAt`, `billingIssueDetectedAt` (« will be null again once billing issue resolved ») | [customer-info](https://www.revenuecat.com/docs/customers/customer-info)                                                                                             |
| Restore                   | `restorePurchases()` « should only be called from some user interaction » ; `syncPurchases()` pour l'automatique                                                               | [restoring-purchases](https://www.revenuecat.com/docs/getting-started/restoring-purchases)                                                                           |
| Identité                  | `Purchases.logIn({ appUserID })` ; ID ≤ 100 caractères, sans `/`, « should not be guessable »                                                                                    | [user-ids](https://www.revenuecat.com/docs/customers/user-ids)                                                                                                       |
| Config Android            | seule exigence documentée : `launchMode` de l'Activity en `standard` ou `singleTop`                                                                                              | [installation/capacitor](https://www.revenuecat.com/docs/getting-started/installation/capacitor)                                                                     |
| Credentials Play          | service account GCP (rôles Pub/Sub Editor + Monitoring Viewer), clé JSON, invitation dans Play Console ; « It can take up to 36 hours »                                          | [creating-play-service-credentials](https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials)                                           |

**Points forts** : seul plugin qui livre *tel quel* les six besoins de MémoPatte (offres, achat,
statut fin, restore, revérification, grâce) ; validation serveur, webhooks et API REST inclus sous
le seuil gratuit ; cadence de release hebdomadaire ; Capacitor 8 supporté depuis neuf mois ; fix
AGP 9 déjà publié (assurance pour un futur Capacitor 9).

**Points faibles** : dépendance à un SaaS (clé API dans l'app, données d'achat et App User ID
transmis à RevenueCat, à déclarer dans la politique de confidentialité et le formulaire « Sécurité
des données » de Play) ; dashboard à configurer (produits, entitlement, offering, credentials) ;
Billing 8.3.0 et non 9.x (conforme jusqu'au 31/08/2027, le bump suivra côté RevenueCat).

**Risques spécifiques à MémoPatte** : oublier de cocher « non-consumable » sur le produit à vie →
achat consommé, rachetable, non restaurable ; un changement de tarification RevenueCat n'aurait
d'effet qu'au-delà de 2 500 $/mois, hors de portée du projet.

### 3.2 `@capgo/native-purchases` (Capgo)

Attention au nom : le ticket #43 cite `@capgo/capacitor-native-purchases`, qui est le nom du
**dépôt GitHub** ; le paquet npm s'appelle **`@capgo/native-purchases`**
(`https://registry.npmjs.org/@capgo/capacitor-native-purchases` → 404).

**Faits vérifiés**

| Point                 | Valeur                                                                                                                                                                                  | Source                                                                                                                                                 |
|-----------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| Version / date        | 8.7.0, 2026-08-24 ; lignes par majeure Capacitor (7.19.3 pour Cap 7, 8.x pour Cap 8) ; 235 versions publiées                                                                            | [registry.npmjs.org/@capgo/native-purchases](https://registry.npmjs.org/@capgo/native-purchases)                                                        |
| peerDependency        | `@capacitor/core >=8.0.0` ; licence MPL-2.0                                                                                                                                             | idem                                                                                                                                                   |
| Compatibilité         | tableau README : v8.\*.\* ↔ Capacitor v8.\*.\* « ✅ » ; « Only the latest major version is actively maintained »                                                                          | [README](https://github.com/Cap-go/capacitor-native-purchases)                                                                                         |
| Activité              | dernier commit `main` 2026-09-01 (« update com.android.billingclient:billing to v9 ») ; 0 issue ouverte (4 PR Renovate) ; #189 (timeout BillingClient Android) fermée le 2026-07-04       | [commits](https://github.com/Cap-go/capacitor-native-purchases/commits/main), [issues](https://github.com/Cap-go/capacitor-native-purchases/issues)    |
| Toolchain du plugin   | `android/build.gradle` : AGP 8.13.0, compileSdk 36, minSdk 24, Java 21                                                                                                                  | [android/build.gradle](https://github.com/Cap-go/capacitor-native-purchases/blob/main/android/build.gradle)                                            |
| Billing Library       | `billing_version = "8.3.0"` au tag 8.7.0 et dans le tarball npm ; `9.1.0` sur `main`, non publié au 07/09 ; le README dit encore « Google Play Billing 7.x » (obsolète)                  | idem, tag [8.7.0](https://github.com/Cap-go/capacitor-native-purchases/blob/8.7.0/android/build.gradle)                                                |
| Abonnements Android   | `productType: PURCHASE_TYPE.SUBS` **et** `planIdentifier` (Base Plan ID) obligatoires ; « Missing planIdentifier for Android subscriptions will cause purchase failures »               | README                                                                                                                                                 |
| Non consommable       | `PURCHASE_TYPE.INAPP`, `isConsumable` défaut `false`, `autoAcknowledgePurchases` défaut `true` (« Android: Must acknowledge within 3 days or Google Play will refund »)                  | [src/definitions.ts](https://github.com/Cap-go/capacitor-native-purchases/blob/main/src/definitions.ts)                                                |
| Statut Android        | tableau README : `isActive` et `expirationDate` « Not set » sur Android ; « For subscription status and expiration, query Google Play Developer API on your server » ; seuls `purchaseState`, `orderId`, `purchaseToken`, `isAcknowledged` sont renseignés | README, [getting-started](https://capgo.app/docs/plugins/native-purchases/getting-started/)                                                            |
| Restore               | `restorePurchases()` → `Promise<void>` ; l'implémentation Java ne fait que `queryPurchasesAsync` INAPP + SUBS et ré-acquitte ; c'est `getPurchases({ productType })` qui renvoie la liste | [NativePurchasesPlugin.java](https://github.com/Cap-go/capacitor-native-purchases/blob/main/android/src/main/java/ee/forgr/nativepurchases/NativePurchasesPlugin.java) |
| Validation serveur    | aucune : le README montre un `fetch('/api/verify-purchase')` vers **votre** backend ; aucun service Capgo de validation trouvé (la page `webapp/payment` concerne l'abonnement Capgo live-update) | README, [capgo.app/docs/webapp/payment](https://capgo.app/docs/webapp/payment/)                                                                        |

**Points forts** : gratuit, sans tiers, Capacitor 8 et AGP 8.13 au jour près, dépôt sain (0 issue),
API simple, déjà l'éditeur de `@capgo/capacitor-social-login` utilisé par le projet (même
convention de versionnage par majeure Capacitor).

**Points faibles** : sur Android le plugin ne sait rien de l'expiration ni de la période de grâce ;
`restorePurchases()` muet ; pas de notion d'entitlement (à coder : « Plus = un INAPP `lifetime`
acquitté OU un SUBS présent ») ; documentation incohérente sur deux points (Billing 7.x, exemple
JSON Android avec `expirationDate`).

**Risques spécifiques à MémoPatte** : tout le statut serveur (nécessaire pour gater la sync Supabase,
voir §4) est à construire : service account Google, signature JWT dans une Edge Function, appel
`subscriptionsv2.get` / `products.get`, RTDN Pub/Sub. C'est faisable, c'est du travail non
prévu dans l'épic 9.

### 3.3 `@capacitor-community/in-app-purchases` et autres plugins communautaires

| Paquet                                    | État au 2026-09-07                                                                                                                                        | Source                                                                                      |
|-------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------|
| `@capacitor-community/in-app-purchases`   | **n'existe pas** (HTTP 404 sur le registre)                                                                                                               | [registry.npmjs.org/@capacitor-community/in-app-purchases](https://registry.npmjs.org/@capacitor-community/in-app-purchases) |
| `@capawesome-team/capacitor-purchases`    | payant (« only available to Capawesome Insiders », registre privé) ; Android : abonnements, consommables et non consommables, Billing 8.2.0                | [capawesome.io/plugins/purchases](https://capawesome.io/plugins/purchases/)                 |
| `@squareetlabs/capacitor-subscriptions`   | 1.0.25 (2025-11-09), peer `^6.0.0 \|\| ^7.0.0` — **pas Capacitor 8** ; abonnements seulement ; Billing 7                                                   | [registry](https://registry.npmjs.org/@squareetlabs/capacitor-subscriptions), [README](https://github.com/squareetlabs/capacitor-subscriptions) |
| `@adplorg/capacitor-in-app-purchase`      | 2.0.64 (2025-07-09), peer `>=7.0.0`, aucune publication depuis 14 mois                                                                                    | [registry](https://registry.npmjs.org/@adplorg/capacitor-in-app-purchase)                   |
| `capacitor-subscriptions`, `capacitor-purchases` | abandonnés (alpha 2024 ; Capacitor 3, 2022)                                                                                                        | registre npm                                                                                |

Conclusion : il n'y a **pas** d'option communautaire crédible ; les trois seules candidates réelles
sont RevenueCat, Capgo et Fovea.

### 3.4 `cordova-plugin-purchase` (Fovea) → en fait `capacitor-plugin-cdv-purchase`

**Découverte structurante** : depuis la 13.15.0 (2026-04-14), Fovea publie un **plugin Capacitor
natif** distinct, `capacitor-plugin-cdv-purchase`, avec la même API JS ; le README recommande ce
paquet pour Capacitor (« The plugin provides native implementations for both Capacitor and Cordova
— no compatibility layer needed »). Le paquet Cordova via la couche de compatibilité n'est plus la
voie préconisée.

| Point                       | Valeur                                                                                                                                                                                      | Source                                                                                                                                                    |
|-----------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| Versions / dates            | `capacitor-plugin-cdv-purchase` 13.18.0 (2026-07-16), créé le 2026-04-07 ; `cordova-plugin-purchase` 13.18.0 (2026-07-16), ~2 Mo décompressé                                                | [registry cap](https://registry.npmjs.org/capacitor-plugin-cdv-purchase), [registry cordova](https://registry.npmjs.org/cordova-plugin-purchase)            |
| peerDependency              | `@capacitor/core ^6.0.0 \|\| ^7.0.0 \|\| ^8.0.0` ; release 13.15.2 : « Capacitor 7 / 8 compatibility (#1692) » ; 13.15.0 : « CI now covers Capacitor 6, 7, and 8 »                            | [releases](https://github.com/j3k0/cordova-plugin-purchase/releases)                                                                                      |
| Billing Library             | `com.android.billingclient:billing:9.0.0` (plugin.xml et `capacitor/android/build.gradle`) ; 13.17.0 : « now build against Google Play Billing Library 9.0.0 (up from 8.3.0) »                | [plugin.xml](https://github.com/j3k0/cordova-plugin-purchase/blob/master/plugin.xml), [RELEASE_NOTES.md](https://github.com/j3k0/cordova-plugin-purchase/blob/master/RELEASE_NOTES.md) |
| Toolchain                   | fallbacks AGP 8.7.3 / compileSdk 35 / minSdk 23 / Java 17, tous surchargés par `rootProject.ext` de l'app                                                                                    | [capacitor/android/build.gradle](https://github.com/j3k0/cordova-plugin-purchase/blob/master/capacitor/android/build.gradle)                              |
| Activité                    | push 2026-09-03, dernier commit 2026-07-30 ; ~117 issues ouvertes, dont 3 récentes (2026-08-31) sur l'init Android (#1719, #1720, #1721) ; 0 issue AGP / Kotlin / Billing 9                   | [issues](https://github.com/j3k0/cordova-plugin-purchase/issues)                                                                                          |
| Types de produits           | `PAID_SUBSCRIPTION` ; `NON_CONSUMABLE` (acquitté) ; **`NON_RENEWING_SUBSCRIPTION` est consommé sur Android** → ne pas l'utiliser pour « à vie »                                             | [www/store.js](https://github.com/j3k0/cordova-plugin-purchase/blob/master/www/store.js)                                                                  |
| Statut sans validateur      | `store.owned()` : « Without receipt validation, it might remain false depending on the platform » ; sans validateur, `verify()` renvoie un faux reçu « ok » et l'acknowledge n'a lieu qu'à `finish()` | [Store.md](https://github.com/j3k0/cordova-plugin-purchase/blob/master/api/classes/CdvPurchase.Store.md), store.js                                          |
| Statut avec validateur      | `VerifiedPurchase` : `expiryDate`, `isExpired`, `isBillingRetryPeriod` (« grace period after a failed attempt to collect payment »), `renewalIntent`, `cancelationReason`                    | [www/store.d.ts](https://github.com/j3k0/cordova-plugin-purchase/blob/master/www/store.d.ts)                                                              |
| Validateur                  | iaptic : plan FREE « forever » 100 transactions/mois, 20 000 requêtes/mois ; STARTER 29 $/mois ; ou `store.validator` custom (format requête/réponse typé)                                   | [iaptic.com/pricing](https://www.iaptic.com/pricing), Store.md                                                                                            |
| Doc Capacitor               | `capacitor/README.md` : `npm install capacitor-plugin-cdv-purchase` + `npx cap sync`, aucune variable ; la page wiki « HOWTO: Capacitor » **n'existe pas** ; TROUBLESHOOTING : pièges iOS uniquement | [capacitor/README.md](https://github.com/j3k0/cordova-plugin-purchase/blob/master/capacitor/README.md)                                                    |
| Capacitor et plugins Cordova | « Capacitor does not support Cordova install variables, auto configuration, or hooks » ; `cordova-plugin-purchase` n'est pas dans la liste des incompatibles                               | [capacitorjs.com/docs/plugins/cordova](https://capacitorjs.com/docs/plugins/cordova)                                                                      |

**Points forts** : le seul en Billing **9.0.0** ; API la plus complète (grâce, intention de
renouvellement, raison d'annulation) *si* on branche un validateur ; iaptic gratuit à l'échelle de
MémoPatte ; projet vétéran (2014).

**Points faibles** : le plugin Capacitor natif n'a que cinq mois ; ~117 issues ouvertes ; API
lourde (store, adaptateurs, receipts, `when().approved().verified().finished()`) héritée de
Cordova ; sans validateur, le statut d'abonnement se limite au `owned()` local ; l'acknowledge
dépend d'un `finish()` explicite (issues #1491, #1546 sur des achats jamais acquittés).

**Risques spécifiques à MémoPatte** : courbe d'apprentissage disproportionnée pour deux produits ;
iaptic est un tiers au même titre que RevenueCat, avec moins d'outillage (pas de dashboard
d'entitlements, webhooks à vérifier).

### 3.5 Plugin maison autour de Play Billing Library 9.1.0

Ce qu'il faudrait écrire (d'après [integrate](https://developer.android.com/google/play/billing/integrate)) :
connexion `BillingClient` (avec `enablePendingPurchases` et `enableAutoServiceReconnection`),
`queryProductDetailsAsync` pour SUBS et INAPP, `launchBillingFlow` avec `ProductDetailsParams` +
`offerToken` du base plan, `PurchasesUpdatedListener`, `queryPurchasesAsync` au lancement et à
chaque `onResume`, `acknowledgePurchase` sous 3 jours, `setObfuscatedAccountId`, gestion de
`PENDING`, reconnexion, mapping des `BillingResponseCode` ; côté Capacitor : classe `@CapacitorPlugin`,
définitions TypeScript, registration dans `MainActivity`.

Estimation honnête pour une développeuse solo qui découvre l'API : **4 à 8 jours** pour un plugin
testable sur appareil, sans validation serveur ni tests automatisés, puis **une reprise obligatoire
tous les deux ans** (cycle de dépréciation de la bibliothèque, chaque majeure supprimant des API —
la v8 a retiré `queryPurchaseHistory`, `querySkuDetailsAsync`, etc., source
[release-notes](https://developer.android.com/google/play/billing/release-notes)). Valeur
portfolio réelle, mais c'est reproduire ce que Capgo fait déjà en 1 500 lignes de Java
maintenues par quelqu'un d'autre. **Non recommandé** ; à garder comme plan C si Capgo cessait
d'être maintenu.

---

### 3.6 `@adapty/capacitor` (Adapty)

Ajouté le 2026-09-07. Même catégorie que RevenueCat : SDK + backend qui valide les achats,
calcule le statut et expose un « access level » unique (équivalent de l'entitlement).

| Point | Constat | Source (consultée le 2026-09-07) |
|---|---|---|
| Version `latest` / date | 4.1.1 / 2026-09-01 (4.1.0 le 2026-08-28, 3.17.1 le 2026-06-10) | registre npm `@adapty/capacitor` |
| `peerDependencies` | `@capacitor/core >=8.0.0` ; « Capacitor 8 : `@adapty/capacitor` 3.16.0 et plus » ; « Capacitor 6 et moins non supportés » | registre npm ; README GitHub `adaptyteam/AdaptySDK-Capacitor` ; docs `sdk-installation-capacitor` |
| Licence / dépôt | MIT ; 30 stars, 0 issue ouverte, 0 fork (dépôt jeune) | README GitHub |
| Android | minSdk 24 ; « Adapty Capacitor SDK works with Google Play Billing Library v8 » | docs `sdk-installation-capacitor` |
| Produits | « One-time purchases and lifetime subscriptions supported » ; abonnements, essais, upgrades | README GitHub |
| Un même droit pour les deux produits | ✅ « access level » (par défaut `premium`) accordé par n'importe quel produit qui y est rattaché | docs Adapty (access levels) |
| Statut | ✅ côté backend : actif, date d'expiration, renouvellement, grâce (à confirmer sur Android, non testé) | docs Adapty |
| Vie privée dans le SDK | Options d'activation : `ipAddressCollectionDisabled: true`, `android.adIdCollectionDisabled: true` ; désactivation de l'IP aussi possible dans le dashboard | docs `sdk-installation-capacitor` ; docs Android |
| Tarif | Plan Pro : « Gratuit tant que vous gagnez moins de $5K/mois », puis « 1 % du revenu mensuel » ; webhooks, analytics, paywall builder inclus. Plan Enterprise sur devis, seul à offrir « Résidence des données (US ou UE) » | adapty.io/fr/pricing |
| Dépendance à un tiers | **oui** (SaaS obligatoire) | — |
| Non vérifié | Le SDK Capacitor 4.x a un mois ; aucune compilation faite dans ce dépôt ; version AGP du plugin non lue ; comportement grâce/hold sur Android non testé | — |

**Différence avec RevenueCat** : périmètre identique pour MémoPatte (deux produits, un droit
unique, statut, restauration, webhooks), seuil gratuit deux fois plus haut (5 000 $ contre
2 500 $), dépôt Capacitor beaucoup plus jeune et moins utilisé (30 stars contre plusieurs
centaines), et surtout **hébergement aux États-Unis par défaut** avec résidence UE réservée au
plan Enterprise (§4.5). Adapty est aussi orienté « paywall builder » et tests A/B, dont
MémoPatte n'a pas besoin en v1.

---

### 3.7 Purchasely

Ajouté le 2026-09-07 à la demande de Gaelle. Purchasely est une plateforme française
d'abonnements et de paywalls no-code.

| Point | Constat | Source (consultée le 2026-09-07) |
|---|---|---|
| Société / hébergement | « Purchasely, a simplified joint-stock company… registered office located at 17, chemin des loriots, 93230 Romainville » ; données chez « Amazon Web Services, EUROPE region / Amazon Web Services EMEA SARL » ; DPO nommé ; DPA disponible | purchasely.com/privacy-policy |
| SDK pour ce projet | **Aucun plugin Capacitor.** Il existe `@purchasely/cordova-plugin-purchasely` (latest 6.0.1, licence ISC, mots-clés `ecosystem:cordova` uniquement, `cordova-android >= 12`). Capacitor sait charger des plugins Cordova, mais ce n'est ni documenté ni supporté par Purchasely, et les plugins Cordova sont la voie la plus fragile dans Capacitor 8 | registre npm ; docs.purchasely.com (« A mobile SDK (iOS, Android, and bridges) ») |
| Tarif | **Pas de plan gratuit ni d'essai** (« Free version not included », « Free trial not available », « Contact vendor for pricing ») ; un agrégateur cite un plan « Signature » à 1 800 $ sans périodicité vérifiable ; la page pricing officielle ne montre qu'un bouton « Talk to Sales » | capterra.com ; purchasely.com/pricing |
| Cible | Éditeurs établis : paywall builder no-code, tests A/B, parcours d'abonnement | purchasely.com |

**Verdict** : le meilleur profil RGPD du comparatif (société française, hébergement AWS Europe,
DPO), mais **écarté** pour MémoPatte : pas de plugin Capacitor, pas d'offre gratuite ni de
tarif public, produit dimensionné pour des éditeurs avec équipe commerciale. À retenir comme
référence de ce qu'un acteur européen propose, si la question de l'hébergement UE devenait
bloquante à plus grande échelle.

---

## 4. Vérification côté serveur

### 4.1 Est-ce nécessaire pour MémoPatte ?

Oui, et pas seulement pour la fraude : **MémoPatte Plus vend le cloud**. Les Edge Functions et
les policies RLS de Supabase doivent savoir si un `user_id` a droit à la sync ; un booléen envoyé
par le client ne vaut rien. Il faut donc, quel que soit le plugin, une table côté Supabase
(par ex. `plus_entitlements(user_id, source, product_id, expires_at, status, updated_at)`) alimentée
par une source de confiance.

Ce que Google demande ([security](https://developer.android.com/google/play/billing/security)) :
« Your app should always verify the legitimacy of purchases before granting benefits » ; « Send the
corresponding purchaseToken to your backend » ; « Use the Purchases.products:get or
Purchases.subscriptionsv2:get endpoints in the Google Play Developer API to verify with Google that
the purchase is legitimate » ; « purchaseToken is globally unique, so you can safely use this value
as a primary key » ; ne pas utiliser `orderId` comme clé. Google ne distingue pas non consommable et
abonnement sur ce point : la règle est la même. Le risque propre au non consommable est le
remboursement/chargeback *après* déblocage — couvert par l'API
[Voided Purchases](https://developers.google.com/android-publisher/voided-purchases) (30 jours
d'historique, 6 000 requêtes/jour) et par la notification RTDN `voidedPurchaseNotification`.

Ordre de grandeur du risque pour une app portfolio : faible (pas de contenu revendable, pas de
consommable), mais le coût d'un accès cloud offert à un faux acheteur est réel (stockage photos,
egress Supabase). La validation serveur est donc **justifiée mais pas urgente** : elle peut être
livrée dans un ticket séparé après l'écran Plus, tant que l'accès cloud est finalement gaté.

### 4.2 Ce que Google fournit

| Brique                                | Rôle                                                                                                                   | Coût / contraintes                                                                                                                                                     | Source                                                                                                                                                       |
|---------------------------------------|------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `purchases.subscriptionsv2.get`       | état complet d'un abonnement : `subscriptionState` (`ACTIVE`, `IN_GRACE_PERIOD`, `ON_HOLD`, `PAUSED`, `CANCELED`, `EXPIRED`, `PENDING`), `lineItems[].expiryTime`, `acknowledgementState`, `testPurchase` | scope `androidpublisher` ; 3 000 requêtes/min par bucket                                                                                                               | [subscriptionsv2](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2), [quotas](https://developers.google.com/android-publisher/quotas) |
| `purchases.products.get`              | non consommable : `purchaseState` (0 Purchased / 1 Canceled / 2 Pending), `acknowledgementState`, `purchaseType` (0 = testeur de licence) | idem                                                                                                                                                                   | [purchases.products](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products)                                                     |
| Compte de service                     | authentification serveur ; invité dans Play Console (« Users & Permissions ») avec « View financial data… » et « Manage orders and subscriptions » ; « must be used in a secure environment, such as your server » | gratuit                                                                                                                                                                | [getting_started](https://developers.google.com/android-publisher/getting_started)                                                                           |
| Real-time developer notifications     | Pub/Sub : `SUBSCRIPTION_RENEWED` (2), `CANCELED` (3), `PURCHASED` (4), `ON_HOLD` (5), `IN_GRACE_PERIOD` (6), `EXPIRED` (13), `REVOKED` (12), `ONE_TIME_PRODUCT_PURCHASED`, `voidedPurchaseNotification` ; recommandé : rappeler l'API après réception | projet GCP avec Pub/Sub ; 10 Gio/mois gratuits (~2 Ko par notification) ; topic à déclarer dans Play Console ; « you need to create a backend server to consume the messages » | [rtdn-reference](https://developer.android.com/google/play/billing/rtdn-reference), [getting-ready](https://developer.android.com/google/play/billing/getting-ready), [Pub/Sub pricing](https://cloud.google.com/pubsub/pricing) |

### 4.3 Avec RevenueCat

RevenueCat *est* ce backend : il consomme les RTDN (topic généré depuis son dashboard, à coller dans
Play Console — [google-server-notifications](https://www.revenuecat.com/docs/platform-resources/server-notifications/google-server-notifications)),
valide chaque `purchaseToken` avec le service account, et expose :

- au client : `getCustomerInfo()` / `addCustomerInfoUpdateListener` → `entitlements.active['plus']` ;
- au serveur : webhooks `INITIAL_PURCHASE`, `RENEWAL`, `NON_RENEWING_PURCHASE` (l'achat à vie),
  `CANCELLATION`, `BILLING_ISSUE` (avec `grace_period_expiration_at_ms`), `EXPIRATION` —
  [event-types](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields) ;
  et `GET /v1/subscribers/{app_user_id}` (`entitlements.expires_date`, `grace_period_expires_date`)
  — [api-v1](https://www.revenuecat.com/docs/api-v1).

Côté Supabase, une seule Edge Function `revenuecat-webhook` (vérification du header
`Authorization` configuré dans RevenueCat, upsert dans `plus_entitlements`) suffit ; pas de service
account Google à manipuler dans Supabase, pas de JWT à signer.

### 4.4 Sans RevenueCat : Supabase Edge Functions + Google Play Developer API

Faisable gratuitement : plan Free Supabase = 500 000 invocations/mois, 100 fonctions, 150 s de wall
clock, 256 Mo ([pricing](https://supabase.com/pricing), [limits](https://supabase.com/docs/guides/functions/limits)) ;
secrets via `supabase secrets set` et `Deno.env.get()` ([secrets](https://supabase.com/docs/guides/functions/secrets)).
Réserve : « Free projects are paused after 1 week of inactivity » — un projet en pause ne recevra
ni les RTDN ni les appels de vérification.

Ce qu'il faut coder :

1. `verify-purchase` (appelée par l'app après achat / au lancement avec le `purchaseToken`) :
   fabriquer un JWT RS256 signé avec la clé du compte de service (secret Supabase), l'échanger
   contre un access token OAuth, appeler `subscriptionsv2.get` ou `products.get`, vérifier
   `obfuscatedExternalAccountId` = `user_id`, upsert `plus_entitlements`.
2. `play-rtdn` (endpoint push Pub/Sub) : décoder le message base64, rappeler l'API, mettre à jour
   l'état ; dédupliquer sur `messageId`.
3. Un job ou une vérification paresseuse pour les abonnements dont `expires_at` est passé sans
   notification reçue.

Supabase ne documente **aucun** exemple Google Play / achats in-app (la liste
[examples](https://supabase.com/docs/guides/functions/examples) n'en contient pas) ; tout est à
écrire. Estimation : 2 à 4 jours, plus la configuration GCP (projet, API, compte de service,
Pub/Sub, topic dans Play Console).

---

### 4.5 Ce que les intermédiaires stockent (RGPD)

Question de Gaelle du 2026-09-07 : « RevenueCat et Adapty vont stocker des données du coup ? »
Oui. Dès qu'un SDK de ce type est activé, l'appareil envoie à leur backend un identifiant
d'utilisateur, le jeton d'achat Google, l'état de l'abonnement et des informations d'appareil.
Ils deviennent **sous-traitants** au sens de l'art. 28 RGPD, à ajouter à la politique de
confidentialité (§3.1 de `conformite-play-store-rgpd.md`) et au formulaire Data safety.

| | RevenueCat | Adapty | Capgo native-purchases |
|---|---|---|---|
| Société | RevenueCat, Inc. (États-Unis) | Adapty Tech Inc. (Delaware, États-Unis) | plugin seul, aucun backend |
| Données d'utilisateurs finaux reçues | « User ID of the end user in your app », « Apple receipt file; and Google purchase token », « Last seen time », « device type, operating system » | « Technical Information », « Identifiers », « Usage Data » : IP, identifiants d'appareil, événements in-app, montants et dates de transaction ; identifiant publicitaire Android (AAID) si non désactivé | rien ne quitte l'appareil vers un tiers ; seul Google Play voit l'achat |
| Hébergement | « stored securely on Amazon Web Services ("AWS") in the USA » ; sous-traitants ultérieurs listés tous aux États-Unis (AWS, Snowflake, Cloudflare, Google, OpenAI, Anthropic…) | « Amazon Web Services (Seattle, USA) » et « OVH US (Reston, Virginia) » ; résidence UE **uniquement en plan Enterprise** | — |
| Transfert hors UE | Clauses contractuelles types (SCC 2021/914) dans le DPA ; pas de mention du Data Privacy Framework trouvée | SCC (module 2) dans le DPA + certification EU-US Data Privacy Framework annoncée dans la politique de confidentialité | aucun |
| DPA | « forms part of the Customer Agreement… Terms of Use » : incorporé aux CGU, rien à signer | « incorporated into and forms part of Adapty Terms of Service » : idem | sans objet |
| Conservation | destruction ou restitution « upon Customer's request » à la fin du contrat ; la politique de confidentialité évoque une conservation jusqu'à « six years » pour litiges | « as per the contractual terms… deleted upon contract termination » | — |
| Réglages pour minimiser | passer l'UUID Supabase comme `appUserID` (pas l'email) | `ipAddressCollectionDisabled: true`, `android.adIdCollectionDisabled: true`, identifiant = UUID Supabase | — |
| Certifications | SOC 2 Type II | SOC 2 (annoncé) | — |

Sources : revenuecat.com/privacy, revenuecat.com/dpa, revenuecat.com/security-and-compliance ;
adapty.io/privacy, adapty.io/data-processing-agreement, adapty.io/fr/pricing ; toutes
consultées le 2026-09-07.

**Lecture RGPD.** Un transfert vers les États-Unis n'est pas interdit : il est licite avec des
clauses contractuelles types, et plus confortable encore si le prestataire est certifié au Data
Privacy Framework (décision d'adéquation de la Commission du 10 juillet 2023). Les deux
services sont donc utilisables, à trois conditions : le mentionner dans la politique de
confidentialité comme sous-traitant hébergé aux États-Unis avec le mécanisme de transfert,
ne leur envoyer qu'un identifiant technique (jamais l'email), et couper la collecte d'IP et
d'identifiant publicitaire quand l'option existe. Le point le moins confortable est chez
RevenueCat : liste de sous-traitants ultérieurs longue (dont des fournisseurs d'IA) et pas de
DPF trouvé. Le seul choix qui **n'ajoute aucun sous-traitant** est Capgo : l'achat n'est connu
que de Google, qui est déjà dans la politique en tant que marchand.

---

## 5. Expiration et période de grâce

### 5.1 Ce que Google impose

Source : [lifecycle/subscriptions](https://developer.android.com/google/play/billing/lifecycle/subscriptions)
et [subscriptions](https://developer.android.com/google/play/billing/subscriptions).

| État                     | Accès attendu                                                                             | Visible par `queryPurchasesAsync` ?                                                     | Durée                                                                                                                                           |
|--------------------------|-------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------|
| Active / annulé non expiré | oui                                                                                     | oui                                                                                     | jusqu'à `expiryTime`                                                                                                                            |
| Période de grâce         | **oui** (« the user should still have access to their subscription entitlement »)         | **oui** (« continues to return purchases that are in the grace period »)                | configurable par base plan ; activée par défaut ; durée par défaut non publiée dans les pages consultées                                          |
| Account hold             | **non** (« you should block access to the subscription entitlement »)                     | **non** (« is not returned by the queryPurchasesAsync() method during account hold »)   | par défaut « 60 days minus any grace period duration » (depuis le 01/12/2025) ; grâce + hold ≥ 30 jours — [answer/16631229](https://support.google.com/googleplay/android-developer/answer/16631229), [answer/12154973](https://support.google.com/googleplay/android-developer/answer/12154973) |
| Paused                   | non                                                                                       | non                                                                                     | **non applicable** : « annual subscriptions and free trials cannot be paused »                                                                  |
| Expiré                   | non (« the user should lose access »)                                                     | non                                                                                     | —                                                                                                                                               |

Lien de gestion à proposer dans l'app (obligation d'un moyen d'annulation facile) :
`https://play.google.com/store/account/subscriptions?sku=<sub_id>&package=com.gaellebriet.memopatte`.

### 5.2 Ce que chaque option expose

| Option              | Grâce                                                                                                   | Account hold                                                                        | Expiré                                                                | Source                                                                                                    |
|---------------------|---------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------|-----------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------|
| RevenueCat          | `isActive: true` + `billingIssueDetectedAt` non null ; webhook `BILLING_ISSUE` avec `grace_period_expiration_at_ms` | `isActive: false` (expiration à la fin de la grâce) ; webhook `EXPIRATION`          | `isActive: false`, `expirationDate` passée ; webhook `EXPIRATION`     | [customer-info](https://www.revenuecat.com/docs/customers/customer-info), [how-grace-periods-work](https://www.revenuecat.com/docs/subscription-guidance/how-grace-periods-work), [event-flows](https://www.revenuecat.com/docs/integrations/webhooks/event-flows) |
| Capgo               | l'abonnement **reste** dans `getPurchases()` (comportement Play) → accès conservé, mais **aucun signal** qu'il y a un problème de paiement | l'abonnement **disparaît** de `getPurchases()` → indistinguable d'un expiré           | disparaît de `getPurchases()`                                          | comportement de `queryPurchasesAsync` ci-dessus + README Capgo (« `expirationDate` is NOT set on Android ») |
| Fovea + validateur  | `VerifiedPurchase.isBillingRetryPeriod`                                                                 | `isExpired` / `owned() === false`                                                   | `isExpired`, `expiryDate`                                             | [store.d.ts](https://github.com/j3k0/cordova-plugin-purchase/blob/master/www/store.d.ts)                   |
| Fovea sans validateur | `owned()` reste true (reçu local présent)                                                             | `owned()` false                                                                     | `owned()` false                                                       | store.js `LocalReceipts.isOwned`                                                                          |

Pour l'achat à vie, les trois options renvoient un achat `PURCHASED` acquitté sans date
d'expiration (`expirationDate: null` chez RevenueCat).

### 5.3 Comportement recommandé pour MémoPatte

Cohérent avec la règle d'or du 2026-09-07 (« qui arrête Plus garde tout en local et perd seulement
la sync ») :

| Statut calculé            | Sync cloud | UI                                                                                                                                      |
|---------------------------|------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| `lifetime`                | oui        | badge « Plus à vie » dans Réglages, rien d'autre                                                                                        |
| `active`                  | oui        | date de renouvellement + lien « Gérer mon abonnement » (deep link Play)                                                                 |
| `grace` (billing issue)   | **oui**    | bandeau non bloquant « Problème de paiement : mets à jour ton moyen de paiement pour garder la sauvegarde cloud » + deep link Play      |
| `hold` / `expired`        | non        | bandeau « Plus est arrêté ; tes données restent sur ce téléphone » + bouton « Réactiver » (écran Plus) + « Restaurer mes achats »       |
| `none`                    | non        | écran Plus proposé, jamais imposé (#43)                                                                                                 |

Règles : ne jamais effacer ni verrouiller les données locales ; ne pas supprimer côté Supabase à
l'expiration (garder la sauvegarde un délai à décider, à consigner dans decisions-log) ; revérifier
le statut à chaque lancement et à chaque retour au premier plan (Google : appeler
`queryPurchasesAsync` « in `onResume()` », [integrate](https://developer.android.com/google/play/billing/integrate)) ;
bouton « Restaurer » manuel dans Réglages (RevenueCat : `restorePurchases` réservé à une action
utilisateur). Configurer la grâce à la valeur par défaut Play (la doc avertit que raccourcir
« may reduce the number of subscriptions recovered »).

---

## 6. Recommandation

**Option principale : `@revenuecat/purchases-capacitor` 13.x.**

Arguments :

1. C'est la seule option qui couvre *toute* la liste de besoins de #43 sans code serveur à
   inventer : l'entitlement `plus` est accordé indifféremment par l'abonnement annuel et par le
   non consommable, `getCustomerInfo()` donne actif/expiré/à vie/grâce, `restorePurchases()`
   fonctionne, la validation Play et les RTDN sont gérés.
2. Compatibilité Capacitor 8 / AGP 8.13 vérifiée dans le code du plugin (compileSdk 36, minSdk 24,
   AGP 8.13.2), Capacitor 8 supporté depuis décembre 2025, fix AGP 9 déjà livré ; Billing 8.3.0
   conforme à l'exigence Google du 31/08/2026.
3. Gratuit à l'échelle du projet (2 500 $ de MTR/mois ≈ 300 abonnements annuels *par mois*), et
   le webhook vers une Edge Function Supabase est la façon la plus simple d'alimenter la table
   d'entitlements qui gate la sync.
4. Portfolio : intégration d'un outil standard de l'industrie, avec dashboard et événements
   exploitables.

Précautions : déclarer le produit à vie **Non-consumable** dans le dashboard RevenueCat ; appeler
`Purchases.logIn({ appUserID: <uuid Supabase> })` dès la connexion (l'UUID respecte les règles :
≤ 100 caractères, sans `/`, non devinable) ; mentionner RevenueCat dans la politique de
confidentialité et le formulaire « Sécurité des données » ; garder le plugin à jour (13.x bouge
chaque semaine).

**Option de repli : `@capgo/native-purchases` 8.x + Edge Function Supabase.**

À choisir si la dépendance à un SaaS est jugée inacceptable, ou si RevenueCat changeait ses
conditions. Le plugin est sain et gratuit ; le prix à payer est la construction de la vérification
(§4.4) — sans elle, l'app sait seulement « l'abonnement est présent ou non », ce qui reste
conforme au comportement Google (accès en grâce, blocage en hold/expiré) mais ne permet ni
d'afficher la date de renouvellement ni de prévenir d'un problème de paiement.

**Adapty** (§3.6) : équivalent fonctionnel de RevenueCat avec un seuil gratuit plus haut, mais
un SDK Capacitor beaucoup plus jeune et des données hébergées aux États-Unis sans option UE hors
Enterprise. À retenir si RevenueCat devait être écarté pour une raison contractuelle, pas comme
premier choix.

**Lecture après la question RGPD du 2026-09-07** : si Gaelle préfère ne déclarer aucun
sous-traitant supplémentaire, Capgo devient l'option principale, avec la limite assumée
« l'app fait confiance au téléphone » (§4.1) ; RevenueCat ou Adapty deviennent une évolution
possible si Plus se vend.

Troisième voie, non retenue : `capacitor-plugin-cdv-purchase` + iaptic gratuit — techniquement
viable, mais plugin Capacitor natif trop jeune et API trop lourde pour deux produits.

Le plugin maison est écarté (§3.5).

---

## 7. Étapes d'intégration (option principale, Capacitor 8)

### 7.1 Play Console (indépendant du plugin)

1. Profil de paiement : « you must also set up a profile in the Google Payments Center and then
   link that profile to your Google Play developer account » —
   [getting-ready](https://developer.android.com/google/play/billing/getting-ready).
2. Publier un premier AAB signé sur la piste **Internal testing** (« publish to any track,
   including the internal test track ») ; les produits ne peuvent être créés qu'une fois une
   version avec la Billing Library téléversée.
3. Produit ponctuel : **Monetize with Play > Products > In-app products > Create product** ;
   id en minuscule/chiffre, titre ≤ 55 caractères, description ≤ 200, prix 24,99 € ; **Activate**
   — [answer/1153481](https://support.google.com/googleplay/android-developer/answer/1153481).
   Proposition d'identifiant : `memopatte_plus_lifetime`.
4. Abonnement : **Monetize with Play > Products > Subscriptions > Create subscription** (id ≤ 40
   caractères) puis **Add base plan** avec période **Yearly**, renouvellement automatique, prix
   7,99 €, grâce laissée par défaut, account hold automatique ; **Activate** —
   [answer/140504](https://support.google.com/googleplay/android-developer/answer/140504).
   Proposition : abonnement `memopatte_plus`, base plan `annual` → identifiant RevenueCat
   `memopatte_plus:annual` ([android-products](https://www.revenuecat.com/docs/getting-started/entitlements/android-products)).
5. Testeurs de licence : **Settings > License testing**, liste d'e-mails (compte Google différent
   du compte développeur) — [answer/6062777](https://support.google.com/googleplay/android-developer/answer/6062777).
6. Compte de service (pour RevenueCat ou pour Supabase) : GCP → activer « Google Play Android
   Developer API », créer le compte de service, clé JSON ; Play Console → **Users and
   permissions** → inviter l'e-mail du compte avec « View financial data… », « Manage orders and
   subscriptions » (+ « View app information » et « Manage store presence » demandés par
   RevenueCat) ; jusqu'à 36 h de propagation —
   [creating-play-service-credentials](https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials).
7. RTDN : **Monetization setup** → coller le topic Pub/Sub généré par RevenueCat, choisir
   « Subscriptions, voided purchases, and all one-time products », donner le rôle Pub/Sub
   Publisher à `google-play-developer-notifications@system.gserviceaccount.com`, « Send test
   notification » — [google-server-notifications](https://www.revenuecat.com/docs/platform-resources/server-notifications/google-server-notifications).

### 7.2 Dashboard RevenueCat

Projet → app Android (package `com.gaellebriet.memopatte`, upload de la clé JSON) → produits
`memopatte_plus:annual` et `memopatte_plus_lifetime` (**Non-consumable**) → entitlement `plus`
rattaché aux deux → offering `default` avec deux packages (`$rc_annual`, `$rc_lifetime`) → clé API
publique Google Play.

### 7.3 Projet

```bash
pnpm add @revenuecat/purchases-capacitor
pnpm cap:sync
```

Aucune modification de `android/build.gradle` ni de `variables.gradle` n'est requise : le plugin
apporte son propre Kotlin et se cale sur `rootProject.ext` (compileSdk 36, minSdk 24). Point à tester :
`android/app/src/main/AndroidManifest.xml` déclare `android:launchMode="singleTask"` pour
`MainActivity`, alors que RevenueCat avertit que « anything other than `standard` or `singleTop` »
peut annuler un achat si l'app passe en arrière-plan pendant le flux — la doc ne dit pas si
`singleTask` pose problème en pratique. Premier build :
`pnpm cap:open:android` → Build → vérifier qu'aucune erreur Gradle n'apparaît (c'est le test qui
avait manqué côté Flutter).

Côté Vue/TypeScript, un store Pinia `plus` avec :

- `configure({ apiKey, appUserID: session.user.id })` au démarrage (ou `logIn` après connexion) ;
- `getOfferings()` → `current.availablePackages` → `product.priceString` pour l'écran Plus (9.2) ;
- `purchasePackage({ aPackage })` → `customerInfo.entitlements.active['plus']` ;
- `getCustomerInfo()` au lancement et `App.addListener('resume')` ; `addCustomerInfoUpdateListener` ;
- `restorePurchases()` derrière un bouton Réglages ;
- mapping vers `lifetime | active | grace | expired | none` (§5.3) via `expirationDate === null`,
  `isActive`, `billingIssueDetectedAt`.

Côté Supabase : Edge Function `revenuecat-webhook` (secret `REVENUECAT_WEBHOOK_AUTH`), table
`plus_entitlements`, policies RLS de la sync conditionnées à `expires_at > now()` ou
`source = 'lifetime'`.

### 7.4 Tester

Source : [billing/test](https://developer.android.com/google/play/billing/test).

- Un testeur de licence peut **sideloader un build debug** : « License testers can bypass this
  check, meaning you can sideload apps for testing, even for apps using debug builds with debug
  signatures », à condition que le package name corresponde à l'app déclarée dans Play Console et
  que le compte Google soit testeur. Un AAB doit tout de même exister sur une piste (étape 7.1.2).
- Instruments de test : « Test instrument, always approves », « always declines », « Slow test
  card », « approves then charges back ».
- Renouvellements accélérés : **abonnement annuel → renouvellement toutes les ~30 minutes**, grâce
  → 5 min, account hold → 10 min. Scénario complet grâce → hold → expiré testable en moins d'une
  heure avec la carte « always declines » après un premier achat.
- Play Billing Lab (`com.google.android.apps.play.billingtestcompanion`) pour forcer les
  transitions et changer de pays.
- Les achats via RevenueCat en sandbox sont marqués `testPurchase` / environnement sandbox ; les
  webhooks ont un scope d'environnement à cocher.

---

## 8. Ce que je n'ai pas pu vérifier

- **Durée par défaut et liste des durées possibles de la période de grâce** dans Play Console :
  absentes des pages consultées ([140504](https://support.google.com/googleplay/android-developer/answer/140504),
  [12154973](https://support.google.com/googleplay/android-developer/answer/12154973),
  [16631229](https://support.google.com/googleplay/android-developer/answer/16631229)) ; la page
  `answer/12154184` renvoie 404. Seule contrainte vérifiée : grâce + hold ≥ 30 jours, hold
  automatique = 60 jours − grâce.
- **Exigence AGP/Gradle propre à la Billing Library** : non documentée par Google (seuls minSdk 23
  depuis 8.1.0 et targetSdk 35 depuis 9.0.0 le sont).
- **Build réel** : aucun des trois plugins n'a été compilé dans ce dépôt ; la compatibilité est
  établie sur les fichiers Gradle des plugins et leurs peerDependencies, pas sur un `assembleDebug`.
  À faire en premier dans le ticket d'implémentation.
- **`launchMode="singleTask"`** du template Capacitor face à la consigne RevenueCat (`standard` ou
  `singleTop`) : non tranché par la doc, à tester (achat, mise en arrière-plan, retour).
- **Matrice précise du plan gratuit RevenueCat** (les RTDN Google sont-elles réservées à un
  palier ?) : la page pricing ne publie pas d'exclusions ; seuls les webhooks sont explicitement
  « Pro plan ». Les pages `revenuecat.com/reference/*` (référence REST détaillée) répondent 404
  depuis cet environnement.
- **Obligation d'un compte de facturation GCP** pour utiliser Pub/Sub dans les 10 Gio gratuits :
  non précisé sur la page pricing.
- **Délai de prise en compte** des testeurs de licence et des permissions du compte de service dans
  Play Console : non documenté (hors « up to 36 hours » côté RevenueCat).
- Capgo : identité du mainteneur non vérifiée sur une page ; `ProductPayloadMapper.java` non lu.
- Fovea : `iaptic-example-nodejs-backend` et les tutoriels wiki non lus ; la liste des issues
  ouvertes (~117) n'a été parcourue que par mots-clés.
- `@adplorg/capacitor-in-app-purchase` : support Android annoncé d'après un résultat de recherche,
  README non lu.

---

## 9. Sources consultées (toutes le 2026-09-07)

Registre npm : `@revenuecat/purchases-capacitor`, `@capgo/native-purchases`,
`capacitor-plugin-cdv-purchase`, `cordova-plugin-purchase`, `@capacitor-community/in-app-purchases`
(404), `@squareetlabs/capacitor-subscriptions`, `@adplorg/capacitor-in-app-purchase`.

RevenueCat : dépôt [purchases-capacitor](https://github.com/RevenueCat/purchases-capacitor)
(README, CHANGELOG, releases 11.0.0 / 12.0.0 / 13.0.0 / 13.2.5, issues, `android/build.gradle`),
[purchases-android libs.versions.toml](https://github.com/RevenueCat/purchases-android/blob/main/gradle/libs.versions.toml),
docs [installation/capacitor](https://www.revenuecat.com/docs/getting-started/installation/capacitor),
[pricing](https://www.revenuecat.com/pricing), [account-management](https://www.revenuecat.com/docs/welcome/set-up-revenuecat/account-management),
[entitlements](https://www.revenuecat.com/docs/getting-started/entitlements), [android-products](https://www.revenuecat.com/docs/getting-started/entitlements/android-products),
[customer-info](https://www.revenuecat.com/docs/customers/customer-info), [restoring-purchases](https://www.revenuecat.com/docs/getting-started/restoring-purchases),
[user-ids](https://www.revenuecat.com/docs/customers/user-ids), [how-grace-periods-work](https://www.revenuecat.com/docs/subscription-guidance/how-grace-periods-work),
[webhooks](https://www.revenuecat.com/docs/integrations/webhooks), [event-types-and-fields](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields),
[event-flows](https://www.revenuecat.com/docs/integrations/webhooks/event-flows), [google-server-notifications](https://www.revenuecat.com/docs/platform-resources/server-notifications/google-server-notifications),
[creating-play-service-credentials](https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials),
[api-v1](https://www.revenuecat.com/docs/api-v1), [api-v2](https://www.revenuecat.com/docs/api-v2).

Capgo : dépôt [capacitor-native-purchases](https://github.com/Cap-go/capacitor-native-purchases)
(README, `android/build.gradle` sur `main` et au tag 8.7.0, `src/definitions.ts`,
`NativePurchasesPlugin.java`, issues, releases), docs [native-purchases](https://capgo.app/docs/plugins/native-purchases/),
[getting-started](https://capgo.app/docs/plugins/native-purchases/getting-started/),
[revenue-playbook](https://capgo.app/docs/plugins/native-purchases/revenue-playbook/).

Fovea : dépôt [cordova-plugin-purchase](https://github.com/j3k0/cordova-plugin-purchase) (README,
`plugin.xml`, `RELEASE_NOTES.md`, releases, `capacitor/README.md`, `capacitor/TROUBLESHOOTING.md`,
`capacitor/android/build.gradle`, `www/store.js`, `www/store.d.ts`, `api/classes/CdvPurchase.Store.md`,
issues), [iaptic.com/pricing](https://www.iaptic.com/pricing).

Capacitor : [docs/plugins/cordova](https://capacitorjs.com/docs/plugins/cordova),
[docs/updating/8-0](https://capacitorjs.com/docs/updating/8-0), [docs/android](https://capacitorjs.com/docs/android),
[android-template](https://github.com/ionic-team/capacitor/tree/main/android-template),
[capacitor-cordova-android-plugins/build.gradle](https://github.com/ionic-team/capacitor/blob/main/capacitor-cordova-android-plugins/build.gradle),
[capawesome.io/plugins/purchases](https://capawesome.io/plugins/purchases/).

Google : [release-notes](https://developer.android.com/google/play/billing/release-notes),
[deprecation-faq](https://developer.android.com/google/play/billing/deprecation-faq),
[integrate](https://developer.android.com/google/play/billing/integrate), [security](https://developer.android.com/google/play/billing/security),
[subscriptions](https://developer.android.com/google/play/billing/subscriptions), [lifecycle/subscriptions](https://developer.android.com/google/play/billing/lifecycle/subscriptions),
[rtdn-reference](https://developer.android.com/google/play/billing/rtdn-reference), [getting-ready](https://developer.android.com/google/play/billing/getting-ready),
[test](https://developer.android.com/google/play/billing/test), [purchases.subscriptionsv2](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2),
[purchases.products](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products),
[getting_started](https://developers.google.com/android-publisher/getting_started), [quotas](https://developers.google.com/android-publisher/quotas),
[voided-purchases](https://developers.google.com/android-publisher/voided-purchases),
Play Console [answer/1153481](https://support.google.com/googleplay/android-developer/answer/1153481),
[answer/140504](https://support.google.com/googleplay/android-developer/answer/140504), [answer/12154973](https://support.google.com/googleplay/android-developer/answer/12154973),
[answer/16631229](https://support.google.com/googleplay/android-developer/answer/16631229), [answer/6062777](https://support.google.com/googleplay/android-developer/answer/6062777),
[Pub/Sub pricing](https://cloud.google.com/pubsub/pricing).

Supabase : [pricing](https://supabase.com/pricing), [functions/limits](https://supabase.com/docs/guides/functions/limits),
[functions/secrets](https://supabase.com/docs/guides/functions/secrets), [functions/examples](https://supabase.com/docs/guides/functions/examples).
