# Auto Backup Android — ce qui est sauvegardé, ce qui ne l'est pas

Filet de sécurité **gratuit** pour les utilisateurs sans compte Plus (décision
du 2026-09-07, `docs/product/05-monetisation.md`). Android sauvegarde les
données de l'app sur le Drive Google de l'utilisateur, sans aucun serveur
MémoPatte, et les restaure à la réinstallation ou lors de la configuration
d'un nouveau téléphone avec le même compte Google. Ticket : #82 (0.4).

## Comment ça marche

- Activé par `android:allowBackup="true"` dans `AndroidManifest.xml` (déjà le
  cas dans le template Capacitor) et piloté par deux fichiers de règles :
  `res/xml/backup_rules.xml` (API 23-30) et `res/xml/data_extraction_rules.xml`
  (API 31+, couvre aussi le transfert direct entre appareils).
- Limite : **25 Mo** par app. Au-delà, rien n'est sauvegardé du tout.
- Cadence : environ une fois par jour, appareil inactif, en charge, en Wi-Fi.
  Ce n'est pas une synchronisation : c'est du « best effort ».
- L'utilisateur peut l'avoir désactivé (Paramètres Android → Google →
  Sauvegarde). MémoPatte n'a aucun moyen de le forcer.
- La restauration ne se produit qu'à la **première installation** de l'app sur
  l'appareil (réinstallation ou nouveau téléphone), jamais à la demande.

## Règles retenues

| Domaine Android | Chemin | Décision | Pourquoi |
|---|---|---|---|
| `database` | `.` (tout `databases/`) | **inclus** | La base SQLite de `@capacitor-community/sqlite` : animaux, vaccins, traitements, poids, rappels. Quelques centaines de Ko pour un usage normal. |
| `file` | `photos/` | exclu | Convention : les photos d'animaux vivent dans `files/photos/` (Capacitor Filesystem, `Directory.Data`). Une seule photo peut peser plus que toute la base ; avec 25 Mo de plafond, les inclure ferait sauter la sauvegarde entière. Les photos sont dans Plus. |
| `root` | `app_webview/` | exclu | Stockage du WebView : localStorage, dont la session Supabase. Un autre appareil ne doit pas hériter d'une session. |
| `sharedpref` | `CapacitorStorage.xml` | exclu | Préférences Capacitor, dont le drapeau « cet appareil a un compte Plus » (ticket 1.2). Il est propre à l'appareil. |

Avec un `<include>` présent, Android ne sauvegarde **que** ce qui est inclus ;
les `<exclude>` sont là pour rendre l'intention lisible.

## Conséquences pour le code

- Le chemin des photos doit être exactement `photos/` sous `Directory.Data`
  (ticket 3.2 / #15). Tout autre emplacement finirait dans la sauvegarde.
- Après une restauration Android, la base revient **sans** les notifications
  programmées : le ticket 8.4 (#41) les reprogramme au premier lancement.
- Le drapeau Plus n'étant pas restauré, un abonné qui change de téléphone
  passe par « Je suis déjà abonné » (Paramètres) puis la restauration Plus
  (8.3), qui, elle, ramène aussi les photos.
- Ne jamais chiffrer la base avec une clé propre à l'appareil (SQLCipher avec
  clé locale), sinon la sauvegarde restaurée serait illisible.

## Tester sans attendre le cycle quotidien

```bash
adb shell bmgr enabled                              # doit répondre "enabled"
adb shell bmgr backupnow com.gaellebriet.memopatte  # force une sauvegarde
adb shell pm uninstall com.gaellebriet.memopatte    # puis réinstaller depuis Android Studio ou Play
adb logcat -s BackupManagerService BackupXmlParserLogging   # vérifie les règles appliquées
```

Après réinstallation, l'app doit retrouver animaux et rappels, sans photos
(placeholder attendu), et reprogrammer les notifications.

## À vérifier sur appareil (ticket #82)

- Le chemin réel de la base du plugin SQLite sur Android (attendu :
  `/data/data/com.gaellebriet.memopatte/databases/memopatteSQLite.db`).
- La taille de la base après un jeu de données réaliste (3 animaux, 2 ans
  d'historique) : doit rester très en dessous de 25 Mo.
- Que `app_webview/` est bien le nom du répertoire WebView sur les versions
  d'Android ciblées (minSdk 24).
