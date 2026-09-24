import {auth} from '@/auth'
import {redirect,notFound} from 'next/navigation'
import {loadWorkspace} from '@/lib/workspace-server'
import type {Workspace} from '@/lib/marketplace'
import {ReserverClient} from './reserver-client'
export default async function Page({params}:{params:Promise<{id:string}>}){const session=await auth();if(!session?.user?.id)redirect('/login');const {id}=await params;const row=await loadWorkspace(session.user);const pro=(row.state as unknown as Workspace).pros.find(p=>p.id===id);if(!pro)notFound();return <ReserverClient pro={pro}/>}
