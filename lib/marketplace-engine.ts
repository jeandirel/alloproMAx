import { z } from 'zod'
import type { PaymentMode } from './payment-types'
import { authorizeRelease, authorizeRefund } from './payment-rules'
import { type Workspace, type Role, type Mission, statusLabels } from './marketplace'

const text = z.string().trim().min(1).max(2000)
const id = z.string().min(1).max(100)
const file = z.object({ id, name: z.string().max(180) })
const files = z.array(file).max(6)
const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
const rating = z.number().int().min(1).max(5)
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('role'), role: z.enum(['client','professionnel','administrateur']), proId: id.optional() }),
  z.object({ type: z.literal('profile'), name: text, email: z.union([z.string().email(),z.literal('')]), phone: z.string().max(30), address: z.string().max(300), quartier: text, provinceId: z.string().nullable().optional(), cityId: z.string().nullable().optional(), neighborhoodId: z.string().nullable().optional(), photo: files, location: point.nullable(), role: z.enum(['client','professionnel']).optional() }),
  z.object({ type: z.literal('favorite'), proId: id }),
  z.object({ type: z.literal('book'), proId: id, service: text, description: text, address: text, quartier: text, neighborhoodId: z.string().nullable().optional(), accessNotes: z.string().max(2000), date: z.string(), urgent: z.boolean(), paymentMethod: z.enum(['airtel','moov']), phone: z.string().regex(/^(?:\+241|00241)?0?[67][0-9]{7}$/,'Numéro gabonais invalide'), photos: files, location: point.nullable(), requestKey: id }),
  z.object({ type: z.literal('transition'), missionId: id, action: z.enum(['accept','refuse','route','start','finish','validate','cancel']), before: files.optional(), after: files.optional(), report: z.string().max(2000).optional() }),
  z.object({ type: z.literal('dispute'), missionId: id, reason: text, evidence: files }),
  z.object({ type: z.literal('resolve'), missionId: id, decision: z.enum(['refund','release']), reason: text }),
  z.object({ type: z.literal('review'), missionId: id, quality: rating, punctuality: rating, communication: rating, comment: text }),
  z.object({ type: z.literal('message'), thread: id, text }),
  z.object({ type: z.literal('read') }),
  z.object({ type: z.literal('availability'), available: z.boolean() }),
  z.object({ type: z.literal('proProfile'), name: text, bio: text, zone: text, zones: z.array(text).min(1).max(10), categorie: text, experience: z.number().int().min(0).max(70), phone: z.string().max(30), services: z.array(z.object({ nom: text, tarif: z.number().int().min(1).max(10000000) })).min(1).max(20), documents: z.record(files), submit: z.boolean(), provinceId: z.string().nullable().optional(), cityId: z.string().nullable().optional(), neighborhoodId: z.string().nullable().optional(), neighborhoodIds: z.array(z.string()).max(20).optional(), serviceIds: z.array(z.string()).max(20).optional() }),
  z.object({ type: z.literal('kyc'), proId: id, approve: z.boolean(), reason: z.string().max(2000) }),
  z.object({ type: z.literal('settings'), commission: z.number().min(0).max(30), autoHours: z.number().int().min(1).max(720) }),
  z.object({ type: z.literal('category'), name: text, active: z.boolean() }),
  z.object({ type: z.literal('adminServices'), proId: id, services: z.array(z.object({nom:text,tarif:z.number().int().min(1).max(10000000)})).min(1).max(20) }),
  z.object({ type: z.literal('suspend'), proId: id, suspended: z.boolean() }),
  z.object({ type: z.literal('moderate'), missionId: id, hidden: z.boolean() }),
  z.object({ type: z.literal('report'), target: text, reason: text }),
  z.object({ type: z.literal('resolveReport'), reportId: id }),
  z.object({ type: z.literal('clientSuspend'), suspended: z.boolean() }),
])
export type Action = z.infer<typeof actionSchema>
export function applyAction(state: Workspace, input: unknown, now = new Date(), makeId = () => crypto.randomUUID(), paymentMode: PaymentMode = 'mock'): { state: Workspace; result?: string } {
  const a = actionSchema.parse(input)
  const s = structuredClone(state)
  const at = now.toISOString()
  const requireRole = (...roles: Role[]) => { if (!roles.includes(s.role)) throw new Error('Cette action n’est pas autorisée dans cet espace.') }
  const pro = () => { const p = s.pros.find(p => p.id === s.activeProId); if (!p) throw new Error('Professionnel introuvable.'); return p }
  const mission = (missionId: string) => { const m = s.missions.find(m => m.id === missionId); if (!m) throw new Error('Mission introuvable.'); if (s.role === 'professionnel' && m.professionalId !== s.activeProId) throw new Error('Cette mission ne vous est pas attribuée.'); return m }
  const notice = (role: Role, message: string, m?: Mission) => { s.notifications.unshift({ id: makeId(), role, proId: role === 'professionnel' ? m?.professionalId : undefined, text: message, href: m ? `/reservations/${m.id}` : role === 'professionnel' ? '/espace-pro' : '/administration', at, read: false }); s.notifications = s.notifications.slice(0,300) }
  const event = (m: Mission, message: string) => { m.events.push({ at, text: message }); notice('client',message,m); notice('professionnel',message,m) }
  const verified = () => { const p = pro(); if (p.kyc !== 'verifie' || p.suspended) throw new Error('Un professionnel vérifié et actif est requis.'); return p }
  switch(a.type) {
    case 'role':
      s.role = a.role
      if (a.proId) { if (!s.pros.some(p=>p.id===a.proId)) throw new Error('Professionnel introuvable.'); s.activeProId=a.proId }
      break
    case 'profile':
      s.profile = { name:a.name,email:a.email,phone:a.phone,address:a.address,quartier:a.quartier,provinceId:a.provinceId ?? null,cityId:a.cityId ?? null,neighborhoodId:a.neighborhoodId ?? null,photo:a.photo,location:a.location }; s.onboarded=true
      if (a.role) { s.role=a.role; if (a.role === 'professionnel') { let p = s.pros.find(p=>p.id==='mon-profil'); if (!p) { p={...structuredClone(s.pros[0]), id:'mon-profil', name:a.name, photo:'', bio:'', verifie:false, enLigne:false, kyc:'brouillon', reason:'', documents:{}, missions:0,note:0,avis:[],galerie:[],phone:a.phone}; s.pros.push(p) }; s.activeProId=p.id } }
      break
    case 'favorite':
      requireRole('client'); if(!s.pros.some(p=>p.id===a.proId)) throw new Error('Professionnel introuvable.'); s.favorites=s.favorites.includes(a.proId)?s.favorites.filter(v=>v!==a.proId):[...s.favorites,a.proId]; break
    case 'book': {
      requireRole('client'); if (s.clientSuspended) throw new Error('Compte de démonstration suspendu par l’administrateur.')
      const duplicate=s.missions.find(m=>m.requestKey===a.requestKey); if(duplicate) return {state:s,result:duplicate.id}
      const p=s.pros.find(p=>p.id===a.proId && p.kyc==='verifie' && !p.suspended)
      if(!p) throw new Error('Ce professionnel n’est pas vérifié ou est suspendu.')
      if(!p.zones.includes(a.quartier)) throw new Error('Ce professionnel ne dessert pas le quartier choisi.')
      if(!s.categories.some(c=>c.name===p.categorie && c.active)) throw new Error('Cette catégorie n’est pas disponible.')
      if(a.urgent && !p.enLigne) throw new Error('Le professionnel n’est pas disponible immédiatement.')
      const service=p.services.find(v=>v.nom===a.service); if(!service) throw new Error('Service non proposé par ce professionnel.')
      const date=a.urgent?now:new Date(a.date); if(!Number.isFinite(date.getTime()) || (!a.urgent && date<=now)) throw new Error('Choisissez un créneau à venir.')
      const fee=Math.round(service.tarif*s.commission/100)
      const m: Mission={id:`RES-${makeId().slice(0,8).toUpperCase()}`,professionalId:p.id,service:service.nom,description:a.description,address:a.address,quartier:a.quartier,neighborhoodId:a.neighborhoodId ?? null,accessNotes:a.accessNotes,date:date.toISOString(),urgent:a.urgent,status:'en_attente',basePrice:service.tarif,serviceFee:fee,totalPrice:service.tarif+fee,paymentMethod:a.paymentMethod,payment:'a_payer',paymentFlow:{mode:paymentMode,phone:a.phone,deposit:null,settlement:null,decision:null},location:a.location,photos:a.photos,before:[],after:[],report:'',deadline:null,events:[],dispute:null,review:null,requestKey:a.requestKey}
      s.missions.unshift(m); event(m,'Réservation enregistrée · paiement Mobile Money à effectuer'); return {state:s,result:m.id}
    }
    case 'transition': {
      const m=mission(a.missionId)
      if(m.status==='litige') throw new Error('Paiement bloqué : seul l’administrateur peut trancher le litige.')
      if(['accept','refuse','route','start','finish'].includes(a.action)) { requireRole('professionnel'); verified() }
      else requireRole('client')
      const rules={accept:['en_attente','acceptee'],refuse:['en_attente','annulee'],route:['acceptee','en_route'],start:['en_route','en_cours'],finish:['en_cours','a_valider'],validate:['a_valider','payee'],cancel:['en_attente','annulee']} as const
      const [from,to]=rules[a.action]; if(m.status!==from) throw new Error('Cette action n’est plus disponible pour le statut actuel.')
      if(m.paymentFlow && ['accept','route','start','finish','validate'].includes(a.action) && m.paymentFlow.deposit?.status!=='COMPLETED') throw new Error('Le paiement doit être confirmé avant de poursuivre la mission.')
      if(a.action==='finish') { if(!a.before?.length || !a.after?.length || !a.report?.trim()) throw new Error('Photos avant/après et compte rendu obligatoires.'); m.before=a.before; m.after=a.after; m.report=a.report; m.deadline=new Date(now.getTime()+s.autoHours*3600000).toISOString() }
      m.status=to
      if(m.paymentFlow) {
        if(to==='payee') authorizeRelease(s,m)
        if(to==='annulee') authorizeRefund(m)
        event(m,`${statusLabels[m.status]}${to==='payee'?' · versement à effectuer':to==='annulee'?' · remboursement à effectuer si encaissement confirmé':''}`)
      } else {
        if(to==='payee') m.payment='libere'; if(to==='annulee') m.payment='rembourse'
        event(m,`${statusLabels[to]}${to==='payee'?' · paiement simulé libéré':to==='annulee'?' · remboursement simulé':''}`)
      }
      break
    }
    case 'dispute': {
      requireRole('client'); const m=mission(a.missionId)
      if(!['acceptee','en_route','en_cours','a_valider'].includes(m.status)) throw new Error('Impossible d’ouvrir un litige sur cette mission.')
      m.status='litige'; m.payment='bloque'; m.deadline=null; m.dispute={reason:a.reason,evidence:a.evidence}; event(m,'Litige ouvert · paiement bloqué'); notice('administrateur','Un litige nécessite votre décision.',m); break
    }
    case 'resolve': {
      requireRole('administrateur'); const m=mission(a.missionId)
      if(m.status!=='litige' || !m.dispute) throw new Error('Aucun litige ouvert sur cette mission.')
      m.dispute.decision=a.reason
      if(m.paymentFlow) {
        if(a.decision==='refund') {m.status='annulee';authorizeRefund(m)} else authorizeRelease(s,m)
        event(m,`Décision administrateur : ${a.decision==='refund'?'remboursement autorisé':'versement autorisé'} · confirmation financière encore requise — ${a.reason}`)
      } else {m.status=a.decision==='refund'?'annulee':'payee';m.payment=a.decision==='refund'?'rembourse':'libere';event(m,`Décision administrateur : ${a.decision==='refund'?'remboursement simulé':'paiement simulé libéré'} — ${a.reason}`)}
      break
    }
    case 'review': {
      requireRole('client'); const m=mission(a.missionId); if(!['validee','payee'].includes(m.status) || m.review) throw new Error('Un seul avis est autorisé par mission validée.')
      m.review={quality:a.quality,punctuality:a.punctuality,communication:a.communication,comment:a.comment,hidden:false}; event(m,'Avis client publié'); break
    }
    case 'message': {
      if(s.role==='client' && s.clientSuspended) throw new Error('Compte suspendu.')
      if(s.role==='professionnel' && pro().suspended) throw new Error('Compte suspendu.')
      const m=s.missions.find(m=>m.id===a.thread)
      const p=s.pros.find(p=>`PRO-${p.id}`===a.thread)
      if(!m && !p) throw new Error('Conversation introuvable.')
      if(m) mission(m.id)
      if(p && s.role==='professionnel' && p.id!==s.activeProId) throw new Error('Conversation non autorisée.')
      s.messages.push({id:makeId(),thread:a.thread,author:s.role,text:a.text,at}); s.messages=s.messages.slice(-1000)
      notice(s.role==='professionnel'?'client':'professionnel','Nouveau message reçu.',m)
      const n=s.notifications[0]; n.href=`/messages?thread=${encodeURIComponent(a.thread)}`; if(p) n.proId=p.id
      break
    }
    case 'read': s.notifications.forEach(n=>{if(n.role===s.role && (!n.proId || n.proId===s.activeProId)) n.read=true}); break
    case 'availability': requireRole('professionnel'); verified().enLigne=a.available; break
    case 'proProfile': {
      requireRole('professionnel'); const p=pro(); if(p.suspended) throw new Error('Compte suspendu.')
      if(!s.categories.some(c=>c.active && c.name===a.categorie)) throw new Error('Choisissez une catégorie active.')
      if(a.submit && (!a.documents.recto?.length || !a.documents.verso?.length || !a.documents.casier?.length)) throw new Error('Pièce d’identité recto/verso et casier judiciaire obligatoires.')
      const identityChanged=p.name!==a.name || JSON.stringify(p.documents)!==JSON.stringify(a.documents) || p.categorie!==a.categorie
      Object.assign(p,{name:a.name,bio:a.bio,zone:a.zone,zones:a.zones,categorie:a.categorie,metier:a.categorie,experience:a.experience,phone:a.phone,services:a.services,tarifMin:Math.min(...a.services.map(v=>v.tarif)),documents:a.documents,provinceId:a.provinceId ?? null,cityId:a.cityId ?? null,neighborhoodId:a.neighborhoodId ?? null,neighborhoodIds:a.neighborhoodIds ?? p.neighborhoodIds ?? [],serviceIds:a.serviceIds ?? p.serviceIds ?? []})
      if(a.documents.portrait?.[0]) p.photo=`/api/files?id=${encodeURIComponent(a.documents.portrait[0].id)}&view=1`
      if(a.documents.realisations?.length) p.galerie=a.documents.realisations.map(f=>`/api/files?id=${encodeURIComponent(f.id)}&view=1`)
      if(a.submit || identityChanged) { p.kyc=a.submit?'en_cours':'brouillon'; p.verifie=false; p.enLigne=false; p.reason='' }
      if(a.submit) notice('administrateur',`Dossier de ${p.name} à vérifier.`)
      break
    }
    case 'kyc': {
      requireRole('administrateur'); const p=s.pros.find(p=>p.id===a.proId); if(!p || p.kyc!=='en_cours') throw new Error('Le dossier doit être soumis avant validation.')
      if(!a.approve && !a.reason.trim()) throw new Error('Indiquez le motif du refus.')
      if(a.approve && (!p.documents.recto?.length || !p.documents.verso?.length || !p.documents.casier?.length)) throw new Error('Le dossier est incomplet.')
      p.kyc=a.approve?'verifie':'refuse';p.verifie=a.approve;p.reason=a.reason
      notice('professionnel',a.approve?'Votre dossier est validé.':`Dossier refusé : ${a.reason}`);s.notifications[0].proId=p.id;break
    }
    case 'settings': requireRole('administrateur');s.commission=a.commission;s.autoHours=a.autoHours;break
    case 'category': {requireRole('administrateur');const c=s.categories.find(c=>c.name===a.name);if(c)c.active=a.active;else s.categories.push({name:a.name,active:a.active});break}
    case 'adminServices': {requireRole('administrateur');const p=s.pros.find(p=>p.id===a.proId);if(!p)throw new Error('Professionnel introuvable.');p.services=a.services;p.tarifMin=Math.min(...a.services.map(v=>v.tarif));break}
    case 'suspend': {requireRole('administrateur');const p=s.pros.find(p=>p.id===a.proId);if(!p)throw new Error('Professionnel introuvable.');p.suspended=a.suspended;if(a.suspended)p.enLigne=false;break}
    case 'moderate': {requireRole('administrateur');const m=mission(a.missionId);if(!m.review)throw new Error('Avis introuvable.');m.review.hidden=a.hidden;break}
    case 'report': s.reports.unshift({id:makeId(),target:a.target,reason:a.reason,resolved:false});notice('administrateur','Nouveau signalement à traiter.');break
    case 'resolveReport': {requireRole('administrateur');const r=s.reports.find(r=>r.id===a.reportId);if(!r)throw new Error('Signalement introuvable.');r.resolved=true;break}
    case 'clientSuspend':requireRole('administrateur');s.clientSuspended=a.suspended;break
  }
  return {state:s}
}

export function settleDue(state: Workspace, now = new Date()): boolean {
  let changed=false
  for(const m of state.missions) {
    if(m.status!=='a_valider' || m.payment!=='bloque' || !m.deadline || new Date(m.deadline)>now || m.dispute) continue
    if(m.paymentFlow) {
      const p=state.pros.find(p=>p.id===m.professionalId)
      if(m.paymentFlow.deposit?.status!=='COMPLETED' || !p || p.kyc!=='verifie' || p.suspended) continue
      authorizeRelease(state,m)
      m.events.push({at:now.toISOString(),text:'Validation automatique à échéance · versement à effectuer (pas encore payé)'})
    } else {m.status='payee';m.payment='libere';m.events.push({at:now.toISOString(),text:'Validation automatique à échéance · paiement simulé libéré'})}
    for(const role of ['client','professionnel'] as const) state.notifications.unshift({id:crypto.randomUUID(),role,proId:role==='professionnel'?m.professionalId:undefined,text:`${m.id} : validation automatique.`,href:`/reservations/${m.id}`,at:now.toISOString(),read:false})
    changed=true
  }
  state.notifications=state.notifications.slice(0,300)
  return changed
}
