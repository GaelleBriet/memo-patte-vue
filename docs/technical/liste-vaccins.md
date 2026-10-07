# Liste des combinaisons de vaccins (VA-4, #283)

Le champ « Nom du vaccin » propose, pendant la frappe, les noms déjà utilisés pour les animaux de la
même espèce, puis les **combinaisons courantes pour l'espèce**, nommées par leurs maladies (spec
[Vaccins](../product/specs/vaccins.md), VA-4). Aucune durée de rappel n'est proposée.

## Source des données

> Données issues de la **Base de données publique des médicaments vétérinaires autorisés en
> France**, Anses – Agence nationale du médicament vétérinaire (ANMV), publiée sur data.gouv.fr
> sous licence **Creative Commons Attribution (CC BY)** :
> <https://www.data.gouv.fr/datasets/base-de-donnees-publique-des-medicaments-veterinaires-autorises-en-france-1>.
> Export utilisé : jeu de données XML V2 du **1ᵉʳ octobre 2026** (`date-jeu-de-donnees`
> 2026-10-01T09:30:01), téléchargé le 7 octobre 2026. Données transformées : seuls sont gardés le
> nombre de produits autorisés par combinaison de maladies, pour le chien et le chat.

- La licence est celle indiquée par les métadonnées de data.gouv.fr (`cc-by`, sans numéro de
  version) ; le fichier lui-même n'en mentionne aucune.
- Dans l'app, l'attribution figure dans Paramètres › À propos (`settings.about.vaccineSource`), avec
  un lien vers le jeu de données (#598).
- L'app n'embarque ni nom commercial, ni texte de RCP : seulement des combinaisons de maladies, leur
  nombre de produits et la date de l'export
  (`src/features/vaccinations/logic/vaccine-combinations.json`).
- Les libellés des maladies (FR, EN britannique) et les sigles de recherche sont écrits à la main
  (`vaccine-suggestions.ts`, `fr.json`, `en.json`) ; le vocabulaire vient de l'étude du coffre
  (`technical/etude-liste-vaccins.md`, §2.1) et de [l'étude du 16/09](../product/etude-vaccination.md).
- **Relecture par un vétérinaire** : prévue pendant la phase de test (lot 10), décision de Gaelle du
  2026-10-06 (#283).

## Méthode

Script `scripts/generate-vaccine-list.mjs` (dérivation dans `scripts/vaccine-list.mjs`, testée par
`scripts/__tests__/vaccine-list.spec.mjs`) :

1. garde les médicaments **autorisés** (statuts « AMM », « AMM illimitée », « AMM renouvelée »,
   « AMM sous circonstances exceptionnelles ») dont un code ATCvet commence par `QI07A` (chien) ou
   `QI06A` (chat) ;
2. prend l'espèce dans les voies d'administration (« Chien », « Chat ») : les vaccins rage
   multi-espèces ne portent que le code du chien ;
3. relie chaque substance active à sa maladie par mots-clés ; les produits dont l'export ne donne pas
   la composition (« A DEFINIR IMMUNO UPD » ou aucune substance : PUREVAX, VERSICAN PLUS, NOBIVAC L4…)
   sont décrits dans `COMPOSITION_BY_NAME`. Une substance ou un produit inconnu **arrête le script** :
   on complète la table, on ne devine pas ;
4. chez le chien, *Bordetella* devient « toux du chenil » et absorbe la parainfluenza qui
   l'accompagne ; chez le chat, calicivirus et herpèsvirus forment le coryza ;
5. ne garde que les combinaisons portées par **au moins 2 produits** (décision du 2026-10-07) ; les
   autres restent en saisie libre.

## Régénérer la liste (à chaque version)

1. Télécharger l'export XML V2 dans un dossier vide, hors du dépôt :
   `https://pro.anses.fr/RCP/amm-vet-fr-v2-v.7z`, puis le décompresser (`7z x amm-vet-fr-v2-v.7z`) :
   il contient `amm-vet-fr-v2-v.xml` et `amm-vet-fr-v2-d.xml`.
2. `pnpm vaccines:generate <ce dossier>`.
3. Relire le diff de `vaccine-combinations.json`. Une combinaison nouvelle fait échouer
   `vaccine-suggestions.spec.ts` tant qu'elle n'a pas ses sigles (`ALIASES`) et les libellés FR et EN
   de ses maladies (`vaccinations.diseases.*`) ; chaque libellé doit tenir dans les 80 caractères
   d'un nom de vaccin.
4. Mettre à jour la date de l'export ci-dessus.

## Liste de l'export du 1ᵉʳ octobre 2026

| Espèce | Combinaison (libellé FR)                                        | Produits | Sigles                         |
| ------ | --------------------------------------------------------------- | -------- | ------------------------------ |
| Chien  | Parvovirose                                                     | 4        | —                              |
| Chien  | Leptospirose                                                    | 8        | L4                             |
| Chien  | Rage                                                            | 6        | —                              |
| Chien  | Toux du chenil                                                  | 6        | KC · BbPi                      |
| Chien  | Leishmaniose                                                    | 2        | —                              |
| Chien  | Parainfluenza, leptospirose                                     | 2        | PiL                            |
| Chien  | Carré, hépatite, parvovirose                                    | 4        | CHP · DAP                      |
| Chien  | Carré, hépatite, parvovirose, parainfluenza                     | 5        | CHPPi · DHPPi                  |
| Chien  | Carré, hépatite, parvovirose, leptospirose                      | 2        | CHPL · DAPL                    |
| Chien  | Carré, hépatite, parvovirose, parainfluenza, leptospirose       | 5        | CHPPiL · DHPPiL                |
| Chien  | Carré, hépatite, parvovirose, parainfluenza, leptospirose, rage | 2        | CHPPiLR                        |
| Chat   | Coryza (herpèsvirus, calicivirus)                               | 4        | RC · CR · HC                   |
| Chat   | Leucose                                                         | 5        | FeLV                           |
| Chat   | Rage                                                            | 7        | —                              |
| Chat   | Typhus, coryza (herpèsvirus, calicivirus)                       | 5        | RCP · CRP · CVR · HCP          |
| Chat   | Typhus, coryza (herpèsvirus, calicivirus), chlamydiose          | 2        | RCPCh · HCPCh                  |
| Chat   | Typhus, coryza (herpèsvirus, calicivirus), leucose              | 3        | TCL · RCP FeLV · HCP FeLV      |
| Chat   | Typhus, coryza (herpèsvirus, calicivirus), chlamydiose, leucose | 2        | RCPCh FeLV · HCPCh FeLV        |

Par rapport au brouillon de l'étude (export du 23/09/2026), le seuil de deux produits ajoute
« Carré, hépatite, parvovirose, leptospirose » (CANIGEN CHP/L, EURICAN DAP L-MULTI) et « Typhus,
coryza, chlamydiose, leucose » (PUREVAX RCPCh FeLV, NOBIVAC NXT HCPCHFELV).
