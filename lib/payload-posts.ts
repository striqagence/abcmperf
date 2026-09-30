import 'server-only'
import { cache } from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { renderLexicalToHtml } from '@/lib/lexical-html'
import { getPost } from '@/lib/blog'

// Couverture d'un article : média uploadé (URL CDN) en priorité, sinon chemin
// d'origine conservé (%ASSET%), sinon ultime repli sur la couverture du fichier
// d'origine — garantit que les couvertures ne disparaissent jamais.
function coverFrom(doc: any): { src: string; alt: string } | null {
  if (doc.cover && typeof doc.cover === 'object' && doc.cover.url) {
    return { src: doc.cover.url, alt: doc.coverAlt || doc.cover.alt || '' }
  }
  if (doc.legacyCoverSrc) {
    return { src: doc.legacyCoverSrc, alt: doc.coverAlt || '' }
  }
  const filePost: any = getPost(doc.slug)
  if (filePost?.cover) {
    return { src: filePost.cover.src, alt: doc.coverAlt || filePost.cover.alt || '' }
  }
  return null
}

// Date de première publication : FIGÉE (jamais modifiée par une édition).
function postDate(doc: any): string | undefined {
  return doc.publishedDate || doc.createdAt || undefined
}
// Date de modification : la date d'origine tant que l'article n'a pas été édité
// dans l'admin ; sinon la date de dernière sauvegarde Payload.
function postModified(doc: any): string | undefined {
  const date = postDate(doc)
  return doc.editedInAdmin ? doc.updatedAt || date : doc.legacyModified || date
}

// Objet « post » complet (même forme que lib/blog.js), avec le corps HTML.
async function buildFullPost(doc: any) {
  // Corps : HTML original exact tant que le contenu n'a pas été édité dans
  // l'admin ; sinon rendu du contenu Lexical (les modifs passent en live).
  // Un échec de rendu Lexical ne doit PAS faire échouer la récupération de
  // l'article (sinon l'appelant croirait la base injoignable et retomberait sur
  // le fichier) : on conserve alors le HTML original comme repli.
  let html = doc.legacyHtml || ''
  if (doc.contentEdited && doc.content?.root) {
    try {
      const rendered = await renderLexicalToHtml(doc.content)
      if (rendered) html = rendered
    } catch {
      /* rendu Lexical en échec : on garde legacyHtml */
    }
  }
  const summary = Array.isArray(doc.summary)
    ? doc.summary.map((s: any) => s?.point).filter(Boolean)
    : []
  // FAQ (données structurées FAQPage + affichage bas d'article) : on ne garde
  // que les entrées avec question ET réponse renseignées.
  const faq = Array.isArray(doc.faq)
    ? doc.faq
        .map((f: any) => ({ question: String(f?.question || '').trim(), answer: String(f?.answer || '').trim() }))
        .filter((f: any) => f.question && f.answer)
    : []
  return {
    slug: doc.slug,
    title: doc.title,
    seoTitle: doc.seoTitle || '',
    description: doc.metaDescription || doc.excerpt || '',
    author: doc.author || '',
    category: doc.category || '',
    canonicalUrl: doc.canonicalUrl || '',
    noindex: Boolean(doc.noindex),
    schemaType: doc.schemaType || 'BlogPosting',
    keywords: doc.keywords || '',
    faq,
    date: postDate(doc),
    modified: postModified(doc),
    cover: coverFrom(doc),
    summary,
    html,
  }
}

// Un article PUBLIÉ depuis Payload (rendu live, repli fidèle sur le HTML
// d'origine). Renvoie `null` si l'article n'existe pas / n'est pas publié
// (l'appelant renvoie alors un 404 — une suppression est donc bien répercutée).
// LÈVE une erreur si Payload / la base est injoignable : dans ce cas l'appelant
// retombe sur le rendu fichier pour ne jamais renvoyer un 500.
// Mémoïsé par requête (dédup entre generateMetadata et le rendu).
export const getPostFromPayload = cache(async (slug: string) => {
  const payload = await getPayload({ config })
  const res = await payload.find({
    collection: 'articles',
    where: { slug: { equals: slug }, _status: { equals: 'published' } },
    limit: 1,
    depth: 2, // peuple cover + images du contenu
    draft: false,
  })
  const doc: any = res.docs?.[0]
  if (!doc) return null
  return buildFullPost(doc)
})

// Tous les articles publiés, forme allégée pour le listing /articles/ et le
// sitemap (pas de rendu HTML du corps). Renvoie `null` si Payload est
// injoignable → l'appelant retombe sur les fichiers (lib/blog).
export const getAllPostsFromPayload = cache(async () => {
  try {
    const payload = await getPayload({ config })
    const res = await payload.find({
      collection: 'articles',
      where: { _status: { equals: 'published' } },
      limit: 1000,
      depth: 1, // peuple la couverture (URL CDN)
      draft: false,
      sort: '-publishedDate',
    })
    const posts = (res.docs || []).map((doc: any) => ({
      slug: doc.slug,
      title: doc.title,
      description: doc.metaDescription || doc.excerpt || '',
      category: doc.category || '',
      noindex: Boolean(doc.noindex),
      date: postDate(doc),
      modified: postModified(doc),
      cover: coverFrom(doc),
    }))
    // Tri par date décroissante (publishedDate manquante → repli createdAt).
    return posts.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  } catch {
    return null
  }
})

// Redirection gérée (Payload) pour une URL donnée. Permet aux redirections
// créées dans l'admin — notamment à la suppression d'un article/page — d'être
// actives en LIVE, sans attendre le prochain déploiement (les redirections de
// next.config, elles, ne s'appliquent qu'au build). Renvoie null si aucune
// redirection ou si la base est injoignable.
export const getRedirectFor = cache(async (from: string): Promise<{ to: string; type: '301' | '302' } | null> => {
  try {
    const payload = await getPayload({ config })
    const res = await payload.find({
      collection: 'redirects',
      where: { from: { equals: from } },
      limit: 1,
      depth: 0,
    })
    const doc: any = res.docs?.[0]
    if (!doc?.to) return null
    return { to: String(doc.to), type: doc.type === '302' ? '302' : '301' }
  } catch {
    return null
  }
})
