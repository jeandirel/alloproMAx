import {RechercheClient} from './recherche-client'
import {PublicShell} from '@/components/public-shell'
import {getPublicProfessionals} from '@/lib/public-professionals'
import {prisma} from '@/lib/prisma'

export const metadata={title:'Rechercher un professionnel — Allo Pro',description:'Trouvez un professionnel près de chez vous au Gabon : plomberie, électricité, ménage et plus.',openGraph:{title:'Rechercher un professionnel — Allo Pro',description:'Trouvez un professionnel près de chez vous au Gabon.'}}

async function getRealCategories() {
  try {
    return await prisma.category.findMany({ where: { active: true }, orderBy: { position: 'asc' }, select: { id: true, name: true } })
  } catch (error) {
    console.error('[recherche] catégories indisponibles', error)
    return []
  }
}

export default async function Page({searchParams}:{searchParams:Promise<{q?:string;cat?:string;catId?:string;subId?:string;zone?:string;provinceId?:string;cityId?:string;neighborhoodId?:string}>}){
  const sp=await searchParams
  const [realPros, realCategories] = await Promise.all([
    getPublicProfessionals({ provinceId: sp.provinceId, cityId: sp.cityId, neighborhoodId: sp.neighborhoodId, limit: 120 }),
    getRealCategories(),
  ])
  return <PublicShell><RechercheClient
    initialQuery={sp.q||''}
    initialCat={sp.cat||''}
    initialZone={sp.zone||''}
    initialCategoryId={sp.catId||''}
    initialSubcategoryId={sp.subId||''}
    initialProvinceId={sp.provinceId||''}
    initialCityId={sp.cityId||''}
    initialNeighborhoodId={sp.neighborhoodId||''}
    realPros={realPros}
    realCategories={realCategories}
  /></PublicShell>
}
