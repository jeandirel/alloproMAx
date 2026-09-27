'use client'
import {useState} from 'react'
import {Upload,FileCheck,Loader2,X} from 'lucide-react'
import {toast} from 'sonner'
import type {FileRef} from '@/lib/marketplace'
export function FileUpload({label,value,onChange,imagesOnly=false}:{label:string;value:FileRef[];onChange:(v:FileRef[])=>void;imagesOnly?:boolean}){
 const [busy,setBusy]=useState(false)
 async function upload(files:FileList|null){if(!files?.length)return;setBusy(true);const added:FileRef[]=[];try{
 if(value.length+files.length>6)throw new Error('6 fichiers maximum par rubrique.')
 for(const f of Array.from(files)){if(f.size>10*1024*1024)throw new Error('Chaque fichier doit peser moins de 10 Mo.');if(imagesOnly&&!['image/jpeg','image/png'].includes(f.type))throw new Error('Choisissez une image JPEG ou PNG.')
 const r=await fetch('/api/files',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.name,size:f.size,contentType:f.type})});const data=await r.json();if(!r.ok)throw new Error(data.error)
 const sent=await fetch(data.uploadUrl,{method:'PUT',headers:{'Content-Type':f.type},body:f});if(!sent.ok)throw new Error('Téléversement interrompu. Réessayez avec une connexion stable.')
 const done=await fetch('/api/files',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({complete:true,id:data.id})});const saved=await done.json();if(!done.ok)throw new Error(saved.error);added.push(saved)
 }
 toast.success('Pièces jointes enregistrées dans votre espace privé.')
 }catch(e){console.error(e);toast.error(e instanceof Error?e.message:'Téléversement impossible.')}finally{if(added.length)onChange([...value,...added]);setBusy(false)}}
 return <div className="space-y-2"><span className="ap-label">{label}</span><label className="border border-dashed border-emerald-300 bg-emerald-50/50 rounded-xl p-4 flex gap-3 items-center cursor-pointer text-sm text-emerald-900">{busy?<Loader2 className="animate-spin"/>:<Upload size={20}/>}<span>{busy?'Téléversement en cours…':'Ajouter des fichiers'}<small className="block text-muted-foreground">{imagesOnly?'JPEG, PNG':'JPEG, PNG, PDF'} · 10 Mo maximum</small></span><input aria-label={label} disabled={busy} type="file" multiple accept={imagesOnly?'image/jpeg,image/png':'image/jpeg,image/png,application/pdf'} className="sr-only" onChange={e=>{void upload(e.target.files);e.target.value=''}}/></label>{value.map(f=><div key={f.id} className="flex gap-2 items-center text-sm"><FileCheck size={16} className="text-emerald-dark"/><a className="truncate underline" href={`/api/files?id=${encodeURIComponent(f.id)}`} download>{f.name}</a><button type="button" aria-label={`Retirer ${f.name}`} onClick={()=>onChange(value.filter(v=>v.id!==f.id))} className="p-2 ml-auto"><X size={16}/></button></div>)}</div>
}
export function FileLinks({files}:{files:FileRef[]}){return <div className="flex flex-wrap gap-2">{files.map(f=><a key={f.id} href={`/api/files?id=${encodeURIComponent(f.id)}`} download className="text-sm text-emerald-dark underline inline-flex gap-1 items-center"><FileCheck size={15}/>{f.name}</a>)}</div>}
