export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { paymentMode, providerOptions } from '@/lib/pawapay'
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({error:'Connexion requise.'},{status:401})
  const requested = new URL(req.url).searchParams.get('kind')
  const kind = requested==='payout'||requested==='refund'?requested:'deposit'
  const headers = {'Cache-Control':'private, no-store'}
  try {
    const mode = paymentMode()
    const options = await providerOptions(kind)
    return NextResponse.json({mode,configured:mode==='sandbox',options,message:mode==='mock'?'Clé sandbox absente ou simulation locale sélectionnée. Aucun appel à pawaPay et aucun débit réel.':'pawaPay sandbox : transactions de test uniquement. Aucun argent réel.'},{headers})
  } catch(e) {
    console.error('Configuration pawaPay indisponible')
    return NextResponse.json({mode:'blocked',configured:!!process.env.PAWAPAY_API_TOKEN,options:[],message:e instanceof Error && !e.name.includes('Zod')?e.message:'Configuration pawaPay non conforme.'},{headers})
  }
}
