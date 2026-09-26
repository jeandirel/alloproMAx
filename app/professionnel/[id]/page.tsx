import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { loadWorkspace } from '@/lib/workspace-server'
import type { Workspace } from '@/lib/marketplace'
import { PublicShell } from '@/components/public-shell'
import { ProfilClient } from './profil-client'
import { getPublicProfessionalById } from '@/lib/public-professionals'
import type { Professional } from '@/lib/data'

async function resolvePro(id: string): Promise<Professional | null> {
  const session = await auth()
  if (session?.user?.id) {
    const row = await loadWorkspace(session.user)
    const workspacePro = row ? (row.state as unknown as Workspace).pros.find((p) => p.id === id) : undefined
    if (workspacePro) return workspacePro
  }
  return getPublicProfessionalById(id)
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const pro = await resolvePro(id)
  if (!pro) return { title: 'Profil professionnel — Allo Pro', description: 'Profil professionnel sur Allo Pro.' }
  const title = `${pro.name} — ${pro.metier} à ${pro.zone} | Allo Pro`
  const description = `${pro.metier} à ${pro.zone}. Consultez le profil de ${pro.name} sur Allo Pro.`
  return { title, description, openGraph: { title, description } }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const pro = await resolvePro(id)
  if (!pro) notFound()
  return <PublicShell><ProfilClient pro={pro}/></PublicShell>
}
