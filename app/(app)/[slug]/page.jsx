import { notFound, redirect, permanentRedirect } from "next/navigation";
import { FormationDetail } from "@/components/site/FormationDetail";
import { ServiceDetail } from "@/components/site/ServiceDetail";
import { AiAdsAgency } from "@/components/site/AiAdsAgency";
import { PayloadAgency } from "@/components/site/PayloadAgency";
import { BlogArticle } from "@/components/site/BlogArticle";
import { ABCM_INFO, getFormation, rootFormationSlugs, formationMetadata } from "@/data/formations";
import { getService, serviceMetadata, ABCM_SERVICES } from "@/data/services";
import { getPost, blogSlugs } from "@/lib/blog";
import { getPostFromPayload, getRedirectFor } from "@/lib/payload-posts";
import { getPageOverride, getFormationOverride, withPageOverride } from "@/lib/payload-pages";

// Fiches formation, fiches service ET articles de blog servis à la racine
// (slugs hérités du site WordPress pour conserver le jus SEO).
//
// Les articles sont rendus depuis Payload (édition en direct), avec repli sur
// les fichiers d'origine si la base est indisponible. ISR : pages statiques,
// régénérées à la publication (revalidatePath dans les hooks Articles) ou au
// plus tard toutes les 5 min. dynamicParams autorise les nouveaux articles
// créés dans l'admin à s'afficher sans rebuild.
export const dynamicParams = true;
export const revalidate = 300;

export function generateStaticParams() {
  return [
    ...rootFormationSlugs().map((slug) => ({ slug })),
    ...ABCM_SERVICES.map((s) => ({ slug: s.slug })),
    ...blogSlugs().map((slug) => ({ slug })),
  ];
}

// Récupère un article. Payload est la source de vérité :
//  - un article publié est rendu (live) ;
//  - `null` = article inexistant ou supprimé → on renvoie null (→ 404), pour
//    qu'une suppression dans l'admin soit bien répercutée ;
//  - une ERREUR = base injoignable → repli sur le fichier d'origine pour ne
//    jamais renvoyer un 500 (aucune régression en cas de coupure).
async function resolvePost(slug) {
  try {
    return await getPostFromPayload(slug);
  } catch {
    return getPost(slug);
  }
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  // Fiches formation / service : métadonnées codées en dur, surchargées en live
  // par la fiche Payload (collection « pages ») si ses champs SEO sont remplis.
  if (getFormation(slug)) return withPageOverride(`/${slug}/`, formationMetadata(slug));
  if (getService(slug)) return withPageOverride(`/${slug}/`, serviceMetadata(slug));
  const post = await resolvePost(slug);
  if (post) {
    // Couverture de l'article en URL absolue pour l'og:image. La source peut
    // être déjà absolue (média Payload) ou contenir le placeholder %ASSET% du
    // repli fichier → on le résout vers le domaine de production.
    const coverUrl = post.cover?.src
      ? post.cover.src.startsWith("%ASSET%")
        ? ABCM_INFO.url + post.cover.src.replace("%ASSET%", "")
        : post.cover.src
      : null;
    return {
      title: post.seoTitle ? { absolute: post.seoTitle } : post.title,
      description: post.description || undefined,
      alternates: { canonical: post.canonicalUrl || `/${slug}/` },
      robots: post.noindex ? { index: false, follow: false } : undefined,
      openGraph: {
        type: "article",
        title: post.seoTitle || post.title,
        description: post.description || undefined,
        publishedTime: post.date || undefined,
        modifiedTime: post.modified || undefined,
        images: coverUrl ? [{ url: coverUrl, alt: post.cover.alt || post.title }] : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title: post.seoTitle || post.title,
        description: post.description || undefined,
        images: coverUrl ? [coverUrl] : undefined,
      },
    };
  }
  return {};
}

export default async function RootSlugPage({ params }) {
  const { slug } = await params;
  const formation = getFormation(slug);
  if (formation) {
    const fo = await getFormationOverride(`/${slug}/`);
    return <FormationDetail formation={formation} fo={fo} />;
  }
  const service = getService(slug);
  if (service) {
    const o = await getPageOverride(`/${slug}/`);
    // Fiche « Agence de publicité IA » : gabarit dédié, plus futuriste et
    // orienté conversion (le reste des services garde le gabarit standard).
    if (slug === "agence-pub-ia") {
      return <AiAdsAgency service={service} h1Override={o?.h1 || ""} contentHtml={o?.contentHtml || ""} />;
    }
    // Fiche « Agence Payload » : gabarit dédié (landing SEO « agence Payload »),
    // même ADN visuel que la landing IA en accent bleu, avec mockup back-office.
    if (slug === "agence-payload") {
      return <PayloadAgency service={service} h1Override={o?.h1 || ""} contentHtml={o?.contentHtml || ""} />;
    }
    return <ServiceDetail service={service} h1Override={o?.h1 || ""} contentHtml={o?.contentHtml || ""} />;
  }
  const post = await resolvePost(slug);
  if (post) return <BlogArticle post={post} />;
  // Article inexistant/supprimé : une redirection gérée (créée dans l'admin,
  // ex. à la suppression) peut exister — on l'applique en live avant le 404.
  const red = await getRedirectFor(`/${slug}/`);
  if (red) {
    if (red.type === "302") redirect(red.to);
    permanentRedirect(red.to);
  }
  notFound();
}
