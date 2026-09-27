'use client'
import {useWorkspace,WorkspaceLoading} from './workspace-provider'
import {PageHeading,Empty} from './market-ui'
import {ProfessionalCard} from './professional-card'
export function FavoritesView(){const {state,act,busy}=useWorkspace();if(!state)return <WorkspaceLoading/>;const pros=state.pros.filter(p=>state.favorites.includes(p.id));return <div className="ap-page"><PageHeading title="Mes favoris" subtitle="Vos professionnels préférés, faciles à retrouver."/>{pros.length?<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">{pros.map(p=><div key={p.id}><ProfessionalCard pro={p}/><button className="text-sm text-rose-700 p-3" disabled={busy} onClick={()=>void act({type:'favorite',proId:p.id})}>Retirer des favoris</button></div>)}</div>:<Empty text="Vous n’avez pas encore ajouté de favori." href="/recherche"/>}</div>}
