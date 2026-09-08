# Commentaires et messages (2026-09-08)

Règle posée par Gaelle après le lot 2, où les commentaires avaient atteint
25 % des lignes de `AnimalChipSelector.vue` et 22 % de `animals.store.ts`.
Le code devenait illisible.

## Le principe

**Par défaut, on n'écrit pas de commentaire.** Le code et les tests disent
ce que fait le programme. Un commentaire ne se justifie que s'il explique
un **pourquoi** qui ne se déduit pas du code, et qu'un développeur
supprimerait par erreur sans lui.

Quand il est justifié : **une phrase, deux lignes maximum.**

## Ce qui ne va jamais dans le code

- **Redire ce que le code dit.** `// on relit la liste` au-dessus d'un `list()`
- **Réexpliquer une règle d'architecture** qui vit déjà dans `CLAUDE.md` ou
  `docs/technical/01-architecture-v2.md`. Le lecteur a le dépôt
- **Citer une règle ESLint** : c'est le linter qui la fait respecter
- **Raconter l'histoire du fichier** (« avant on faisait X », « suite à la
  revue de… », « décision du 2026-09-08 »). Ça va dans `git log`, dans
  `docs/product/decisions-log.md` ou dans le corps de la PR
- **Un bloc JSDoc sur une fonction interne.** Le JSDoc est réservé à une API
  publique consommée ailleurs, et il décrit alors le **contrat**, pas le
  raisonnement qui y a mené

## Où va le reste

| Ce que tu veux écrire                       | Où ça va                               |
| ------------------------------------------- | -------------------------------------- |
| La raison d'une décision produit ou d'archi | `docs/product/decisions-log.md`        |
| Ce qui a changé et pourquoi                 | Le message de commit                   |
| Ce qu'un relecteur doit savoir              | Le corps de la PR                      |
| Une contrainte durable de travail           | `.claude/rules/`                       |
| Un piège qui reste dans le code             | Un commentaire d'une ligne, ou un test |

**Un piège se protège mieux par un test que par un commentaire** : le test
casse, le commentaire non.

## Exemple

Trop, tel que livré dans `animals.repository.ts` :

```ts
/**
 * Repository branché sur la base locale, construit à la première demande.
 *
 * C'est le point de composition du feature : ce fichier est, avec `core/`, le
 * seul autorisé à ouvrir la base (cf. CLAUDE.md et la règle ESLint
 * `app/repository-only-data-access`). `main.ts` le passe au store via
 * `provideAnimalsRepository`, et les repositories suivants se brancheront de
 * la même façon.
 *
 * Une ouverture ratée n'est pas mise en cache : sans cette remise à `null`, la
 * promesse rejetée serait resservie indéfiniment et annulerait le réessai
 * prévu par `getDb()`.
 */
```

Assez :

```ts
/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
```

Le reste était déjà écrit ailleurs : le point de composition dans
`decisions-log.md`, la règle d'accès dans `CLAUDE.md`, et le réessai est
couvert par un test.

## Repère chiffré

Au-delà de **10 % de lignes de commentaire** dans un fichier, il y a
probablement trop. Ce n'est pas un seuil à respecter mécaniquement, c'est un
signal à aller regarder.

## Messages de commit et corps de PR

Même esprit, appliqué ailleurs :

- **Commit** : le titre Conventional Commits suffit dans la majorité des cas.
  Un corps seulement s'il y a une raison non évidente à donner, et alors
  quelques lignes, pas une dissertation
- **Corps de PR** : Quoi / Vérifié / Points à garder en tête. Aller à
  l'essentiel ; les détails de vérification vivent dans les rapports d'agents,
  pas dans la PR

## Pour les agents

Un brief qui demande de « documenter la raison » **ne demande pas de l'écrire
dans le code**. La raison va au journal des décisions ou à la PR. Cette règle
prime sur toute formulation d'un brief qui pousserait à commenter davantage.
