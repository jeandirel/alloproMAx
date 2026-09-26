import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { getPublicProfessionals } from '@/lib/public-professionals'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headerList = await headers()
  const host = headerList.get('x-forwarded-host') ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const baseUrl = host.startsWith('http') ? host : `https://${host}`

  const professionals = await getPublicProfessionals({ limit: 120 })
  const proPages = professionals.map((p) => ({
    url: `${baseUrl}/professionnel/${p.id}`,
    lastModified: new Date(),
  }))

  return [
    { url: baseUrl, lastModified: new Date() },
    { url: `${baseUrl}/recherche`, lastModified: new Date() },
    { url: `${baseUrl}/a-propos`, lastModified: new Date() },
    { url: `${baseUrl}/contact`, lastModified: new Date() },
    { url: `${baseUrl}/aide`, lastModified: new Date() },
    { url: `${baseUrl}/mentions-legales`, lastModified: new Date() },
    ...proPages,
  ]
}
