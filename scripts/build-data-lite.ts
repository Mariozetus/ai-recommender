// scripts/build-data-lite.ts — genera public/data/catalog-lite.json con la forma
// mínima necesaria para el filtro client-side de /catalog. Sin benchmark_scores,
// sin family, sin cache_read, sin region, sin max_output. Short keys para
// reducir ~75% el tamaño (~1MB vs 4.7MB del models.json completo).
//
// Output: public/data/catalog-lite.json (consumido por /catalog via fetch on-demand).
//
// Schema (1 row por model×offering):
//   {i:id, n:name, l:license|null, c:context_window|null,
//    fc:cap_function_calling, cr:cap_reasoning, vi:mod_image_in,
//    p:provider_id, pn:provider_name, pt:provider_type,
//    ic:input_cost|null, oc:output_cost|null}
//
// Uso: import { buildDataLite } from './build-data-lite'; buildDataLite();

import { existsSync, writeFileSync } from 'node:fs';
import { models } from '../src/lib/data';

type RawModel = (typeof models)[number];
type RawOffering = RawModel['offerings'][number];

interface LiteRow {
  i: string;
  n: string;
  l: string | null;
  c: number | null;
  fc: 0 | 1;
  cr: 0 | 1;
  vi: 0 | 1;
  p: string;
  pn: string;
  pt: string;
  ic: number | null;
  oc: number | null;
  rd: string | null;  // release_date YYYY-MM-DD o null
}

const OUT = './public/data/catalog-lite.json';

export function buildDataLite(): void {
  if (!existsSync('./public/data/models.json')) {
    throw new Error('public/data/models.json no existe. Ejecuta `bun run build:data` primero.');
  }
  const rows: LiteRow[] = [];
  for (const m of models as RawModel[]) {
    const fc: 0 | 1 = m.flags.cap_function_calling ? 1 : 0;
    const cr: 0 | 1 = m.flags.cap_reasoning ? 1 : 0;
    const vi: 0 | 1 = m.flags.mod_image_in ? 1 : 0;
    for (const o of (m.offerings ?? []) as RawOffering[]) {
      rows.push({
        i: m.id,
        n: m.name,
        l: m.license,
        c: m.context_window,
        fc,
        cr,
        vi,
        p: o.provider_id,
        pn: o.provider_name,
        pt: o.provider_type,
        ic: o.input_cost,
        oc: o.output_cost,
        rd: m.release_date,
      });
    }
  }
  const json = JSON.stringify(rows);
  writeFileSync(OUT, json);
  console.log(`✓ ${OUT}: ${rows.length} rows (${(json.length / 1024).toFixed(0)} KB)`);
}

if (import.meta.main) {
  buildDataLite();
}

