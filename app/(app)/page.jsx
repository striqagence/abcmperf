import { Hero } from "@/components/site/Hero";
import { Clients } from "@/components/site/Clients";
import { TypewriterQuote } from "@/components/site/TypewriterQuote";
import { ScrollReveal } from "@/components/site/ScrollReveal";
import { Testimonials } from "@/components/site/Testimonials";
import { Services } from "@/components/site/Services";
import { Team } from "@/components/site/Team";
import { FormationsPromo } from "@/components/site/FormationsPromo";
import { WhyUs } from "@/components/site/WhyUs";
import { LatestArticles } from "@/components/site/LatestArticles";
import { AgencyMap } from "@/components/site/AgencyMap";
import { homeJsonLd } from "@/lib/site-jsonld";

export const metadata = {
  alternates: { canonical: "/" },
  // Vérification Search Console (rend <meta name="google-site-verification" ...>).
  verification: { google: "xnVh_3QP7RWakJkMA54p1op9QZrfpH0yMg5_4SpC7j4" },
};

// ISR : la home est régénérée à la publication / suppression d'un article
// (revalidatePath('/') dans les hooks Articles) ou au plus tard toutes les
// 5 min, pour que la section « derniers articles » reste à jour sans rebuild.
export const revalidate = 300;

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd()) }}
      />
      <ScrollReveal />
      <Hero />
      <Clients />
      <TypewriterQuote />
      <Services />
      <Testimonials />
      <Team />
      <FormationsPromo />
      <WhyUs />
      <LatestArticles />
      <AgencyMap />
    </>
  );
}
