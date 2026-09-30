import 'server-only'
import { getPayload } from 'payload'
import config from '@payload-config'
import { ABCM_INFO, FORMATIONS, HUB_URL, MODALITES_URL } from '@/data/formations'
import { ABCM_SERVICES } from '@/data/services'
import { PORTFOLIO_URL } from '@/data/portfolio'
import { getAllPostsFromPayload } from '@/lib/payload-posts'
import { getAllPosts } from '@/lib/blog'
import { getAllPortfolioSummaries } from '@/lib/payload-portfolio'

// ── Sitemap segmenté (sitemap_index + 5 sous-sitemaps) ─────────────────────
//
// Source de vérité : le back-office (Payload). La liste des pages / services /
// formations vient de la collection « pages » (filtrée par `pageType`), les
// articles de la collection « articles », les fiches du portfolio de la
// collection « portfolio ». Chaque URL tombe donc AUTOMATIQUEMENT dans le bon
// sous-sitemap, et une page créée / supprimée / mise en noindex depuis l'admin
// s'y répercute (ISR + revalidation ciblée dans les hooks des collections).
//
// Repli : si la base est injoignable, on retombe sur les données codées en dur
// (data/formations, data/services, fichiers portfolio) pour ne jamais servir un
// sitemap vide.

const BASE = ABCM_INFO.url

export type SitemapKey = 'pages' | 'articles' | 'formations' | 'portfolio' | 'service'

export const SITEMAP_KEYS: SitemapKey[] = ['pages', 'articles', 'formations', 'portfolio', 'service']

export const sitemapFilename = (key: SitemapKey) => `sitemap-${key}.xml`
export const sitemapLoc = (key: SitemapKey) => `${BASE}/${sitemapFilename(key)}`

type Entry = { path: string; lastmod?: string; changefreq?: string; priority?: number }

// Pages de la collection « pages » pour un ou plusieurs `pageType`, hors
// noindex. Renvoie null si la base est injoignable (→ repli codé en dur).
async function pagesByType(types: string[]): Promise<Entry[] | null> {
  try {
    const payload = await getPayload({ config })
    const res = await payload.find({
      collection: 'pages',
      where: { pageType: { in: types } },
      limit: 1000,
      depth: 0,
    })
    return (res.docs || [])
      .filter((d: any) => d?.path && !d.noindex)
      .map((d: any) => ({ path: d.path, lastmod: d.updatedAt || d.createdAt || undefined }))
  } catch {
    return null
  }
}

// « Pages » = pages classiques + pages système (accueil, contact, listings,
// mentions légales, modalités…). Repli : liste codée en dur.
async function pagesEntries(): Promise<Entry[]> {
  const fromDb = await pagesByType(['classique', 'systeme'])
  const list =
    fromDb ||
    ['/', '/contact/', '/articles/', HUB_URL, '/mentions-legales/', MODALITES_URL].map((path) => ({
      path,
    }))
  return list.map((e) => ({ ...e, changefreq: 'monthly', priority: e.path === '/' ? 1 : 0.7 }))
}

// « Service » = fiches service. Repli : data/services.
async function serviceEntries(): Promise<Entry[]> {
  const fromDb = await pagesByType(['service'])
  const list = fromDb || ABCM_SERVICES.map((s: any) => ({ path: `/${s.slug}/` }))
  return list.map((e) => ({ ...e, changefreq: 'monthly', priority: 0.7 }))
}

// « Formations » = fiches formation. Repli : data/formations.
async function formationsEntries(): Promise<Entry[]> {
  const fromDb = await pagesByType(['formation'])
  let list: Entry[]
  if (fromDb) {
    const have = new Set(fromDb.map((e) => e.path))
    // Fiches formation à URL imbriquée (ex. inbound) non gérées comme pages
    // « racine » dans la collection : ajoutées pour ne pas les perdre du sitemap.
    const nested = FORMATIONS.filter(
      (f: any) => f.url !== `/${f.slug}/` && !have.has(f.url),
    ).map((f: any) => ({ path: f.url }))
    list = [...fromDb, ...nested]
  } else {
    list = FORMATIONS.map((f: any) => ({ path: f.url }))
  }
  return list.map((e) => ({ ...e, changefreq: 'monthly', priority: 0.7 }))
}

// « Articles » = articles de blog publiés (Payload, repli fichiers).
async function articlesEntries(): Promise<Entry[]> {
  const posts = (await getAllPostsFromPayload()) || getAllPosts()
  return (posts || [])
    .filter((post: any) => !post.noindex)
    .map((post: any) => ({
      path: `/${post.slug}/`,
      lastmod: post.modified || post.date || undefined,
      changefreq: 'monthly',
      priority: 0.6,
    }))
}

// « Portfolio » = page listing + fiches références (Payload + fichiers, hors
// noindex).
async function portfolioEntries(): Promise<Entry[]> {
  const cases = await getAllPortfolioSummaries()
  const caseEntries = cases
    .filter((c: any) => !c.noindex)
    .map((c: any) => ({
      path: `${PORTFOLIO_URL}${c.slug}/`,
      lastmod: c.lastModified || undefined,
      changefreq: 'monthly',
      priority: 0.6,
    }))
  return [
    { path: PORTFOLIO_URL, changefreq: 'monthly', priority: 0.7 },
    ...caseEntries,
  ]
}

// Entrées d'un sous-sitemap donné.
export async function sectionEntries(key: SitemapKey): Promise<Entry[]> {
  switch (key) {
    case 'pages':
      return pagesEntries()
    case 'service':
      return serviceEntries()
    case 'formations':
      return formationsEntries()
    case 'articles':
      return articlesEntries()
    case 'portfolio':
      return portfolioEntries()
    default:
      return []
  }
}

// ── Sérialisation XML ──────────────────────────────────────────────────────

function xmlEscape(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function toIso(d?: string): string | undefined {
  if (!d) return undefined
  const date = new Date(d)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

// Date de dernière modification d'une liste d'entrées (la plus récente).
function maxLastmod(entries: Entry[]): string | undefined {
  let max = 0
  for (const e of entries) {
    const iso = toIso(e.lastmod)
    if (iso) {
      const t = new Date(iso).getTime()
      if (t > max) max = t
    }
  }
  return max ? new Date(max).toISOString() : undefined
}

// Document <urlset> d'un sous-sitemap.
export function renderUrlset(entries: Entry[]): string {
  const urls = entries
    .map((e) => {
      const loc = xmlEscape(BASE + e.path)
      const lastmod = toIso(e.lastmod)
      return [
        '  <url>',
        `    <loc>${loc}</loc>`,
        lastmod ? `    <lastmod>${lastmod}</lastmod>` : '',
        e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : '',
        typeof e.priority === 'number' ? `    <priority>${e.priority}</priority>` : '',
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

// Document <sitemapindex> pointant vers les 5 sous-sitemaps.
export async function renderSitemapIndex(): Promise<string> {
  const items = await Promise.all(
    SITEMAP_KEYS.map(async (key) => ({
      loc: sitemapLoc(key),
      lastmod: maxLastmod(await sectionEntries(key)),
    })),
  )
  const body = items
    .map((it) => {
      const lastmod = toIso(it.lastmod)
      return [
        '  <sitemap>',
        `    <loc>${xmlEscape(it.loc)}</loc>`,
        lastmod ? `    <lastmod>${lastmod}</lastmod>` : '',
        '  </sitemap>',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`
}

// En-têtes communs aux réponses XML des sitemaps.
export const SITEMAP_HEADERS = {
  'Content-Type': 'application/xml; charset=utf-8',
  'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
}
