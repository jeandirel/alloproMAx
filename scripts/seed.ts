import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Hidden test account
  const testPwHash = await bcrypt.hash('FvOzdjZ*8S', 12)
  await prisma.user.upsert({
    where: { email: 'abacus-51f44a48@example.com' },
    update: {},
    create: {
      email: 'abacus-51f44a48@example.com',
      password: testPwHash,
      name: 'Test Admin',
      role: 'admin',
    },
  })

  // Demo user: Armand Ndong
  const demoPwHash = await bcrypt.hash('demo1234', 12)
  await prisma.user.upsert({
    where: { email: 'armand@allopro.ga' },
    update: {},
    create: {
      email: 'armand@allopro.ga',
      password: demoPwHash,
      name: 'Armand Ndong',
      role: 'user',
    },
  })

  console.log('Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
