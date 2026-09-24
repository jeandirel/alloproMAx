'use server'
import {cookies} from 'next/headers'
import {randomUUID,randomInt,createHash} from 'crypto'
import {prisma} from '@/lib/prisma'
export async function requestDemoCode(phone:string){
 if(!/^(?:\+241|00241)?0?[67][0-9]{7}$/.test(phone.replace(/\s/g,'')))return {error:'Entrez un numéro gabonais valide, par exemple au format 077 XX XX XX.'}
 const jar=await cookies();const previous=Number(jar.get('allopro-otp-at')?.value||0);if(Date.now()-previous<30000)return {error:'Patientez 30 secondes avant de demander un nouveau code.'}
 const challenge=randomUUID();const code=String(randomInt(100000,1000000))
 await prisma.demoOtp.create({data:{id:challenge,codeHash:createHash('sha256').update(challenge+code).digest('hex'),expiresAt:new Date(Date.now()+5*60000)}})
 jar.set('allopro-otp-at',String(Date.now()),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:300,path:'/'})
 return {challenge,code}
}
