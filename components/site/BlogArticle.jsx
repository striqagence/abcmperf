import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Button, Icon } from "@/components/ds";
import { ABCM_INFO, assetPath } from "@/data/formations";
import { buildToc } from "@/lib/toc";
import { BlogToc } from "@/components/site/BlogToc";

const SITE = ABCM_INFO.url;
const ARTICLES_URL = "/articles/";

function frDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(d);
}
function withBase(s, base) {
  return typeof s === "string" ? s.split("%ASSET%").join(base) : s;
}
function abs(src) {
  // %ASSET%/blog/... -> URL absolue (domaine de production) pour le JSON-LD
  return SITE + String(src || "").replace("%ASSET%", "");
}
function initials(name) {
  if (!name) return "A";
  return name.trim().slice(0, 1).toUpperCase();
}

// Photo de profil réelle par auteur — reprend les portraits de la section équipe.
const AUTHOR_PHOTOS = {
  Audrey: "team/audrey.webp",
  "Audrey Braun": "team/audrey.webp",
  Thomas: "team/thomas.webp",
  Caroline: "team/caroline.webp",
  Anto: "team/anto.webp",
  Johan: "team/johan.webp",
  Patrice: "team/patrice.webp",
  Sakhavat: "team/sakhavat.webp",
  "Jérôme": "team/jerome.webp",
};

function AuthorAvatar({ author, cls }) {
  const photo = author && AUTHOR_PHOTOS[author];
  if (photo) {
    return (
      <span className={`${cls} ${cls}--photo`}>
        <img src={assetPath(photo)} alt={author} loading="lazy" style={{ objectPosition: "center 20%" }} />
      </span>
    );
  }
  return <span className={cls} aria-hidden="true">{initials(author)}</span>;
}

// Types schema.org autorisés pour un article (piloté depuis le BO).
const ARTICLE_TYPES = ["BlogPosting", "Article", "NewsArticle"];

function buildJsonLd(post) {
  const url = SITE + `/${post.slug}/`;
  const img = post.cover ? abs(post.cover.src) : undefined;
  const type = ARTICLE_TYPES.includes(post.schemaType) ? post.schemaType : "BlogPosting";
  // Mots-clés : chaîne « a, b, c » du BO → tableau propre pour le JSON-LD.
  const keywords = String(post.keywords || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": type,
    "@id": url + "#article",
    headline: post.title,
    description: post.description || undefined,
    articleSection: post.category || undefined,
    keywords: keywords.length ? keywords : undefined,
    image: img ? [img] : undefined,
    datePublished: post.date || undefined,
    dateModified: post.modified || post.date || undefined,
    inLanguage: "fr-FR",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Person", name: post.author || ABCM_INFO.name },
    publisher: {
      "@type": "Organization",
      name: ABCM_INFO.name,
      url: SITE,
      logo: { "@type": "ImageObject", url: SITE + "/logo-abcm-full.png" },
    },
  };
}

// Données structurées FAQPage (résultats enrichis « questions/réponses »).
// Renvoie null tant qu'aucune question/réponse valide n'est renseignée.
function buildFaqJsonLd(post) {
  const faq = Array.isArray(post.faq) ? post.faq : [];
  const items = faq
    .filter((f) => f && f.question && f.answer)
    .map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    }));
  if (!items.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": SITE + `/${post.slug}/#faq`,
    mainEntity: items,
  };
}

export function BlogArticle({ post }) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const { html, toc } = buildToc(withBase(post.html || "", base));
  const hasToc = toc.length >= 2;
  const cover = post.cover ? { ...post.cover, src: withBase(post.cover.src, base) } : null;
  const jsonLd = buildJsonLd(post);
  const faqJsonLd = buildFaqJsonLd(post);
  const faq = faqJsonLd ? post.faq : null;
  const summary = Array.isArray(post.summary) ? post.summary : null;
  const dayPub = String(post.date || "").slice(0, 10);
  const dayMod = String(post.modified || "").slice(0, 10);
  const showModified = dayMod && dayMod !== dayPub;

  return (
    <article className="blog">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {faqJsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      ) : null}

      <header className="blog-hero on-dark" data-theme="dark">
        <div className="blog-hero__deco" aria-hidden="true">
          <span className="blog-hero__blob blog-hero__blob--1" />
          <span className="blog-hero__blob blog-hero__blob--2" />
        </div>
        <div className="container blog-hero__inner">
          <nav className="blog-crumbs" aria-label="Fil d'Ariane">
            <Link href="/">Accueil</Link>
            <span aria-hidden="true">/</span>
            <Link href={ARTICLES_URL}>Articles</Link>
            <span aria-hidden="true">/</span>
            <span className="blog-crumbs__current">{post.title}</span>
          </nav>
          {post.category ? (
            <span className="blog-hero__cat"><Icon name="sparkles" size={14} /> {post.category}</span>
          ) : null}
          <h1 className="blog-hero__title">{post.title}</h1>
          <div className="blog-hero__meta">
            {post.author ? (
              <span className="blog-hero__by"><AuthorAvatar author={post.author} cls="blog-hero__avatar" />Par {post.author}</span>
            ) : null}
            {post.date ? <span><Icon name="clock" size={15} /> Publié le {frDate(post.date)}</span> : null}
            {showModified ? <span className="blog-hero__upd">Mis à jour le {frDate(post.modified)}</span> : null}
          </div>
        </div>
      </header>

      {cover ? (
        <div className="container">
          <figure className="blog-cover">
            <Image
              src={cover.src}
              alt={cover.alt || post.title}
              width={1600}
              height={900}
              sizes="(max-width: 880px) 100vw, 880px"
              priority
              style={{ width: "100%", height: "auto" }}
            />
          </figure>
        </div>
      ) : null}

      <div className={"container blog-layout" + (hasToc ? " blog-layout--toc" : "")}>
        {hasToc ? <BlogToc toc={toc} /> : null}
        <div className="blog-wrap">
        {summary ? (
          <aside className="blog-tldr" aria-label="En bref">
            <p className="blog-tldr__title"><Icon name="sparkles" size={18} /> En bref</p>
            <ul className="blog-tldr__list">
              {summary.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </aside>
        ) : null}

        <div className="blog-content" dangerouslySetInnerHTML={{ __html: html }} />

        {faq ? (
          <section className="blog-faq" aria-label="Questions fréquentes">
            <h2 className="blog-faq__title">Questions fréquentes</h2>
            <div className="blog-faq__list">
              {faq.map((f, i) => (
                <details key={i} className="blog-faq__item">
                  <summary className="blog-faq__q">{f.question}</summary>
                  <div className="blog-faq__a">{f.answer}</div>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        <section className="blog-author" aria-label="Auteur">
          <AuthorAvatar author={post.author} cls="blog-author__avatar" />
          <div className="blog-author__body">
            <span className="blog-author__kicker">Écrit par</span>
            <span className="blog-author__name">{post.author || ABCM_INFO.name}</span>
            <p className="blog-author__bio">
              {post.author || "L'équipe"} fait partie de l&apos;équipe d&apos;ABCM Performances, agence de communication
              digitale et organisme de formation certifié Qualiopi à Strasbourg.
            </p>
          </div>
        </section>

        <footer className="blog-foot">
          <Link href={ARTICLES_URL} className="blog-foot__back">
            <Icon name="arrow-left" size={16} /> Tous les articles
          </Link>
          <div className="blog-foot__cta">
            <p>Envie d&apos;aller plus loin sur le sujet&nbsp;?</p>
            <Button as={Link} href="/contact" variant="primary" iconRight={<Icon name="arrow-right" size={18} />}>Parler à un expert</Button>
          </div>
        </footer>
        </div>
      </div>
    </article>
  );
}
