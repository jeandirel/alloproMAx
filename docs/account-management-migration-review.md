# Revue de la migration `20260926120000_add_account_lifecycle`

Audit ligne par ligne de `prisma/migrations/20260926120000_add_account_lifecycle/migration.sql`,
classé `SAFE` / `CHECK_REQUIRED` / `RISKY`. Complète §Migration de `docs/account-management.md`.

Statut au 2026-09-26, après exécution de `npm run db:preflight` contre la base de développement
(`db.prisma.io`, voir `docs/account-management.md` §Database connectivity) : **tous les checks
sont au vert sur cette base** (0 doublon, 0 chaîne vide). Ce document classe le risque de chaque
opération dans l'absolu — il reste valable tel quel pour auditer une autre base (notamment
Production) avant d'y appliquer la même migration.

## `ALTER TABLE "User" ADD COLUMN ...` (13 colonnes)

**SAFE.** Chaque colonne est soit `NOT NULL DEFAULT <valeur>` (`accountStatus`, `marketingConsent`,
`notifyBookingUpdates`, `notifyMessages`, `notifySecurity`, `notifyMarketing`) soit nullable sans
défaut (`pausedAt`, `suspendedAt`, `suspensionReason`, `suspendedById`, `deletionRequestedAt`,
`deletionScheduledAt`, `deletedAt`, `authProvider`, `phoneVerifiedAt`, `lastLoginAt`). Postgres
remplit une valeur pour chaque ligne existante sans réécrire la table ligne par ligne (fast-path
ADD COLUMN, disponible depuis Postgres 11 pour les défauts constants) : verrou `ACCESS EXCLUSIVE`
bref, pas de verrou long.

## `ALTER TABLE "Professional" ADD COLUMN ...` (6 colonnes)

**SAFE.** Même raisonnement : `paused BOOLEAN NOT NULL DEFAULT false`, le reste nullable.

## `ALTER TABLE "Session" ADD COLUMN ...` (4 colonnes)

**SAFE.** `createdAt`/`lastUsedAt` sont `NOT NULL DEFAULT CURRENT_TIMESTAMP` — rétro-remplissent les
lignes existantes avec l'heure de la migration (approximation acceptable : ces colonnes pilotent
uniquement l'affichage "Appareils connectés", pas une logique de sécurité qui dépendrait de leur
exactitude historique). `userAgent`/`ipAddress` nullables.

## `CREATE TABLE "PhoneOtp"`

**SAFE.** Nouvelle table, aucun impact sur l'existant.

## `CREATE INDEX "PhoneOtp_phone_idx"`, `"User_accountStatus_idx"`, `"User_deletionScheduledAt_idx"`, `"Professional_paused_idx"`, `"Professional_deletedAt_idx"`

**SAFE.** Index non uniques sur des colonnes neuves — ne peuvent pas échouer sur des données
existantes. Non `CONCURRENTLY` : sur une table de la taille actuelle (utilisateurs en dizaines/
centaines, pas millions) le verrou est de l'ordre de la milliseconde ; à réévaluer si le volume de
lignes change avant l'application réelle en production.

## `CREATE INDEX IF NOT EXISTS "Session_userId_idx"`

**SAFE.** `IF NOT EXISTS` gère explicitement le cas où un index équivalent existe déjà hors suivi
Prisma (commenté dans le fichier source). Confirmé sans risque par `npm run db:preflight`.

## `CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone")`

**CHECK_REQUIRED — précondition validée sur la base de développement, à revalider sur toute autre
base avant application.** `User.phone` existe déjà dans le schéma de base (`phone String? @unique`
dans `prisma/schema.prisma`, présent avant cette branche) — cette instruction pose pour la première
fois la contrainte au niveau base de données. Une valeur dupliquée ou vide en double ferait échouer
la migration (erreur Postgres, transaction annulée — non destructif, mais bloquant).

Preuve sur `db.prisma.io` (`npm run db:preflight`, 2026-09-26) :
- doublons `phone` : **0 groupe, 0 ligne**
- `phone = ''` : **0 ligne**
- 1 utilisateur au total dans cette base (environnement de développement Vercel, faible volume)

**Avant d'appliquer cette migration sur une autre base (notamment Production) :** relancer
`npm run db:preflight` (ou au minimum les requêtes `SELECT phone, COUNT(*) ... HAVING COUNT(*) > 1`
et `SELECT COUNT(*) FROM "User" WHERE phone = ''` en lecture seule) contre CETTE base précise. Ne
pas supposer que l'absence de doublons en développement s'applique à Production.

Voir aussi `docs/account-management.md` §Phone uniqueness pour la question distincte de la
normalisation de format (06... / +336... / 00336...), qui n'est pas couverte par cet index UNIQUE
(deux formats différents du même numéro ne sont pas détectés comme doublons par une contrainte
UNIQUE texte).

## `ALTER TABLE "User" ADD CONSTRAINT "User_suspendedById_fkey" ... ON DELETE SET NULL ON UPDATE CASCADE`

**SAFE.** `suspendedById` est une colonne neuve (donc entièrement `NULL` avant cette migration) :
la contrainte n'a aucune ligne existante à valider. `ON DELETE SET NULL` : la suppression d'un
compte administrateur ne bloque jamais la suppression et ne cascade jamais vers les comptes qu'il a
suspendus.

## `ALTER TABLE "Professional" ADD CONSTRAINT "Professional_suspendedById_fkey" ...`

**SAFE.** Même raisonnement.

## Synthèse

| Opération | Classement |
|---|---|
| `ALTER TABLE "User" ADD COLUMN` (×13) | SAFE |
| `ALTER TABLE "Professional" ADD COLUMN` (×6) | SAFE |
| `ALTER TABLE "Session" ADD COLUMN` (×4) | SAFE |
| `CREATE TABLE "PhoneOtp"` | SAFE |
| Index non uniques (×6, dont 1 `IF NOT EXISTS`) | SAFE |
| `CREATE UNIQUE INDEX "User_phone_key"` | CHECK_REQUIRED (validé sur dev, à revalider par base cible) |
| Foreign keys `suspendedById` (×2) | SAFE |

Aucune opération classée **RISKY** : pas de `DROP`, pas de `NOT NULL` sans défaut sur une colonne
existante, pas de changement de type, pas de `CASCADE` destructif.
