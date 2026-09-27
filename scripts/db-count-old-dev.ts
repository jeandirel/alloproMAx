// Read-only row counts on the OLD Development database (db.prisma.io, the pre-Neon instance).
// Never selects/prints actual row content — COUNT(*) only, per the "no personal data" requirement
// ahead of a possible Neon data migration.
//
// Deliberately does NOT use resolveTargetEnv('development') — since .env.local's DATABASE_URL/
// DIRECT_URL now point at Neon Development (see docs/account-management.md §14.9), "development"
// means Neon everywhere else in this codebase. This script needs the old database specifically, so
// it reads OLD_DEV_DATABASE_URL, the value preserved in .env.local for exactly this purpose.
// Usage: tsx scripts/db-count-old-dev.ts
import { loadAppEnv } from './lib/load-app-env'

async function main() {
  loadAppEnv()
  const oldUrl = process.env.OLD_DEV_DATABASE_URL
  if (!oldUrl) {
    console.error(
      'OLD_DEV_DATABASE_URL is not set in .env.local. This script only ever counts rows on the old ' +
        'pre-Neon database — it will not fall back to DATABASE_URL (that now points at Neon).',
    )
    process.exit(1)
  }
  process.env.DATABASE_URL = oldUrl

  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()

  const tables: Array<[string, () => Promise<number>]> = [
    ['User', () => prisma.user.count()],
    ['Professional', () => prisma.professional.count()],
    ['Address', () => prisma.address.count()],
    ['Session', () => prisma.session.count()],
    ['Account', () => prisma.account.count()],
    ['PhoneOtp', () => prisma.phoneOtp.count()],
    ['AuditLog', () => prisma.auditLog.count()],
    ['Booking', () => prisma.booking.count()],
    ['Review', () => prisma.review.count()],
    ['Conversation', () => prisma.conversation.count()],
    ['Message', () => prisma.message.count()],
    ['Notification', () => prisma.notification.count()],
    ['Favorite', () => prisma.favorite.count()],
    ['Category', () => prisma.category.count()],
    ['Service', () => prisma.service.count()],
    ['Province', () => prisma.province.count()],
    ['City', () => prisma.city.count()],
    ['Neighborhood', () => prisma.neighborhood.count()],
    ['Payout', () => prisma.payout.count()],
    ['Invoice', () => prisma.invoice.count()],
    ['PaymentTransaction', () => prisma.paymentTransaction.count()],
    ['Dispute', () => prisma.dispute.count()],
    ['UploadedAsset', () => prisma.uploadedAsset.count()],
  ]

  console.log('Row counts — OLD_DEV_DATABASE_URL (pre-Neon database, .env.local)')
  console.log('No row content is read or printed below, counts only.\n')

  for (const [name, fn] of tables) {
    try {
      const count = await fn()
      console.log(`${name.padEnd(20)} ${count}`)
    } catch (e) {
      console.log(`${name.padEnd(20)} ERROR (${(e as Error).message.split('\n')[0]})`)
    }
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
