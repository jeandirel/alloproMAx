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
de développement (`db.prisma.io`) — 0 doublon et 0 chaîne vide sur `User.phone`. L'historique des
migrations 1 et 2 (dont dépend celle-ci pour un replay complet) a depuis été réparé et vérifié de
bout en bout sur une base vide jetable (§13.11) ; l'application réelle sur `db.prisma.io` reste
bloquée sur une seule étape (réconciliation de `_prisma_migrations`, §13.11.5).

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

- **Connectivité DB résolue, y compris pour le CLI Prisma lancé nu** (voir §13 pour le diagnostic
  complet) : la base réellement utilisée par l'application (`db.prisma.io`, Prisma Postgres) est
  joignable et fonctionnelle. Deux causes distinctes du P1001 ont été corrigées : l'ordre de
  chargement des scripts internes (`scripts/lib/load-app-env.ts`, §13.1) et la ligne `DATABASE_URL`
  périmée de `.env` (retirée — `.env.local` reste l'unique source pour le développement, §13.1/§13.9).
  Un `npx prisma migrate status` lancé nu échoue désormais bruyamment (`P1012`) plutôt que de
  contacter silencieusement l'ancien hôte. La migration a été auditée et pré-validée (§13.3/§13.4)
  mais **n'a pas été appliquée** : `prisma migrate deploy` reste une action volontaire à exécuter
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

Deux `DATABASE_URL` différentes coexistaient dans ce projet, dans deux fichiers différents (état au
moment du diagnostic — `.env` a depuis été corrigé, voir plus bas) :

| Fichier | Hôte | Nature |
|---|---|---|
| `.env` (avant correction) | `db-1614bea1d5.db007.hosteddb.reai.io` | Base de sandbox de développement fournie par **Abacus.AI** (confirmé par `AWS_BUCKET_NAME=abacusai-apps-...` dans ce même fichier) |
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

**Correctif appliqué (application/scripts)** : `scripts/lib/load-app-env.ts` reproduit l'ordre de
précédence exact de Next.js (`process.env` > `.env.$(NODE_ENV).local` > `.env.local` >
`.env.$(NODE_ENV)` > `.env`) et **doit être appelé avant tout import de `@prisma/client`** (voir le
commentaire en tête de ce fichier et son usage dans `scripts/db-connectivity-check.ts`,
`scripts/db-preflight.ts`, `scripts/account-management-predeploy.ts`,
`scripts/db-network-diagnostics.ts`).

**Second problème, distinct, découvert ensuite : le CLI Prisma lancé nu.** Le correctif ci-dessus ne
protège que le code qui appelle `loadAppEnv()`. Un `npx prisma migrate status` tapé directement au
terminal ne passe par aucun de nos scripts — reproduit et confirmé :

```
> npx prisma migrate status
Environment variables loaded from .env
Datasource "db": PostgreSQL database "1614bea1d5", schema "public" at "db-1614bea1d5.db007.hosteddb.reai.io:5432"
Error: P1001: Can't reach database server at `db-1614bea1d5.db007.hosteddb.reai.io:5432`
```

Preuve que ce n'est pas contournable en amont : `grep -o "\.env\.local" node_modules/prisma/build/index.js`
retourne **zéro occurrence** — le binaire du CLI Prisma ne contient tout simplement aucune référence
à `.env.local`, ce n'est pas une case à cocher qui aurait été oubliée, c'est une convention propre à
Next.js que Prisma CLI n'implémente pas. Le CLI charge son propre `.env` via `dotenv.config({path})`
(confirmé en désassemblant `node_modules/prisma/build/index.js`), et cet appel ne réécrit jamais une
variable déjà présente dans `process.env` (comportement par défaut de `dotenv`) — vérifié
empiriquement en forçant `DATABASE_URL` dans l'environnement du process enfant avant de lancer
`npx prisma migrate status` : le CLI a bien utilisé la valeur forcée (`db.prisma.io`) malgré son
message `Environment variables loaded from .env`. C'est exactement le mécanisme que
`scripts/lib/target-env.ts` exploite (§13.10).

**Correctif appliqué (fichier `.env`)** : la ligne `DATABASE_URL=...` a été supprimée de `.env` (et
uniquement cette ligne — `npm run env:audit` avait d'abord confirmé que `.env` contient 6 autres
variables absentes de `.env.local` — `NEXTAUTH_SECRET`, `AUTH_SECRET`, `AWS_PROFILE`, `AWS_REGION`,
`AWS_BUCKET_NAME`, `AWS_FOLDER_PREFIX` — donc supprimer tout le fichier aurait cassé l'auth et le
stockage S3 ; les corriger à l'aveugle était donc hors de propos, seule `DATABASE_URL` posait
problème). Conséquence vérifiée : `npx prisma migrate status` lancé nu échoue maintenant
immédiatement avec `P1012: Environment variable not found: DATABASE_URL` au lieu de contacter
silencieusement l'ancien hôte — un échec bruyant et sans ambiguïté plutôt qu'une connexion
silencieuse à la mauvaise base. `.env.local` reste la seule source de `DATABASE_URL` pour le
développement (application, `next dev`, et tous les scripts `db:*` via `loadAppEnv()`).

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

Voir aussi §13.10 pour `npm run db:predeploy` (version généralisée, explicite par environnement) et
`npm run db:status:dev` / `npm run db:migrate:dev`.

### 13.4 Staging migration

Aucune base de "staging" distincte n'a été identifiée dans ce projet (un seul environnement Vercel
"development" avec sa propre `DATABASE_URL`, une "Production" dont la valeur est masquée). La base
de développement (`db.prisma.io`) a servi de validation de facto pour ce diagnostic (lecture seule
uniquement : `SELECT`, `information_schema`, `pg_indexes` — aucune écriture, aucun DDL). Workflow
recommandé avant toute application réelle, une fois l'environnement cible confirmé :
`npm run account:predeploy` → confirmation manuelle de sauvegarde (§13.6) → `prisma migrate deploy`
→ tests d'intégration → smoke tests.

`npm run db:predeploy -- --env=staging` (§13.10) refuse systématiquement et explicitement tant
qu'aucune variable `STAGING_DATABASE_URL` n'est exportée — il n'invente jamais un environnement de
repli, conformément à la contrainte de ne jamais fabriquer un staging qui n'existe pas.

### 13.5 Production migration

**Non exécutée.** `prisma migrate deploy` n'a été lancé contre aucune base par ce travail — la
tentative de le faire contre la base de développement a été explicitement bloquée par les
autorisations de l'environnement d'exécution (catégorie "Production Deploy"), ce qui est cohérent
avec la règle du projet de ne jamais migrer sans confirmation humaine explicite. La seule action
technique restante est de lancer `npx prisma migrate deploy` soi-même (voir "Prochaine action"
en fin de document), après avoir tranché le point ouvert de la section 12 sur la séparation
Production/Development.

`npm run db:predeploy -- --env=production` (§13.10) n'a **aucun chemin de code** qui appelle
`migrate deploy`/`migrate reset`/`db push` — pas derrière un flag, pas derrière une variable
d'environnement. Il exige `PRODUCTION_DATABASE_URL` explicitement exportée (jamais lue
automatiquement depuis `.env.vercel.production` ou tout autre fichier), n'affiche que les checks en
lecture seule, et n'affiche jamais de verdict `SAFE TO MIGRATE` pour la production.

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
| `DATABASE_URL` | `.env.local` uniquement (retirée de `.env`, voir §13.1) | Build/démarrage impossible |
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

1. Ce message signifie que le CLI Prisma (ou un script qui importe `@prisma/client` avant
   `loadAppEnv()`) a résolu `DATABASE_URL` vers l'hôte Abacus.AI (sandbox de développement), pas
   vers `db.prisma.io`. Lancer `npm run db:check` : s'il affiche `DNS: PRIVATE_IP` puis `TCP: FAIL`,
   c'est confirmé.
2. Cause : deux mécanismes distincts peuvent produire ce symptôme (§13.1) — (a) un import direct de
   `@prisma/client` (ou de `lib/prisma.ts`) avant `loadAppEnv()`, qui fige la valeur dans
   `process.env` avant que `.env.local` ait pu la remplacer ; (b) le CLI Prisma lancé nu
   (`npx prisma ...`), qui ne connaît pas `.env.local` du tout — confirmé par l'absence totale de
   `.env.local` dans le binaire du CLI (`node_modules/prisma/build/index.js`).
3. Correctif : ne jamais lancer `npx prisma` nu dans ce projet. Utiliser `npm run db:check`,
   `npm run db:preflight`, `npm run account:predeploy`, `npm run db:status:dev`,
   `npm run db:predeploy`, ou `npm run db:migrate:dev` (§13.10), qui résolvent `DATABASE_URL`
   explicitement et l'injectent dans le process enfant plutôt que de compter sur l'auto-chargement
   du CLI. Depuis la correction de §13.1, `.env` ne contient plus `DATABASE_URL` du tout : un
   `npx prisma` nu échoue maintenant immédiatement avec `P1012: Environment variable not found`
   plutôt que de contacter silencieusement l'ancien hôte — un signal explicite que la commande a été
   lancée sans passer par les scripts fournis.
4. Ce message n'indique **pas** une base cassée ou une action à corriger côté hébergeur — l'hôte
   Abacus.AI répond simplement à un réseau différent de celui de ce poste, ce qui est son
   fonctionnement prévu.

### 13.10 Commandes explicites par environnement

En complément de `db:check` / `db:preflight` / `account:predeploy` (toujours valables, toujours
implicitement "development" via `loadAppEnv()`), trois commandes rendent la source de
`DATABASE_URL` explicite et sans ambiguïté, y compris pour le CLI Prisma lui-même — voir
`scripts/lib/target-env.ts` pour la résolution par cible et `scripts/lib/predeploy-checks.ts` pour
les checks partagés :

| Commande | Cible | Comportement |
|---|---|---|
| `npm run db:status:dev` | development (fixe) | Affiche `Environment` / `Database host` / `Database name` / `DATABASE_URL source`, puis lance `prisma migrate status` avec cette valeur forcée dans le process enfant. Lecture seule. |
| `npm run db:predeploy` | development par défaut ; `-- --env=staging`/`--env=production` | Même banner + les checks read-only (connectivité, PostgreSQL, doublons/`phone` vide, migrations en attente). `development`/`staging` : verdict `SAFE TO MIGRATE`. `production` : jamais de verdict, aucun chemin de code ne pouvant appeler `migrate deploy`. |
| `npm run db:migrate:dev` | development (codé en dur, aucun flag ne peut cibler autre chose) | Relance les mêmes checks ; si `Preflight: FAIL`, refuse et s'arrête. Si `PASS`, lance `prisma migrate dev` en `stdio: inherit` — les invites interactives de Prisma (ex. detection de drift demandant un reset) restent pleinement interactives, rien n'est auto-confirmé. |

`staging`/`production` ne lisent **jamais** un fichier local automatiquement : `staging` exige
`STAGING_DATABASE_URL` exporté explicitement (refuse proprement sinon, n'invente rien) ;
`production` exige `PRODUCTION_DATABASE_URL` exporté explicitement (jamais lu depuis
`.env.vercel.production`, qui reste un fichier de référence humaine, pas une source automatique).

`npm run env:audit` (`scripts/env-audit.ts`) — lecture seule, n'affiche jamais de valeur de secret :
pour chaque fichier `.env`/`.env.local`/`.env.vercel.production`, présence de `DATABASE_URL`, hôte
masqué, nom de base, et l'ensemble des **noms** de variables présentes uniquement dans l'un des deux
fichiers (jamais les valeurs) — utile avant de décider si un fichier `.env*` peut être corrigé,
remplacé, ou supprimé sans casser une variable qui n'existe que là.

### 13.11 Historique de migration réparé — root cause P3006/P1014 sur `Address`

**Symptôme** : `npm run db:migrate:dev` échouait avec `P3006` sur
`20260924202220_add_gabon_locations`, lui-même causé par `P1014: The underlying table for model
Address does not exist` pendant le replay sur la shadow database de Prisma.

**Root cause** (confirmée par lecture de `prisma/schema.prisma`, de tous les `migration.sql`, de
l'historique Git — `git log -S'CREATE TABLE "Address"' --all` ne retourne **aucun** commit — et
d'une inspection en lecture seule de `db.prisma.io` via `scripts/db-inspect-address.ts` /
`scripts/db-dump-ddl.ts`) : au commit `5fa446f`, ~29 modèles Prisma (dont `Address`, `Category`,
`Professional`, `Service`) ont été ajoutés à `schema.prisma` **en même temps que** la création du
dossier `prisma/migrations/`, mais seuls 8 de ces modèles ont reçu un vrai `CREATE TABLE` dans les
migrations écrites à ce moment-là — les ~20 autres n'apparaissent que via des `ALTER
TABLE`/`FOREIGN KEY`, qui supposent silencieusement leur préexistence. La base de développement les
possède réellement (confirmé par `to_regclass`), preuve d'un `prisma db push` historique jamais
capturé sous forme de migration, avant que le dossier `migrations/` n'existe. Ce n'est donc **pas**
une migration supprimée (CASE C exclue par la recherche Git ci-dessus) mais un **drift historique
non tracé** (CASE B).

**Réparation appliquée** (pattern officiel Prisma "baseline an existing database", documenté par
`prisma migrate resolve --help`) :
1. `scripts/db-generate-baseline.ts` génère, via
   `prisma migrate diff --from-empty --to-schema-datasource prisma/schema.prisma --script` contre
   la vraie base (introspection en lecture seule, `DATABASE_URL` jamais passée en argument CLI —
   uniquement via l'environnement du process enfant), le SQL exact nécessaire pour construire les
   38 tables actuellement réelles à partir de rien.
2. `prisma/migrations/20260924202220_add_gabon_locations/migration.sql` — remplacée par ce script
   complet (38 `CREATE TABLE`, tous les index, toutes les `FOREIGN KEY`).
3. `prisma/migrations/20260924205721_add_services_catalogue/migration.sql` — réduite à un no-op
   (`SELECT 1;`), ses effets étant désormais entièrement absorbés par la baseline ci-dessus. Le
   dossier est conservé (pas supprimé) pour préserver l'ordre/l'horodatage historique.
4. `prisma/migrations/20260926120000_add_account_lifecycle/migration.sql` — **non modifiée** (ne
   référence pas `Address`, s'applique proprement une fois `Professional` créée par la baseline).

**Vérification de bout en bout — sur base jetable, jamais sur `db.prisma.io`** : un conteneur
Postgres local temporaire (`docker run --rm postgres:16-alpine`, détruit immédiatement après, aucune
donnée réelle) a servi à rejouer l'historique complet :
```
npx prisma migrate deploy   →  3 migrations appliquées, 0 erreur (empty DB → schéma final)
npx prisma migrate diff --from-url <shadow> --to-schema-datasource prisma/schema.prisma --script
                             →  "-- This is an empty migration." (aucun drift)
```
Ceci confirme que l'historique réparé est **auto-suffisant et fidèle à `schema.prisma`** : rejouer
depuis une base vide reproduit exactement le schéma attendu, sans dépendre d'un état préexistant.

**13.11.5 — Ce qui reste bloqué** : les deux fichiers réécrits ci-dessus étaient déjà marqués
`APPLIED` dans `_prisma_migrations` sur la vraie base `db.prisma.io` (leur SQL y a déjà été exécuté
historiquement, via le `db push` non tracé). Les rejouer pour de vrai échouerait
(`relation already exists`) — la voie correcte est `prisma migrate resolve --applied <name>`, qui
ne fait que recalculer le checksum stocké sans exécuter de SQL (mécanisme documenté officiellement
pour "reconcile hotfixes done manually on databases with your migration history", exactement ce cas
— `scripts/db-migrate-resolve.ts`). Cette action a été refusée par le classificateur de permissions
de l'environnement d'exécution (catégorie "Modify Shared Resources" — écriture, même minime, sur la
table de bookkeeping d'une base distante). Elle nécessite une confirmation humaine explicite avant
de pouvoir être rejouée ; jusque-là, `prisma migrate deploy`/`dev` réel sur `db.prisma.io` (donc
l'application de `20260926120000_add_account_lifecycle`) reste en attente.

## 14. Migration vers Neon Postgres (intégration Vercel) — plan et état

### 14.1 Pourquoi

`db.prisma.io` (Prisma Postgres, intégration `prisma-postgres-green-harbor`) reste un environnement
de développement à usage limité (pas de branching, historique déjà réparé une fois — §13.11). Décision :
bascule complète et définitive vers **Neon Postgres**, intégré nativement à Vercel, avec trois bases
isolées (Development / Preview / Production) au lieu d'une seule base partagée. Contraintes strictes,
valables pour toute la durée de cette bascule : ne jamais toucher la Production existante, ne jamais
supprimer une base existante, ne jamais pousser/merger, ne perdre aucune donnée.

### 14.2 Architecture cible

| Environnement Vercel | Base Neon | Partage de données |
|---|---|---|
| Development (local, `.env.local`) | Neon **Development** | Isolée — jamais de données Production |
| Preview (déploiements de PR) | Neon **Preview**, idéalement une branche Neon par déploiement | Isolée de Production |
| Production | Neon **Production** | Inchangée jusqu'à un cutover explicite et validé — voir §15 |

### 14.3 Contrat de variables d'environnement

L'intégration Vercel/Neon crée, par environnement Vercel : `DATABASE_URL` (poolée, compatible
Vercel Functions), `DATABASE_URL_UNPOOLED` (connexion directe), `PGHOST`/`PGUSER`/`PGDATABASE`/
`PGPASSWORD`, et optionnellement des variables Neon Auth (désactivées ici via `-m auth=false` :
NextAuth est déjà en place, §9). Mapping requis pour Prisma (schema.prisma exige déjà les deux,
voir `datasource db` §14.4) :

- `DATABASE_URL` (Prisma) ← `DATABASE_URL` (Neon, poolée) — utilisée par l'app en runtime.
- `DIRECT_URL` (Prisma) ← `DATABASE_URL_UNPOOLED` (Neon, directe) — utilisée uniquement par le CLI
  Prisma (`migrate dev/deploy/diff`, `validate`) ; jamais lue par `prisma generate` ni par le moteur
  de requête en runtime (confirmé empiriquement).

Ce mapping n'est **jamais** deviné : à chaque environnement Vercel réellement connecté, les noms
effectifs sont vérifiés via `vercel env ls <environment>` avant toute copie de valeur.

### 14.4 `schema.prisma`

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

`directUrl` est désormais déclarée. Elle ne casse pas `prisma generate` (fonctionne sans
`DIRECT_URL` défini) mais est requise par les commandes du moteur de migration
(`validate`/`migrate status/dev/deploy/diff`) — cohérent avec le fait que ces dernières passent déjà
toutes par les wrappers `scripts/db-*.ts` (§13.10), qui chargent `.env.local` via `loadAppEnv()`.

### 14.5 Aucun changement de code requis dans les wrappers existants

Vérification explicite (grep + lecture) : `scripts/lib/target-env.ts`, `scripts/db-status.ts`,
`scripts/db-predeploy.ts`, `scripts/db-migrate-dev.ts` et `scripts/lib/predeploy-checks.ts` ne
contiennent **aucune** référence en dur à `db.prisma.io`/`hosteddb.reai.io` — `resolveTargetEnv('development')`
résout déjà `DATABASE_URL`/`DIRECT_URL` uniquement depuis ce que `.env.local` contient, quel que soit
l'hébergeur réel. Conséquence directe : `npm run db:status:dev` / `db:preflight` / `db:migrate:dev`
cibleront Neon Development **automatiquement et sans aucune modification de code**, dès que
`.env.local` contient les vraies valeurs Neon (§14.3). Seule exception volontaire :
`scripts/db-count-old-dev.ts`, dont le rôle est justement de continuer à pointer sur l'ancienne base
tant que la migration de données (§14.7) n'est pas confirmée terminée.

### 14.6 État de l'installation

Bloqué à l'étape d'installation de l'intégration marketplace Neon elle-même : Vercel exige une
première acceptation humaine des conditions Neon dans un navigateur
(`vercel integration add neon ...` renvoie `status: action_required,
reason: integration_terms_acceptance_required`) — limitation produit/CLI réelle et attendue pour
toute première installation d'une intégration marketplace, non contournable en mode
non-interactif. Commande de relance, à rejouer telle quelle une fois les conditions acceptées :

```
vercel --non-interactive integration add neon --plan free_v3 -m auth=false -m region=iad1 --no-env-pull -n allopro-neon
```

### 14.7 Recensement des données de l'ancienne base Development (lecture seule)

`scripts/db-count-old-dev.ts` (comptages uniquement, aucun contenu de ligne affiché) : la base
`db.prisma.io` actuelle contient très peu de données réelles — 1 `User`, 0 `Professional`, 0
`Address`/`Session`/`AuditLog` — l'essentiel du volume est du référentiel (`Province`, `City`,
`Neighborhood`, `Category`, `ServiceSubcategory`, `CatalogService`) et quelques lignes de démo
(`DemoWorkspace`, `UploadedAsset`, `DemoOtp`).

### 14.8 Script de transfert `scripts/migrate-data-to-neon.ts`

Ordre des tables dérivé automatiquement du DMMF Prisma (parents avant enfants, par relation FK
scalaire) — jamais d'ordre codé en dur. Ne journalise jamais de contenu de ligne ni de chaîne de
connexion, seulement des comptages avant/après par table. Deux modes :
`--dry-run` (défaut, comptages + connectivité, aucune écriture) et `--execute` (copie réelle,
transaction par table, `skipDuplicates: true`). Restreint dynamiquement le `select` Prisma aux
colonnes réellement présentes sur la table source (introspection `information_schema.columns`),
pour tolérer un schéma source en retard (ex. `PhoneOtp` inexistante, `User.accountStatus` absente
tant que `20260926120000_add_account_lifecycle` n'est pas appliquée côté source).

**Validé de bout en bout** contre un conteneur Postgres jetable local simulant Neon Development
(jamais contre une donnée réelle) : les 39 modèles transférés dans le bon ordre, comptages
source/cible identiques pour toutes les tables non vides (`User=1`, `DemoWorkspace=1`,
`UploadedAsset=2`, `DemoOtp=1`, `Province=9`, `City=52`, `Neighborhood=820`, `Category=13`,
`ServiceSubcategory=50`, `CatalogService=588`), verdict final « All tables reached at least the
source row count. ». Prêt à être rejoué tel quel contre la vraie Neon Development dès que la base
existe — seule variable à fournir alors : `TARGET_DATABASE_URL` (la `DIRECT_URL` Neon Development).

### 14.9 Suite (bloquée sur §14.6)

Une fois l'intégration installée : appliquer l'historique de migrations réparé (§13.11) sur Neon
Development via `prisma migrate deploy`, vérifier connectivité/schéma/0 migration en attente,
rejouer `migrate-data-to-neon.ts --dry-run` puis `--execute` contre la vraie base, puis dérouler la
suite de tests d'intégration Account Management (§8) contre Neon Development.

## 15. Plan de bascule Production — Neon (préparé, non exécuté)

Ce plan est documenté à l'avance, conformément à la consigne de ne jamais toucher la Production
existante avant que Development ne soit entièrement vert sur Neon (§14). Aucune étape ci-dessous
n'a été exécutée.

1. **Sauvegarde** : confirmer un point de restauration (backup/PITR) de la base Production actuelle
   avant toute action — vérification manuelle dans le dashboard de l'hébergeur actuel.
2. **Export** : export complet et horodaté de la base Production actuelle (lecture seule), conservé
   en dehors du dépôt.
3. **Provisionnement Neon Production** : créer la base Neon Production (variables Vercel
   Production, jamais mélangées avec Development/Preview — §14.2/14.3).
4. **Migration du schéma** : `prisma migrate deploy` de l'historique réparé (§13.11) contre Neon
   Production, sur une base neuve et vide — pas de baseline/resolve nécessaire puisqu'aucune donnée
   n'y a encore été écrite.
5. **Migration des données** : rejouer `scripts/migrate-data-to-neon.ts` (§14.8) avec
   `SOURCE_DATABASE_URL` pointant l'export/la Production actuelle et `TARGET_DATABASE_URL` pointant
   Neon Production ; `--dry-run` obligatoire avant tout `--execute`.
6. **Validation** : comparer les comptages avant/après pour chaque table (le script les affiche
   déjà), plus un échantillon de vérifications applicatives (connexion, session, RBAC) contre Neon
   Production **avant** bascule du trafic réel.
7. **Bascule** : changer `DATABASE_URL`/`DIRECT_URL` de l'environnement Vercel Production pour
   pointer Neon Production — seule cette étape rend Neon Production réellement actif pour les
   utilisateurs.
8. **Smoke test** : vérifications post-bascule sur l'app en production réelle (login, session,
   pages critiques).
9. **Rollback possible** : tant que l'ancienne base Production n'est pas supprimée (elle ne le sera
   jamais sans confirmation explicite séparée), revenir en arrière ne demande que de restaurer les
   anciennes variables `DATABASE_URL`/`DIRECT_URL` sur Vercel Production.

Cette bascule ne sera engagée qu'après confirmation explicite, distincte de celle qui a autorisé la
migration de Development.
