# Configuration Google OAuth (Android) — ticket [#65](https://github.com/GaelleBriet/memo-patte-vue/issues/65)

Toutes les valeurs propres à MémoPatte sont déjà renseignées ci-dessous.

> **À faire avant l'écran de connexion (#6)**

---

## Déjà vérifié

| Point                         | État                                                                       |
|-------------------------------|----------------------------------------------------------------------------|
| Plugin compatible Capacitor 8 | ✅ `@capgo/capacitor-social-login@8.4.5` déclare `@capacitor/core >=8.0.0` |
| Identifiant de l'application  | ✅ `com.gaellebriet.memopatte` (dans `capacitor.config.ts`)                |
| Keystore debug                | ✅ présent (`~/.android/debug.keystore`)                                   |
| SHA-1 debug                   | ✅ extrait, voir étape 2                                                   |


---

## Vue d'ensemble

Trois endroits à configurer, dans cet ordre :

```
1. Google Cloud Console  →  crée 2 identifiants (Web + Android)
2. Supabase Dashboard    →  reçoit ces 2 identifiants
3. Le projet             →  installe le plugin, utilise le Web client ID
```

Le point qui surprend tout le monde : **il faut deux identifiants, et c'est le
« Web client ID » que le code Android utilise.** L'identifiant Android sert
uniquement à faire le lien entre ton app signée et ton projet Google — il n'est
jamais écrit dans le code.

---

## Étape 1 — Google Cloud Console

### 1.1 Créer le projet et l'écran de consentement

1. Va sur [console.cloud.google.com](https://console.cloud.google.com)
2. Crée un projet (nom libre, ex. `MemoPatte`)
3. **APIs & Services → OAuth consent screen**
   - Type : **External**
   - Nom de l'app : `MémoPatte`
   - Email d'assistance et de contact : ton adresse
   - Tant que l'app est en mode *Testing*, seuls les comptes que tu ajoutes
     dans **Test users** pourront se connecter — pense à y mettre ton propre
     compte Google, sinon la connexion échouera sur ton téléphone.

### 1.2 Créer l'identifiant **Web** (celui utilisé par le code)

**APIs & Services → Credentials → Create credentials → OAuth client ID**

- Application type : **Web application**
- Name : `MemoPatte Web`
- Aucune URI de redirection à ajouter

➡️ Note le **Client ID** obtenu (finit par `.apps.googleusercontent.com`).
C'est le `webClientId` du code et de Supabase.

### 1.3 Créer l'identifiant **Android**

**Create credentials → OAuth client ID** à nouveau

- Application type : **Android**
- Name : `MemoPatte Android`
- **Package name** :
  ```
  com.gaellebriet.memopatte
  ```
- **SHA-1 certificate fingerprint** (ton keystore debug) :
  ```
  <SHA-1 du keystore debug — ré-extraire avec la commande keytool ci-dessous>
  ```

➡️ Note aussi ce Client ID.

> Pour ré-extraire ce SHA-1 plus tard :
> ```bash
> keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
> ```

| Élément                             | Rôle                                                                                                            |
|-------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| keytool                             | Outil livré avec le JDK (celui de Java 21 qu'on a installé pour Gradle). Il inspecte les magasins de clés       |
| -list -v                            | Liste le contenu, en mode verbeux — c'est -v qui fait apparaître les empreintes ; sans lui tu n'as qu'un résumé |
| -keystore ~/.android/debug.keystore | Le fichier à inspecter                                                                                          |
| -alias androiddebugkey              | La clé à l'intérieur du fichier (un keystore peut en contenir plusieurs)                                        |
| -storepass android -keypass android | Les mots de passe                                                                                               |


### ⚠️ 1.4 Le piège du keystore de release

Le SHA-1 ci-dessus est celui du keystore **debug**. Le keystore de **release**
n'existe pas encore — il sera créé au [ticket #53](https://github.com/GaelleBriet/memo-patte-vue/issues/53) (build signé).

**Conséquence si tu l'oublies : la connexion Google fonctionnera parfaitement en
développement et échouera silencieusement en production.** C'est une erreur
classique et difficile à diagnostiquer.

Au moment du build signé, reviens ici et ajoute le SHA-1 du keystore de release
au même identifiant Android (Google en accepte plusieurs) :

```bash
keytool -list -v -keystore <chemin-du-keystore-release> -alias <alias>
```

---

## Étape 2 — Supabase Dashboard

**Authentication → Providers → Google**

1. Active le provider
2. Dans **Client IDs**, colle les **deux** identifiants de l'étape 1, séparés
   par une virgule :
   ```
   <WEB_CLIENT_ID>,<ANDROID_CLIENT_ID>
   ```

### ⚠️ Trois champs à NE PAS remplir

La documentation Capgo est explicite là-dessus, et c'est contre-intuitif :

| Champ                       | Action                |
|-----------------------------|-----------------------|
| `Client Secret (for OAuth)` | **laisser vide**      |
| `Callback URL (for OAuth)`  | **ne pas configurer** |
| `Skip nonce checks`         | **laisser désactivé** |

Ces champs servent au flux OAuth classique par navigateur. Ici on utilise le
flux natif (`signInWithIdToken`), qui n'en a pas besoin — et les activer casse
la vérification du nonce.

---

## Étape 3 — Le projet

### 3.1 Installer le plugin

```bash
pnpm add @capgo/capacitor-social-login
```

Puis synchroniser le projet natif :

```bash
pnpm cap:sync
```

### 3.2 Où va le code

Rien à coder dans ce ticket — mais pour situer, au ticket [#6](https://github.com/GaelleBriet/memo-patte-vue/issues/6) :

- l'initialisation du plugin avec le **Web client ID** ira dans
  `src/core/supabase/` (à côté du client), pas dans un composant ;
- l'appel `signInWithIdToken` ira dans `src/features/auth/auth.repository.ts` —
  la règle ESLint du projet interdit d'y toucher depuis un composant ou un store.

Le Web client ID n'est pas un secret (il est visible dans toute app Android),
mais par cohérence avec le reste il ira dans `.env` / `.env.example` sous
`VITE_GOOGLE_WEB_CLIENT_ID`.

**Sur le nonce** : le flux attend un couple — le `rawNonce` est transmis à
Supabase, et c'est son empreinte SHA-256 qui part vers Google. Supabase compare
les deux. C'est la partie la plus facile à rater ; le [code d'exemple officiel](https://github.com/Cap-go/capacitor-social-login/blob/main/example-app/src/supabaseAuthUtils.ts)
fait autorité, à suivre tel quel plutôt qu'à réinventer.

---

## Étape 4 — Tester sur un vrai téléphone

Le test navigateur ne prouve rien ici : c'est le flux **natif** qu'on valide.

```bash
# terminal 1
pnpm dev

# terminal 2
pnpm dev:mobile
```

À vérifier :

- [ ] Le sélecteur de compte Google natif s'ouvre (pas un onglet navigateur)
- [ ] Après sélection, retour automatique dans l'app
- [ ] L'utilisateur apparaît dans **Supabase → Authentication → Users**
- [ ] Une seconde connexion avec le même compte Google ne crée **pas** un
      doublon d'utilisateur

---

## Erreurs fréquentes

| Symptôme | Cause probable |
|---|---|
| `invalid audience` | Les Client IDs de Supabase ne correspondent pas exactement à ceux de Google Cloud Console |
| Rien ne se passe au clic | Le SHA-1 enregistré ne correspond pas au keystore qui a signé l'APK installé |
| `access_denied` | L'écran de consentement est en *Testing* et ton compte n'est pas dans **Test users** |
| Marche en debug, échoue en prod | Le SHA-1 du keystore de release n'a pas été ajouté (voir 1.4) |

---

## Checklist du ticket #65

- [ ] Plugin choisi et compatibilité Capacitor 8 vérifiée *(déjà fait : 8.4.5)*
- [ ] Projet + écran de consentement créés dans Google Cloud Console
- [ ] Client ID **Web** créé
- [ ] Client ID **Android** créé (package name + SHA-1 debug)
- [ ] Provider Google activé dans Supabase, avec les deux Client IDs
- [ ] Plugin installé, `pnpm cap:sync` passé
- [ ] Connexion testée de bout en bout sur téléphone physique
- [ ] SHA-1 de release noté comme à ajouter au ticket #53

---

## Sources

- [Capgo — Supabase Google Login, setup général](https://capgo.app/docs/plugins/social-login/supabase/google/general/)
- [Capgo — Supabase Google Login sur Android](https://capgo.app/docs/plugins/social-login/supabase/google/android/)
- [Code d'exemple officiel (`supabaseAuthUtils.ts`)](https://github.com/Cap-go/capacitor-social-login/blob/main/example-app/src/supabaseAuthUtils.ts)
