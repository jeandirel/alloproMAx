import { prisma } from '@/lib/prisma'
import { initialWorkspace, type Workspace } from './marketplace'
import { settleDue } from './marketplace-engine'
import type { Prisma } from '@prisma/client'
export async function loadWorkspace(user: { id: string; name?: string | null; email?: string | null }) {
  const existing = await prisma.demoWorkspace.findUnique({where:{userId:user.id}})
  const initial = initialWorkspace(user.name||'Client',user.email||'')
  if (!existing) {
    const identity = await prisma.user.findUnique({where:{id:user.id},select:{role:true}})
    if(identity?.role==='demo_admin') initial.role='administrateur'
  }
  if (!existing) await prisma.demoWorkspace.createMany({data:[{userId:user.id,state:initial as unknown as Prisma.InputJsonValue}],skipDuplicates:true})
  let row = existing || await prisma.demoWorkspace.findUniqueOrThrow({where:{userId:user.id}})
  const state=row.state as unknown as Workspace
  if(settleDue(state)) {
    await prisma.demoWorkspace.updateMany({where:{id:row.id,version:row.version},data:{state:state as unknown as Prisma.InputJsonValue,version:{increment:1}}})
    row=(await prisma.demoWorkspace.findUnique({where:{id:row.id}}))!
  }
  return row
}
