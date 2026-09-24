'use client'
import {useEffect,useRef,useState} from 'react'
import {toast} from 'sonner'
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>}
export function PwaSupport(){const event=useRef<InstallEvent|null>(null);const [available,setAvailable]=useState(false)
 useEffect(()=>{if('serviceWorker'in navigator)navigator.serviceWorker.register('/service-worker-v1.js').catch(e=>console.error('Installation du mode hors ligne',e));const capture=(e:Event)=>{e.preventDefault();event.current=e as InstallEvent;setAvailable(true)};const installed=()=>{event.current=null;setAvailable(false)};const prompt=async()=>{if(event.current){await event.current.prompt();await event.current.userChoice;event.current=null;setAvailable(false)}else toast.info('Sur Android : menu du navigateur → Installer l’application. Sur iPhone : Safari → Partager → Sur l’écran d’accueil. Ouvrez l’application hors de l’aperçu intégré si nécessaire.')};window.addEventListener('beforeinstallprompt',capture);window.addEventListener('appinstalled',installed);window.addEventListener('allopro-install',prompt);return()=>{window.removeEventListener('beforeinstallprompt',capture);window.removeEventListener('appinstalled',installed);window.removeEventListener('allopro-install',prompt)}},[])
 return available?<button className="ap-install-prompt fixed right-4 z-30 ap-button shadow-lg" onClick={()=>window.dispatchEvent(new Event('allopro-install'))}>Installer Allo-Pro</button>:null
}
