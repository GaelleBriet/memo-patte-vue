# MémoPatte : benchmark tarifaire, avis utilisateurs et opportunité B2B (marché francophone + anglophone)

## TL;DR

- **Ton hypothèse "paiement unique seul" est risquée. Passe à un modèle hybride** : gratuit généreux (1-2 animaux) + abonnement annuel bas (8-15 €/an) + option à vie (25-40 €), adossé à 2-3 différenciants nets (données jamais otages avec export libre, fiche d'urgence partageable sans compte, scan IA local de documents). Le marché francophone est saturé d'apps 100 % gratuites (ZOOVET, Mon Compagnon, Wizipet, Animoa, VetoVeto), donc un paiement unique isolé se vend mal et ne finance pas ta sync Supabase récurrente.
- **Le pain point n°1 du secteur est un cadeau pour toi** : quand une app bascule d'un modèle gratuit ou "à vie" vers l'abonnement, les utilisateurs perdent l'accès à leurs données et le crient dans les stores (cas 11pets, confirmé sur App Store ET Google Play). Fais de la portabilité des données ta promesse marketing centrale, c'est gratuit à tenir pour une dev honnête et impossible à copier pour les acteurs qui ont déjà trahi leurs users.
- **Un vide B2B réel existe** mais il est lourd pour une dev solo : les logiciels de refuge/association FR (Hunimalis, Pawer, Espace Refuge, Vetly, Pattoune) gèrent l'organisation, pas la **transmission fluide du dossier santé à l'adoptant** ni le **roulement en famille d'accueil**. Garde ça comme extension v2, pas comme cœur de v1.

---

## Key Findings (synthèse chiffrée)

1. **Tarifs grand public** : la fourchette réelle va de 0 € (majorité des entrants FR) à 39,99 $ à vie (Pawza) ou 2 à 7 $/mois. Le paiement unique existe encore (Pawza 39,99 $, Medika version payante ~6,49 €) mais devient minoritaire car il ne finance pas une infrastructure cloud récurrente.
2. **Benchmarks RevenueCat State of Subscription Apps 2026** (fondé sur 115 000+ apps, 16 Md$ de revenus, >1 milliard de transactions) : la catégorie **Health & Fitness mène le revenu par install à 0,48 $ à J14 et 0,66 $ à J60**, contre une médiane toutes catégories de 0,23 $ (J14) / 0,34 $ (J60). C'est la catégorie la plus rémunératrice, mais aussi une des plus concurrentielles.
3. **Format annuel dominant en santé** : Health & Fitness est la seule catégorie où l'annuel domine encore, captant **60,6 % du revenu**. Ailleurs, le weekly a pris le dessus. Pour un carnet de santé, l'annuel est le bon réflexe.
4. **Paywall dur vs freemium** : les hard paywalls convertissent médian **10,7 % des téléchargements en payeurs sous 35 jours contre 2,1 % pour le freemium (facteur ~5x)**, avec une rétention à un an quasi identique entre les deux modèles. MAIS le freemium reste pertinent quand les utilisateurs gratuits créent du bouche-à-oreille, ce qui est ton cas (projet portfolio, pas de budget acquisition).
5. **Pain point "données otages après changement de modèle"** : le plus documenté et le plus toxique du secteur, incarné par 11pets.
6. **B2B refuges** : marché déjà occupé côté gestion (Hunimalis à 30-90 € TTC/mois pour les assos), mais la santé transmissible reste un maillon faible.

---

## VOLET 1 : Benchmark tarifaire détaillé

### 1.1 Marché francophone grand public

|App|Éditeur|Plateformes|Modèle|Prix exacts|Verrou payant|Pub|Note / volume|Dernière MàJ connue|
|---|---|---|---|---|---|---|---|---|
|**11pets: Pet Care**|11 PETS LTD / m11pets (Chypre)|iOS, Android, Amazon, Huawei|Freemium (ex-lifetime supprimé)|Aucun prix officiel publié sur le site. Achats intégrés App Store : **1,99 $** et **17,99 $** (probable mensuel/annuel, non étiquetés). Un article tiers cite "69 € (~75 $)" mais sans périodicité, sûrement un ancien tarif à vie. Le gratuit = **1 animal** ; le Premium débloque multi-animaux + "unlimited pet seats"|multi-animaux, stockage cloud illimité, membres famille, support véto 24h|Oui (introduite à la refonte)|**~2,2/5 sur 5,5 k notes, ~570 k téléch.** (AppBrain) ; 3,6/5 sur Aptoide (500 k)|v6.003.020, 22 juillet 2026|
|**Medika**|Foxtastic SRL (Belgique)|iOS, Android|Freemium + option payante|Version standard gratuite ; version payante **6,49 €**|premium (fonctions avancées)|**Oui (pubs Temu, difficiles à fermer)**|4,1/5 (306 avis) et ~32 k install. Android ; 4,6/5 (58) iOS|v2.2.3 Android (14/03/2025), iOS 26.06.02|
|**ZOOVET**|Vetozone (FR, conçue par vétérinaire)|iOS, Android, web|**Gratuit total, sans restriction**|0 €|rien|Non|plateforme pro gratuite pour vétos/pros|active 2026|
|**Mon Compagnon**|Solly Azar (assureur FR)|iOS, Android|**Gratuit total** (produit d'appel assurance)|0 €|rien|Non|~30 000 téléch. (chiffre éditeur)|active 2025|
|**Animoo**|Pierre Heraud (FR, données hébergées en France)|iOS, Android|Freemium|Gratuit = 1 animal + quelques documents ; **Animoo Plus** = animaux illimités, partage famille, journal illimité, 100 docs/animal, dépenses, fiche d'urgence, export PDF (montant non public)|animaux illimités, export PDF, fiche pet-sitter|Non|entrant récent 2025-2026|active 2026|
|**Wizipet**|Wizipet (Dr J.-S. Pouvreau, FR)|iOS, Android|Gratuit, **Premium annoncé mais pas lancé**|0 € aujourd'hui ; premium à venir (6 mois offerts aux testeurs au lancement)|-|Non|"milliers" de pet parents (présentée à Animal Expo 2024)|active 2026|
|**Vetly**|Vetly (FR)|iOS "prochainement", web/asso|Gratuit|0 €, jusqu'à 3 animaux|-|Non|app grand public en lancement|app-id iOS 6741389813, 2026|
|**MonCarnetVeto**|FR|Web|Freemium 3 paliers|Découverte gratuit (1 animal) ; **Essentiel 2,49 €/mois** (3 animaux + Veto-IA) ; **Famille 4,99 €/mois** (illimité + IA illimitée)|nb animaux, IA|Non|-|active 2026|
|**Carnet de Santé Animale**|Jean-Guillaum Luydlin (FR)|iOS|Gratuit|0 € (fiches illimitées, sync iCloud)|-|Non|bien noté, avis positifs simplicité|active|
|**VetoVeto / Animoa / VetPocket / AnimoVeto / OOpet Fit**|divers FR|iOS/Android/web|Gratuit (VetPocket "sans pub, sans engagement")|0 €|-|Non|AnimoVeto : 23 236 carnets ouverts|actives 2025-2026|

### 1.2 Marché US / anglophone

|App|Éditeur|Plateformes|Modèle|Prix exacts|Verrou payant|Pub|
|---|---|---|---|---|---|---|
|**Pawza**|Lagerland Apps (indépendant)|iOS/iPadOS|Freemium + à vie|**2,99 $/mois, 19,99 $/an (essai 7 j), 39,99 $ à vie** (Family Sharing)|scan IA illimité, résumés IA, galerie illimitée, export PDF véto|**Non, aucun tracking**|
|**PawDose / PawsScript**|indépendants|iOS|Freemium|scan IA d'ordonnances sur l'appareil (Apple Intelligence), iCloud sync|reconnaissance IA|Non|
|**Pawformance**|-|Web|Freemium|**6,99 $/mois**|animaux illimités, IA, PDF|-|
|**PawTrack**|-|iOS|Abonnement|**1,99 $/mois** (2 plans Pro)|-|-|
|**PadsPass** (type Pawzport)|PadsPass|iOS, Android|Freemium|Pet ID gratuit (5 animaux) ; **Digital Pet Passport 39 $/an** ; concierge VIPP 649 $/voyage ou 2 400 $/an|planification voyage, conformité|Non|
|**Pet Passport US-JP**|indépendant|iOS|Freemium|**34,99 $/an** (essai 7 j)|export packet voyage, scans illimités|Non|
|**PetPort / PetPassport.co**|indépendants|iOS/Android|Freemium|base gratuite ("free forever" pour la fiche perdu), coffre docs payant|vault documents, sitter links|Non|
|**PetDesk**|PetDesk|iOS, Android|**Gratuit pour l'utilisateur** (financé par les cliniques vétérinaires, 7 M d'utilisateurs)|0 €|-|Non (garanti sans pub)|

**Lecture stratégique du Volet 1** : Le prix plancher du marché francophone est **zéro**. Une dizaine d'acteurs FR crédibles offrent un carnet gratuit complet. Cela détruit la valeur perçue d'un paiement unique "sec". Le seul modèle de paiement unique qui tient (Pawza, 39,99 $ à vie) fonctionne parce que son scan IA est **local** (aucun coût serveur récurrent) et qu'il vise le marché iOS anglophone premium, pas la France gratuite. Note aussi que 11pets, le concurrent "avancé" historique, **ne publie aucun tarif chiffré sur son site** et a supprimé son offre à vie : c'est un signal que même le leader galère à assumer sa tarification.

---

## VOLET 2 : Analyse des avis utilisateurs

### 2.1 Pain points confirmés (par ≥2 apps ou ≥2 sources indépendantes)

**A. Données otages / perte d'accès après mise à jour ou changement de modèle tarifaire — PAIN POINT N°1, MULTI-SOURCES**

C'est le grief le plus violent et le plus répété du secteur, cristallisé sur **11pets** après sa refonte vers l'abonnement :

- Avis App Store : après la nouvelle version, impossible de récupérer les données du compte ou les dossiers de l'animal ; un utilisateur "à vie" témoigne : _"I have a lifetime license and paid a lot for it, but I am disappointed with 11pets."_
- Avis Google Play : _"I paid a 'lifetime subscription' but only for a newer version… I don't recommend."_
- JustUseApp : _"they just launched an update to force you to have a subscription, and blocked me from accessing the data… I call that stealing."_
- Analyses agrégées (Kimola, sur App Store US et Google Play séparément) : _"Users are frustrated with the loss of access to their pet data, poor customer service, and functionality issues post-update… data being scrambled"_ et _"recent updates… caused data loss, login issues, and decreased functionality."_
- Chrome-Stats : _"Recent updates introduced bugs such as wrong pet record assignment and data corruption."_

Confirmé indépendamment sur les deux stores. C'est structurellement lié au passage gratuit/à vie -> abonnement.

**B. Multi-animaux verrouillé derrière le payant** : 11pets (le gratuit se limite à 1 animal, le multi-animaux force le Premium), schéma repris par Animoo (gratuit = 1 animal) et MonCarnetVeto (paliers par nombre d'animaux). Un avis 11pets résume l'agacement : _"still wonky and now you are charged for it, if you have more than one pet. I'll go back to my spreadsheet."_

**C. Pubs intrusives** : Medika, avis Android précis : les _"pubs Temu impossibles à fermer, il faut s'y reprendre à plusieurs reprises… Aucune info sur le prix de suppression de ces pubs"_. Grief également remonté sur 11pets post-refonte (_"intrusive ads and pop-ups"_).

**D. Fiabilité des notifications de rappel** : signalé sur **PetDesk** (avis Google Play : rappels qui ne se suppriment pas après le rendez-vous et se répètent, le support ne résout pas). Enjeu critique pour une app dont la promesse est justement le rappel de vaccins/vermifuges.

**E. Bugs après refonte** : 11pets (interface toujours "wonky", boucle de démarrage à la nouvelle version). Mon Compagnon mentionne dans ses notes de version des corrections de bugs "invalid data form" et dysfonctionnements de notifications, confirmant que même une app d'assureur bataille sur la fiabilité technique.

### 2.2 Demandes de fonctionnalités récurrentes

- Export et partage faciles du dossier (vétérinaire, pet-sitter, famille) : demande transversale, déjà servie par Pawza (PDF/CSV/JSON), Animoo (fiche d'urgence QR + export PDF), Medika (QR multi-appareils).
- Fiche pour pet-sitter / garde de vacances : Animoo, Mon Compagnon, Wizipet, Pawza en font un argument central. Besoin validé.
- Multi-appareils / multi-propriétaires (couple) : Medika (QR), Carnet de Santé Animale (sync iCloud).
- Version Android ET française : plusieurs apps anglophones (Pawza, PawDose, Pet Passport) sont iOS-only, ce qui laisse un espace Android francophone, précisément ta cible.

### 2.3 Pain points isolés (une seule source)

- "Impossible d'indiquer l'emplacement de la puce/tatouage" (un avis isolé sur Carnet de Santé Animale).
- "Impossible de trier/glisser-déposer les profils" (un avis isolé sur Medika).

Ces points sont mineurs mais faciles à traiter en v1 pour marquer une différence de finition.

---

## VOLET 3 : Segment associations, refuges, familles d'accueil, pensions, éleveurs

### 3.1 Outils existants FR/EU

|Outil|Cible|Modèle / Prix|Fonctions santé|Satisfaction|
|---|---|---|---|---|
|**Hunimalis**|Refuges, assos (avec ou sans refuge), fourrières, pensions, toiletteurs, éleveurs|SaaS. Association : **Standard 30 € TTC/mois, Complet 90 € TTC/mois**, annuel avec 2 mois offerts, sans engagement, essai 15 j. Tarif d'appel toutes activités "à partir de 15 €/mois". (CGU mentionnent des prix HT : nuance d'affichage HT/TTC à vérifier au devis.) Module enquête gratuit|Livrets de santé dématérialisés, fiches animaux, suivi sanitaire, vaccinations/stérilisations/traitements avec rappels auto, registres légaux R214-30|Avis Capterra/Appvizer positifs (intuitif, support réactif, "seul adapté aux assos sans refuge")|
|**Pawer**|Assos avec familles d'accueil|SaaS (abonnement par asso, période d'essai)|Fiches animaux, coordination FA, rendez-vous vétérinaires, adoptions|Positionnement récent, orienté douleurs FA|
|**Espace Refuge** (Son Espace Santé)|Refuges, assos|SaaS|Suivi pensionnaires, réseau FA, dépenses vétérinaires, QR code par animal pour soins/repas|-|
|**Vetly (logiciel asso)**|Refuges, FA, bénévoles, adoptants|**Gratuit**|Adoption, FA, animaux perdus, registre DDPP|En lancement 2026|
|**Pattoune Adoption**|Assos avec FA|Solution 3-en-1, démo sur rdv|Gestion animaux + FA + adoptants|-|
|**CarnetVet Pro**|Pensions, pet-sitters, éducateurs|**Dès 9,90 € HT/mois** (pack + site vitrine 24,90 €)|Journal de bord, suivi sanitaire, registres légaux PDF|-|
|**Animalo**|Pensions et entreprises animalières|Core + **plan équipe 149 €/mois**, essai 30 j|Suivi vaccinations + rappels (carnet de santé), portail client|-|
|**CarnetVet (grand public)**|Particuliers, éleveurs, assos|Essai 15 j sans CB, plans illimités en animaux|Dossier partagé avec véto via code 4 chiffres. **Envoie automatiquement un email à l'adoptant/acheteur avec un lien pour récupérer le dossier complet**|-|

### 3.2 Vide identifiable

Les logiciels ci-dessus gèrent bien **l'interne** (planning, comptabilité, registres légaux, coordination bénévoles/FA). Mais deux besoins restent mal servis :

1. **La transmission du dossier santé au moment de l'adoption** (du refuge/FA vers le particulier adoptant, dans SON app grand public). CarnetVet a déjà bricolé une passerelle par email : c'est la preuve que le besoin est réel et non encore standardisé.
2. **Le roulement d'animaux en famille d'accueil** : historique santé qui suit l'animal quand il change de FA puis part en adoption, sans re-saisie.

Les gros logiciels B2B sont chers (30-149 €/mois) et lourds pour une petite asso ou une FA individuelle. Il y a de la place pour une **passerelle légère "carnet FA/refuge -> carnet adoptant"** greffée sur une app grand public gratuite. C'est ton angle B2B2C le plus défendable, mais il exige un back-end multi-comptes robuste (donc du dev et du coût Supabase), incompatible avec une v1 solo minimale.

### 3.3 Comment ces structures gèrent aujourd'hui

Les retours de terrain (pages éditeurs, avis Capterra, article Solidarité-Peuple-Animal) décrivent un existant fait de **tableurs, emails et carnets papier** : _"Tableurs et e-mails qui s'accumulent : qui a la dernière version de la fiche de l'animal ?"_ (Pawer). L'écosystème français compte, selon Pattoune, _"près de 4 000 associations sans refuges, 750 refuges indépendants et 64 refuges affiliés à la SPA"_, soit un vivier important mais fragmenté et peu solvable individuellement.

---

## Recommandations (staged, avec seuils de décision)

### (a) Différenciants défendables pour une dev solo, sans budget marketing, projet portfolio

Choisis-en **2, 3 au maximum**, tous à faible coût récurrent :

1. **"Tes données ne seront jamais prises en otage" (différenciant n°1, quasi gratuit)** : export libre et permanent en PDF + CSV + JSON, même dans la version gratuite, et engagement écrit de ne jamais verrouiller les données existantes derrière un paywall rétroactif. C'est l'anti-11pets. C'est la promesse la plus recherchée du marché (Volet 2A) et la moins chère à tenir. Elle nourrit aussi ta narration portfolio ("éthique des données by design").
2. **Fiche d'urgence / pet-sitter partageable sans compte (QR ou lien révocable)** : besoin validé par Animoo, Mon Compagnon, Pawza. Techniquement simple (une page web statique signée), fort impact perçu, différencie des apps purement "carnet".
3. **Scan IA local de documents (optionnel, si tu veux un accroche moderne)** : suivre le modèle Pawza/PawDose (traitement sur l'appareil, pas d'appel serveur payant). Attention : en PWA/Android, l'équivalent d'Apple Intelligence n'existe pas nativement ; tu devras soit un OCR embarqué (Tesseract.js, gratuit mais limité), soit un appel API IA (coût variable). **Ne le mets en v1 que si tu maîtrises le coût.** Sinon, garde-le comme fonction premium v2.

Évite de te battre sur : le nombre d'espèces (tout le monde fait NAC), les rappels de vaccins (commodité), la communauté/réseau social (Wizipet, hors de portée solo).

### (b) Modèle de monétisation recommandé : HYBRIDE, pas paiement unique seul

Comparaison explicite des trois options :

|Option|Avantages|Inconvénients|Verdict|
|---|---|---|---|
|**Paiement unique seul** (ton hypothèse)|Simple, éthique, pas d'abonnement subi|Ne finance PAS la sync Supabase récurrente ; valeur perçue écrasée par les gratuits FR ; plafond de revenu bas ; pas de revenu récurrent pour maintenir|**À éviter seul**|
|**Hybride (gratuit + annuel + à vie)**|Freemium = bouche-à-oreille (vital sans budget acquisition) ; annuel = revenu récurrent qui couvre le cloud ; à vie = capte les allergiques à l'abonnement, comme toi|Un peu plus de dev (gestion des tiers)|**RECOMMANDÉ**|
|**Offre B2B structures**|Panier moyen élevé (30-149 €/mois observés), marché sous-servi sur la transmission santé|Cycle de vente long, support exigeant, back-end multi-comptes lourd, incompatible v1 solo|**v2 uniquement**|

**Fourchettes de prix chiffrées recommandées** (calées sur le marché FR et RevenueCat) :

- **Gratuit** : 1 à 2 animaux, rappels, documents limités (ex. 10), export PDF de base. Généreux pour nourrir le bouche-à-oreille.
- **Annuel "MémoPatte Plus"** : **9,99 à 14,99 €/an**. En dessous du seuil psychologique, cohérent avec MonCarnetVeto (2,49-4,99 €/mois soit ~30-60 €/an, que tu sous-cotes volontairement) et bien au-dessus des gratuits en valeur perçue. L'annuel est le bon format : en Health & Fitness il capte 60,6 % du revenu et retient bien mieux que le mensuel.
- **À vie "MémoPatte Pro"** : **29 à 39 €**, aligné sur Pawza (39,99 $). Réservé à ceux qui refusent l'abonnement. Attention : l'à-vie ne finance pas le cloud éternel, donc **limite-le explicitement** (ex. sync incluse tant que l'app existe, ou plafond de stockage) pour ne pas reproduire le piège 11pets.
- **Débloqué par le payant** : animaux illimités, partage famille, journal illimité, scan IA (si retenu), stockage documents étendu. **Jamais** : l'accès aux données déjà saisies (règle d'or anti-otage).

**Pourquoi pas un hard paywall** malgré son taux de conversion 5x supérieur (10,7 % vs 2,1 % à J35, RevenueCat 2026) : sans budget d'acquisition, tu dépends du bouche-à-oreille et du référencement store, donc tu as besoin d'une base gratuite large. Le freemium est ici le bon compromis, même s'il convertit moins.

### (c) Coûts récurrents à couvrir

- **Supabase** : le tier gratuit suffit au départ, mais dès que le stockage de documents (photos d'ordonnances, radios) grimpe, tu passeras sur un plan payant (le premier palier Supabase Pro est autour de 25 $/mois). **Ton annuel à 9,99-14,99 € doit être calibré pour qu'un petit nombre d'abonnés couvre ce coût** : à 12 €/an net (après commission store ~15-30 %), il te faut de l'ordre de 30 à 50 abonnés pour absorber un plan cloud de base. Objectif atteignable et bon jalon de décision.
- **Scan IA** : si tu passes par une API, chaque scan a un coût marginal. Réserve-le au tier payant et/ou plafonne (ex. le modèle "5 scans gratuits/mois" vu chez les scanners d'ordonnances).

### Seuils qui changeraient la reco

- Si le gratuit dépasse **~5 000 utilisateurs actifs** avec une conversion payante <1 %, ajoute un onboarding paywall doux (pas dur) pour remonter vers les 2,1 % médians du freemium.
- Si les coûts Supabase dépassent tes revenus annuels récurrents, **bascule le stockage lourd (documents) en fonction payante uniquement** plutôt que d'augmenter les prix.
- Si une asso partenaire te sollicite spontanément pour la transmission de dossiers, c'est le signal d'amorcer le B2B v2 (facturation ~15-30 €/mois par structure, sous les 30-90 € d'Hunimalis pour rester la solution légère).

---

## Caveats (faits vs interprétations)

- **Prix non publics ou approximatifs** : 11pets ne publie aucun tarif chiffré sur son site ; les seuls montants concrets actuels sont les achats intégrés App Store (1,99 $ et 17,99 $), dont la périodicité n'est pas étiquetée par Apple. Le "69 € / ~75 $" cité par Hepper n'a pas de périodicité et est probablement un ancien tarif à vie obsolète : à ne pas prendre comme référence mensuelle/annuelle. Les prix d'Animoo Plus et de Wizipet Premium ne sont pas encore publics.
- **Nuance HT/TTC Hunimalis** : la page association affiche 30 € et 90 € TTC/mois, alors que les CGU mentionnent des montants HT. Le tarif exact définitif est indiqué comme consultable dans l'interface après connexion. Chiffre à confirmer au devis.
- **Notes et volumes de téléchargement** sont des ordres de grandeur issus des stores et d'agrégateurs (AppBrain, Aptoide, apkgk), pas des chiffres d'audience certifiés. La note 11pets varie fortement selon la source (2,2/5 AppBrain vs 3,6/5 Aptoide), ce qui reflète surtout le choc de la refonte.
- **RevenueCat SOSA 2026** est un dataset massivement mobile et B2C (iOS/Android), pas du SaaS B2B pur : ses chiffres de revenu par payeur et de conversion s'appliquent bien à ton app grand public, moins à un éventuel module B2B refuges. À noter aussi : la santé monétise fort tôt (LTV mois 1 ~24,23 $ par payeur) mais retient mal (Adapty 2026 donne à Health & Fitness le plus faible taux de premier renouvellement, ~30,3 %), ce qui renforce l'intérêt de l'annuel et d'une option à vie plutôt que du mensuel.
- **Interprétation vs fait** : l'existence du "vide B2B sur la transmission santé à l'adoption" est une interprétation appuyée sur des indices convergents (passerelle email de CarnetVet, absence de la fonction chez les gros éditeurs), pas une donnée mesurée. À valider par des entretiens directs avec 3-4 associations avant tout investissement dev.

### Sources principales

11pets : play.google.com/store/apps/details?id=com.m11pets.elevenpets ; apps.apple.com/us/app/11pets-pet-care/id1232470530 ; 11pets.com/en/price ; justuseapp.com/en/app/1232470530 ; kimola.com (rapports App Store US et Google Play) ; chrome-stats.com/d/com.m11pets.elevenpets/reviews ; articles.hepper.com/must-have-apps-for-dog-owners. Medika : apps.apple.com/fr/app/medika-carnet-de-santé/id1553778157 ; apkgk.com/fr/be.foxtastic.medicalrecord ; chatsdumonde.com ; medika.pet/fr. Apps FR : zoovet.fr ; apps.apple.com/fr/app/mon-compagnon-soins-animaux/id1254050874 ; assurland.com/assurance/assureurs/mon-compagnon.html ; apps.apple.com/fr/app/animoo-carnet-santé-animal/id6756840538 ; animoo.app/en ; wizipet.com ; vetly.fr/blog/carnet-sante-numerique-chien-2026 ; moncarnetveto.fr ; apps.apple.com/fr/app/carnet-de-santé-animale/id6467492226 ; vetoveto.com ; animoa.fr ; vetpocket.fr ; animoveto.net ; oopetfit.io. Apps US : lagerland-apps.github.io/apps/pawza ; apps.apple.com/gb/app/pawza-pet-health-records/id6773507068 ; getpawdose.com ; alternativeto.net/software/pawformance ; apps.apple.com/ly/app/pawtrack/id6736639805 ; padspass.com/pricing ; apps.apple.com/us/app/pet-passport-us-jp-travel/id6762554040 ; petport.app ; petdesk.com ; play.google.com/store/apps/details?id=com.locai.petpartner. B2B : hunimalis.com/fr/pro/animal-rescue-organization ; hunimalis.com/fr/pro/cgu ; capterra.com/p/219989/Hunimalis ; pawer.fr/fr/pour-qui/associations ; sonespacesante.fr/refuge.html ; carnetvet.fr ; animalo.com/fr ; pattoune-adoption.fr ; vetly.fr/associations ; solidarite-peuple-animal.com/blog,lecture,192.html. Benchmarks : revenuecat.com/state-of-subscription-apps ; revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026 ; tasu.ai/library/app-category-revenue-per-install-benchmark ; airbridge.io/en/blog/subscription-app-pricing-by-category-2026-benchmark ; adapty.io/blog/health-fitness-app-subscription-benchmarks ; builtbyfoundry.io/blog/creator-app-benchmarks-numbers-to-hit-2026.