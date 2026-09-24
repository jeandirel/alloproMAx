import { professionals, categories, type Professional } from './data'
import type { PaymentFlow, paymentLabels } from './payment-types'

export type Role = 'client' | 'professionnel' | 'administrateur'
export type Status = 'en_attente' | 'acceptee' | 'en_route' | 'en_cours' | 'a_valider' | 'validee' | 'payee' | 'annulee' | 'litige'
export type Point = { lat: number; lng: number }
export type FileRef = { id: string; name: string }
export type Pro = Professional & { kyc: 'brouillon' | 'en_cours' | 'verifie' | 'refuse'; reason: string; documents: Record<string, FileRef[]>; experience: number; location: Point; suspended: boolean; phone: string; provinceId?: string | null; cityId?: string | null; neighborhoodId?: string | null; neighborhoodIds?: string[]; serviceIds?: string[] }
export type Mission = {
  id: string; professionalId: string; service: string; description: string; address: string; quartier: string; neighborhoodId?: string | null; accessNotes: string;
  date: string; urgent: boolean; status: Status; basePrice: number; serviceFee: number; totalPrice: number;
  paymentMethod: 'airtel' | 'moov'; payment: keyof typeof paymentLabels; paymentFlow?: PaymentFlow; location: Point | null;
  photos: FileRef[]; before: FileRef[]; after: FileRef[]; report: string; deadline: string | null;
  events: { at: string; text: string }[]; dispute: { reason: string; evidence: FileRef[]; decision?: string } | null;
  review: { quality: number; punctuality: number; communication: number; comment: string; hidden: boolean } | null;
  requestKey: string;
}
export type Notice = { id: string; role: Role; proId?: string; text: string; href: string; at: string; read: boolean }
export type Message = { id: string; thread: string; author: Role; text: string; at: string }
export type Workspace = {
  role: Role; activeProId: string; onboarded: boolean;
  profile: { name: string; email: string; phone: string; address: string; quartier: string; provinceId?: string | null; cityId?: string | null; neighborhoodId?: string | null; photo: FileRef[]; location: Point | null };
  pros: Pro[]; missions: Mission[]; messages: Message[]; notifications: Notice[]; favorites: string[];
  categories: { name: string; active: boolean }[]; commission: number; autoHours: number;
  clientSuspended: boolean; reports: { id: string; target: string; reason: string; resolved: boolean }[];
}
export const roleLabels: Record<Role, string> = { client: 'Client', professionnel: 'Professionnel', administrateur: 'Administrateur' }
export const statusLabels: Record<Status, string> = { en_attente: 'Demande envoyée', acceptee: 'Acceptée', en_route: 'En route', en_cours: 'Intervention en cours', a_valider: 'Terminée · À valider', validee: 'Validée · Versement en attente', payee: 'Payée', annulee: 'Annulée', litige: 'Litige' }
export const zonePoints: Record<string, Point> = { 'Libreville Centre': { lat: 0.3924, lng: 9.4536 }, Akanda: { lat: 0.525, lng: 9.499 }, Owendo: { lat: 0.303, lng: 9.503 }, PK5: { lat: 0.406, lng: 9.482 }, PK8: { lat: 0.42, lng: 9.51 }, 'Nzeng-Ayong': { lat: 0.439, lng: 9.486 }, 'Port-Gentil': { lat: -0.719, lng: 8.781 }, Franceville: { lat: -1.633, lng: 13.583 } }
export function distanceKm(a: Point, b: Point) { const r = Math.PI / 180; const h = Math.sin((b.lat-a.lat)*r/2)**2 + Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lng-a.lng)*r/2)**2; return 6371*2*Math.atan2(Math.sqrt(h), Math.sqrt(1-h)) }
export function initialWorkspace(name: string, email: string, now = new Date()): Workspace {
  const at = now.toISOString()
  const pros: Pro[] = professionals.map(p => ({ ...p, kyc: 'verifie', reason: '', documents: {}, experience: 5, location: zonePoints[p.zone] || zonePoints['Libreville Centre'], suspended: false, phone: '' }))
  const statuses: Status[] = ['en_route', 'acceptee', 'a_valider', 'en_attente', 'en_cours', 'payee', 'annulee', 'litige']
  const missions: Mission[] = statuses.map((status, i) => {
    const p = pros[i % pros.length]; const service = p.services[0]; const fee = Math.round(service.tarif * 0.05)
    return { id: `RES-${String(i+1).padStart(3,'0')}`, professionalId: p.id, service: service.nom, description: 'Mission de démonstration : intervention à domicile, accès par le portail principal.', address: 'Résidence de démonstration', quartier: p.zone, accessNotes: 'Merci de prévenir à votre arrivée.', date: at, urgent: i === 0, status, basePrice: service.tarif, serviceFee: fee, totalPrice: service.tarif+fee, paymentMethod: i%2 ? 'moov' : 'airtel', payment: status === 'payee' ? 'libere' : status === 'annulee' ? 'rembourse' : 'bloque', location: p.location, photos: [], before: [], after: [], report: ['payee','a_valider'].includes(status) ? 'Intervention de démonstration terminée, contrôle effectué.' : '', deadline: status === 'a_valider' ? new Date(now.getTime()+48*3600000).toISOString() : null, events: [{ at, text: 'Mission de démonstration créée · paiement simulé' }, { at, text: statusLabels[status] }], dispute: status === 'litige' ? { reason: 'La prestation de démonstration est incomplète.', evidence: [] } : null, review: null, requestKey: `seed-${i}` }
  })
  return { role: 'client', activeProId: '1', onboarded: false, profile: { name, email: email.endsWith('.allopro.invalid') ? '' : email, phone: '', address: '', quartier: 'Libreville Centre', photo: [], location: null }, pros, missions, messages: [{ id: 'welcome', thread: 'RES-001', author: 'professionnel', text: 'Bonjour, je prépare mon intervention. Pouvez-vous préciser les indications d’accès ?', at }], notifications: [{ id: 'welcome', role: 'client', text: 'Bienvenue dans votre démonstration Allo-Pro.', href: '/accueil', at, read: false }], favorites: [], categories: [...categories.map(c => ({ name: c.nom, active: true })), ...['Sécurité','Santé','Événementiel'].map(name => ({ name, active: true }))], commission: 5, autoHours: 48, clientSuspended: false, reports: [] }
}
