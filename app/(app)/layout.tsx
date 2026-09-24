import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { BottomNav } from '@/components/bottom-nav'
import { WorkspaceProvider } from '@/components/workspace-provider'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
  return (
    <div className="ap-auth-shell min-h-screen bg-background">
      <WorkspaceProvider>
        <BottomNav />
        {children}
      </WorkspaceProvider>
    </div>
  )
}
