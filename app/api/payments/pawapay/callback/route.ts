export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { refreshPayment } from '@/lib/payment-server'
import { isFinal } from '@/lib/payment-types'
const callback = z.object({depositId:z.string().uuid().optional(),payoutId:z.string().uuid().optional(),refundId:z.string().uuid().optional()})
// Public provider endpoint: NEVER trust a supplied status, amount or identity.
// Callbacks are hints only; every effect uses the authenticated pawaPay GET response.
export async function POST(req: Request) {
  const headers = {'Cache-Control':'no-store'}
  try {
    if (Number(req.headers.get('content-length')||0)>16384) return new NextResponse(null,{status:413,headers})
    const raw = await req.text()
    if (raw.length>16384) return new NextResponse(null,{status:413,headers})
    const body = callback.parse(JSON.parse(raw))
    // Refund callbacks also include their source depositId; refundId takes precedence.
    const id = body.refundId || body.payoutId || body.depositId
    if (!id || (body.refundId && body.payoutId)) return new NextResponse(null,{status:400,headers})
    const kind = body.refundId?'refund':body.payoutId?'payout':'deposit'
    const transaction = await prisma.paymentTransaction.findUnique({where:{id}})
    if (!transaction || transaction.mode!=='sandbox' || transaction.kind!==kind) return new NextResponse(null,{status:200,headers})
    const result = await refreshPayment(transaction)
    return new NextResponse(null,{status:isFinal(result.transaction.status)?200:503,headers})
  } catch(e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError) return new NextResponse(null,{status:400,headers})
    console.error('Rapprochement pawaPay indisponible')
    return new NextResponse(null,{status:503,headers})
  }
}
