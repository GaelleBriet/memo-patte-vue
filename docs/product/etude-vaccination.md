---
tags:
  - perso
  - memo-patte
  - sante-animale
---

# Étude : la vaccination du chien et du chat en France

Étude documentaire préparée pour le ticket #283 (« choisir le vaccin dans une liste plutôt que le
saisir »), consultée et rédigée le **16 septembre 2026**.

> **Avertissement.** Ce document est une synthèse de sources vétérinaires publiées, pas un avis
> vétérinaire. Il n'autorise personne, et surtout pas MémoPatte, à décider d'un protocole vaccinal.
> Chaque affirmation renvoie à une source numérotée de la section [Sources](#sources). Là où les
> sources se contredisent — et elles se contredisent, sur les périodicités — le document le dit au
> lieu de trancher.

## À retenir en six points

1. On n'injecte pas une valence, on injecte un **produit** qui en couvre plusieurs, et chaque valence
   a sa propre périodicité (§1).
2. **La périodicité de rappel dépend du produit commercial, pas de la combinaison de valences** : le
   même « CHP » vaut 1 an chez Canigen, 2 ans chez Eurican, 3 ans chez Nobivac (§2.3). C'est le
   résultat central de l'étude.
3. Les recommandations d'experts (rappel triennal) et les RCP des produits (souvent annuel) disent
   des choses différentes, et les deux ont raison dans leur registre (§3.4 a).
4. La rage est un cas juridique, pas médical : la date qui compte est écrite dans le passeport, un
   rappel en retard d'un jour annule tout, et les RCP vont de l'annuel au triennal (§4).
5. Le sigle `L` veut dire leptospirose chez le chien et leucose chez le chat ; `R` veut dire rage chez
   le chien et rhinotrachéite chez le chat. Un référentiel doit être indexé par espèce (§2.1).
6. Conséquence pour l'app : le sélecteur de produits est un gain net ; la date de rappel calculée, elle,
   ne l'est pas — les faits confirment la décision du 2026-09-09 (§7 et question Q1).

---

## 1. Le vocabulaire

Ces six mots reviennent partout ; s'ils sont flous, le modèle de données le sera aussi.

| Terme                       | Ce que ça désigne                                                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Valence**                 | Une maladie couverte par un vaccin. « Carré », « parvovirose », « leptospirose », « rage » sont des valences. C'est l'unité de protection — et l'unité de périodicité.                |
| **Produit (spécialité)**    | Le flacon réellement injecté, avec un nom commercial et une AMM. Un produit couvre **une ou plusieurs** valences. C'est l'unité d'achat, d'injection et de traçabilité.               |
| **Primo-vaccination**       | La série d'injections qui **installe** l'immunité chez un animal naïf. Plusieurs injections espacées, dont le calendrier dépend de l'âge de départ.                                   |
| **Rappel**                  | Une injection qui **entretient** la mémoire immunitaire déjà installée. Une seule injection, à intervalle régulier.                                                                   |
| **Durée d'immunité (DOI)**  | La durée de protection. Il y en a **deux** : la DOI *réglementaire* écrite au RCP du produit (le minimum démontré par le fabricant au dossier d'AMM) et la DOI *réelle*, souvent plus longue, sur laquelle s'appuient les recommandations d'experts. |
| **RCP**                     | Résumé des Caractéristiques du Produit : le document légal joint au dossier d'AMM. Il « résume les informations techniques notamment la durée d'immunité (DOI) réglementaire » [S4] et se consulte sur la base publique de l'ANMV/ANSES [S7]. |

Deux notions méritent d'être détaillées, parce qu'elles gouvernent tout le reste.

**Ce qu'on injecte, c'est un produit — pas une valence.** Une seule injection d'un CHPPiL protège
contre cinq maladies à la fois. Le ticket #283 a raison de corriger la première version de sa
propre spec : lister « Carré », « Hépatite », « Parvovirose » comme des vaccins distincts ne décrit
aucune réalité clinique.

**Les valences d'un même produit n'ont pas la même périodicité.** C'est le cœur du problème. Le
même flacon CHPPiL contient des valences virales vivantes atténuées, dont l'immunité dépasse trois
ans, et une valence leptospirose bactérienne inactivée, dont l'immunité tient environ un an
[S4, S5, S6]. Résultat : un chien vacciné « CHPPiL » a bien un rendez-vous annuel, mais toutes ses
valences ne sont pas réinjectées à chaque fois — ou alors elles le sont par commodité, et les
recommandations appellent ça de la survaccination [S5].

**La fenêtre de sensibilité du jeune.** Les anticorps d'origine maternelle (AOM), transmis par le
colostrum, protègent le chiot ou le chaton mais neutralisent aussi le vaccin. Il existe donc une
période — généralement entre la 6ᵉ et la 16ᵉ semaine, exceptionnellement jusqu'à la 20ᵉ — où les AOM
sont trop élevés pour que le vaccin prenne, et trop bas pour protéger [S5]. D'où des séries de
plusieurs injections, et non une seule : on ne sait pas d'avance quand la fenêtre se ferme pour un
individu donné. C'est aussi pourquoi l'injection décisive est **celle qui a lieu à 16 semaines ou
plus** [S1].

---

## 2. Ce qui est réellement commercialisé en France

### 2.1 Les sigles, et le piège qu'ils cachent

Les vétérinaires français nomment les combinaisons par une suite de lettres, une par valence. Le
professeur Michel Pépin (VetAgro Sup) en donne la liste de référence pour la France [S6] :

**Chien** — jusqu'à six valences, notées `CHPPiLR` :

| Lettre           | Valence                                              | Agent          |
| ---------------- | ---------------------------------------------------- | -------------- |
| **C** (ou **D**) | Maladie de Carré (*distemper*)                       | CDV            |
| **H** (ou **A2**)| Hépatite de Rubarth (hépatite infectieuse canine)    | CAV-1 / CAV-2  |
| **P**            | Parvovirose                                          | CPV-2          |
| **Pi**           | Parainfluenza canin (toux de chenil, volet viral)    | CPiV           |
| **L**            | **Leptospirose** (2, 3 ou 4 sérogroupes → L2/L3/L4)  | *Leptospira*   |
| **R**            | **Rage**                                             | Rhabdovirus    |

**Chat** — jusqu'à cinq valences, notées `CRPChL` (ou `RCP` dans l'ordre d'usage courant) :

| Lettre  | Valence                                               | Agent          |
| ------- | ----------------------------------------------------- | -------------- |
| **R**   | **Rhinotrachéite** infectieuse féline (volet du coryza)| FHV-1          |
| **C**   | **Calicivirose** féline (volet du coryza)             | FCV            |
| **P** (ou **T**) | **Panleucopénie** féline / typhus            | FPV            |
| **Ch**  | Chlamydiose                                           | *C. felis*     |
| **L**   | **Leucose** féline                                    | FeLV           |
| **R** (rage) | Rage, quand elle est associée                    | Rhabdovirus    |

> ⚠️ **Le même sigle ne veut pas dire la même chose selon l'espèce.** Chez le chien, `L` = leptospirose
> et `R` = rage. Chez le chat, `L` = leucose et `R` = rhinotrachéite — la rage féline est
> presque toujours vendue en vaccin monovalent séparé [S6, S4]. Un dictionnaire de valences dans
> l'app doit donc être **indexé par espèce**, sinon « RCP » chez le chien et « RCP » chez le chat
> désignent deux choses différentes.

Deuxième piège : la nomenclature anglo-saxonne diverge. Le « DHPP » / « DA2PP » américain mélange les
deux conventions (`D` pour *distemper*, `A2` pour l'adénovirus 2), et la note technique AFVAC/GEMP
utilise d'ailleurs « DA2P **ou** CHP » comme synonymes [S4]. Un libellé à afficher ne peut donc pas
être la simple concaténation des lettres : il faut un nom lisible, et les lettres en sous-titre.

### 2.2 Les combinaisons courantes, par espèce

Ce que les documents professionnels français et la base ANMV/ANSES permettent d'affirmer :

**Chien**

| Combinaison usuelle | Valences                                            | Statut d'usage                                                      |
| ------------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| **CHP** (DA2P)      | Carré, Hépatite, Parvovirose                        | Le socle « essentiel ». Rarement vendu seul aujourd'hui.             |
| **CHPPi**           | + Parainfluenza                                     | Très courant : le Pi vient « gratuitement » avec le socle viral.     |
| **CHPPiL** (L2/L4)  | + Leptospirose                                      | **La combinaison la plus courante en France** — c'est le « vaccin annuel » vécu par les propriétaires. |
| **CHPPiLR**         | + Rage                                              | Existe, mais la rage est plus souvent injectée à part.               |
| **L seul (L2/L4)**  | Leptospirose                                        | Courant pour les années où les valences virales ne sont pas dues.    |
| **Rage seule**      | Rage                                                | Courant, et obligatoire d'être tracé à part (voir §4).               |
| **Pi + Bb**         | Parainfluenza + *Bordetella* (toux de chenil)       | Vaccin séparé, voie nasale ou orale. Ne se confond pas avec le Pi du CHPPi. |
| Leishmaniose        | *Leishmania infantum*                               | Monovalent, sur indication géographique.                             |
| Piroplasmose, Borréliose | *Babesia canis* / *Borrelia*                   | Monovalents, rares, sur indication.                                  |

**Chat**

| Combinaison usuelle | Valences                                     | Statut d'usage                                                |
| ------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| **RCP** (TC + P)    | Rhinotrachéite, Calicivirose, Panleucopénie  | **Le socle, de très loin le plus courant.**                    |
| **RCP-L** (RCP-FeLV)| + Leucose                                    | Courant chez les chats ayant accès à l'extérieur.              |
| **RCP-Ch**          | + Chlamydiose                                | Rare, réservé aux collectivités félines à problème confirmé [S4]. |
| **RCPChL**          | Les cinq                                     | Existe (jusqu'à 5 valences [S6]), peu fréquent.                |
| **FeLV seul**       | Leucose                                      | Courant, notamment quand le RCP n'est pas dû la même année.    |
| **Rage seule**      | Rage                                         | Chez le chat, **tous les vaccins rage sont monovalents** [S4].  |

### 2.3 Les produits eux-mêmes, et la découverte qui change tout

Les RCP ont été relus produit par produit sur la base publique de l'ANMV/ANSES [S7] et, pour les AMM
centralisées européennes, sur le Registre communautaire de la Commission, qui publie l'annexe I (le
RCP complet) en français [S22]. Extrait des périodicités de rappel, **telles qu'elles sont écrites
dans les RCP** :

**Chien**

| Produit                       | Valences                        | Rappel selon le RCP                                              |
| ----------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| NOBIVAC CHP                   | CDV, CAV-2, CPV                 | **tous les 3 ans** (DOI 3 ans démontrée par épreuve virulente)     |
| EURICAN DAP                   | CDV, CAV-2, CPV                 | 1 dose à 12 mois, puis **tous les 2 ans**                          |
| CANIGEN DHPPI                 | CDV, CAV-2, CPV, CPi            | **annuel**                                                          |
| NOBIVAC CHPPI                 | CDV, CAV-2, CPV, CPi            | **CDV/CAV/CPV : 3 ans — CPi : 6 mois**                             |
| Versican Plus DHPPi/L4        | CDV, CAV-2, CPV, CPi, L4        | **CDV/CAV/CPV : 3 ans — CPi et leptospires : annuel**              |
| Versican Plus DHPPi/L4R       | + rage                          | **CDV/CAV/CPV et rage : 3 ans — CPi et L4 : annuel**               |
| EURICAN DAPPI-L               | CDV, CAV-2, CPV, CPi, L2        | 1 dose à 12 mois puis **annuel**                                    |
| Nobivac L4, Canigen L4, Eurican L4 | leptospires seuls (L4)     | **annuel**                                                          |
| CANIGEN CHPPi/LR              | les six valences                | **annuel, toutes valences**                                         |

**Chat**

| Produit                | Valences                     | Rappel selon le RCP                                                          |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| Purevax RCP            | FHV, FCV, FPV                | 1ᵉʳ rappel à **1 an**, puis **intervalles de 3 ans maximum**                   |
| Purevax RCPCh          | + Chlamydia                  | RCP ≤ 3 ans — **chlamydiose : annuel**                                        |
| Purevax RCP FeLV       | + FeLV                       | RCP ≤ 3 ans — **FeLV : annuel**                                               |
| NOBIVAC TRICAT TRIO    | FCV, FHV, FPV                | **FCV + FHV : annuel — FPV : tous les 3 ans**                                 |
| VERSIFEL CVR           | FPV, FHV, FCV                | **annuel**                                                                     |
| FELIGEN CRP            | FCV, FHV, FPV                | **annuel**                                                                     |
| FELIGEN CRP/R          | + rage                        | **CRP : annuel — rage : tous les 3 ans maximum**                              |
| Leucofeligen FeLV/RCP  | FCV, FHV, FPV, FeLV          | **FeLV : tous les 3 ans après le 1ᵉʳ rappel — RCP : annuel**                  |
| VERSIFEL FELV          | FeLV seul                    | 1 rappel à 1 an, **puis tous les 3 ans**                                      |
| Purevax FeLV           | FeLV seul                    | **annuel**                                                                     |
| Nobivac LeuFel         | FeLV seul                    | 1 rappel à 1 an, **puis tous les 3 ans**                                      |
| Nobivac NXT HCP        | FHV, FCV, FPV                | FHV + FCV : 1 an puis ≤ 3 ans — **FPV : ≤ 3 ans dès la primo-vaccination**    |

**Ce que ces tableaux démontrent, et c'est le résultat le plus important de l'étude : la périodicité
de rappel n'est pas déductible de la combinaison de valences. Elle dépend du produit.**

Trois preuves suffisent :

1. **Même trio CHP, trois réponses** : NOBIVAC CHP dit 3 ans, EURICAN DAP dit 2 ans après le premier
   rappel annuel, CANIGEN DHPPI dit annuel [S7, S22].
2. **Même valence FeLV, deux réponses opposées** : Purevax FeLV dit annuel, Nobivac LeuFel et
   VERSIFEL FELV disent 3 ans après le premier rappel [S7, S22].
3. **Même produit, plusieurs échéances** : Versican Plus DHPPi/L4 porte 3 ans pour les valences
   virales et 1 an pour le parainfluenza et les leptospires, avec un produit intercalaire (Versican
   Plus Pi/L4) prévu exprès pour le rappel annuel [S22].

À quoi s'ajoute une régularité utile chez le chat : la formule des RCP est presque toujours « 1 an
après la primo-vaccination **et** 3 ans après le dernier rappel ». Le triennal ne démarre donc jamais
directement après la primo-vaccination — sauf deux produits récents (Nobivac NXT HCP et HCPCh) qui
donnent 3 ans dès la primo pour la panleucopénie [S22].

**Une limite à garder en tête** : une AMM ne prouve pas qu'un produit est effectivement distribué en
France, et tous les RCP portent la mention « Toutes les présentations peuvent ne pas être
commercialisées » [S7, S22]. Par ailleurs, la base ANMV n'affiche qu'un RCP **vide** pour les AMM
centralisées (`EU/2/…`) : c'est le Registre communautaire qui porte le texte [S22].

---

## 3. Les périodicités, valence par valence

### 3.1 Primo-vaccination

Les trois sources majeures (WSAVA 2024, note AFVAC/GEMP 2020, *La Dépêche Technique* 2019) sont
**d'accord sur la primo-vaccination**. Le désaccord commence aux rappels.

| Étape                          | Chien (CHP)                                       | Chat (RCP)                                                         |
| ------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------ |
| Première injection             | 6 à 8 semaines [S1, S4, S5]                       | 6 à 8 semaines [S1, S4, S5] — 8-9 semaines selon l'ABCD [S3]       |
| Injections suivantes           | Toutes les 2 à 4 semaines [S1] (3 à 5 semaines selon l'AFVAC [S4]) | Idem                                        |
| **Dernière injection de la série** | **À 16 semaines ou plus** — la plus importante [S1] | **À 16 semaines ou plus** [S1, S3]                            |
| Injection de consolidation     | À **26 semaines** (≈ 6 mois) de préférence, plutôt que d'attendre 12-16 mois [S1, S4] | Idem [S1, S3, S4]                    |
| Animal de plus de 16 semaines, naïf | **Une seule injection suffit** pour CHP [S1, S4] | Une injection suffit pour P, mais **deux injections à 3-5 semaines d'écart sont nécessaires pour R et C** [S4, S5] |

Le détail qui compte pour l'app : **le nombre d'injections de primo-vaccination n'est pas fixe.** Il
dépend de l'âge au démarrage. Six semaines → quatre injections ; douze semaines → deux [S5]. Aucune
formule ne s'applique sans connaître l'âge de la première injection.

Pour la leptospirose (chien) et la leucose (chat), le schéma est différent et **plus strict** : deux
injections espacées de 3 à 5 semaines, la seconde après 12 semaines d'âge, puis une **troisième
injection un an après**, entre 12 et 13 mois. Si le délai de 13 mois est dépassé, la primo-vaccination
est à recommencer entièrement [S4].

### 3.2 Rappels — chien

Règle générale qui explique tout le tableau : « la DOI apportée par la plupart des vaccins non
essentiels est d'environ un an », alors que celle des vaccins essentiels à virus vivant atténué se
compte « en plusieurs années » [S1].

| Valence                    | Recommandations d'experts                                                    | Ce que disent les RCP français (§2.3)      |
| -------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| **Carré, Hépatite, Parvovirose (CHP)** | Rappel à 3 ans, puis **pas plus souvent que tous les 3 ans** [S1, S4, S5]. « L'immunité conférée s'étend au-delà de trois ans. Aucun bénéfice n'est tiré d'une vaccination plus fréquente » [S5] | **1, 2 ou 3 ans selon le produit** — annuel (Canigen), 2 ans (Eurican DAP), 3 ans (Nobivac CHP, Versican Plus) [S7, S22] |
| **Parainfluenza (Pi)**     | **Annuel** — « la durée d'immunité en chien de compagnie est incertaine » [S1] | Annuel — **6 mois** pour NOBIVAC CHPPI [S7]  |
| **Leptospirose (L)**       | **Annuel**, sans exception : « la durée d'immunité est d'un an » [S1, S4, S5]. Tolérance de retard estimée à 3 mois par les experts français ; au-delà de 15 mois, primo-vaccination à refaire [S4] | Annuel, sans exception trouvée [S7, S22] |
| **Rage (R)**               | Selon le RCP du produit : **1 an ou 3 ans** [S1, S4]. Voir §4 : ici c'est le droit, pas la science, qui commande | **1 an, 2 ans ou 3 ans selon le produit** [S7] |
| **Toux de chenil (Bb ± Pi)** | **Annuel** si le risque d'exposition perdure [S1, S5]                       | Annuel                                        |
| **Leishmaniose**           | **Annuel** après induction (1 ou 3 injections selon le produit) [S4, S9]      | Annuel                                        |
| **Piroplasmose, Borréliose** | **Annuel**, après induction en 2 injections + 1 an [S1, S4]                 | Annuel                                        |

### 3.3 Rappels — chat

| Valence                        | Recommandations d'experts                                                                 | Ce que disent les RCP (§2.3)                    |
| ------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| **Panleucopénie (P/T)**        | Rappel à 3 ans puis **tous les 3 ans ou moins souvent** [S1, S3, S5]                        | Annuel (Versifel, Feligen) ou 3 ans (Tricat Trio, Purevax, NXT) [S7, S22] |
| **Rhinotrachéite + Calicivirose (RC)** | **1 à 3 ans selon le risque.** Tous les 3 ans pour un chat d'intérieur à faible risque, annuel pour un chat sortant, en chatterie ou en collectivité [S1, S3, S4, S5] | Annuel, ou 1 an puis ≤ 3 ans (Purevax, NXT) [S22] |
| **Leucose (FeLV)**             | **Contradiction entre sources**, voir §3.4                                                  | **Annuel (Purevax) ou 3 ans après le 1ᵉʳ rappel (LeuFel, Versifel, Leucofeligen)** [S7, S22] |
| **Chlamydiose (Ch)**           | **Annuel**, pour les chats à exposition prolongée seulement [S1, S3, S4]                    | Annuel [S22]                                      |
| **Rage**                       | Selon le RCP : 1, 2 ou 3 ans [S4]. Voir §4                                                  | 1 an puis ≤ 3 ans [S7, S22]                       |

### 3.4 Là où les sources se contredisent

Ce sont les points sur lesquels l'app **ne doit pas trancher toute seule**.

**a) Recommandations d'experts contre RCP des produits.** C'est la contradiction structurante, et
la WSAVA la nomme explicitement : « Les recommandations peuvent donc préconiser une revaccination
triennale ou moins fréquente avec des vaccins essentiels qui portent encore, dans certains pays, une
allégation de DOI d'un an » [S1]. La note AFVAC/GEMP dit le miroir : le vétérinaire « doit suivre
dans la mesure du possible les recommandations écrites dans le RCP », et s'en écarter engage sa
responsabilité [S4]. Autrement dit : le RCP dit souvent « annuel », la science dit « triennal », et
c'est le vétérinaire qui arbitre au cas par cas — pas une app.

**b) Le rappel de leucose (FeLV) chez le chat adulte.** Trois réponses différentes :

- **WSAVA 2024** : rappel un an après la primo-vaccination, puis **annuel** pour les chats à risque
  d'exposition continu ; « selon la notice (par ex. tous les 2 ou 3 ans) » pour les chats à faible
  risque. Et la WSAVA ajoute que « des recherches supplémentaires sont nécessaires pour déterminer à
  quelle fréquence » [S1].
- **ABCD (fiche de 2020)** : rappel un an après, puis **tous les 2-3 ans après l'âge de 3 ans**, en
  raison de la résistance à l'infection qui vient avec l'âge [S3].
- **Note AFVAC/GEMP 2020** : rappel « **tous les 2 à 3 ans** » après la troisième injection [S4].
- **L'AAFP**, citée par *La Dépêche Technique*, préconise un rappel **annuel** pour les animaux à
  haut risque et **bisannuel** pour les autres [S5].

**c) Le rappel RC (coryza) chez le chat.** Même dispersion : de 1 à 3 ans selon l'estimation du
risque, sans définition consensuelle de ce qu'est un « chat à risque » [S1, S3, S4, S5].

**d) L2 contre L4 chez le chien.** Le consensus européen de 2015 recommande le tétravalent
systématique ; les retours de pharmacovigilance français ont fait hésiter, et 83 % des vétérinaires
français interrogés en 2020 utilisaient néanmoins un L4 [S5, S8, S10]. Aucune conséquence sur la
périodicité (annuelle dans les deux cas), mais c'est une raison de plus pour que l'app ne prétende
pas savoir quel produit a été injecté.

**e) Le « premier rappel » à 6 mois ou à 1 an.** La WSAVA recommande depuis 2016 une injection à 26
semaines plutôt qu'à 12-16 mois [S1] ; la pratique française majoritaire reste le rappel « à un an ».
*La Dépêche Technique* formule le compromis : « entre six mois (de préférence) et un an d'âge » [S5].

---

## 4. La rage : le cas à part

La rage est la seule valence dont l'échéance n'est pas une recommandation mais une **règle de droit**.
C'est aussi la seule où une erreur de date a un coût immédiat et non médical.

### 4.1 Une durée d'immunité qui dépend du produit

Les RCP des vaccins antirabiques disponibles en France ne disent pas la même chose — ni sur l'âge de
début, ni sur la périodicité, ni même d'une espèce à l'autre pour un seul et même produit [S7] :

| Produit          | Âge minimal de la primo-vaccination | Rappel selon le RCP                                                  |
| ---------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| RABISIN          | 12 semaines                          | 1 an, puis **tous les 3 ans maximum**                                  |
| RABISIN MULTI    | 12 semaines                          | 1 an, puis **intervalles de 3 ans maximum**                            |
| RABIGEN MONO / MULTI | **3 mois**                       | 1 an, puis **tous les 3 ans**                                          |
| NOBIVAC RAGE     | 12 semaines                          | **annuel**                                                              |
| VERSIGUARD RABIES| 12 semaines                          | **chien : tous les 3 ans dès la primo — chat : 1 an puis tous les 2 ans** |
| Purevax Rabies (chat) | 12 semaines                     | 1 an, puis **intervalles de 3 ans maximum**                            |
| FELIGEN CRP/R (chat) | 8-9 semaines (schéma CRP/R)      | rage : 1 an puis ≤ 3 ans — **valences CRP : annuel**                   |

La note AFVAC/GEMP disait déjà la même chose en 2020, produit par produit et sans les nommer : l'âge
de départ, la durée d'immunité (1, 2 ou 3 ans) et même le délai de validité après primo-vaccination
(21 ou 28 jours révolus) varient d'une spécialité à l'autre [S4].

La WSAVA le dit plus brièvement : « Des vaccins rage canins avec une DOI d'un an ou de trois ans sont
disponibles. Le moment des rappels est déterminé par la DOI homologuée, mais dans certaines zones il
peut être dicté par la loi » [S1].

**Conséquence directe pour l'app : sans le nom exact du produit injecté, aucune date de rappel
antirabique n'est calculable.** Ni 1 an, ni 3 ans : les deux existent sur le marché français, et
VERSIGUARD RABIES répond même différemment selon que l'animal est un chien ou un chat.

Et la note AFVAC/GEMP ajoute l'avertissement qui doit gouverner tout traitement de la rage dans une
app de rappels [S4] :

> « Le respect des dates est primordial – au jour près – pour pouvoir notamment se rendre à
> l'étranger, faire l'objet de dérogations lors de gestion d'un foyer de rage, ou lorsque le
> propriétaire est détenteur d'un animal catégorisé. Aucune tolérance n'est applicable sur ces dates.
> Seules les données propres à chaque vaccin et figurant dans le RCP de l'AMM doivent être prises en
> compte. »

Changer de produit au moment du rappel peut d'ailleurs, à lui seul, imposer de repartir en
primo-vaccination [S4].

### 4.2 Quand la vaccination antirabique est-elle obligatoire en France ?

**En France métropolitaine, il n'y a aucune obligation générale de vacciner contre la rage.** La
France est officiellement reconnue indemne depuis 2001 [S11, S16], et la note d'information de la
DGAL du 24 septembre 2007 annonçait déjà le cadrage actuel : « À terme, seuls les animaux voyageant
en dehors du territoire français et les chiens de 1ʳᵉ et 2ᵉ catégorie auront l'obligation d'être
valablement vaccinés » [S14].

Quatre cas, et quatre seulement :

| Cas                                     | Fondement                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Voyage / mouvement vers un autre pays** | Règlement (UE) n° 576/2013, article 6 : identification + vaccination antirabique valide + passeport européen [S12] |
| **Chien de 1ʳᵉ ou 2ᵉ catégorie**        | Article L211-14 du code rural : le permis de détention exige « la vaccination antirabique du chien en cours de validité », de façon continue [S13] |
| **Guyane**                              | Arrêté du 5 septembre 2008, toujours en vigueur : obligation de vacciner les carnivores domestiques, rage desmodine enzootique [S15, S16] |
| **Département déclaré infecté**         | Articles R223-25 à R223-37 du code rural : régime dormant, activé par arrêté ministériel [S13]              |

**Ce qui n'est plus obligatoire depuis 2007 : les campings, pensions, expositions et rassemblements.**
L'arrêté du 22 janvier 1985 qui l'imposait a été abrogé par l'arrêté du 4 mai 2007 [S14]. Et
**depuis le 23 janvier 2008, aller en Corse ou dans un DOM autre que la Guyane avec un chien ou un
chat depuis la métropole n'exige plus de vaccination antirabique** : l'arrêté du 29 novembre 1991 qui
le prévoyait a été abrogé par l'arrêté du 14 janvier 2008 [S14, S15]. Ce qui subsiste est
**contractuel** : un transporteur, un camping ou une pension peut l'exiger par son règlement intérieur
— c'est une pratique, pas une règle de droit.

### 4.3 Les trois règles qui n'existent que pour la rage

**1. L'identification doit précéder la vaccination.** Le règlement européen l'exige (annexe III,
point 2 d : la date du vaccin « n'est pas antérieure à la date d'implantation du transpondeur ») [S12],
et service-public.gouv.fr le résume : « La vaccination doit être réalisée après l'identification pour
être reconnue valable » [S17]. La DGAL est plus brutale : « une vaccination sans identification
préalable de l'animal n'a jamais eu de valeur réglementaire » [S14]. Une vaccination faite avant la
puce est **réglementairement nulle**.

**2. C'est le passeport qui fait foi, pas le carnet de santé.** Depuis le 1ᵉʳ janvier 2009, la
primo-vaccination et les rappels antirabiques sont attestés dans la rubrique « vaccination
antirabique » du **passeport européen pour animal de compagnie**, par un vétérinaire sanitaire, qui y
porte lui-même **la date de fin de validité** (article 6 de l'arrêté du 10 octobre 2008) [S18]. Le
carnet de santé n'a, pour la rage, aucune valeur réglementaire.

**3. Un rappel en retard d'un jour n'est plus un rappel.** Le règlement européen : « une revaccination
doit être considérée comme une vaccination primaire si elle n'a pas été administrée au cours de la
période de validité » [S12]. Et la primo-vaccination n'est valide qu'après **21 jours révolus**,
tandis que la certification d'un rappel fait dans les temps « prend effet le jour de son
établissement » [S18].

### 4.4 Contradiction entre sources officielles : « rappel annuel » ou pas ?

C'est la contradiction la plus nette de toute l'étude, et elle oppose des sources **toutes officielles**.

| Source                                                                | Ce qu'elle dit                                                                   | Date                    |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------- |
| **Arrêté du 10 octobre 2008, art. 3** (version en vigueur)            | Durée = celle du protocole d'emploi et de l'AMM, **aucun plafond**                 | en vigueur depuis le 28/06/2018 [S18, S19] |
| **service-public.gouv.fr**                                            | « Il doit faire l'objet d'un **rappel annuel** »                                    | fiche vérifiée le 28/04/2026 [S17] |
| **agriculture.gouv.fr**                                               | « Limitation de la durée de validité de la primo-vaccination antirabique […] à 1 an » | mise à jour le 28/06/2024 [S16] |
| **Ordre national des vétérinaires**                                   | « tous les ans\* […] \* **ou tous les 3 ans, selon le vaccin**. Parlez-en avec votre vétérinaire » | publiée le 27/08/2018 [S20] |

Ce qui s'est passé : la phrase « ce protocole ne peut en aucun cas, et quel que soit le vaccin, porter
à plus d'un an la durée de la validité de la primo-vaccination » a été **supprimée de l'article 3 par
l'arrêté du 19 juin 2018** [S19]. Le droit positif est donc celui de l'AMM du produit — 1, 2 ou 3 ans.
Les deux pages de vulgarisation semblent en retard sur le texte consolidé, mais aucune note officielle
n'explicite ce changement : la lecture ci-dessus est une inférence à partir de Légifrance, pas une
source qui l'affirme.

**Conclusion pour l'app : ne jamais coder « rage = +1 an ».** La seule date juste est celle que le
vétérinaire a écrite dans le passeport.

---

## 5. Ce que fait un logiciel de refuge existant : Globinours

Globinours est une application web libre (PHP + SQLite, AGPL-3.0-or-later) de gestion de refuges et
d'associations de protection animale, écrite par un refuge [S21]. Elle a un modèle de vaccination en
production — ce qui vaut mieux que nos spéculations, à condition de se rappeler que **son contexte est
un refuge multi-espèces, pas un particulier avec un chien ou un chat**, et que ses choix disent ce
qu'ils ont retenu, pas ce qui est recommandé.

### 5.1 Leur modèle de données

```sql
-- migrations/001_init.sql
CREATE TABLE ref_vaccines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,        -- ex: TCL / Rage
  notes TEXT
);
CREATE TABLE vaccinations (
  id, animal_id, vaccine_id,        -- FK ref_vaccines, ON DELETE RESTRICT
  done_date TEXT NOT NULL,
  due_date  TEXT,                   -- rappel
  lot TEXT, notes TEXT, created_by
);
-- 002_vaccines_code.sql : ALTER TABLE ref_vaccines ADD COLUMN family TEXT;
-- 048_vaccination_traceability.sql : + manufacturer, batch_expires_on,
--   administered_by_user_id, administered_by_name
-- 004 / 015 : + clinic_id, vet_name
```

Ce qu'on y lit :

- **Le catalogue de vaccins est une table libre, alimentée par l'utilisateur** (`name` unique, `notes`).
  Aucune liaison à l'espèce, aucune périodicité stockée, aucune notion de valence.
- **La notion de « famille » est arrivée après coup**, par une migration qui devine la famille à partir
  du libellé déjà saisi : `family='TC'` si le nom contient TC, TCL, CORYZA ou TYPHUS ; `family='L'`
  si le nom contient LEUCO, FELV ou vaut exactement `L` [S21]. Le commentaire du fichier est honnête :
  « Mapping simple (à ajuster si tu as d'autres libellés) ». **C'est très exactement la dette que le
  ticket #283 veut éviter** : un champ libre auquel on tente ensuite de donner un sens.
- **La traçabilité est riche** : lot, fabricant, date de péremption du lot, clinique, nom du
  vétérinaire, intervenant qui a injecté. Un refuge en a besoin ; un particulier beaucoup moins.
- **La prochaine échéance de l'animal est le minimum des échéances futures** — `next_vaccine_due` dans
  la vue `v_animals_med_summary` est un `MIN(due_date)` sur les vaccinations à venir. Même principe
  que « la valence qui revient le plus tôt », appliqué au niveau de l'animal.
- **Le tableau de bord range les échéances en trois paniers** : en retard, sous 7 jours, sous 30 jours.

### 5.2 Leur calcul de date de rappel

Globinours **propose** bien une date, et son code dit explicitement la règle de préséance :

> « Si `due_date` est fourni, on respecte. Sinon auto selon protocole. »
> — `app/Controllers/AnimalMedicalActions.php`, `addVaccine()` [S21]

Le protocole tient en quatre lignes :

| Famille du vaccin        | Condition                                          | Échéance proposée |
| ------------------------ | -------------------------------------------------- | ------------------ |
| `L` (leucose)            | aucune vaccination `L` antérieure → primo-vaccination | **+ 1 mois**      |
| `L`                      | sinon                                              | **+ 1 an**         |
| `TC` (ou famille inconnue) | animal de moins d'un an                          | **+ 1 mois**       |
| `TC`                     | sinon                                              | **+ 1 an**         |

Ils se posent donc bien la question de la phase (primo-vaccination contre rappel), et ils la
résolvent avec les deux seules données qu'ils ont : la date de naissance et l'historique des
injections de la même famille.

### 5.3 Ce qu'on peut en reprendre, et ce qu'on ne peut pas

**À reprendre :**

- **La règle de préséance** : une date saisie par l'utilisateur n'est jamais écrasée par un calcul.
- **Le catalogue livré pré-rempli** : leurs vermifuges ont une table `ref_dewormers` seedée avec des
  noms commerciaux et une phrase de couverture, et leur documentation l'assume — « Les vermifuges
  disposent volontairement d'un catalogue séparé : ne les créez pas comme traitements ordinaires »
  [S21]. Un référentiel de santé gagne à être livré, pas laissé à l'utilisateur.
- **Le ton de leur formule de prudence** : « Le calendrier proposé sert de repère […] L'équipe
  vétérinaire reste prioritaire sur toute suggestion automatique » [S21].

**À ne pas reprendre :**

- **Le catalogue libre pour les vaccins.** Leur `ref_vaccines` est la solution que #283 abandonne, et
  leur migration `002` montre le prix à payer ensuite.
- **`+1 an` pour tout adulte.** Défendable dans un refuge (population à haut risque, historique
  inconnu, protocoles renforcés en collectivité [S1]), mais contraire au « pas plus souvent que tous
  les 3 ans » applicable à un animal de particulier [S1, S4, S5] — et de toute façon indécidable
  sans le nom du produit (§2.3).
- **La granularité « famille » à deux valeurs** (TC, L), qui ne couvre que le chat et ignore la rage,
  la chlamydiose et tout le versant chien. MémoPatte a besoin du couple espèce + valences.
- **La traçabilité lot / fabricant / intervenant**, hors scope v1 et hors besoin d'un particulier.

---

---

---

## 6. Mode de vie : ce qui est « essentiel » et ce qui ne l'est pas

Le classement n'est pas absolu : il dépend du lieu et du mode de vie. La formulation française la plus
nette est celle de *La Dépêche Technique* : les valences non essentielles « sont classées ainsi car
elles ne nécessitent pas d'être administrées à tous les animaux dans toutes les régions du monde,
mais pour un animal donné, une valence dite non essentielle pourra se révéler indispensable » [S5].

### 6.1 Chat : intérieur strict contre accès extérieur

L'ABCD publie deux calendriers distincts [S3], que voici résumés.

| Valence      | Chat d'intérieur strict                                  | Chat ayant accès à l'extérieur                            |
| ------------ | -------------------------------------------------------- | ---------------------------------------------------------- |
| **FPV** (panleucopénie) | **Essentiel** — rappel tous les 3 ans ou plus     | **Essentiel** — rappel tous les 3 ans ou plus              |
| **FHV, FCV** (coryza)   | **Essentiel** — jusqu'à tous les 3 ans en situation à faible risque | **Essentiel** — annuel, ou jusqu'à tous les 3 ans si faible risque |
| **FeLV** (leucose)      | **Non essentiel** — seulement en cas de contact avec un chat FeLV+ ou de statut inconnu | **Essentiel en zone endémique** — rappel tous les 2-3 ans après 3 ans |
| **Rage**                | Non essentiel — « seulement si la loi l'exige »   | Non essentiel hors zone endémique — « vacciner en zone endémique ou si la loi l'exige » |
| **Chlamydiose**         | Non essentiel                                     | Non essentiel                                              |
| ***Bordetella***        | Non essentiel — collectivités à forte densité seulement | Idem                                                  |

La WSAVA va un cran plus loin sur la leucose : le vaccin FeLV est **essentiel pour tout chat de moins
d'un an** en zone où le FeLV circule, quel que soit son mode de vie, et pour les adultes ayant un accès
extérieur non surveillé ou vivant avec des chats qui sortent [S1]. Autrement dit : « chat d'intérieur »
ne dispense pas de la leucose la première année.

Deux conditions non négociables qui ne se déduisent d'aucune date : **seuls les chats testés négatifs
au FeLV doivent être vaccinés** [S1, S3, S5], et **changer de laboratoire impose de recommencer la
primo-vaccination**, les vaccins FeLV ne visant pas tous les mêmes antigènes [S4, S5].

### 6.2 Chien : chenil, chasse, zones à tiques et à moustiques

| Situation                         | Ce qui devient recommandé                                                     |
| --------------------------------- | ------------------------------------------------------------------------------- |
| Vie ordinaire en France           | CHP essentiel ; **leptospirose classée non essentielle au niveau mondial mais « indispensable en France »** [S5] — « aucun chien ou presque n'a un mode de vie le protégeant complètement de l'exposition » [S8] |
| Pension, chenil, concours, élevage, garderie | Toux de chenil (*Bordetella* ± Pi), rappel annuel. Voie nasale ou orale préférée à l'injectable [S5] |
| Chasse, randonnée, zones humides  | Leptospirose L4 plutôt que L2 ; rappel de préférence **au début du printemps**, quand la pression d'infection est la plus forte [S5] |
| Zones à tiques                    | Borréliose et piroplasmose possibles, mais « la prévention repose d'abord sur un contrôle rigoureux des ectoparasites » [S1, S4] ; rappel annuel, de préférence juste avant la saison des tiques [S1] |
| Sud de la France, zones à phlébotomes | Leishmaniose : **test avant la première injection**, puis rappel annuel [S4, S9]. Le vaccin « réduit les risques mais n'assure pas une protection à 100 % » — les répulsifs restent nécessaires [S9] |
| Voyage hors de France             | Rage obligatoire, voir §4                                                       |

---

## 7. Ce que l'app peut honnêtement proposer

### 7.1 Ce qui est défendable

Le ticket #283 pose la bonne question : « une date fausse proposée par l'app vaut moins qu'un champ
vide ». Il ne s'agit donc pas de savoir si l'app *peut* calculer une date, mais à quelles conditions
cette date est défendable. Rappel de contexte : le journal des décisions porte déjà, au 2026-09-09,
« **l'échéance d'un vaccin est saisie, optionnelle, jamais calculée** », avec pour alternative écartée
« inventer une règle de rappel par nom de vaccin ». Le ticket #283 rouvre explicitement cette
décision ; l'étude doit donc dire si les faits la confirment ou l'infirment.

**Proposer un choix de produits plutôt qu'un champ libre : oui, sans réserve.** C'est le vrai gain du
ticket, et il ne demande aucune décision médicale. « Vaccin Vaccin antirabique » disparaît, le libellé
des notifications devient cohérent, l'export devient exploitable, et l'app sait enfin de quelle
valence elle parle.

**Proposer une date de rappel : les faits confirment la décision de 2026-09-09.** Le §2.3 est sans
appel : la périodicité est une propriété du **produit commercial**, pas de la combinaison de valences.
Le même « CHP » vaut 1 an chez Canigen, 2 ans chez Eurican et 3 ans chez Nobivac ; le même « FeLV »
vaut 1 an chez Purevax et 3 ans chez LeuFel [S7, S22]. Or le ticket propose de lister des
**combinaisons**, pas des marques (voir Q3) — donc au moment où l'utilisateur choisit « CHPPiL »,
l'app ne sait toujours pas si le rappel est à 1 ou 3 ans.

**Ce qui reste malgré tout calculable, et honnêtement.** Une borne inférieure existe : pour chaque
combinaison, l'intervalle le plus court trouvé dans un RCP français. En pratique, elle vaut **un an
pour presque tout** : un an dès qu'un CHPPiL, un RCP ou un FeLV est en jeu, parce qu'au moins un
produit de chaque famille porte un rappel annuel. Proposer cette borne ne fait jamais manquer un
rappel ; elle fait au pire une visite trop tôt, et une visite annuelle de médecine préventive est
recommandée de toute façon [S1]. Mais il faut alors être honnête sur ce qu'elle est : **un plancher
prudent, pas la durée d'immunité du vaccin reçu**.

**Et l'exception absolue : la rage.** Un chien vacciné avec VERSIGUARD est protégé trois ans dès la
primo-vaccination ; le même chien vacciné NOBIVAC RAGE l'est un an [S7]. Proposer « +1 an » n'est pas
seulement imprécis, c'est trompeur : la validité légale est une date que le vétérinaire a écrite dans
le passeport (§4.3), et faire croire qu'elle expire quand l'app le dit peut coûter un voyage.

### 7.2 Où est le risque de se tromper

| Risque                                  | Pourquoi                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Confondre primo-vaccination et rappel** | Le nombre d'injections et les intervalles de la primo-vaccination dépendent de l'âge au démarrage [S5]. Un animal en cours de primo-vaccination n'a pas un rappel dans un an : il a une injection dans 3 à 5 semaines. Se tromper de phase, c'est décaler un rappel d'un an. |
| **Proposer 3 ans sur un chiot ou un chaton** | Le rappel de consolidation se fait à 26 semaines (ou au plus tard vers 1 an), pas 3 ans après [S1, S4]. |
| **Proposer 3 ans pour un chat de coryza** | Le RC est de 1 à 3 ans selon le risque, et l'app ne connaît pas le risque [S1, S3, S4, S5]. |
| **Croire que la combinaison détermine la périodicité** | Elle ne la détermine pas. « CHP » vaut 1, 2 ou 3 ans selon la marque ; « FeLV » vaut 1 ou 3 ans [S7, S22]. C'est le résultat central du §2.3. |
| **La rage**                             | 1, 2 ou 3 ans selon le produit exact, et selon l'espèce pour un même produit ; l'échéance est juridique, pas médicale. Se tromper ici, ce n'est pas une visite en retard, c'est un voyage annulé ou une primo-vaccination à refaire [S4, S7, S12]. Voir §4. |
| **Le dépassement de délai qui invalide** | Leptospirose au-delà de 15 mois, leucose au-delà de 13 mois pour le premier rappel : la primo-vaccination est à recommencer [S4]. Une date de rappel proposée trop tard n'est pas seulement « en retard », elle annule le protocole. |
| **Prendre le RCP pour la recommandation (ou l'inverse)** | Les deux disent des choses différentes et ont toutes deux raison dans leur registre [S1, S4]. |

### 7.3 Les données qui manquent

L'app ne connaît aujourd'hui, pour un vaccin, que `name` (texte libre), `lastInjectionDate` et
`dueDate` — et pour l'animal, `species`, `birthDate` (facultative) et `breed`. Il manque :

- **Le produit exact injecté** (c'est l'objet du ticket) ;
- **La phase** : primo-vaccination en cours, rappel de consolidation, ou rappel d'entretien ;
- **L'âge à la première injection**, sans lequel le calendrier de primo-vaccination est indéterminé
  (`birthDate` est facultative, et un animal adopté adulte n'en a souvent pas) ;
- **Le statut intérieur / extérieur du chat**, qui détermine RC et FeLV [S1, S3] ;
- **Le mode de vie du chien** (pension, chasse, zones à tiques ou à phlébotomes) ;
- **Le nom commercial exact du produit**, seul élément qui donne la vraie périodicité (§2.3), et pour
  la rage la seule chose qui distingue 1 an de 3 ans [S7].

Aucune de ces données n'est dans le scope v1. La conclusion honnête : **l'app peut au mieux proposer
un plancher prudent d'un an, présenté comme tel, et jamais pour la rage.** Toute tentative d'aller
au-delà (déduire la phase, adapter au mode de vie, retrouver la DOI du produit) demande de nouvelles
données et de nouvelles décisions produit.

---

## 8. Les limites de cette étude

Ce que ce document **ne permet pas** de trancher :

1. **La liste exhaustive des produits réellement distribués en France.** Les RCP du §2.3 ont bien été
   lus dans les sources officielles, mais une AMM ne prouve pas la commercialisation : tous les RCP
   portent « Toutes les présentations peuvent ne pas être commercialisées » [S7, S22]. Trois obstacles
   techniques ont aussi été rencontrés et sont à connaître avant toute mise à jour : la base ANMV
   n'affiche qu'un **RCP vide** pour les AMM centralisées (`EU/2/…`), les PDF « product information »
   de l'EMA sont **vidés de leur contenu depuis 2023**, et le portail `medicines.health.europa.eu`
   bloque le téléchargement par CAPTCHA. Le chemin qui fonctionne est le Registre communautaire de la
   Commission, qui publie l'annexe I en français [S22]. **Une liste embarquée dans l'app devra être
   vérifiée RCP par RCP, et datée.**
2. **Le bon intervalle pour un animal donné.** Toutes les sources s'accordent sur un point : le
   protocole découle d'une analyse de risque faite par un vétérinaire en consultation [S1, S4]. Les
   recommandations « ne sont pas opposables » [S4].
3. **La frontière « chat à risque » / « chat à faible risque »**, qui décide de 1 an contre 3 ans pour
   le coryza. Aucune source ne la définit de façon opérationnelle.
4. **La périodicité du rappel leucose chez l'adulte** : trois réponses différentes dans quatre
   sources (§3.4 b).
5. **Ce qui a changé depuis 2020** dans les protocoles français : la note AFVAC/GEMP est datée et liée
   à un contexte (le déconfinement) ; elle reste le document français le plus détaillé que j'aie
   trouvé, mais elle s'appuie sur la WSAVA 2016, pas 2024.
6. **La durée de validité légale de la vaccination antirabique en France.** Le texte consolidé de
   l'arrêté du 10 octobre 2008 n'impose plus de plafond d'un an depuis le 28 juin 2018, mais deux
   pages officielles continuent d'annoncer un rappel annuel (§4.4) et **aucune note administrative ne
   commente ce changement**. La lecture retenue ici est une inférence à partir de Légifrance.
7. **Deux anomalies relevées dans des RCP officiels** et non tranchées : le RCP de RABIGEN MULTI décrit
   son rappel comme « une dose unique de RABIGEN **MONO** », et le RCP d'Eurican L4 nomme la souche
   Grippotyphosa tantôt *Leptospira interrogans*, tantôt *Leptospira kirschneri* [S7, S22].

Ce qu'il faudrait demander à un vétérinaire (idéalement un enseignant de médecine préventive d'une
école vétérinaire française, ou le GEMP de l'AFVAC) :

- La liste des combinaisons qu'il voit réellement passer, et le libellé qu'un propriétaire lit sur son
  carnet de santé (est-ce le nom commercial ? le sigle ? une vignette collée ?) ;
- Si une date de rappel par défaut proposée par une app lui paraît aidante ou dangereuse ;
- Si la formulation choisie pour l'app (« Proposé d'après… — vérifie avec ton vétérinaire ») est
  suffisante à ses yeux.

---

## 9. Ce que ça implique pour MémoPatte

### 9.1 Modèle de données proposé

Trois notions, pas une. C'est la traduction directe de « une injection = un produit qui couvre
plusieurs valences, chaque valence ayant sa propre périodicité ».

```text
Valence          (référentiel, figé dans l'app)
  code           'CDV' | 'CAV' | 'CPV' | 'CPiV' | 'LEPTO' | 'RABIES'
                 | 'FPV' | 'FHV' | 'FCV' | 'FELV' | 'CHLAMYDIA' | ...
  species        'dog' | 'cat'        ← indispensable : « L » et « R » changent de sens
  i18nKey        libellé traduit

VaccineProduct   (référentiel, figé dans l'app)
  code           'DOG_CHPPIL' | 'DOG_CHP' | 'DOG_RABIES' | 'CAT_RCP' | 'CAT_RCP_FELV' | 'OTHER'
  species        'dog' | 'cat'
  valences       Valence[]
  i18nKey        libellé traduit + sigle
  hintKey        phrase d'aide sur les rappels (aucune durée codée en dur)

Vaccination      (table existante, à étendre)
  productCode    référence au référentiel, ou 'OTHER'
  name           conservé : libellé libre quand productCode = 'OTHER',
                 et pour les vaccins déjà saisis
  lastInjectionDate, dueDate   inchangés
```

Points de conception :

- **Aucune périodicité n'est stockée dans le référentiel.** C'est le changement que le §2.3 impose :
  une combinaison générique n'a pas de périodicité, seul un produit commercial en a une. Le
  référentiel porte donc des **valences** (pour le libellé, le filtrage par espèce et le texte d'aide)
  et rien de plus. Si la Q1 retient les raccourcis « Dans 1 an / Dans 3 ans », ce sont deux constantes
  d'interface, pas une règle métier par valence.
- **`dueDate` reste une date stockée, pas une règle.** L'app enregistre une date ; elle ne recalcule
  jamais après coup. Un utilisateur qui corrige la date garde sa correction pour toujours, et un
  changement de référentiel dans une version ultérieure ne déplace pas les échéances déjà saisies.
  C'est aussi ce qui protège l'export et la reprogrammation des notifications après restauration.
- **`name` ne disparaît pas.** Les vaccins déjà saisis en texte libre restent lisibles et modifiables
  sans migration destructrice : ils prennent `productCode = 'OTHER'` et gardent leur libellé. Aucune
  perte de donnée, aucune tentative de correspondance automatique (qui inventerait de la donnée de
  santé à partir d'un texte tapé au clavier).
- **Le référentiel est figé dans l'app, pas en base.** Il est petit (une dizaine de produits par
  espèce), il doit être traduit FR/EN, il doit être versionné et daté avec sa source — donc il
  appartient au code, pas à une table synchronisée. Une table en base imposerait une synchro, une
  migration et une traduction dynamique pour un gain nul.

### 9.2 Écrans concernés

| Écran / module                                | Ce qui change                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `VaccinationFormView.vue`                     | Le champ texte devient un sélecteur filtré par l'espèce de l'animal + entrée « Autre » qui révèle le champ texte sans perdre la saisie. Phrase d'aide propre au produit sous le sélecteur, et (selon Q1) raccourcis d'échéance sous le champ de date. |
| `vaccination.schema.ts`, `vaccination-form.ts` | Ajout de `productCode`, `name` devient conditionnel                                            |
| `vaccinations.repository.ts` + migration       | Nouvelle colonne, valeur `'OTHER'` pour l'existant                                              |
| `vaccination-reminders.ts`, `due-reminders`   | Le libellé de la notification vient du produit traduit, plus du texte libre (ferme #282)         |
| `VaccinationsSection.vue`, Accueil            | Affichage du libellé produit + sigle                                                            |
| Export / import JSON et CSV                   | `productCode` exporté **et** `name` conservé : un export doit rester lisible sans l'app          |
| `glossaire-fr-en.md`                          | Entrées à ajouter : valence, produit, primo-vaccination, rappel de consolidation                 |
| `docs/product/`                               | Ce document, cité par le ticket (critère d'acceptation « la source des données vaccinales est citée ») |

### 9.3 Questions à poser à Gaelle

Aucune de ces questions n'est une question de bonnes pratiques : chacune touche au produit, au texte
vu par l'utilisateur ou à de la donnée de santé. Elles attendent donc une réponse.

**Q1 — L'app propose-t-elle une date de rappel, ou laisse-t-elle le champ vide ?**
*(Cette question rouvre la décision du 2026-09-09 « l'échéance d'un vaccin est saisie, jamais
calculée » : c'est un des quatre points que le ticket #283 demande explicitement de trancher.)*

- **Recommandation :** garder le principe de 2026-09-09 — **aucune date pré-remplie** — mais ajouter
  deux raccourcis d'un tap sous le champ, « Dans 1 an » et « Dans 3 ans », rien de pré-sélectionné, et
  sous le sélecteur de produit une phrase d'aide propre à la combinaison choisie (« Selon le vaccin
  utilisé, le rappel des valences virales va de 1 à 3 ans ; la leptospirose est annuelle. Reporte la
  date de ton carnet. »). Pour la rage, pas de raccourci du tout (Q2).
- **Raison :** le §2.3 montre que la périodicité est une propriété du produit commercial, pas de la
  combinaison — la même combinaison porte 1, 2 ou 3 ans selon la marque [S7, S22]. Une date
  pré-remplie affirmerait donc quelque chose que l'app ne sait pas. Les raccourcis, eux, suppriment
  l'arithmétique (le vrai frein à créer un rappel) sans rien affirmer : c'est l'utilisateur qui
  choisit, comme le fait déjà le logiciel de refuge étudié au §5, qui ne calcule que si le champ est
  laissé vide.
- **Alternatives écartées :** (a) **pré-remplir « +1 an »** — défendable médicalement, jamais trop
  tard, mais ça renverse une décision consignée et ça fait passer un plancher prudent pour la durée
  d'immunité du vaccin reçu ; (b) **laisser le champ nu**, sans raccourci ni aide — le plus prudent,
  mais en pratique aucun rappel n'est programmé, ce qui est le pire résultat pour une app dont le
  différenciant n° 1 est « rappels ultra-fiables ».

**Q2 — La rage a-t-elle un traitement à part ?**

- **Recommandation :** oui. Pour la rage, l'app **ne propose aucune date** et affiche à la place : « La
  validité de la vaccination antirabique dépend du vaccin utilisé (1, 2 ou 3 ans) et figure sur le
  passeport. Reporte la date indiquée par ton vétérinaire. »
- **Raison :** c'est la seule valence où une date fausse a une conséquence juridique — voyage refusé,
  chien catégorisé dont le permis de détention exige une vaccination « en cours de validité » [S13],
  primo-vaccination à refaire si le rappel est fait un seul jour trop tard [S12]. Et les RCP français
  vont de l'annuel (NOBIVAC RAGE) au triennal dès la primo-vaccination (VERSIGUARD chez le chien)
  [S7] : l'app ne peut pas deviner lequel. La date qui compte est celle que le vétérinaire a écrite
  dans le passeport [S18].
- **Alternative écartée :** proposer 1 an par défaut « au pire on vaccine trop tôt ». Faux ici : un
  rappel fait trop tôt ne prolonge pas la validité, il la remplace, et un propriétaire qui suit l'app
  plutôt que son passeport perdrait la trace de la vraie date d'échéance.

**Q3 — Quelle profondeur de liste ? Produits génériques ou noms commerciaux ?**

- **Recommandation :** des **combinaisons génériques** (« CHPPiL — Carré, hépatite, parvovirose,
  parainfluenza, leptospirose »), pas des noms de marque.
- **Raison :** c'est ce que le propriétaire peut reconnaître sur son carnet sans se tromper, ça ne
  demande pas de suivre les AMM et les retraits du marché, et ça évite de nommer des produits
  commerciaux dans une app grand public. Les valences, elles, ne changent pas.
- **Alternative écartée :** lister les noms commerciaux (Nobivac, Purevax, Eurican, Versican, Canigen,
  Feligen, Rabisin…). C'est la seule option qui donnerait accès à la vraie périodicité, puisqu'elle est
  attachée au produit (§2.3), et c'est ce que le propriétaire a sous les yeux s'il a une vignette
  collée dans son carnet. Mais c'est un référentiel de données de santé à maintenir à vie, RCP par RCP,
  pour une dev solo — et les RCP bougent : les produits du §2.3 portent des dates de mise à jour
  échelonnées de 2022 à 2026.
- **Point à rouvrir plus tard :** si un jour Gaelle veut une vraie date de rappel calculée, c'est
  cette question-là qu'il faudra retrancher, pas la Q1. Sans le nom commercial, aucune périodicité
  fiable n'est atteignable.

**Q4 — Que fait-on des vaccins déjà saisis en texte libre ?**

- **Recommandation :** ils restent tels quels, en « Autre », avec leur libellé intact. Aucune
  proposition de correspondance automatique.
- **Raison :** faire deviner à l'app que « rappel vaccin » veut dire CHPPiL, c'est inventer de la
  donnée de santé. Et la promesse « données jamais otages » interdit une migration qui perdrait ce
  que l'utilisateur a écrit.
- **Alternative écartée :** proposer une correspondance à la première ouverture (« On dirait un
  CHPPiL, on corrige ? »). Séduisant, mais c'est une suggestion médicale faite sur une chaîne de
  caractères.

**Q5 — Ajoute-t-on un statut « intérieur / extérieur » au chat, et un mode de vie au chien ?**

- **Recommandation :** **pas dans ce ticket.** À noter comme ticket de suite, sans engagement.
- **Raison :** c'est la donnée qui déciderait entre 1 an et 3 ans pour le coryza, et entre « leucose
  essentielle » et « leucose inutile » [S1, S3]. Sans elle, l'app se contente d'enregistrer ce que
  l'utilisateur sait ; avec elle, elle commencerait à faire une recommandation vaccinale — un tout
  autre métier, et un tout autre niveau de responsabilité.
- **Alternative écartée :** l'ajouter tout de suite au formulaire animal pour affiner les
  propositions. Ça élargit #283 à la fiche animal et fait entrer l'app dans le conseil vétérinaire.

**Q6 — Distingue-t-on la primo-vaccination du rappel dans le formulaire ?**

- **Recommandation :** **non en v1**, mais le texte d'aide sous le sélecteur doit mentionner le cas
  (« pendant la primo-vaccination du chiot ou du chaton, la prochaine injection tombe dans 3 à 5
  semaines : reporte la date donnée par ton vétérinaire »).
- **Raison :** le calendrier de primo-vaccination dépend de l'âge à la première injection, donnée que
  l'app n'a pas ; et un chiot en primo-vaccination a une injection dans 3 à 5 semaines, pas dans un an
  [S4, S5]. Sans la phrase d'aide, un raccourci « Dans 1 an » serait un piège pour un chiot.
- **Alternative écartée :** un sélecteur « primo-vaccination / rappel » qui change les raccourcis
  proposés. Plus juste médicalement, mais il demande à l'utilisateur de connaître une distinction
  vétérinaire pour remplir un formulaire de deux taps — ce qui contredit le différenciant « saisie
  rapide ».

---

## Sources

Toutes consultées le **16 septembre 2026**.

**[S1] 2024 guidelines for the vaccination of dogs and cats — compiled by the Vaccination Guidelines
Group (VGG) of the World Small Animal Veterinary Association (WSAVA)**
Squires R. A. *et al.*, WSAVA / *Journal of Small Animal Practice*, 40 pages, DOI 10.1111/jsap.13718.
Publié le **3 avril 2024**.
<https://wsava.org/wp-content/uploads/2024/04/WSAVA-Vaccination-guidelines-2024.pdf>
Version française (traduction publiée le **26 mars 2025**) :
<https://wsava.org/wp-content/uploads/2025/03/2024-Squires-et-al-WSAVA-Vaccination-guidelines_FR_CLEAN.pdf>
Résumé exécutif séparé (15 mai 2024) :
<https://wsava.org/wp-content/uploads/2024/05/2024-Guidelines-for-the-Vaccination-of-Dogs-and-Cats.pdf>
Page d'index et liste des traductions : <https://wsava.org/global-guidelines/vaccination-guidelines/>
*C'est la source de référence mondiale. Tableau 1 (chien) et tableau 2 (chat) donnent, valence par
valence, le schéma chiot/chaton, le schéma adulte et l'intervalle de rappel.*

**[S2] Guideline for Feline Leukaemia Virus Infection**
Hofmann-Lehmann R., Hartmann K. et coll., ABCD. Page mise à jour le **27 mars 2025**.
<https://www.abcdcatsvets.org/guideline-for-feline-leukaemia-virus-infection/>
*Vacciner uniquement les chats testés négatifs ; schéma chaton 8-9 semaines puis 12 semaines.*
Référence originale : Lutz H. *et al.*, « Feline leukaemia. ABCD guidelines on prevention and
management », *Journal of Feline Medicine and Surgery*, 2009 — <https://pubmed.ncbi.nlm.nih.gov/19481036/>

**[S3] Vaccine recommendations for cats according to their lifestyle (ABCD Tool)**
European Advisory Board on Cat Diseases (ABCD), **février 2020**, 2 pages.
<https://www.abcdcatsvets.org/wp-content/uploads/2022/11/TOOL_Vaccine-recommendations_Feb_2020_EN.pdf>
*Deux calendriers côte à côte, chat d'intérieur strict et chat ayant accès à l'extérieur, plus refuge
et élevage. La source la plus directement exploitable sur la question intérieur/extérieur.*

**[S4] Note technique sur la reprise progressive des activités de médecine préventive à la levée du
confinement le 11 mai — Gestion des protocoles vaccinaux**
Rédigée par les enseignants de médecine préventive des **Écoles Vétérinaires Françaises** et le bureau
du **GEMP (Groupe d'Étude de Médecine Préventive) de l'AFVAC**, à la demande du Conseil National de
l'Ordre des vétérinaires ; ANMV et SIMV consultés. Version définitive du **27 avril 2020**, 15 pages.
Hébergée par l'Académie Vétérinaire de France :
<https://academie-veterinaire.fr/fileadmin/user_upload/DossiersThematiques/Coronavirus/Corona_Biblio/2020-04-27_RepriseVaccin-PostDeconfinement.pdf>
Également publiée dans *Revue Vétérinaire Clinique* : <https://pmc.ncbi.nlm.nih.gov/articles/PMC7837031/>
*Le document français le plus détaillé que j'aie trouvé : protocole valence par valence, délais de
tolérance de retard, et deux tableaux de synthèse des RCP des vaccins antirabiques français
(tableaux 10 et 11). Son contexte est daté (le déconfinement de 2020) et il s'appuie sur la WSAVA
2016, pas 2024 — les protocoles, eux, restent la référence française.*

**[S5] Recommandations vaccinales chez le chien et le chat**
Bercker C., *La Dépêche Technique* n° 172, **novembre 2019**, 10 pages.
<https://medias.depecheveterinaire.com/articles/2019/recommandations_vaccinales_dt172.pdf>
*Tableaux 1 à 3 : calendriers de primo-vaccination selon l'âge à la première présentation, puis
recommandations chien et chat par valence. C'est la source qui expose le mieux les divergences entre
WSAVA, AAFP et ABCD sur le coryza et la leucose.*

**[S6] Recommandations pour la vaccination du Chien et du Chat en 2016**
Pépin M. (VetAgro Sup, campus de Lyon), *PratiqueVet* (2016) **51 : 564-570**, publié en
**octobre 2016**.
<https://anima-vet.fr/PEPIN-PRATVET-Recommandations_pour_la_vaccination_du_Chien_et_du_Chat.pdf>
*Tableaux 1 et 2 : la liste des maladies vaccinables en France, les sigles français (CHPPiLR, CRPChL),
le nombre de spécialités enregistrées par valence, et le classement essentiel / optionnel. La source
des abréviations utilisées au §2.1. Données de 2016 : les comptages de spécialités ont vieilli, les
sigles non.*

**[S7] Base publique des médicaments vétérinaires (RCP)**
Agence Nationale du Médicament Vétérinaire (ANMV) — ANSES.
<https://ircp.anmv.anses.fr/> — index par lettre : `https://www.ircp.anmv.anses.fr/index.aspx?letter=E`,
RCP : `https://www.ircp.anmv.anses.fr/rcp.aspx?NomMedicament=<NOM+EXACT>`
*La source qui fait foi pour les AMM françaises. RCP lus le 16/09/2026 pour EURICAN DAP (mise à jour
18/04/2024), EURICAN DAPPI, EURICAN DAPPI-L (02/04/2026), NOBIVAC CHP et CHPPI (19/07/2024),
CANIGEN DHPPI et DHPPI/L (14/01/2026), VANGUARD CPV, FELIGEN CRP (04/10/2024) et CRP/R (20/06/2025),
VERSIFEL CVR (21/02/2024) et FELV (10/01/2024), NOBIVAC TRICAT TRIO (15/11/2024), RABISIN
(06/08/2025), RABISIN MULTI (17/10/2025), RABIGEN MONO (06/03/2025) et MULTI (14/01/2026),
NOBIVAC RAGE (22/08/2025), VERSIGUARD RABIES (26/10/2023). **Attention : pour les AMM centralisées
européennes (`EU/2/…`), cette base n'affiche qu'un RCP vide — voir [S22].***

**[S22] Registre communautaire des médicaments vétérinaires — annexe I (RCP complet, en français)**
Commission européenne, DG Santé.
Index des vaccins vétérinaires actifs :
<https://ec.europa.eu/health/documents/community-register/html/reg_vet_act.htm?sort=a>
Fiche produit : `https://ec.europa.eu/health/documents/community-register/html/v<NNN>.htm`
Annexe française : `https://ec.europa.eu/health/documents/community-register/<AAAA>/<AAAAMMJJ><id>/anx_<id>_fr.pdf`
*C'est le texte juridiquement opposable pour les AMM centralisées. Annexes lues le 16/09/2026,
datées par la décision de la Commission : Versican Plus DHPPi (08/08/2023), DHPPi/L4 et DHPPi/L4R
(29/07/2026), Pi (16/05/2023), Pi/L4 (29/07/2026) ; Nobivac L4 et LoVo L4 (21/08/2025) ; Canigen L4
(05/07/2023) ; Eurican L4 (31/03/2023) ; Nobivac DP Plus (03/07/2023) ; Purevax RC (09/03/2023),
RCP (25/04/2024), RCPCh (28/10/2022), RCP FeLV (06/05/2024), RCPCh FeLV (09/11/2022), FeLV
(24/10/2024), Rabies (16/05/2023) ; Leucofeligen FeLV/RCP (19/10/2023) ; Nobivac LeuFel (19/12/2023) ;
Nobivac NXT HCP et HCPCh (02/07/2026), NXT FeLV (29/07/2026). Depuis le règlement (UE) 2019/6, la
posologie est en rubrique **3.9** et les durées d'immunité en **3.2** (anciennement 4.9 et 4.2). Le
champ « date de dernière révision » des annexes est un gabarit vide : la date qui fait foi est celle
de la décision, lisible dans l'URL.*

**[S23] Voies d'accès qui ne fonctionnent plus (constat du 16/09/2026)**
Les PDF `…/documents/product-information/<produit>-epar-product-information_fr.pdf` de l'EMA ne
contiennent plus que la phrase « Up-to-date information on this veterinary medicinal product is
available on the Veterinary Medicines Information website » (© EMA 2023). Le portail de remplacement
<https://medicines.health.europa.eu/> affiche les fiches produit mais protège le téléchargement des
documents par CAPTCHA. *À savoir avant toute mise à jour de cette étude.*

**[S8] European consensus statement on leptospirosis in dogs and cats**
Schuller S., Francey T., Hartmann K., Hugonnard M., Kohn B., Nally J. E., Sykes J.,
*Journal of Small Animal Practice* 56 : 159-179, **mars 2015**, DOI 10.1111/jsap.12328.
<https://onlinelibrary.wiley.com/doi/10.1111/jsap.12328>
*Cité par [S4] et [S5] comme le texte de référence sur le choix L2 / L4 et sur le rappel annuel.*

**[S9] La leishmaniose chez le chien — Leishmania infantum — Phlébotome**
ESCCAP France. Page sans date de publication affichée.
<https://www.esccap.fr/maladies-vectorielles/leishmaniose>
*« Son protocole d'utilisation nécessite de tester l'animal avant la première injection […] S'il est
négatif, il reçoit une première vaccination, puis une injection de rappel une fois par an. »
Saison des phlébotomes : avril à fin novembre. ESCCAP ne traite que les parasites : c'est la seule
valence pour laquelle il est une source.*

**[S10] Vaccination contre la leptospirose canine en France : enquête sur les pratiques vétérinaires
et leurs motivations**
Hidalgo Friaz M., Barthélemy A., Savoie P., Freyburger L., Hugonnard M. (VetAgro Sup),
*Revue Vétérinaire Clinique* **58 (1) : 1-11, 2023**, DOI 10.1016/j.anicom.2022.12.001.
<https://www.em-consulte.com/article/1578714/vaccination-contre-la-leptospirose-canine-en-franc>
*Enquête menée en 2020 auprès de 863 vétérinaires français : 83,2 % utilisent un vaccin L4. Source
d'usage, pas de recommandation.*

**[S11] Bilan de la surveillance de la rage animale en France : 13 cas détectés en 2015 et 2016**
Servat A. *et al.* (ANSES, Laboratoire de référence de l'UE pour la rage, Nancy ; Institut Pasteur ;
DGAL), *Bulletin épidémiologique santé animale-alimentation* n° 39, mis en ligne le **9 décembre 2020**.
<https://be.anses.fr/sites/default/files/N-039_2020-12-09_Rage_Servat_VF.pdf>
*« La France métropolitaine est officiellement reconnue indemne de rage depuis 2001 (arrêté
ministériel du 30 avril 2001), excepté pour la période de février 2008 à février 2010 » — à la suite
de l'importation d'un chien enragé.*

**[S12] Règlement (UE) n° 576/2013 du Parlement européen et du Conseil du 12 juin 2013**
relatif aux mouvements non commerciaux d'animaux de compagnie, JO L 178 du 28.6.2013, p. 1,
applicable depuis le **29 décembre 2014**.
<https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32013R0576>
*Article 6 (conditions d'entrée), article 17 (marquage), articles 21-22 (passeport), annexe III :
âge minimal de 12 semaines, 21 jours avant validité, puce obligatoirement antérieure au vaccin, et
« une revaccination doit être considérée comme une vaccination primaire si elle n'a pas été
administrée au cours de la période de validité » de la précédente. EUR-Lex bloquant les requêtes
automatisées, le texte a été lu via l'Office des publications :
`http://publications.europa.eu/resource/celex/32013R0576`.*

**[S13] Code rural et de la pêche maritime**
Légifrance. Articles consultés : **L211-14** (permis de détention des chiens de 1ʳᵉ et 2ᵉ catégorie,
subordonné à « la vaccination antirabique du chien en cours de validité », en vigueur depuis le
22/06/2008) — <https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000019065635> ;
**L212-10** (identification obligatoire, en vigueur depuis le 02/12/2021) ;
**R223-25 à R223-37** (police sanitaire de la rage, départements officiellement déclarés infectés) —
<https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006071367/LEGISCTA000006183234/>

**[S14] Note d'information DGAL/SDSPA/O2007-8010 du 24 septembre 2007**
« Mise en œuvre du nouveau dispositif encadrant la vaccination et la certification antirabique »,
Direction générale de l'alimentation, ministère de l'Agriculture. Date : **24 septembre 2007**.
<https://info.agriculture.gouv.fr/boagri/instruction-O2007-8010/telechargement>
Copie miroir : <https://www.veterinaire.fr/system/files/files/2021-12/Note_d_information_de_la_DGAL__24_septembre_2007___Mise_en_oeuvre_du_nouveau_dispositif_encadrant_la_vaccination_et_la_certification_antirabique__.pdf>
*Le document qui pose le cadrage actuel : « seuls les animaux voyageant en dehors du territoire
français et les chiens de 1ʳᵉ et 2ᵉ catégorie auront l'obligation d'être valablement vaccinés » ;
suppression de l'obligation dans les campings, centres de vacances, expositions et lieux de
rassemblement ; « une vaccination sans identification préalable de l'animal n'a jamais eu de valeur
réglementaire ».*

**[S15] Arrêtés relatifs à la rage et aux territoires**
**Arrêté du 5 septembre 2008** relatif à des mesures de lutte contre la rage en Guyane (vaccination
obligatoire des carnivores domestiques) — version en vigueur au 16/09/2026 —
<https://www.legifrance.gouv.fr/loda/id/LEGITEXT000019457637>
**Arrêté du 14 janvier 2008** abrogeant l'arrêté du 29 novembre 1991 (Corse et DOM), JORF n° 0018 du
22/01/2008 — <https://www.legifrance.gouv.fr/loda/id/LEGITEXT000017983600>
**Arrêté du 4 mai 2007** abrogeant l'arrêté du 22 janvier 1985 (campings, expositions, lévriers de
course), JORF n° 113 du 16/05/2007 — <https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000000277184>

**[S16] Les principaux textes réglementaires sur la rage** et **Questions / Réponses pour tout savoir
sur la rage**
Ministère de l'Agriculture. Pages mises à jour le **28 juin 2024** et le **14 juin 2024**.
<https://agriculture.gouv.fr/les-principaux-textes-reglementaires-sur-la-rage> ·
<https://agriculture.gouv.fr/questions-reponses-pour-tout-savoir-sur-la-rage>
*« En novembre 2001, la France est déclarée officiellement indemne de rage par l'OMSA » ; obligation
guyanaise motivée par la rage desmodine. ⚠️ La première page décrit encore l'article 3 de l'arrêté de
2008 dans sa rédaction antérieure à juin 2018 (§4.4).*

**[S17] Voyager à l'étranger avec son animal de compagnie**
service-public.gouv.fr, fiche **F21374**, éditée par la DILA, **vérifiée le 28 avril 2026**.
<https://www.service-public.gouv.fr/particuliers/vosdroits/F21374>
*« Le vaccin antirabique est possible à partir de 12 semaines (3 mois) et prend effet au moins 21
jours (3 semaines) plus tard. Il doit faire l'objet d'un rappel annuel. La vaccination doit être
réalisée après l'identification pour être reconnue valable. » ⚠️ La mention « rappel annuel » est
en tension avec le texte consolidé de l'arrêté de 2008 (§4.4). L'ancienne référence F36479 est morte.*

**[S18] Arrêté du 10 octobre 2008 relatif aux conditions et modalités de la vaccination antirabique
des animaux domestiques**
Légifrance, version en vigueur depuis le **29 décembre 2014** (article 3 modifié le 28/06/2018).
<https://www.legifrance.gouv.fr/loda/id/JORFTEXT000019675107>
*Article 1 (vétérinaires sanitaires seuls habilités), article 2 (vaccin à virus inactivé sous AMM),
article 6 (attestation dans la rubrique « vaccination antirabique » du passeport européen, obligatoire
depuis le 1ᵉʳ janvier 2009), article 7 (21 jours pour la primo-vaccination ; « la certification de
vaccination antirabique de rappel des animaux domestiques prend effet le jour de son établissement »).*

**[S19] Arrêté du 19 juin 2018 modifiant l'arrêté du 10 octobre 2008**
JORF n° 0146 du **27 juin 2018**, appliqué depuis le 28 juin 2018.
<https://www.legifrance.gouv.fr/loda/id/JORFTEXT000037106438>
*Supprime de l'article 3 la phrase qui plafonnait à un an la durée de validité de la
primo-vaccination antirabique, quel que soit le vaccin.*

**[S20] Contre la rage (fiche pratique propriétaires)**
Ordre national des vétérinaires, publiée le **27 août 2018**.
<https://www.veterinaire.fr/je-suis-proprietaire-danimaux/fiches-pratiques/contre-la-rage>
*« En faisant vacciner tous les ans\* vos carnivores domestiques […] \* ou tous les 3 ans, selon le
vaccin. Parlez-en avec votre vétérinaire. » Précise aussi qu'un animal non identifié, ou dont la
vaccination est certifiée ailleurs que sur le passeport, sera euthanasié en cas de suspicion.*

**[S21] Globinours — code source**
OverSu (Alexandre Noël), application web libre de gestion de refuges, **PHP + SQLite**, licence
**AGPL-3.0-or-later**. Version `1.0.0-rc.28`, dernier commit consulté `f20d7cc9` du
**15 septembre 2026**.
<https://nnsprod.com/git/oversu/Globinours> · site du projet : <https://globinours.fr>
Fichiers lus le 16/09/2026 : `migrations/001_init.sql`, `002_vaccines_code.sql`,
`015_add_clinic_vet_to_vaccinations.sql`, `048_vaccination_traceability.sql`,
`063_separate_dewormer_catalog.sql`, `064_seed_dewormers.sql`,
`app/Controllers/AnimalMedicalActions.php` (méthode `addVaccine`), `docs/04-suivi-medical.md`.
*Source de conception, pas source vétérinaire : elle dit ce qu'un refuge a choisi d'implémenter, pas
ce qui est recommandé.*
