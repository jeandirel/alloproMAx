// Read-only row counts on the current Development database (db.prisma.io, the pre-Neon instance).
// Never selects/prints actual row content — COUNT(*) only, per the "no personal data" requirement
// ahead of a possible Neon data migration. Usage: tsx scripts/db-count-old-dev.ts
import { resolveTargetEnv } from './lib/target-env'

async function main() {
  const resolved = resolveTargetEnv('development')
  process.env.DATABASE_URL = resolved.databaseUrl

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

  console.log(`Row counts — ${resolved.source} (development)`)
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
