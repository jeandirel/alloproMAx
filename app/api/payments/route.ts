export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { preparePayment, refreshPayment, simulatePayment, getMissionForPayment, publicTransaction } from '@/lib/payment-server'
const headers = {'Cache-Control':'private, no-store'}
const input = z.discriminatedUnion('action',[
  z.object({action:z.literal('initiate'),missionId:z.string().min(1).max(100),kind:z.enum(['deposit','refund','payout']),method:z.enum(['airtel','moov']).optional(),phone:z.string().max(30).optional()}),
  z.object({action:z.literal('refresh'),transactionId:z.string().uuid()}),
  z.object({action:z.literal('simulate'),transactionId:z.string().uuid(),outcome:z.enum(['COMPLETED','FAILED'])}),
])
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({error:'Connexion requise.'},{status:401,headers})
  const missionId = new URL(req.url).searchParams.get('missionId') || ''
  try {
    await getMissionForPayment(session.user.id,missionId)
    const transactions = await prisma.paymentTransaction.findMany({where:{userId:session.user.id,missionId},orderBy:{createdAt:'desc'},take:30})
    return NextResponse.json({transactions:transactions.map(publicTransaction)},{headers})
  } catch { return NextResponse.json({error:'Mission inaccessible.'},{status:404,headers}) }
}
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({error:'Connexion requise.'},{status:401,headers})
  try {
    const origin = req.headers.get('origin')
    if (origin && ![req.headers.get('host'),req.headers.get('x-forwarded-host')].includes(new URL(origin).host)) return NextResponse.json({error:'Origine non autorisée.'},{status:403,headers})
    const text = await req.text()
    if (text.length > 4000) return NextResponse.json({error:'Demande trop volumineuse.'},{status:413,headers})
    const body = input.parse(JSON.parse(text))
    if (body.action === 'initiate') {
      const t = await preparePayment(session.user.id,body.missionId,body.kind,body.method,body.phone)
      const result = await refreshPayment(t,true)
      return NextResponse.json({transaction:publicTransaction(result.transaction),message:result.message},{headers})
    }
    const t = await prisma.paymentTransaction.findFirst({where:{id:body.transactionId,userId:session.user.id}})
    if (!t) return NextResponse.json({error:'Transaction inaccessible.'},{status:404,headers})
    const {state,mission} = await getMissionForPayment(session.user.id,t.missionId)
    if (body.action === 'simulate') {
      if (t.kind === 'deposit' && state.role !== 'client') throw new Error('Seul le client de démonstration peut simuler son encaissement.')
      if (t.kind === 'payout' && !(state.role === 'administrateur' || (state.role === 'professionnel' && state.activeProId === mission.professionalId))) throw new Error('Action de test non autorisée.')
      if (t.kind === 'refund' && !['client','administrateur'].includes(state.role)) throw new Error('Action de test non autorisée.')
      return NextResponse.json({transaction:publicTransaction(await simulatePayment(t,body.outcome))},{headers})
    }
    const result = await refreshPayment(t)
    return NextResponse.json({transaction:publicTransaction(result.transaction),message:result.message},{headers})
  } catch(e) {
    const malformed = e instanceof z.ZodError || e instanceof SyntaxError
    const database = e instanceof Prisma.PrismaClientKnownRequestError || e instanceof Prisma.PrismaClientUnknownRequestError || e instanceof Prisma.PrismaClientInitializationError
    console.error('Action de paiement refusée',{category:malformed?'validation':database?'database':'business'})
    return NextResponse.json({error:malformed?'Vérifiez les paramètres du paiement.':database?'Une opération concurrente ou une indisponibilité empêche cette action. Actualisez puis réessayez.':e instanceof Error?e.message:'Action impossible.'},{status:database?409:400,headers})
  }
}
