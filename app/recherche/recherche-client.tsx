'use client'
import {useMemo,useState} from 'react'
import {Search,Map,LocateFixed,SlidersHorizontal} from 'lucide-react'
import {toast} from 'sonner'
import {professionals,categories,quartiers} from '@/lib/data'
import {distanceKm,zonePoints,type Point} from '@/lib/marketplace'
import {useOptionalWorkspace} from '@/components/workspace-provider'
import {ProfessionalCard} from '@/components/professional-card'
import {PageHeading,Empty} from '@/components/market-ui'
import {ServiceMap} from '@/components/service-map'
const normalize=(s:string)=>s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase()
export function RechercheClient({initialQuery,initialCat,initialZone=''}:{initialQuery:string;initialCat:string;initialZone?:string}){
 const ws=useOptionalWorkspace();const state=ws?.state;const [query,setQuery]=useState(initialQuery);const [cat,setCat]=useState(initialCat);const [online,setOnline]=useState(false);const [verified,setVerified]=useState(false);const [rating,setRating]=useState(0);const [maxPrice,setMaxPrice]=useState('');const [maxDistance,setMaxDistance]=useState('');const [sort,setSort]=useState('note');const [map,setMap]=useState(false);const [filters,setFilters]=useState(false);const [zone,setZone]=useState(initialZone);const [position,setPosition]=useState<Point|null>(null)
 const cats=state?.categories.filter(c=>c.active).map(c=>c.name)||categories.map(c=>c.nom);const data=state?.pros||professionals;const origin=position||state?.profile.location||zonePoints[state?.profile.quartier||'Libreville Centre']||zonePoints['Libreville Centre']
 const filtered=useMemo(()=>{let list=data.filter(p=>!('suspended'in p&&p.suspended)&&cats.includes(p.categorie));if(query.trim())list=list.filter(p=>normalize(`${p.name} ${p.metier} ${p.categorie} ${p.services.map(s=>s.nom).join(' ')}`).includes(normalize(query)));if(cat)list=list.filter(p=>normalize(p.categorie).includes(normalize(cat)));if(zone)list=list.filter(p=>p.zones.includes(zone));if(online)list=list.filter(p=>p.enLigne);if(verified)list=list.filter(p=>p.verifie);list=list.filter(p=>p.note>=rating);if(maxPrice)list=list.filter(p=>p.tarifMin<=Number(maxPrice));if(maxDistance)list=list.filter(p=>distanceKm(origin,zonePoints[p.zone]||zonePoints['Libreville Centre'])<=Number(maxDistance));return list.sort((a,b)=>sort==='prix'?a.tarifMin-b.tarifMin:sort==='prix-desc'?b.tarifMin-a.tarifMin:sort==='distance'?distanceKm(origin,zonePoints[a.zone]||origin)-distanceKm(origin,zonePoints[b.zone]||origin):b.note-a.note)},[data,cats,query,cat,zone,online,verified,rating,maxPrice,maxDistance,origin,sort])

 const filterCount=Number(online)+Number(verified)+Number(rating>0)+Number(Boolean(maxPrice))+Number(Boolean(maxDistance))+Number(Boolean(zone))
 const reset=()=>{setQuery('');setCat('');setZone('');setOnline(false);setVerified(false);setRating(0);setMaxPrice('');setMaxDistance('');setSort('note')}
 return <main className="ap-client-page">
   <div className="mb-7 rounded-[2rem] bg-primary/5 p-5 sm:p-8"><PageHeading title="Le bon professionnel, près de vous" subtitle="Votre prochain coup de main commence ici. Comparez les services, les disponibilités et les tarifs."/>
     <div className="flex flex-wrap gap-2"><label className="relative min-w-0 basis-full sm:flex-1 sm:basis-auto"><Search size={20} className="absolute left-4 top-4 text-muted-foreground"/><input className="ap-input !min-h-14 !rounded-2xl !pl-12" aria-label="Rechercher un service ou un professionnel" list="service-suggestions" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Plombier, ménage, coiffure…"/><datalist id="service-suggestions">{cats.map(c=><option key={c} value={c}/>)}{data.map(p=><option key={p.id} value={p.name}/>)}</datalist></label>
       <button className="ap-secondary flex-1 sm:flex-none lg:hidden" aria-controls="search-filters" aria-expanded={filters} onClick={()=>setFilters(!filters)}><SlidersHorizontal size={18}/>Filtres{filterCount>0&&<span className="rounded-full bg-primary px-2 py-0.5 text-xs text-white">{filterCount}</span>}</button>
       <button className="ap-secondary flex-1 sm:flex-none" aria-pressed={map} onClick={()=>setMap(!map)}><Map size={18}/>{map?'Masquer la carte':'Voir la carte'}</button>
     </div>
     <div aria-label="Catégories de services" className="mt-4 flex gap-2 overflow-x-auto pb-2">{['',...cats].map(c=><button key={c} aria-pressed={cat===c} className={`min-h-11 shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${cat===c?'bg-primary text-white shadow-sm':'bg-white text-foreground hover:bg-muted'}`} onClick={()=>setCat(c)}>{c||'Tous les services'}</button>)}</div>
   </div>
   <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]">
     <aside id="search-filters" className={`${filters?'block':'hidden'} rounded-3xl border border-border/40 bg-white p-5 shadow-sm lg:block`}>
       <div className="mb-5 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-display text-base font-bold"><SlidersHorizontal size={17} className="text-primary"/>Affiner la recherche</h2></div>
       <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
         <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={online} onChange={e=>setOnline(e.target.checked)}/>Disponible maintenant</label>
         <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/>Vérifié uniquement</label>
         <label className="ap-label">Note minimum<select className="ap-input mt-2" value={rating} onChange={e=>setRating(Number(e.target.value))}><option value={0}>Toutes les notes</option><option value={4}>4/5 et plus</option><option value={4.5}>4,5/5 et plus</option></select></label>
         <label className="ap-label">Tarif de départ maximum (FCFA)<input className="ap-input mt-2" type="number" min={0} value={maxPrice} onChange={e=>setMaxPrice(e.target.value)} placeholder="Sans limite"/></label>
         <label className="ap-label">Zone d’intervention<select className="ap-input mt-2" value={zone} onChange={e=>setZone(e.target.value)}><option value="">Toutes les zones</option>{quartiers.map(q=><option key={q}>{q}</option>)}</select></label>
         <label className="ap-label">Distance maximale (km)<input className="ap-input mt-2" type="number" min={0} value={maxDistance} onChange={e=>setMaxDistance(e.target.value)} placeholder="Sans limite"/></label>
         <button className="ap-secondary !px-3" onClick={()=>{if(!navigator.geolocation){toast.error('Localisation indisponible.');return}navigator.geolocation.getCurrentPosition(p=>setPosition({lat:p.coords.latitude,lng:p.coords.longitude}),()=>toast.error('Localisation refusée : distances calculées depuis votre quartier ou Libreville Centre.'),{timeout:10000})}}><LocateFixed size={17} className="shrink-0"/>Utiliser ma position</button>
         <p className="text-xs leading-relaxed text-muted-foreground">Distances à vol d’oiseau ; positions des professionnels approximatives.</p>
       </div><button className="mt-5 min-h-11 w-full rounded-xl bg-muted px-3 text-sm font-semibold text-muted-foreground hover:text-primary" onClick={reset}>Réinitialiser les filtres</button>
     </aside>
     <section className="min-w-0" aria-label="Résultats de recherche">
       <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p role="status" aria-live="polite" className="text-sm text-muted-foreground"><strong className="text-lg text-foreground">{filtered.length}</strong> professionnel{filtered.length>1?'s':''}{cat&&<span className="block mt-1 text-xs">{cat}</span>}</p><label className="flex items-center gap-2 text-sm text-muted-foreground">Trier<select className="ap-input !w-auto !max-w-[190px]" value={sort} onChange={e=>setSort(e.target.value)}><option value="note">Mieux notés</option><option value="prix">Prix croissant</option><option value="prix-desc">Prix décroissant</option><option value="distance">Plus proches</option></select></label></div>
       {map&&<div className="mb-5 overflow-hidden rounded-3xl"><ServiceMap markers={filtered.map(p=>({id:p.id,name:p.name,point:zonePoints[p.zone]||zonePoints['Libreville Centre'],href:`/professionnel/${p.id}`}))} position={position}/></div>}
       {filtered.length?<div className="grid gap-5 sm:grid-cols-2">{filtered.map(p=><div key={p.id} className="flex min-w-0 flex-col"><div className="flex-1"><ProfessionalCard pro={p}/></div><p className="mt-2 px-2 text-xs leading-relaxed text-muted-foreground">À environ {distanceKm(origin,zonePoints[p.zone]||origin).toFixed(1)} km · Avis de démonstration</p></div>)}</div>:<div><Empty text="Aucun professionnel ne correspond à ces critères. Essayez une autre catégorie ou élargissez la distance."/><button className="ap-secondary mt-4" onClick={reset}>Voir tous les professionnels</button></div>}
     </section>
   </div>
 </main>
}
