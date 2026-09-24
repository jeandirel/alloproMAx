import {professionals} from '@/lib/data'
import {notFound} from 'next/navigation'
import {auth} from '@/auth'
import {loadWorkspace} from '@/lib/workspace-server'
import type {Workspace} from '@/lib/marketplace'
import {PublicShell} from '@/components/public-shell'
import {ProfilClient} from './profil-client'
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;const session=await auth();const row=session?.user?.id?await loadWorkspace(session.user):null;const pros=row?(row.state as unknown as Workspace).pros:professionals;const pro=pros.find(p=>p.id===id);if(!pro)notFound();return <PublicShell><ProfilClient pro={pro}/></PublicShell>}
