import {auth} from '@/auth'
import {prisma} from '@/lib/prisma'
import {redirect} from 'next/navigation'
import {AdminDashboard} from '@/components/admin-dashboard'
export const metadata={title:'Administration — Allo-Pro',description:"Espace d'administration Allo-Pro : gestion des professionnels, des litiges, des paiements et de la plateforme.",openGraph:{title:'Administration — Allo-Pro',description:"Espace d'administration de la plateforme Allo-Pro."}}
export default async function Page(){
 const session=await auth()
 const dbUser=session?.user?.id?await prisma.user.findUnique({where:{id:session.user.id},select:{role:true}}):null
 if(!dbUser || !['admin','demo_admin'].includes(dbUser.role))redirect('/accueil')
 return <AdminDashboard/>
}
