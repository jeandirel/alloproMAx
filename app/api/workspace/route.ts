export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { loadWorkspace } from '@/lib/workspace-server'
import { actionSchema, applyAction } from '@/lib/marketplace-engine'
import type { Workspace } from '@/lib/marketplace'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { paymentMode } from '@/lib/pawapay'
import type { Prisma } from '@prisma/client'
const headers={'Cache-Control':'private, no-store'}
export async function GET() {
  const session=await auth();if(!session?.user?.id)return NextResponse.json({error:'Connexion requise.'},{status:401})
  try { const row=await loadWorkspace(session.user);return NextResponse.json({state:row.state,version:row.version},{headers}) }
  catch(e){console.error('Lecture démonstration',e);return NextResponse.json({error:'Impossible de charger les données. Réessayez.'},{status:500})}
}
export async function POST(req:Request) {
  const session=await auth();if(!session?.user?.id)return NextResponse.json({error:'Connexion requise.'},{status:401})
  try {
    const origin=req.headers.get('origin');if(origin && new URL(origin).host!==req.headers.get('host') && new URL(origin).host!==req.headers.get('x-forwarded-host')) return NextResponse.json({error:'Origine non autorisée.'},{status:403})
    const {action,version}=await req.json();const parsed=actionSchema.parse(action)
    const assetIds:string[]=[]
    const visit=(v:unknown)=>{if(Array.isArray(v))v.forEach(visit);else if(v && typeof v==='object'){const obj=v as Record<string,unknown>;if(typeof obj.id==='string' && typeof obj.name==='string')assetIds.push(obj.id);else Object.values(obj).forEach(visit)}}
    visit(parsed)
    if(assetIds.length){
      const assets=await prisma.uploadedAsset.findMany({where:{id:{in:[...new Set(assetIds)]},userId:session.user.id,complete:true},select:{id:true,contentType:true}})
      if(assets.length!==new Set(assetIds).size)throw new Error('Une pièce jointe n’est pas disponible ou ne vous appartient pas.')
      const photos=parsed.type==='transition'?[...(parsed.before||[]),...(parsed.after||[])]:parsed.type==='book'?parsed.photos:parsed.type==='profile'?parsed.photo:parsed.type==='proProfile'?[...(parsed.documents.portrait||[]),...(parsed.documents.realisations||[])]:[]
      if(photos.some(f=>!assets.find(v=>v.id===f.id)?.contentType.startsWith('image/')))throw new Error('Une photo JPEG, PNG ou WebP est obligatoire dans cette rubrique.')
    }
    const row=await loadWorkspace(session.user)
    if(version!==row.version)return NextResponse.json({error:'Les données ont évolué. Actualisez puis réessayez.'},{status:409})
    const result=applyAction(row.state as unknown as Workspace,parsed,undefined,undefined,parsed.type==='book'?paymentMode():undefined)
    const saved=await prisma.demoWorkspace.updateMany({where:{id:row.id,version:row.version},data:{state:result.state as unknown as Prisma.InputJsonValue,version:{increment:1}}})
    if(!saved.count)return NextResponse.json({error:'Une autre action a été enregistrée. Réessayez.'},{status:409})
    return NextResponse.json({...result,version:row.version+1},{headers})
  }catch(e){if(e instanceof z.ZodError)return NextResponse.json({error:'Vérifiez les champs obligatoires, les formats et les valeurs saisis.'},{status:400});console.error('Action démonstration',e);return NextResponse.json({error:e instanceof Error?e.message:'Action impossible.'},{status:400})}
}
