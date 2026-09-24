import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { professionals } from '@/lib/data'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headerList = await headers()
  const host = headerList.get('x-forwarded-host') ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const baseUrl = host.startsWith('http') ? host : `https://${host}`

  const proPages = professionals.map((p) => ({
    url: `${baseUrl}/professionnel/${p.id}`,
    lastModified: new Date(),
  }))

  return [
    { url: baseUrl, lastModified: new Date() },
    { url: `${baseUrl}/recherche`, lastModified: new Date() },
    ...proPages,
  ]
}
