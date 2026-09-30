import type { CollectionConfig } from 'payload'
import { contentEditor } from '@/lib/payload/editor'

// Slug « propre » à partir d'un texte : sans accents, minuscules, tirets.
function slugify(input?: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
}

// Revalide la page publique d'un article (ISR) après publication / suppression.
// Ne fait rien pendant l'import (context.seeding) ni hors contexte Next.
async function revalidateArticle(slug?: string, context?: any) {
  if (!slug || context?.seeding) return
  try {
    const { revalidatePath } = await import('next/cache')
    revalidatePath(`/${slug}/`)
    revalidatePath('/articles/')
    // Section « derniers articles » de la home.
    revalidatePath('/')
    revalidatePath('/sitemap-articles.xml')
    revalidatePath('/sitemap_index.xml')
  } catch {
    /* hors contexte Next (CLI) : ignoré */
  }
}

export const Articles: CollectionConfig = {
  slug: 'articles',
  labels: { singular: 'Article', plural: 'Articles' },
  hooks: {
    // Slug automatique : généré depuis le titre s'il est laissé vide, et
    // toujours normalisé (accents, espaces, majuscules) pour une URL propre.
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        if (!data.slug && data.title) data.slug = slugify(data.title)
        else if (data.slug) data.slug = slugify(data.slug)
        return data
      },
    ],
    beforeChange: [
      ({ data, originalDoc, req }) => {
        // L'import (seeding) ne marque jamais un article comme édité : on
        // préserve le HTML original ET la date de modification d'origine
        // (fidélité SEO). Une vraie édition dans l'admin marque l'article.
        if (req?.context?.seeding) return data
        if (data) {
          // Toute édition dans l'admin → la date de modification (updatedAt de
          // Payload) devient la référence pour dateModified.
          data.editedInAdmin = true
          // Édition spécifique du contenu → rendu depuis Lexical.
          const changed =
            JSON.stringify(data?.content ?? null) !== JSON.stringify(originalDoc?.content ?? null)
          if (changed) data.contentEdited = true
          // À la première mise en ligne sans date renseignée : on fige la date
          // de publication (datePublished des données structurées + tri).
          if (!data.publishedDate && data._status === 'published') {
            data.publishedDate = new Date().toISOString()
          }
        }
        return data
      },
    ],
    afterChange: [
      ({ doc, req }) => {
        void revalidateArticle(doc?.slug, req?.context)
      },
    ],
    afterDelete: [
      ({ doc, req }) => {
        void revalidateArticle(doc?.slug, req?.context)
      },
    ],
  },
  admin: {
    useAsTitle: 'title',
    group: 'Contenu',
    defaultColumns: ['title', 'slug', 'publishedDate', '_status', 'updatedAt'],
    description:
      'Articles de blog. Renseignez le titre, le contenu et l’image à la une, puis le SEO (balise Title, meta description). Le slug (URL) se génère automatiquement depuis le titre. « Publier » met l’article en ligne : la page, les données structurées (Article) et le sitemap se mettent à jour tout seuls.',
    listSearchableFields: ['title', 'slug'],
    components: {
      edit: {
        // Bouton « Supprimer… » avec overlay de création de redirection.
        beforeDocumentControls: [
          '/lib/payload/deleteWithRedirect/DeleteWithRedirect#DeleteWithRedirect',
        ],
      },
    },
  },
  versions: {
    drafts: {
      autosave: { interval: 800 },
    },
    maxPerDoc: 20,
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Titre (H1 / affichage)',
      admin: { description: 'Titre principal (H1) de l’article.' },
    },

    // ── Colonne de droite (sidebar) : réglages de l'article, façon WordPress ──
    // Box repliable regroupant slug, image à la une, auteur, date, extrait.
    {
      type: 'collapsible',
      label: 'Réglages de l’article',
      admin: { position: 'sidebar', initCollapsed: false },
      fields: [
        {
          name: 'slug',
          type: 'text',
          required: true,
          unique: true,
          index: true,
          label: 'Slug (URL)',
          admin: { description: 'ex. geo-vs-aeo → /geo-vs-aeo/' },
        },
        {
          name: 'author',
          type: 'text',
          label: 'Auteur',
          defaultValue: 'ABCM',
        },
        {
          name: 'category',
          type: 'text',
          label: 'Rubrique / catégorie',
          admin: {
            description:
              'Ex. « SEO », « IA », « Réseaux sociaux ». Affichée sur l’article et utilisée dans les données structurées (articleSection). Optionnel.',
          },
        },
        {
          name: 'publishedDate',
          type: 'date',
          label: 'Date de publication',
          admin: { date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'cover',
          type: 'upload',
          relationTo: 'media',
          label: 'Image à la une',
          admin: {
            description:
              'Visuel principal de l’article. Sert aussi d’aperçu au partage sur les réseaux (OpenGraph). Format paysage recommandé, idéalement 1200×630 px.',
          },
        },
        {
          name: 'coverAlt',
          type: 'text',
          label: 'Texte alternatif (alt)',
          admin: { description: 'Décrit l’image pour l’accessibilité et le SEO. Prioritaire sur le alt du média.' },
        },
        {
          name: 'excerpt',
          type: 'textarea',
          label: 'Extrait',
          admin: { description: 'Résumé court affiché dans les listes d’articles. Sert aussi de meta description si celle-ci est vide.' },
        },
      ],
    },
    // SEO : deuxième box repliable dans la sidebar.
    {
      type: 'collapsible',
      label: 'SEO',
      admin: { position: 'sidebar', initCollapsed: true },
      fields: [
        {
          name: 'seoTitle',
          type: 'text',
          label: 'Balise Title',
          admin: { description: 'Titre affiché dans Google (~50-60 caractères). « | ABCM » est ajouté automatiquement. Si vide, le titre de l’article est utilisé.' },
        },
        {
          name: 'metaDescription',
          type: 'textarea',
          label: 'Meta description',
          admin: { description: 'Résumé affiché sous le titre dans Google (~150-160 caractères). Si vide, l’extrait est utilisé.' },
        },
        {
          name: 'canonicalUrl',
          type: 'text',
          label: 'URL canonique (avancé)',
          admin: {
            description:
              'À remplir seulement si le contenu est publié en priorité ailleurs. Laisser vide dans 99 % des cas : l’URL de l’article fait foi.',
          },
        },
        {
          name: 'noindex',
          type: 'checkbox',
          defaultValue: false,
          label: 'Ne pas indexer (noindex)',
          admin: {
            description:
              'Coché : l’article passe en noindex et sort du sitemap (utile pour un contenu de service, une page légère…). Laisser décoché pour un article public normal.',
          },
        },
      ],
    },

    // ─────────────────── Colonne centrale : le contenu ───────────────────
    {
      name: 'summary',
      type: 'array',
      label: 'En bref',
      labels: { singular: 'point', plural: 'points' },
      admin: { description: 'Encart « En bref » (liste de points clés, en tête d’article).' },
      fields: [{ name: 'point', type: 'text', required: true }],
    },
    {
      name: 'content',
      type: 'richText',
      label: 'Contenu',
      admin: { description: 'Corps de l’article (titres H2/H3, paragraphes, listes, images, liens, citations…). C’est ce texte qui est publié et indexé.' },
      editor: contentEditor,
    },
    // HTML original importé : conservé pour référence et repli, mais rangé dans
    // un menu replié fermé par défaut (retiré de la sidebar).
    {
      type: 'collapsible',
      label: 'HTML original (import — référence)',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'legacyHtml',
          type: 'textarea',
          label: 'HTML original',
          admin: {
            readOnly: true,
            description: 'HTML historique conservé pour fidélité de rendu et repli.',
          },
        },
      ],
    },
    {
      // Passe à true dès que le contenu est édité dans l'admin : le site public
      // rend alors le contenu Lexical au lieu du HTML original.
      name: 'contentEdited',
      type: 'checkbox',
      defaultValue: false,
      admin: { hidden: true },
    },
    {
      // Passe à true à la première édition dans l'admin. Tant que false, la
      // dateModified (données structurées / affichage) reste la date de
      // modification d'origine (legacyModified), et non la date d'import.
      name: 'editedInAdmin',
      type: 'checkbox',
      defaultValue: false,
      admin: { hidden: true },
    },
    {
      // Date de modification d'origine (issue du site WordPress). Sert de
      // dateModified tant que l'article n'a pas été édité dans l'admin.
      name: 'legacyModified',
      type: 'date',
      admin: { hidden: true },
    },
    {
      // Chemin de la couverture d'origine (avec %ASSET%), utilisé en repli tant
      // qu'aucune image n'est uploadée dans le média.
      name: 'legacyCoverSrc',
      type: 'text',
      admin: { hidden: true },
    },
  ],
}
