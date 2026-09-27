import { requireAdmin } from '@/lib/account-guard'
import { AdminFinanceClient } from './admin-finance-client'

export const metadata = { title: 'Finance admin — Allo Pro' }

export default async function AdminFinancePage() {
  await requireAdmin()
  return <AdminFinanceClient />
}
