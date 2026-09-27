import {ProfileForm} from '@/components/profile-form'
export const metadata={title:'Complétez votre profil — Allo Pro',description:'Finalisez votre inscription en renseignant vos informations pour commencer à utiliser Allo Pro.',openGraph:{title:'Complétez votre profil — Allo Pro',description:'Finalisez votre inscription pour commencer à utiliser Allo Pro.'}}
export default async function Page({searchParams}:{searchParams:Promise<{role?:string}>}){
  const {role}=await searchParams
  return <ProfileForm onboarding initialRole={role==='professionnel'?'professionnel':'client'}/>
}
