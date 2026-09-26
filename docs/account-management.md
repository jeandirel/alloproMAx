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
hébergée est restée injoignable depuis cet environnement pendant toute la session, ce qui empêche
`prisma migrate dev` de passer par une shadow database). Contenu : `ALTER TABLE` additifs
uniquement, une nouvelle table `PhoneOtp`, les index de recherche/modération, et deux
`FOREIGN KEY` (`suspendedById`) en `ON DELETE SET NULL`. Aucun `DROP`, aucune perte de données.

**Vérification à faire avant `prisma migrate deploy` en production** : la migration pose un index
`UNIQUE` sur `User.phone`. Si deux comptes existants partagent déjà le même numéro non-null, la
migration échouera — à vérifier avec une requête `SELECT phone, COUNT(*) FROM "User" WHERE phone IS
NOT NULL GROUP BY phone HAVING COUNT(*) > 1` avant d'appliquer.

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

**Explicitement non exécutés cette session** (nécessitent une connexion Postgres réelle — voir
"Point ouvert" ci-dessous) : callbacks `jwt`/`session`/`signIn` de bout en bout, toutes les
fonctions de `lib/account-lifecycle.ts`, les routes `/api/account/**`, `/api/sessions/**`,
`/api/professional/**`, `/api/admin/**`, `/api/cron/process-deletions`, et `requestPhoneOtp`. Le
détail exact de ce qui est couvert vs. non couvert est documenté en commentaire en fin de ce
fichier de test.

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
1. Vérifier l'unicité de `User.phone` (section 4) puis exécuter `prisma migrate deploy`.
2. Renseigner en production les variables d'environnement listées dans `.env.example`
   (`GOOGLE_CLIENT_ID`/`SECRET`, `SMS_PROVIDER`/`TWILIO_*`, `CRON_SECRET`).
3. Ouvrir une Pull Request vers `main` pour obtenir une preview Vercel, valider manuellement les
   parcours (connexion téléphone, pause/suppression de compte, modération admin) avant merge.

## 12. Points ouverts

- **Base de données hébergée injoignable** pendant toute cette session (voir mémoire projet) : la
  migration est écrite à la main et n'a pas pu être appliquée ni testée contre une vraie instance ;
  tous les tests d'intégration DB-dépendants restent à exécuter dès que la connectivité est
  rétablie.
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
