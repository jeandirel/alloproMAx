# Gestion de compte — Allo Pro

Module de gestion de compte (client et professionnel) : connexion Google/téléphone, profil,
notifications, appareils connectés, pause/suppression de compte, cycle de vie du profil
professionnel, modération admin, journal d'audit. Additif uniquement — aucune table existante
supprimée, aucun reset de base, aucune fonctionnalité en production modifiée sans compatibilité
ascendante.

## 1. Architecture

- **Next.js 16 (App Router)**, `middleware.ts` renommé `proxy.ts` dans cette version (runtime
  Node.js uniquement, pas d'override `runtime`, export nommé `proxy`).
- **NextAuth v5** (`next-auth@5.0.0-beta.32`, `@auth/prisma-adapter`) avec **`session.strategy:
  'jwt'`** — conservé tel quel, pour une raison précise vérifiée dans le code source
  (`@auth/core`) : un provider de type Credentials produit **toujours** un JWT, quelle que soit la
  stratégie configurée ; seuls les providers oauth/oidc/email/webauthn utilisent réellement des
  sessions "database". Comme la connexion par téléphone et par e-mail/mot de passe sont toutes
  deux des providers Credentials, `strategy: 'database'` était inutilisable.
- **Sessions révocables gérées manuellement** : le callback `jwt` (`auth.ts`) crée une ligne
  `Session` en base à chaque connexion fraîche (tous providers confondus) et stocke son `id` dans
  `token.sessionId`. À chaque lecture de session ultérieure, ce callback revalide que la ligne
  existe encore et n'est pas expirée ; sinon il vide `token.id`/`token.sessionId`, ce que le
  callback `session` traduit en `session.user === undefined`. Le layout applicatif existant
  (`app/(app)/layout.tsx`, `if (!session?.user) redirect('/login')`) bénéficie donc de la
  révocation à distance (ex. suspension admin) **sans aucune modification**.
- **DAL (Data Access Layer)** — `lib/account-guard.ts`, suivant le modèle documenté par Next.js
  lui-même (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`) : `proxy.ts` ne fait
  que des vérifications optimistes (présence d'un cookie de session, aucun accès base), pendant que
  `getCurrentUser`/`requireUser`/`requireAdmin`/`requireApiUser`/`requireAdminApi` relisent l'état
  réel (rôle, statut de compte, professionnel associé) depuis la base à chaque appel. **Aucune
  route ni page ne fait confiance à un rôle mis en cache dans le JWT/cookie.**
- **Providers pluggables** (`lib/sms.ts` pour l'envoi de code par SMS, mirroring `lib/kyc.ts`) :
  interface + implémentation "console" sûre par défaut (jamais d'échec silencieux) + sélection par
  variable d'environnement qui ne bascule sur un vrai fournisseur que si ses identifiants sont
  complets.
- **Anonymisation, jamais de suppression SQL du compte** : après la période de rétractation,
  `anonymizeUser` (lib/account-lifecycle.ts) scrube les données personnelles (nom, e-mail,
  téléphone, mot de passe, image) et marque `accountStatus: 'deleted'`, mais conserve la ligne
  `User` pour préserver l'intégrité référentielle des réservations/avis/messages historiques.

## 2. Existant vs ajouté

**Existant (non modifié)** : NextAuth, modèles Prisma `User`/`Professional`/`Session`/`Account`,
`User.suspended`/`Professional.suspended` (booléens de modération déjà lus par le code de
production, ex. `lib/public-professionals.ts`), le "Workspace" de démonstration
(`lib/marketplace-engine.ts`, `components/workspace-provider.tsx`, `app/api/workspace/*`,
`components/admin-dashboard.tsx`, `components/pro-dashboard.tsx`, `app/(app)/espace-pro/*`) —
resté strictement hors périmètre.

**Ajouté** :
- Connexion réelle par téléphone (OTP par SMS) et Google OAuth (conditionnel), en complément de
  e-mail/mot de passe — remplace l'objectif initial "pas d'e-mail/mot de passe en primaire" par une
  mise en avant de ces deux méthodes dans l'UI, l'e-mail/mot de passe restant disponible.
- Cycle de vie du compte : pause, demande de suppression (délai de rétractation), annulation,
  suppression définitive différée (anonymisation).
- Cycle de vie du profil professionnel, **distinct** du compte utilisateur : pause, réactivation,
  suppression du profil seul (conserve le compte, l'historique de réservations, avis, versements).
- Gestion des appareils connectés (liste des sessions actives, révocation individuelle ou globale).
- Préférences de notification et consentement marketing.
- Modération admin : suspension/réactivation d'un compte ou d'un profil professionnel, avec motif
  obligatoire et journal d'audit.
- Suppression différée automatique via un cron quotidien.

## 3. Tables modifiées / créées

Toutes les colonnes ajoutées sont **nullable ou pourvues d'une valeur par défaut compatible** avec
les lignes existantes (aucun `NOT NULL` sans défaut, aucun `DROP`).

| Table | Changement |
|---|---|
| `User` | + `accountStatus`, `pausedAt`, `suspendedAt`, `suspensionReason`, `suspendedById`, `deletionRequestedAt`, `deletionScheduledAt`, `deletedAt`, `authProvider`, `phoneVerifiedAt`, `lastLoginAt`, `marketingConsent`, `notifyBookingUpdates`, `notifyMessages`, `notifySecurity`, `notifyMarketing` ; `phone` passe en `UNIQUE` (existait déjà comme colonne) |
| `Professional` | + `paused`, `pausedAt`, `suspendedAt`, `suspensionReason`, `suspendedById`, `deletedAt` |
| `Session` | + `userAgent`, `ipAddress`, `createdAt`, `lastUsedAt` |
| `PhoneOtp` | nouvelle table (code OTP haché, expiration, tentatives) |
| `AuditLog` | réutilisée telle quelle (modèle générique déjà existant) pour toutes les actions de ce module |

`User.suspended` / `Professional.suspended` (booléens pré-existants) sont **maintenus en synchronisation**
avec `accountStatus`/`suspended*` par chaque fonction de `lib/account-lifecycle.ts`, pour ne rien
casser des lectures déjà en production.

## 4. Migration

`prisma/migrations/20260926120000_add_account_lifecycle/migration.sql` — rédigée à la main (la base
alors utilisée par les outils locaux était injoignable au moment de l'écrire, ce qui empêchait
`prisma migrate dev` de passer par une shadow database — cause exacte identifiée depuis, voir
§13.1). Contenu : `ALTER TABLE` additifs uniquement, une nouvelle table `PhoneOtp`, les index de
recherche/modération, et deux `FOREIGN KEY` (`suspendedById`) en `ON DELETE SET NULL`. Aucun
`DROP`, aucune perte de données. Audit complet, opération par opération, classé
SAFE/CHECK_REQUIRED/RISKY : `docs/account-management-migration-review.md`.

**État** : connectivité rétablie (§13.1) ; `npm run db:preflight` exécuté avec succès contre la base
de développement (`db.prisma.io`) — 0 doublon et 0 chaîne vide sur `User.phone`, migration non
encore appliquée sur cette base. Voir §13.3 pour la procédure avant `prisma migrate deploy`.

## 5. Endpoints ajoutés

Tous protégés par `lib/account-guard.ts` (`requireApiUser`/`requireAdminApi` — 401/403 explicites,
jamais un rôle lu depuis un cookie).

| Route | Méthode | Description |
|---|---|---|
| `/api/account` | GET/PATCH | Profil courant (lecture complète, mise à jour nom + préférences) |
| `/api/account/pause` | POST | Met le compte en pause |
| `/api/account/reactivate` | POST | Réactive un compte en pause |
| `/api/account/delete-request` | POST | Démarre le délai de rétractation (30 jours) |
| `/api/account/cancel-delete` | POST | Annule une suppression demandée |
| `/api/sessions` | GET/DELETE | Liste des appareils connectés / déconnexion de tous les autres |
| `/api/sessions/[id]` | DELETE | Déconnexion d'un appareil précis (vérifie la propriété) |
| `/api/professional` | DELETE | Supprime le **profil** professionnel uniquement |
| `/api/professional/pause` \| `/reactivate` | POST | Pause/réactivation du profil professionnel |
| `/api/admin/users` | GET | Liste paginée/recherchable des comptes (admin) |
| `/api/admin/users/[id]/suspend` \| `/unsuspend` | POST | Suspension/réactivation d'un compte (admin, motif requis) |
| `/api/admin/professionals/[id]/suspend` \| `/unsuspend` | POST | Idem pour un profil professionnel |
| `/api/cron/process-deletions` | GET | Exécute les suppressions arrivées à échéance (protégé par `CRON_SECRET`) |

## 6. Pages et composants ajoutés

- `app/(app)/profil/compte/` — page "Sécurité et confidentialité" (infos, notifications, appareils
  connectés, pause/suppression de compte, contrôles du profil professionnel si applicable). Lien
  ajouté dans `app/(app)/profil/profil-client.tsx` (démo Workspace laissée intacte).
- `app/(app)/administration/comptes/` — modération admin (recherche, filtre par statut, suspension
  avec motif). Accessible directement à cette URL ; le tableau de bord démo
  (`components/admin-dashboard.tsx`) n'a volontairement **pas** été modifié (hors périmètre établi).
- `components/phone-login.tsx` — connexion/inscription par téléphone (SMS), intégrée dans
  `app/login` et `app/signup`.
- Bouton "Continuer avec Google" (login + signup), affiché uniquement si
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` sont configurés (`isGoogleAuthEnabled()`).

## 7. Sécurité

- **Aucune confiance dans un rôle/statut client** : chaque route relit `role`/`accountStatus`
  depuis Prisma via `lib/account-guard.ts`, jamais depuis le JWT/cookie.
- **Choke-point unique** : `auth.ts`'s callback `signIn` refuse la connexion (tous providers) si le
  compte est `suspended` ou `deleted`, avant même l'émission d'un token.
- **Révocation immédiate** : suspendre un compte (`adminSuspendUser`) supprime toutes ses lignes
  `Session` — la prochaine requête de ce compte, où qu'elle soit dans l'app, perd sa session.
- **OTP téléphone** : code haché (jamais stocké en clair), limité à 5 tentatives, expiration
  courte, un seul usage (`used`), limitation de débit par IP/téléphone/global
  (`lib/rate-limit.ts`, convention existante réutilisée à l'identique).
- **Isolation profil pro vs compte** : `deleteProfessionalProfile` ne touche jamais `User` ; à
  l'inverse, la suppression de compte marque aussi le profil professionnel lié comme supprimé
  (`anonymizeUser`), jamais l'inverse implicite.
- **Cron protégé** : `/api/cron/process-deletions` refuse de s'exécuter (503) si `CRON_SECRET`
  n'est pas configuré, et vérifie l'en-tête `Authorization: Bearer` envoyé automatiquement par
  Vercel pour les tâches déclarées dans `vercel.json`.

## 8. Tests

`scripts/account-management.test.ts` (ajouté à `npm test`) — logique pure, sans dépendance base de
données : sélection du fournisseur SMS (`lib/sms.ts`, y compris le repli sûr si `SMS_PROVIDER=twilio`
sans identifiants), normalisation du rôle de signup, allowlist des rôles admin.

**Explicitement non exécutés** (nécessitent un environnement d'intégration dédié, distinct de la
base de développement partagée utilisée par les scripts de diagnostic ci-dessous — voir §13.5) :
callbacks `jwt`/`session`/`signIn` de bout en bout, toutes les fonctions de
`lib/account-lifecycle.ts`, les routes `/api/account/**`, `/api/sessions/**`,
`/api/professional/**`, `/api/admin/**`, `/api/cron/process-deletions`, et `requestPhoneOtp`. Le
détail exact de ce qui est couvert vs. non couvert est documenté en commentaire en fin de ce
fichier de test.

**Diagnostic DB (lecture seule, jamais de migration/écriture)** :
- `npm run db:check` — DNS, TCP, connexion Postgres réelle, latence.
- `npm run db:preflight` — les 12 vérifications de §13.4 (DNS/IP/TCP/Postgres/statut de migration/
  doublons `phone`/chaînes vides).
- `npm run account:predeploy` — synthèse "SAFE TO MIGRATE" avant de lancer soi-même
  `prisma migrate deploy` (ce script ne l'exécute jamais automatiquement).
- `npx tsx scripts/db-network-diagnostics.ts` — DNS + classification d'IP privée/publique + TCP,
  sans toucher à Postgres (utile quand la base elle-même est down).

## 9. Lint / build

- `npm run typecheck` (`tsc --noEmit`) : **0 erreur**.
- `npx eslint .` : **0 erreur**, 43 avertissements pré-existants (aucun dans les fichiers de ce
  module).
- `npm run build` (`prisma generate && next build --webpack`) : **build réussi**, toutes les routes
  listées correctement, `proxy.ts` reconnu comme Middleware.
- `npm test` : toutes les suites passent (existantes + nouvelle).

## 10. Branche et commits

Branche : `feat/account-management` (créée à partir de `redesign/real-marketplace`). Commits
séparés par domaine fonctionnel (auth/session, DAL + cycle de vie, endpoints API, UI compte, UI
admin, tests/docs).

## 11. Aperçu (preview) et déploiement

**Non déployé automatiquement.** Le pipeline existant (Vercel) n'a pas été modifié. Avant tout
merge/déploiement production :
1. Exécuter `npm run account:predeploy` contre la base cible (§13.3/§13.4) et obtenir
   `SAFE TO MIGRATE: YES` avant d'exécuter soi-même `prisma migrate deploy`.
2. Renseigner en production les variables d'environnement listées dans `.env.example`
   (`GOOGLE_CLIENT_ID`/`SECRET`, `SMS_PROVIDER`/`TWILIO_*`, `CRON_SECRET`).
3. Ouvrir une Pull Request vers `main` pour obtenir une preview Vercel, valider manuellement les
   parcours (connexion téléphone, pause/suppression de compte, modération admin) avant merge.

## 12. Points ouverts

- **Connectivité DB résolue** (voir §13 pour le diagnostic complet) : la base réellement utilisée
  par l'application (`db.prisma.io`, Prisma Postgres) est joignable et fonctionnelle ; c'est
  l'ancienne variable `DATABASE_URL` du fichier `.env` (base de sandbox de développement Abacus.AI,
  réseau privé) qui ne l'était pas. La migration a été auditée et pré-validée (§13.3/§13.4) mais
  **n'a pas été appliquée** : `prisma migrate deploy` reste une action volontaire à exécuter
  soi-même après avoir confirmé l'environnement cible et le mécanisme de sauvegarde (§13.6).
- **Séparation Production/Development non confirmée programmatiquement** : `DATABASE_URL` est
  marquée "Sensitive" dans l'environnement Vercel Production (valeur jamais révélée, même à
  l'organisation propriétaire, par conception de cette option Vercel) — impossible de vérifier par
  un outil si elle pointe vers la même instance Prisma Postgres que Development ou vers une
  instance séparée. Seule action manuelle nécessaire : dans le dashboard Vercel du projet
  `allopro-m-ax` (Settings → Environment Variables), ouvrir `DATABASE_URL` pour l'environnement
  Production et confirmer si l'hôte est bien `db.prisma.io` (même instance) ou un hôte différent —
  sans copier la valeur elle-même hors du dashboard.
- **Google OAuth** : les comptes créés via Google reçoivent par défaut `role: 'user'` — il n'y a
  pas de relais du rôle choisi sur `/signup` à travers la redirection OAuth (jugé disproportionné
  pour ce périmètre). Un professionnel s'inscrivant via Google doit ensuite passer par le parcours
  d'onboarding existant pour créer son profil professionnel.
- **Fournisseurs non provisionnés** : tant que `GOOGLE_CLIENT_ID`/`SECRET` et les identifiants
  Twilio ne sont pas renseignés en production, le bouton Google reste masqué et l'envoi de SMS
  reste en mode "console" (code journalisé côté serveur, jamais envoyé réellement) — comportement
  sûr par défaut, jamais un échec silencieux qui prétendrait avoir envoyé un SMS.
- **Tableau de bord admin démo** (`components/admin-dashboard.tsx`) volontairement non relié à la
  nouvelle page de modération `/administration/comptes` — reste accessible par URL directe.

## 13. Base de données — connectivité, migration et sécurité

### 13.1 Database connectivity — cause racine du P1001

Deux `DATABASE_URL` différentes coexistent dans ce projet, dans deux fichiers différents :

| Fichier | Hôte | Nature |
|---|---|---|
| `.env` | `db-1614bea1d5.db007.hosteddb.reai.io` | Base de sandbox de développement fournie par **Abacus.AI** (confirmé par `AWS_BUCKET_NAME=abacusai-apps-...` dans ce même fichier) |
| `.env.local` | `db.prisma.io` | **Prisma Postgres**, connexion directe (créé par `# Created by Vercel CLI`, tiré de l'environnement Vercel "development" du projet `allopro-m-ax`) |

Preuves techniques recueillies (host masqué, IP publique non sensible) :
- `Resolve-DnsName`/`nslookup db-1614bea1d5.db007.hosteddb.reai.io` → `172.21.254.215` — plage
  **RFC1918 privée** (`172.16.0.0–172.31.255.255`).
- Test TCP direct (`node net.Socket`, port 5432) vers cette IP : **TIMEOUT** après 5s — confirme
  qu'aucune route publique n'existe vers cet hôte depuis un poste externe au réseau Abacus.AI.
- `nslookup db.prisma.io` → `217.69.3.105` / `217.69.6.73` — IP **publiques**.
- Test TCP vers `db.prisma.io:5432` : **connecté en ~20 ms**.
- `npx prisma migrate status` avec `DATABASE_URL` pointée explicitement sur `db.prisma.io` :
  connexion réussie, 3 migrations trouvées, 1 en attente (`20260926120000_add_account_lifecycle`).
  Utilisateur Postgres retourné : `prisma_migration` — rôle dédié aux migrations, cohérent avec le
  provisionnement standard d'une base Prisma Postgres.

**Cause exacte de la confusion** (au-delà de "la base est privée") : Next.js charge `.env.local`
avant `.env` (ordre documenté dans
`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`), donc `next dev`/`next
build` utilisent déjà la bonne base (`db.prisma.io`) sans aucune modification. Mais **le CLI Prisma
et `tsx` n'appliquent pas cet ordre** : `@prisma/client` charge automatiquement `.env` (uniquement
ce fichier) dès son import, et comme `dotenv` ne réécrit jamais une variable déjà présente dans
`process.env`, toute tentative ultérieure de charger `.env.local` devient un no-op pour
`DATABASE_URL`. C'est pour cela que `npx prisma migrate status` (lancé nu, sans variable
explicite) retournait P1001 alors que l'application elle-même fonctionne normalement.

**Correctif appliqué** : `scripts/lib/load-app-env.ts` reproduit l'ordre de précédence exact de
Next.js (`process.env` > `.env.$(NODE_ENV).local` > `.env.local` > `.env.$(NODE_ENV)` > `.env`) et
**doit être appelé avant tout import de `@prisma/client`** (voir le commentaire en tête de ce
fichier et son usage dans `scripts/db-connectivity-check.ts`, `scripts/db-preflight.ts`,
`scripts/account-management-predeploy.ts`, `scripts/db-network-diagnostics.ts`). Aucun fichier
`.env*` n'a été modifié ni supprimé ; `.env` reste tel quel (il peut encore servir à autre chose,
et le corriger à l'aveugle sortait du périmètre demandé).

### 13.2 Local vs private network

L'hôte Abacus.AI (`hosteddb.reai.io`) est conçu pour n'être joignable que depuis l'intérieur du
réseau qui l'héberge (sandbox de développement Abacus.AI) — ce n'est pas une base à laquelle ce
projet doit se connecter pour le développement local ou la production ; elle semble être un
résidu du scaffold initial. La base réellement utilisée en développement (`db.prisma.io`, Prisma
Postgres) est, elle, un endpoint externe officiel : documentée par Prisma, protégée par
`sslmode=require`, avec un rôle Postgres dédié (`prisma_migration`) et une authentification par
identifiants. Elle n'a pas été rendue publique pour les besoins de ce diagnostic — elle l'était
déjà, par conception du produit Prisma Postgres.

### 13.3 Migration preflight

`npm run db:preflight` (`scripts/db-preflight.ts`) — lecture seule, 12 vérifications dans l'ordre :
DATABASE_URL configurée → URL valide → hostname → DNS → classification IP privée/publique → port
TCP → connexion Postgres → connectivité Prisma → statut de migration → doublons `User.phone` →
chaînes vides `User.phone` → pointeur vers `docs/account-management-migration-review.md`. Ne lance
jamais `migrate dev`/`deploy`/`db push`/`reset`.

Résultat obtenu contre `db.prisma.io` (2026-09-26) : tous les checks bloquants au vert,
`SAFE TO MIGRATE: YES` (1 seule base de développement, 1 utilisateur, 0 professionnel — voir
`docs/account-management-migration-review.md` pour le détail).

### 13.4 Staging migration

Aucune base de "staging" distincte n'a été identifiée dans ce projet (un seul environnement Vercel
"development" avec sa propre `DATABASE_URL`, une "Production" dont la valeur est masquée). La base
de développement (`db.prisma.io`) a servi de validation de facto pour ce diagnostic (lecture seule
uniquement : `SELECT`, `information_schema`, `pg_indexes` — aucune écriture, aucun DDL). Workflow
recommandé avant toute application réelle, une fois l'environnement cible confirmé :
`npm run account:predeploy` → confirmation manuelle de sauvegarde (§13.6) → `prisma migrate deploy`
→ tests d'intégration → smoke tests.

### 13.5 Production migration

**Non exécutée.** `prisma migrate deploy` n'a été lancé contre aucune base par ce travail — la
tentative de le faire contre la base de développement a été explicitement bloquée par les
autorisations de l'environnement d'exécution (catégorie "Production Deploy"), ce qui est cohérent
avec la règle du projet de ne jamais migrer sans confirmation humaine explicite. La seule action
technique restante est de lancer `npx prisma migrate deploy` soi-même (voir "Prochaine action"
en fin de document), après avoir tranché le point ouvert de la section 12 sur la séparation
Production/Development.

### 13.6 Rollback / recovery

Aucun mécanisme de sauvegarde/PITR n'a pu être confirmé par un outil : le CLI Prisma expose bien
des sous-commandes `prisma platform` (`--early-access`) pour la Prisma Data Platform, mais rien
sous `environment`/`project` ne gère les sauvegardes, et aucune session authentifiée
(`prisma platform auth login`) n'existe dans cet environnement — se connecter est une action de
compte que ce travail n'a pas prise. **Seule action manuelle nécessaire** : dans la console Prisma
Data Platform (console.prisma.io), sur le projet correspondant à `allopro-m-ax`, ouvrir l'onglet de
la base `db.prisma.io` et vérifier si un point de restauration (backup/PITR) est proposé pour le
plan actuel, avant toute migration sur une base contenant des données réelles.

### 13.7 Required secrets

Présence vérifiée par nom de variable uniquement (jamais la valeur) :

| Variable | Présente | Effet si absente |
|---|---|---|
| `DATABASE_URL` | `.env` et `.env.local` (deux valeurs différentes, voir §13.1) | Build/démarrage impossible |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Non renseignées (placeholders vides dans `.env.example`) | Bouton Google masqué (`isGoogleAuthEnabled()`), aucun échec |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | Non renseignées | `lib/sms.ts` retombe sur le fournisseur `console` (code journalisé serveur, jamais un vrai SMS, jamais un échec silencieux prétendant avoir envoyé) |
| `CRON_SECRET` | À vérifier en production | `/api/cron/process-deletions` refuse (503) de s'exécuter sans elle |

### 13.8 Phone uniqueness

La normalisation existe déjà et est appliquée **avant** stockage, pour tout numéro saisi au
téléphone (`app/login/actions.ts` → `lib/pawapay.ts::normalizePhone`) : accepte `074345678`,
`74345678`, `+241 074 34 56 78`, `0024174345678` et produit systématiquement `24174345678` (indicatif
Gabon `241`, sans `+`, sans séparateurs) — testé dans `scripts/payment-rules.test.ts`. Conséquence :
l'index `UNIQUE` posé par la migration ne peut pas être contourné par un nouveau compte utilisant un
format différent du même numéro ; le risque résiduel ne concerne que d'éventuelles lignes
antérieures à l'introduction de cette normalisation, ce que `npm run db:preflight`
(vérification n°10) détecte explicitement avant toute migration. Voir aussi
`docs/account-management-migration-review.md` (section `User_phone_key`).

### 13.9 Troubleshooting P1001

```
Error: P1001: Can't reach database server at `db-1614bea1d5.db007.hosteddb.reai.io:5432`
```

1. Ce message signifie que le CLI Prisma a résolu `DATABASE_URL` vers l'hôte Abacus.AI (sandbox de
   développement), pas vers `db.prisma.io`. Lancer `npm run db:check` : s'il affiche
   `DNS: PRIVATE_IP` puis `TCP: FAIL`, c'est confirmé.
2. Cause : `.env` contient encore l'ancienne valeur, et un import direct de `@prisma/client` (ou de
   `lib/prisma.ts`) avant `loadAppEnv()` la fige dans `process.env` avant que `.env.local` ait pu la
   remplacer (§13.1).
3. Correctif : utiliser les scripts fournis (`npm run db:check`, `npm run db:preflight`,
   `npm run account:predeploy`), qui appliquent déjà le bon ordre de chargement — ou, pour une
   commande Prisma ponctuelle, exporter `DATABASE_URL` explicitement depuis `.env.local` avant de
   lancer la commande, plutôt que de compter sur le chargement automatique du CLI.
4. Ce message n'indique **pas** une base cassée ou une action à corriger côté hébergeur — l'hôte
   Abacus.AI répond simplement à un réseau différent de celui de ce poste, ce qui est son
   fonctionnement prévu.
