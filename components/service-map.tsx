'use client'
import {useEffect,useRef,useState} from 'react'
import type {Point} from '@/lib/marketplace'
import {MapPin,LocateFixed} from 'lucide-react'
import {toast} from 'sonner'
export function ServiceMap({markers=[],position,onSelect,caption='Positions des professionnels approximatives, pour la démonstration.'}:{markers?:{id:string;name:string;point:Point;href?:string}[];position?:Point|null;onSelect?:(point:Point)=>void;caption?:string}){
 const [enabled,setEnabled]=useState(false);const [error,setError]=useState('');const element=useRef<HTMLDivElement>(null);const callback=useRef(onSelect)
 useEffect(()=>{callback.current=onSelect},[onSelect])
 const signature=JSON.stringify({markers,position})
 useEffect(()=>{if(!enabled||!element.current)return;let disposed=false;let map:import('leaflet').Map|undefined
 void import('leaflet').then(L=>{if(disposed||!element.current)return;const data=JSON.parse(signature) as {markers:typeof markers;position:Point|null};const center=data.position||data.markers[0]?.point||{lat:0.3924,lng:9.4536};map=L.map(element.current).setView([center.lat,center.lng],12)
 const tileUrl=['https:', '', 'tile.openstreetmap.org', '{z}', '{x}', '{y}.png'].join('/')
 L.tileLayer(tileUrl,{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',maxZoom:18}).on('tileerror',()=>setError('Fond de carte indisponible. Les coordonnées et la liste restent accessibles.')).addTo(map)
 for(const m of data.markers){const el=document.createElement('div');el.textContent=m.name;if(m.href){const a=document.createElement('a');a.href=m.href;a.textContent='Voir le profil';a.style.display='block';el.appendChild(a)}L.circleMarker([m.point.lat,m.point.lng],{radius:9,color:'#0B6E4F',fillColor:'#F5A623',fillOpacity:1}).bindPopup(el).addTo(map)}
 if(data.position)L.circleMarker([data.position.lat,data.position.lng],{radius:8,color:'#1d4ed8',fillOpacity:0.7}).bindPopup('Position sélectionnée').addTo(map)
 map.on('click',e=>callback.current?.({lat:e.latlng.lat,lng:e.latlng.lng}))
 }).catch(e=>{console.error(e);setError('La carte n’a pas pu être chargée.')});return()=>{disposed=true;map?.remove()}},[enabled,signature])
 return <div className="rounded-xl overflow-hidden bg-muted border border-border"><div className="p-3 flex gap-2 flex-wrap justify-between text-xs items-center"><p className="max-w-md">{caption}{onSelect?' Touchez la carte pour placer votre repère.':''}</p>{onSelect&&<button type="button" className="ap-secondary text-xs" onClick={()=>{if(!navigator.geolocation){toast.error('Géolocalisation indisponible.');return}navigator.geolocation.getCurrentPosition(p=>{onSelect({lat:p.coords.latitude,lng:p.coords.longitude});setEnabled(true)},()=>toast.error('Localisation refusée ou indisponible. Choisissez le quartier ou placez un repère sur la carte.'),{timeout:12000})}}><LocateFixed size={16}/>Me localiser</button>}</div>{enabled?<div ref={element} className="h-72 md:h-80" aria-label="Carte interactive de Libreville"/>:<button type="button" onClick={()=>setEnabled(true)} className="w-full h-40 flex flex-col gap-2 items-center justify-center text-emerald-dark"><MapPin size={28}/><span className="font-semibold">Afficher la carte</span><span className="text-xs">Chargement à la demande pour économiser vos données</span></button>}{position&&<p className="p-3 text-xs">Repère : {position.lat.toFixed(5)}, {position.lng.toFixed(5)}</p>}{error&&<p role="status" className="p-3 text-sm text-amber-900">{error}</p>}</div>
}
