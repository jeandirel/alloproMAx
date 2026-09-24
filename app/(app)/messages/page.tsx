import {Suspense} from 'react'
import {MessagesView} from '@/components/messages-view'
export default function Page(){return <Suspense fallback={<p className="p-6">Chargement des messages…</p>}><MessagesView/></Suspense>}
