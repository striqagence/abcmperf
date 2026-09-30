import * as migration_20260708_103551_initial from './20260708_103551_initial';
import * as migration_20260708_134254_add_article_seo_fields from './20260708_134254_add_article_seo_fields';
import * as migration_20260709_090000_add_page_formation_fields from './20260709_090000_add_page_formation_fields';
import * as migration_20260720_130325_add_portfolio_collection from './20260720_130325_add_portfolio_collection';
import * as migration_20260721_093000_add_portfolio_case_fields from './20260721_093000_add_portfolio_case_fields';
import * as migration_20260721_140000_add_portfolio_featured_fields from './20260721_140000_add_portfolio_featured_fields';
import * as migration_20260930_120000_add_article_fields from './20260930_120000_add_article_fields';

export const migrations = [
  {
    up: migration_20260708_103551_initial.up,
    down: migration_20260708_103551_initial.down,
    name: '20260708_103551_initial',
  },
  {
    up: migration_20260708_134254_add_article_seo_fields.up,
    down: migration_20260708_134254_add_article_seo_fields.down,
    name: '20260708_134254_add_article_seo_fields',
  },
  {
    up: migration_20260709_090000_add_page_formation_fields.up,
    down: migration_20260709_090000_add_page_formation_fields.down,
    name: '20260709_090000_add_page_formation_fields',
  },
  {
    up: migration_20260720_130325_add_portfolio_collection.up,
    down: migration_20260720_130325_add_portfolio_collection.down,
    name: '20260720_130325_add_portfolio_collection'
  },
  {
    up: migration_20260721_093000_add_portfolio_case_fields.up,
    down: migration_20260721_093000_add_portfolio_case_fields.down,
    name: '20260721_093000_add_portfolio_case_fields',
  },
  {
    up: migration_20260721_140000_add_portfolio_featured_fields.up,
    down: migration_20260721_140000_add_portfolio_featured_fields.down,
    name: '20260721_140000_add_portfolio_featured_fields',
  },
  {
    up: migration_20260930_120000_add_article_fields.up,
    down: migration_20260930_120000_add_article_fields.down,
    name: '20260930_120000_add_article_fields',
  },
];
