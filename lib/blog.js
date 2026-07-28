import fs from "node:fs";
import path from "node:path";

// Articles de blog repris VERBATIM des pages live (content/blog/<slug>.json),
// générés par scripts/extract_article.py. Les encarts « En bref » (résumés)
// vivent à part dans content/blog/summaries.json. Lecture au build (export statique).
const DIR = path.join(process.cwd(), "content", "blog");
const SUMMARIES = path.join(DIR, "summaries.json");

let _summaries = null;
function summaries() {
  if (_summaries) return _summaries;
  try {
    _summaries = JSON.parse(fs.readFileSync(SUMMARIES, "utf8"));
  } catch {
    _summaries = {};
  }
  return _summaries;
}

function readRaw(slug) {
  const p = path.join(DIR, `${slug}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function blogSlugs() {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json") && f !== "summaries.json")
    .map((f) => f.slice(0, -5))
    // Les brouillons (status:draft) sont exclus du repli fichier : ils
    // n'existent publiquement (listing, page, sitemap) que s'ils sont publiés
    // dans Payload.
    .filter((slug) => readRaw(slug)?.status !== "draft");
}

export function getPost(slug) {
  const data = readRaw(slug);
  if (!data) return null;
  // Un brouillon n'est jamais rendu par le repli fichier (voir blogSlugs).
  if (data.status === "draft") return null;
  const s = summaries()[slug];
  if (Array.isArray(s) && s.length) data.summary = s;
  return data;
}

export function getAllPosts() {
  return blogSlugs()
    .map(getPost)
    .filter(Boolean)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}
