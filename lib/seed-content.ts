import fs from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { convertHTMLToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
import type { Payload } from 'payload'

import { contentEditor } from '@/lib/payload/editor'
import { ABCM_SERVICES, serviceMetadata } from '@/data/services'
import { rootFormationSlugs, getFormation, formationMetadata, formationPriceFrom } from '@/data/formations'
import { PORTFOLIO_THEMES } from '@/data/portfolio'

type SeedOpts = {
  payload: Payload
  log?: (m: string) => void
  // Ignore tout upload de média (couvertures + images en ligne). Utile tant
  // qu'aucun stockage (Vercel Blob) n'est branché : l'import reste « texte ».
  skipMedia?: boolean
}

/**
 * Importe le contenu existant du dépôt dans Payload. Idempotent (upsert par
 * slug / chemin). Renvoie un récap chiffré.
 */
export async function runContentSeed({ payload, log = () => {}, skipMedia = false }: SeedOpts) {
  const editorConfig = await editorConfigFactory.fromEditor({
    config: payload.config,
    editor: contentEditor,
  })

  const CWD = process.cwd()
  const BLOG_DIR = path.join(CWD, 'content', 'blog')
  const PUBLIC_DIR = path.join(CWD, 'public')

  const upsert = async (collection: any, field: string, value: string, data: Record<string, any>) => {
    const existing = await payload.find({
      collection,
      where: { [field]: { equals: value } },
      limit: 1,
      depth: 0,
      ...(collection === 'articles' ? { draft: true } : {}),
    })
    if (existing.docs.length) {
      return payload.update({
        collection,
        id: existing.docs[0].id,
        data,
        overrideAccess: true,
        context: { seeding: true },
      })
    }
    return payload.create({ collection, data, overrideAccess: true, context: { seeding: true } })
  }

  const uploadImageBySrc = async (src?: string, alt?: string): Promise<number | string | null> => {
    if (skipMedia) return null
    if (!src) return null
    if (/^https?:\/\//i.test(src)) return null
    const rel = src.replaceAll('%ASSET%', '').replace(/^\/+/, '').split('?')[0].split('#')[0]
    let abs: string
    try {
      abs = path.join(PUBLIC_DIR, decodeURIComponent(rel))
    } catch {
      abs = path.join(PUBLIC_DIR, rel)
    }
    if (!fs.existsSync(abs)) return null
    const filename = path.basename(abs)
    const found = await payload.find({
      collection: 'media',
      where: { filename: { equals: filename } },
      limit: 1,
      depth: 0,
    })
    if (found.docs.length) return found.docs[0].id
    const created = await payload.create({
      collection: 'media',
      filePath: abs,
      data: { alt: alt || '' },
      overrideAccess: true,
    })
    return created.id
  }

  const collectUploadNodes = (node: any, acc: any[] = []): any[] => {
    if (!node || !Array.isArray(node.children)) return acc
    for (const child of node.children) {
      if (child?.type === 'upload') acc.push(child)
      else collectUploadNodes(child, acc)
    }
    return acc
  }

  const pruneDroppedNodes = (node: any) => {
    if (!node || !Array.isArray(node.children)) return
    node.children = node.children.filter((c: any) => !c.__drop)
    node.children.forEach(pruneDroppedNodes)
  }

  const htmlToContent = async (html: string) => {
    const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0])
    const imgIds: (number | string | null)[] = []
    for (const tag of imgTags) {
      const src = (tag.match(/\ssrc="([^"]+)"/i) || [])[1]
      const alt = (tag.match(/\salt="([^"]*)"/i) || [])[1] || ''
      imgIds.push(await uploadImageBySrc(src, alt))
    }
    const content: any = convertHTMLToLexical({ editorConfig, html, JSDOM })
    const uploadNodes = collectUploadNodes(content.root)
    uploadNodes.forEach((n, i) => {
      const id = imgIds[i]
      if (id != null) {
        n.relationTo = 'media'
        n.value = id
      } else {
        n.__drop = true
      }
    })
    pruneDroppedNodes(content.root)
    return content
  }

  // ── 1. Articles ──────────────────────────────────────────────────────────
  const summaries: Record<string, string[]> = fs.existsSync(path.join(BLOG_DIR, 'summaries.json'))
    ? JSON.parse(fs.readFileSync(path.join(BLOG_DIR, 'summaries.json'), 'utf8'))
    : {}
  const articleFiles = fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'summaries.json')

  log(`▶ Articles (${articleFiles.length})${skipMedia ? ' — sans images (skipMedia)' : ''}`)
  let aOk = 0
  let aFail = 0
  for (const file of articleFiles) {
    const slug = file.slice(0, -5)
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(BLOG_DIR, file), 'utf8'))
      const html = String(raw.html || '').replaceAll('%ASSET%', '')
      const content = await htmlToContent(html)
      const coverId = await uploadImageBySrc(raw.cover?.src, raw.cover?.alt)
      const summaryArr = Array.isArray(summaries[slug])
        ? summaries[slug].map((point) => ({ point }))
        : []
      await upsert('articles', 'slug', slug, {
        title: raw.title || slug,
        slug,
        author: raw.author || 'ABCM',
        publishedDate: raw.date || undefined,
        cover: coverId || undefined,
        coverAlt: raw.cover?.alt || '',
        excerpt: raw.description || '',
        summary: summaryArr,
        content,
        seoTitle: raw.seoTitle || '',
        metaDescription: raw.description || '',
        legacyHtml: raw.html || '',
        legacyCoverSrc: raw.cover?.src || '',
        legacyModified: raw.modified || raw.date || undefined,
        contentEdited: false,
        editedInAdmin: false,
        // Aligne les timestamps système sur les dates d'origine (affichage
        // admin cohérent). Payload les respecte à la création.
        createdAt: raw.date || undefined,
        updatedAt: raw.modified || raw.date || undefined,
        // Un article marqué `"status": "draft"` dans son fichier est importé en
        // BROUILLON (invisible du site public tant qu'il n'est pas publié dans
        // l'admin) ; sinon publié comme le reste du contenu historique.
        _status: raw.status === 'draft' ? 'draft' : 'published',
      })
      aOk++
    } catch (e: any) {
      aFail++
      log(`  ✗ ${slug} — ${e?.message || e}`)
    }
  }

  // ── 2. Redirections ──────────────────────────────────────────────────────
  const findStubs = (dir: string, acc: string[] = []): string[] => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) findStubs(full, acc)
      else if (entry.name === 'index.html') acc.push(full)
    }
    return acc
  }
  let rOk = 0
  for (const stubPath of findStubs(PUBLIC_DIR)) {
    try {
      const stub = fs.readFileSync(stubPath, 'utf8')
      if (!/http-equiv="refresh"/i.test(stub)) continue
      const from = '/' + path.relative(PUBLIC_DIR, path.dirname(stubPath)).split(path.sep).join('/') + '/'
      const canon = stub.match(/rel="canonical"\s+href="([^"]+)"/i)
      const refresh = stub.match(/content="0;\s*url=([^"]+)"/i)
      let to = ''
      if (canon) to = canon[1].replace(/^https?:\/\/[^/]+/i, '')
      else if (refresh) to = refresh[1]
      if (!to) continue
      await upsert('redirects', 'from', from, { from, to, type: '301' })
      rOk++
    } catch (e: any) {
      log(`  ✗ redirect ${stubPath} — ${e?.message || e}`)
    }
  }
  log(`▶ Redirections : ${rOk}`)

  // ── 3. Pages ─────────────────────────────────────────────────────────────
  // Chaque page porte ses balises SEO (Title / Meta / H1) reprises des valeurs
  // actuellement rendues, pour qu'elles apparaissent — et soient éditables —
  // dans le back-office. `seedPage` ne REMPLIT que les champs SEO vides : une
  // valeur déjà saisie dans l'admin n'est jamais écrasée par un rebuild.
  const titleStr = (t: any): string => (typeof t === 'string' ? t : t?.absolute || '')

  const staticPages: any[] = [
    { path: '/', title: 'Accueil', pageType: 'classique' },
    { path: '/contact/', title: 'Contact', pageType: 'classique',
      seoTitle: 'Contact : devis & projets de formation',
      metaDescription: 'Contactez ABCM Performances à Strasbourg : renseignement ou projet de formation (intra/inter, présentiel ou visio). Réponse rapide, organisme Qualiopi.' },
    { path: '/portfolio/', title: 'Portfolio', pageType: 'portfolio',
      seoTitle: "Nos références et cas d'études | ABCM Performances",
      metaDescription: "Découvrez les réalisations d'ABCM Performances : sites internet, stratégie digitale, marketing, formations, publicité et graphisme pour des entreprises du Grand Est." },
    { path: '/articles/', title: 'Blog', pageType: 'classique' },
    { path: '/formations-strasbourg/', title: 'Formations', pageType: 'classique',
      seoTitle: 'Formations digitales & IA à Strasbourg',
      metaDescription: '18 formations professionnelles à Strasbourg et en visio : IA, réseaux sociaux, marketing digital, web et marque employeur. Qualiopi, financement OPCO.' },
    { path: '/mentions-legales/', title: 'Mentions légales', pageType: 'systeme',
      seoTitle: 'Mentions légales & RGPD',
      metaDescription: 'Mentions légales du site ABCM Performances : éditeur, propriété intellectuelle, cookies, protection des données personnelles (RGPD).' },
    { path: '/modalites-de-la-formation/', title: 'Modalités de la formation', pageType: 'systeme',
      seoTitle: 'Modalités de formation',
      metaDescription: "Modalités, moyens pédagogiques, techniques et d'encadrement des formations ABCM Performances, organisme certifié Qualiopi à Strasbourg." },
  ]
  const servicePages = ABCM_SERVICES.map((s: any) => {
    const md: any = serviceMetadata(s.slug)
    return {
      path: `/${s.slug}/`,
      title: s.name || s.title || s.slug,
      pageType: 'service',
      seoTitle: titleStr(md.title),
      metaDescription: md.description || '',
      h1: s.title || '',
    }
  })
  const formationPages = rootFormationSlugs().map((slug: string) => {
    const f: any = getFormation(slug)
    const md: any = formationMetadata(slug)
    return {
      path: `/${slug}/`,
      title: f?.title || slug,
      pageType: 'formation',
      seoTitle: titleStr(md.title),
      metaDescription: md.description || '',
      h1: f?.title || '',
      // Contenu structuré de la fiche formation, repris tel quel de l'existant.
      formationContent: {
        lead: f?.lead || '',
        prix: f ? formationPriceFrom(f) : undefined,
        duree: f?.duree || '',
        public: f?.public || '',
        prerequis: f?.prerequis || '',
        modalites: f?.modalites || '',
        financement: f?.financement || '',
        objectifs: (f?.objectifs || []).map((o: string) => ({ objectif: o })),
        programme: (f?.programme || []).map((m: any) => ({
          module: m?.module || '',
          points: (m?.points || []).map((p: string) => ({ point: p })),
        })),
        tarifs: (f?.tarifs || []).map((t: string) => ({ tarif: t })),
        faq: (f?.faq || []).map((x: any) => ({ question: x?.q || '', reponse: x?.a || '' })),
      },
    }
  })

  const seedPage = async (p: any) => {
    const existing = await payload.find({
      collection: 'pages',
      where: { path: { equals: p.path } },
      limit: 1,
      depth: 2,
    })
    if (existing.docs.length) {
      const cur: any = existing.docs[0]
      const data: any = { title: p.title, pageType: p.pageType }
      // fill-only-empty : ne jamais écraser une valeur éditée dans l'admin.
      if (p.seoTitle && !cur.seoTitle) data.seoTitle = p.seoTitle
      if (p.metaDescription && !cur.metaDescription) data.metaDescription = p.metaDescription
      if (p.h1 && !cur.h1) data.h1 = p.h1
      // Contenu formation : peuplé uniquement s'il n'a jamais été renseigné.
      if (p.formationContent) {
        const curFC: any = cur.formationContent || {}
        const alreadyFilled =
          (Array.isArray(curFC.programme) && curFC.programme.length > 0) || Boolean(curFC.lead)
        if (!alreadyFilled) data.formationContent = p.formationContent
      }
      return payload.update({ collection: 'pages', id: cur.id, data, overrideAccess: true, context: { seeding: true } })
    }
    return payload.create({
      collection: 'pages',
      data: {
        path: p.path,
        title: p.title,
        pageType: p.pageType,
        seoTitle: p.seoTitle || '',
        metaDescription: p.metaDescription || '',
        h1: p.h1 || '',
        ...(p.formationContent ? { formationContent: p.formationContent } : {}),
      },
      overrideAccess: true,
      context: { seeding: true },
    })
  }

  let pOk = 0
  for (const p of [...staticPages, ...servicePages, ...formationPages]) {
    try {
      await seedPage(p)
      pOk++
    } catch (e: any) {
      log(`  ✗ page ${p.path} — ${e?.message || e}`)
    }
  }
  log(`▶ Pages : ${pOk}`)

  // ── 4. Portfolio ───────────────────────────────────────────────────────────
  // Importe les fiches références historiques (content/portfolio/*.json), qui
  // n'existaient que comme repli fichier, dans la collection « portfolio » pour
  // les rendre visibles ET éditables au back-office. Idempotent : une fiche déjà
  // présente en base (créée / éditée dans l'admin) n'est jamais écrasée.
  const PORTFOLIO_DIR = path.join(CWD, 'content', 'portfolio')
  const VALID_CATS = new Set(PORTFOLIO_THEMES.map((t: any) => t.id))
  const PORTFOLIO_SERVICE_SLUGS = new Set(ABCM_SERVICES.map((s: any) => s.slug))

  const mapPromo = (promo: any) => {
    const slug = String(promo?.url || '').replace(/^\/+|\/+$/g, '')
    if (promo?.kind === 'Service' && PORTFOLIO_SERVICE_SLUGS.has(slug)) return { kind: 'service', service: slug }
    if (promo?.kind === 'Formation' && slug) return { kind: 'formation', formation: slug }
    return { kind: 'none' }
  }

  const portfolioFiles = fs.existsSync(PORTFOLIO_DIR)
    ? fs.readdirSync(PORTFOLIO_DIR).filter((f) => f.endsWith('.json'))
    : []
  log(`▶ Portfolio (${portfolioFiles.length})${skipMedia ? ' — sans images (skipMedia)' : ''}`)
  let pfOk = 0
  let pfFail = 0
  for (const file of portfolioFiles) {
    const slug = file.slice(0, -5)
    try {
      const existing = await payload.find({
        collection: 'portfolio',
        where: { slug: { equals: slug } },
        limit: 1,
        depth: 0,
      })
      if (existing.docs.length) continue // ne jamais écraser une fiche déjà en base
      const raw = JSON.parse(fs.readFileSync(path.join(PORTFOLIO_DIR, file), 'utf8'))
      const coverId = await uploadImageBySrc(raw.cover)
      const logoId = await uploadImageBySrc(raw.logo)
      // Corps libre historique → champ « content ». On retire le placeholder
      // %ASSET% pour que les liens internes pointent vers de vraies URLs.
      const content = await htmlToContent(String(raw.body || '').replaceAll('%ASSET%', ''))
      const categories = (Array.isArray(raw.categories) ? raw.categories : []).filter((c: string) =>
        VALID_CATS.has(c),
      )
      // Typé `any` : les valeurs (catégories, service de l'encart…) viennent des
      // fichiers et sont validées à l'exécution, pas assignables aux littéraux
      // générés par Payload.
      const data: any = {
        title: raw.title || slug,
        slug,
        status: 'published',
        projectType: raw.projectType || '',
        categories,
        ...(coverId != null ? { cover: coverId } : {}),
        ...(logoId != null ? { logo: logoId } : {}),
        content,
        promo: mapPromo(raw.promo),
        // Politique du site : fiches références en noindex (comme le repli fichier).
        noindex: true,
      }
      await payload.create({
        collection: 'portfolio',
        data,
        overrideAccess: true,
        context: { seeding: true },
      })
      pfOk++
    } catch (e: any) {
      pfFail++
      log(`  ✗ portfolio ${slug} — ${e?.message || e}`)
    }
  }
  log(`▶ Portfolio : ${pfOk}${pfFail ? ` (échecs ${pfFail})` : ''}`)

  const summary = { articles: aOk, articleFails: aFail, redirects: rOk, pages: pOk, portfolio: pfOk }
  log(`✅ Import terminé — articles ${aOk}/${articleFiles.length} (échecs ${aFail}), redirections ${rOk}, pages ${pOk}, portfolio ${pfOk}`)
  return summary
}
