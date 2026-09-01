import "./globals.css";
import "./ds.css";
import "./site.css";
import "./serviceviz.css";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { ChatWidget } from "@/components/site/ChatWidget";

export const metadata = {
  metadataBase: new URL("https://abcmperformances.com"),
  title: {
    default: "ABCM Performances : agence marketing digital à Strasbourg",
    template: "%s | ABCM",
  },
  description:
    "Agence de communication & marketing digital à Strasbourg depuis 2015 : création de site web, SEO/GEO, Google Ads, réseaux sociaux et stratégie digitale.",
  keywords: ["agence communication Strasbourg", "marketing digital", "création site internet", "référencement SEO", "Google Ads", "community management"],
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "ABCM Performances",
    url: "/",
    title: "ABCM Performances, agence de communication & marketing digital",
    description: "Boostez votre visibilité sur le web & les réseaux. Une équipe à taille humaine à Strasbourg, depuis 2015.",
    images: [
      {
        url: "/og-default.png",
        width: 1200,
        height: 630,
        alt: "ABCM Performances, agence de communication & marketing digital à Strasbourg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ABCM Performances, agence de communication & marketing digital",
    description: "Boostez votre visibilité sur le web & les réseaux. Une équipe à taille humaine à Strasbourg, depuis 2015.",
    images: ["/og-default.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr" className="sv-anim-lazy">
      <head>
        {/* Sans JS, les scènes animées tournent normalement (le JS les met en
            pause hors écran puis les démarre au scroll — voir ScrollReveal). */}
        <noscript>
          <style>{`.sv-anim-lazy .sv-viz, .sv-anim-lazy .sv-viz *, .sv-anim-lazy .sv-screen::before { animation-play-state: running !important; }`}</style>
        </noscript>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Hanken+Grotesk:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Header />
        <main>{children}</main>
        <Footer />
        <ChatWidget />
      </body>
    </html>
  );
}
