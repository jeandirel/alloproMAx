import {RechercheClient} from './recherche-client'
import {PublicShell} from '@/components/public-shell'
export default async function Page({searchParams}:{searchParams:Promise<{q?:string;cat?:string;zone?:string}>}){const sp=await searchParams;return <PublicShell><RechercheClient initialQuery={sp.q||''} initialCat={sp.cat||''} initialZone={sp.zone||''}/></PublicShell>}
