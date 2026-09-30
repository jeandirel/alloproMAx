import { PublicShell } from '@/components/public-shell'
import { RequestFunnel } from './request-funnel'

export const metadata = { title: 'Publier un besoin — AlloPro', description: 'Décrivez votre besoin et trouvez le bon professionnel au Gabon.' }

export default function Page() { return <PublicShell><RequestFunnel/></PublicShell> }
