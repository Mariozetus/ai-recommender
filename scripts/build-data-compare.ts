// scripts/build-data-compare.ts — genera public/data/compare.json con la forma
// mínima necesaria para el comparador side-by-side de /compare. 1 row por model
// (no por offering) con los campos más útiles para comparar.
//
// Schema (1 row por model):
//   {i:id, n:name, f:family|null, l:license|null, c:context_window|null,
//    rd:release_date|null,
//    bs:Record<bencId, number>,    // sparse: omit si {}
//    bp:{pn:provider_name, ic:input_cost, oc:output_cost, n:providers} | null,
//    fl:{fc:cap_function_calling, cr:cap_reasoning, vi:mod_image_in,
//        lo:cap_long_horizon, em:mod_embedding,
//        fn:cap_function_calling_alias, jm:cap_json_mode,
//        sm:cap_system_messages, pc:cap_prompt_caching,
//        tb:cap_tool_browse, tc:cap_tool_code_exec, tf:cap_tool_file_search}}
//
// Tamaño esperado: ~900KB para 5925 models (benchmarks sparse ocupan 5KB).
//
// Uso: import { buildDataCompare } from './build-data-compare'; buildDataCompare();

import { existsSync, writeFileSync } from 'node:fs';
import { models } from '../src/lib/data';

type RawModel = (typeof models)[number];
type RawOffering = RawModel['offerings'][number];

interface CompareBestOffering {
  pn: string;
  ic: number;
  oc: number;
  n: number;
}

interface CompareFlags {
  fc: 0 | 1;
  cr: 0 | 1;
  vi: 0 | 1;
  lo: 0 | 1;
  em: 0 | 1;
  jm: 0 | 1;
  sm: 0 | 1;
  pc: 0 | 1;
  tb: 0 | 1;
  tc: 0 | 1;
  tf: 0 | 1;
}

interface CompareRow {
  i: string;
  n: string;
  f: string | null;
  l: string | null;
  c: number | null;
  rd: string | null;
  bs: Record<string, number>;
  bp: CompareBestOffering | null;
  fl: CompareFlags;
}

const OUT = './public/data/compare.json';

function bestOffering(offerings: RawOffering[]): CompareBestOffering | null {
  const priced = offerings.filter((o) => o.input_cost != null && o.output_cost != null);
  if (priced.length === 0) return null;
  priced.sort((a, b) => (a.input_cost ?? 0) + (a.output_cost ?? 0) - (b.input_cost ?? 0) - (b.output_cost ?? 0));
  const best = priced[0]!;
  return {
    pn: best.provider_name,
    ic: best.input_cost!,
    oc: best.output_cost!,
    n: offerings.length,
  };
}

function flagsOf(m: RawModel): CompareFlags {
  return {
    fc: m.flags.cap_function_calling ? 1 : 0,
    cr: m.flags.cap_reasoning ? 1 : 0,
    vi: m.flags.mod_image_in ? 1 : 0,
    lo: m.flags.cap_long_horizon ? 1 : 0,
    em: m.flags.mod_embedding ? 1 : 0,
    jm: m.flags.cap_json_mode ? 1 : 0,
    sm: m.flags.cap_system_messages ? 1 : 0,
    pc: m.flags.cap_prompt_caching ? 1 : 0,
    tb: m.flags.cap_tool_browse ? 1 : 0,
    tc: m.flags.cap_tool_code_exec ? 1 : 0,
    tf: m.flags.cap_tool_file_search ? 1 : 0,
  };
}

export function buildDataCompare(): void {
  if (!existsSync('./public/data/models.json')) {
    throw new Error('public/data/models.json no existe. Ejecuta `bun run build:data` primero.');
  }
  const rows: CompareRow[] = [];
  for (const m of models as RawModel[]) {
    const bs = m.benchmark_scores;
    rows.push({
      i: m.id,
      n: m.name,
      f: m.family,
      l: m.license,
      c: m.context_window,
      rd: m.release_date,
      bs: Object.keys(bs).length > 0 ? bs : {},
      bp: bestOffering(m.offerings ?? []),
      fl: flagsOf(m),
    });
  }
  const json = JSON.stringify(rows);
  writeFileSync(OUT, json);
  console.log(`✓ ${OUT}: ${rows.length} rows (${(json.length / 1024).toFixed(0)} KB)`);
}

if (import.meta.main) {
  buildDataCompare();
}
