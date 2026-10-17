// src/lib/catalog.ts — queries del catálogo, server-side.
// Usa Drizzle ORM sobre bun:sqlite (driver nativo de Bun).
// En prod (CF Pages) se sustituirá por drizzle-orm/d1 con la misma schema.
// @ts-nocheck — corre solo en Bun runtime; los tipos de bun:sqlite no son
// válidos en Node (CI corre astro check en Node). El runtime real es Bun.
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { eq, and, or, like, gte, lte, sql, desc, asc, isNotNull } from 'drizzle-orm';
import { model, modelProviderOffering, provider } from '../../db/schema';

const SCHEMA = { model, modelProviderOffering, provider } as const;
type DB = BunSQLiteDatabase<typeof SCHEMA>;

let _db: DB | null = null;
function getDb(): DB {
  if (!_db) {
    _db = drizzle(new Database('./db/data/ai-recommender.db', { readonly: true }), { schema: SCHEMA });
  }
  return _db;
}

export interface CatalogFilters {
  q?: string;
  providerId?: string;
  license?: string;
  hasFunctionCalling?: boolean;
  hasReasoning?: boolean;
  hasVision?: boolean;
  hasLongContext?: boolean;
  minContext?: number;
  maxInputCost?: number;
  isOpenSource?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: 'name' | 'release_date' | 'context_window' | 'input_cost' | 'output_cost';
  sortDir?: 'asc' | 'desc';
}

export interface CatalogRow {
  model_id: string;
  model_name: string;
  family: string | null;
  release_date: string | null;
  context_window: number | null;
  license: string | null;
  open_weights: boolean | null;
  parameter_count: string | null;
  mod_text_in: number;
  mod_image_in: number;
  mod_embedding: number;
  cap_function_calling: number;
  cap_reasoning: number;
  cap_long_horizon: number;
  provider_id: string;
  provider_name: string;
  provider_type: string;
  region: string;
  input_cost: number | null;
  output_cost: number | null;
  cache_read: number | null;
}

export interface CatalogResult {
  rows: CatalogRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

const MODEL_TABLE = model;
const OFFERING_TABLE = modelProviderOffering;
const PROVIDER_TABLE = provider;

export function queryCatalog(filters: CatalogFilters): CatalogResult {
  const db = getDb();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  const conds: ReturnType<typeof eq>[] = [];
  if (filters.q) {
    const q = `%${filters.q}%`;
    conds.push(or(
      like(MODEL_TABLE.name, q),
      like(MODEL_TABLE.id, q),
      like(MODEL_TABLE.family, q),
    )!);
  }
  if (filters.providerId) conds.push(eq(OFFERING_TABLE.providerId, filters.providerId));
  if (filters.license) conds.push(eq(MODEL_TABLE.license, filters.license));
  if (filters.hasFunctionCalling) conds.push(eq(MODEL_TABLE.capFunctionCalling, 1));
  if (filters.hasReasoning) conds.push(eq(MODEL_TABLE.capReasoning, 1));
  if (filters.hasVision) conds.push(eq(MODEL_TABLE.modImageIn, 1));
  if (filters.hasLongContext) conds.push(gte(MODEL_TABLE.contextWindow, 100000));
  if (filters.minContext) conds.push(gte(MODEL_TABLE.contextWindow, filters.minContext));
  if (filters.maxInputCost != null) {
    conds.push(lte(OFFERING_TABLE.inputCostPerMillionUsd, filters.maxInputCost));
  }
  if (filters.isOpenSource) {
    conds.push(or(
      like(MODEL_TABLE.license, '%apache%'),
      like(MODEL_TABLE.license, '%mit%'),
      like(MODEL_TABLE.license, '%open%'),
      like(MODEL_TABLE.license, '%community%'),
    )!);
  }

  const where = conds.length ? and(...conds) : undefined;

  // Sort
  const sortCol = (() => {
    switch (filters.sortBy) {
      case 'release_date':   return MODEL_TABLE.releaseDate;
      case 'context_window': return MODEL_TABLE.contextWindow;
      case 'input_cost':     return OFFERING_TABLE.inputCostPerMillionUsd;
      case 'output_cost':    return OFFERING_TABLE.outputCostPerMillionUsd;
      case 'name':
      default:               return MODEL_TABLE.name;
    }
  })();
  const order = filters.sortDir === 'desc' ? desc(sortCol) : asc(sortCol);

  const rows = db
    .select({
      model_id: MODEL_TABLE.id,
      model_name: MODEL_TABLE.name,
      family: MODEL_TABLE.family,
      context_window: MODEL_TABLE.contextWindow,
      license: MODEL_TABLE.license,
      parameter_count: MODEL_TABLE.parameterCount,
      mod_text_in: MODEL_TABLE.modTextIn,
      mod_image_in: MODEL_TABLE.modImageIn,
      mod_embedding: MODEL_TABLE.modEmbedding,
      cap_function_calling: MODEL_TABLE.capFunctionCalling,
      cap_reasoning: MODEL_TABLE.capReasoning,
      cap_long_horizon: MODEL_TABLE.capLongHorizon,
      provider_id: OFFERING_TABLE.providerId,
      provider_name: PROVIDER_TABLE.name,
      provider_type: PROVIDER_TABLE.type,
      region: OFFERING_TABLE.region,
      input_cost: OFFERING_TABLE.inputCostPerMillionUsd,
      output_cost: OFFERING_TABLE.outputCostPerMillionUsd,
      cache_read: OFFERING_TABLE.cacheReadCostPerMillionUsd,
    })
    .from(MODEL_TABLE)
    .innerJoin(OFFERING_TABLE, eq(OFFERING_TABLE.modelId, MODEL_TABLE.id))
    .innerJoin(PROVIDER_TABLE, eq(PROVIDER_TABLE.id, OFFERING_TABLE.providerId))
    .where(where)
    .orderBy(order, asc(MODEL_TABLE.id), asc(OFFERING_TABLE.providerId))
    .limit(pageSize)
    .offset(offset)
    .all();

  const total = db
    .select({ c: sql<number>`count(*)` })
    .from(MODEL_TABLE)
    .innerJoin(OFFERING_TABLE, eq(OFFERING_TABLE.modelId, MODEL_TABLE.id))
    .innerJoin(PROVIDER_TABLE, eq(PROVIDER_TABLE.id, OFFERING_TABLE.providerId))
    .where(where)
    .get()?.c ?? 0;

  return { rows, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
}

export function listProviders(): Array<{ id: string; name: string; type: string }> {
  const db = getDb();
  return db.select({ id: PROVIDER_TABLE.id, name: PROVIDER_TABLE.name, type: PROVIDER_TABLE.type })
    .from(PROVIDER_TABLE)
    .orderBy(asc(PROVIDER_TABLE.name))
    .all();
}

export function listLicenses(): Array<{ license: string; count: number }> {
  const db = getDb();
  return db
    .select({ license: MODEL_TABLE.license, count: sql<number>`count(*)` })
    .from(MODEL_TABLE)
    .where(isNotNull(MODEL_TABLE.license))
    .groupBy(MODEL_TABLE.license)
    .orderBy(desc(sql`count(*)`))
    .all()
    .filter((r): r is { license: string; count: number } => r.license != null);
}
