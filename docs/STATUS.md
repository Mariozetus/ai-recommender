# Pipeline status — live

> Estado actual del pipeline. Reflejo markdown de `/status` + `/api/health`. Se regenera por GH Actions tras cada sync.

## Última snapshot aplicada

| Field  | Value                                              |
|--------|----------------------------------------------------|
| ID     | `2026-10-16-models.dev`                            |
| Fecha  | `2026-10-16T13:39:07Z`                             |
| Source | `models.dev` (live API)                            |

## Conteos actuales

| Métrica | Valor |
|---------|------:|
| Modelos | 5872 |
| Proveedores | 230 |
| Benchmarks | 9 |
| Active offerings | 8916 |
| Benchmark scores | 51 |

## Sync runs recientes

| Cuándo | Source | Status | Added |
|--------|--------|--------|------:|
| `2026-10-16T13:39:07Z` | models.dev | succeeded | 8897 |
| `2026-10-16T00:00:00Z` | seed       | succeeded | 10 |

> Las otras 4 fuentes (litellm, aa, livebench, replicate) están en F3.2+.

## Próximos pasos

| Source | Estado | ETA |
|--------|--------|-----|
| models.dev | ✅ activo en F3.1 | cron diario 06:00 UTC via GH Actions |
| litellm | ⏳ F3.2 | idem cadencia semanal |
| aa | ⏳ F3.3 | API-key gated |
| livebench | ⏳ F3.4 | HF monthly releases |
| replicate | ⏳ F3.4 | jsDelivr dump |

## Conflictos entre fuentes

_(vacío: solo 1 fuente activa, sin solapamiento todavía)_
