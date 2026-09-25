import {RechercheClient} from './recherche-client'
import {PublicShell} from '@/components/public-shell'
export const metadata={title:'Rechercher un professionnel — Allo-Pro',description:'Trouvez un professionnel vérifié près de chez vous à Libreville : plomberie, électricité, ménage et plus.',openGraph:{title:'Rechercher un professionnel — Allo-Pro',description:'Trouvez un professionnel vérifié près de chez vous à Libreville.'}}
export default async function Page({searchParams}:{searchParams:Promise<{q?:string;cat?:string;catId?:string;subId?:string;zone?:string}>}){const sp=await searchParams;return <PublicShell><RechercheClient initialQuery={sp.q||''} initialCat={sp.cat||''} initialZone={sp.zone||''} initialCategoryId={sp.catId||''} initialSubcategoryId={sp.subId||''}/></PublicShell>}
