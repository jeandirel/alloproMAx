import {professionals} from '@/lib/data'
import {notFound} from 'next/navigation'
import {auth} from '@/auth'
import {loadWorkspace} from '@/lib/workspace-server'
import type {Workspace} from '@/lib/marketplace'
import {PublicShell} from '@/components/public-shell'
import {ProfilClient} from './profil-client'
export async function generateMetadata({params}:{params:Promise<{id:string}>}){const {id}=await params;const pro=professionals.find(p=>p.id===id);if(!pro)return {title:'Profil professionnel — Allo-Pro',description:'Profil professionnel sur Allo-Pro.'};const title=`${pro.name} — ${pro.metier} à ${pro.zone} | Allo-Pro`;const description=`${pro.metier} vérifié à ${pro.zone}. Consultez le profil, les avis clients et réservez ${pro.name} sur Allo-Pro.`;return {title,description,openGraph:{title,description}}}
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;const session=await auth();const row=session?.user?.id?await loadWorkspace(session.user):null;const pros=row?(row.state as unknown as Workspace).pros:professionals;const pro=pros.find(p=>p.id===id);if(!pro)notFound();return <PublicShell><ProfilClient pro={pro}/></PublicShell>}
