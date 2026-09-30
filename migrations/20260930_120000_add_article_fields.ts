import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Champs ajoutés à la collection « articles » pour l'intégration BO :
// rubrique / catégorie (category), URL canonique (canonical_url) et noindex.
// Colonnes ajoutées sur la table principale ET la table de versions (_articles_v).
// Migration additive et idempotente : les articles existants ne sont pas touchés.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "category" varchar;
  ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "canonical_url" varchar;
  ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "noindex" boolean DEFAULT false;
  ALTER TABLE "_articles_v" ADD COLUMN IF NOT EXISTS "version_category" varchar;
  ALTER TABLE "_articles_v" ADD COLUMN IF NOT EXISTS "version_canonical_url" varchar;
  ALTER TABLE "_articles_v" ADD COLUMN IF NOT EXISTS "version_noindex" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "articles" DROP COLUMN IF EXISTS "category";
  ALTER TABLE "articles" DROP COLUMN IF EXISTS "canonical_url";
  ALTER TABLE "articles" DROP COLUMN IF EXISTS "noindex";
  ALTER TABLE "_articles_v" DROP COLUMN IF EXISTS "version_category";
  ALTER TABLE "_articles_v" DROP COLUMN IF EXISTS "version_canonical_url";
  ALTER TABLE "_articles_v" DROP COLUMN IF EXISTS "version_noindex";`)
}
