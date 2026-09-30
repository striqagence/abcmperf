import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Données structurées pilotables depuis le BO des articles :
//  - schema_type (type schema.org : BlogPosting / Article / NewsArticle)
//  - keywords (mots-clés du JSON-LD)
//  - faq (tableau question/réponse → données structurées FAQPage)
// Colonnes ajoutées sur la table principale ET la table de versions (_articles_v).
// Les tables de tableau (articles_faq / _articles_v_version_faq) reprennent
// exactement le schéma des tableaux « summary » (ordre, parent, cascade, index).
// Migration additive et idempotente : aucun article existant n'est modifié.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "schema_type" varchar DEFAULT 'BlogPosting';
  ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "keywords" varchar;
  ALTER TABLE "_articles_v" ADD COLUMN IF NOT EXISTS "version_schema_type" varchar DEFAULT 'BlogPosting';
  ALTER TABLE "_articles_v" ADD COLUMN IF NOT EXISTS "version_keywords" varchar;

  CREATE TABLE IF NOT EXISTS "articles_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" varchar
  );

  CREATE TABLE IF NOT EXISTS "_articles_v_version_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" varchar,
  	"_uuid" varchar
  );

  DO $$ BEGIN
   ALTER TABLE "articles_faq" ADD CONSTRAINT "articles_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  DO $$ BEGIN
   ALTER TABLE "_articles_v_version_faq" ADD CONSTRAINT "_articles_v_version_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "articles_faq_order_idx" ON "articles_faq" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "articles_faq_parent_id_idx" ON "articles_faq" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_articles_v_version_faq_order_idx" ON "_articles_v_version_faq" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_articles_v_version_faq_parent_id_idx" ON "_articles_v_version_faq" USING btree ("_parent_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE IF EXISTS "articles_faq" CASCADE;
  DROP TABLE IF EXISTS "_articles_v_version_faq" CASCADE;
  ALTER TABLE "articles" DROP COLUMN IF EXISTS "schema_type";
  ALTER TABLE "articles" DROP COLUMN IF EXISTS "keywords";
  ALTER TABLE "_articles_v" DROP COLUMN IF EXISTS "version_schema_type";
  ALTER TABLE "_articles_v" DROP COLUMN IF EXISTS "version_keywords";`)
}
