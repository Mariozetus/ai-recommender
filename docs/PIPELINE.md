# Pipeline de actualización de datos

> Estado: v0.1 (F1). Se implementa en F3. Companion de `SCHEMA.md`.

## Fuentes

| ID           | Upstream                              | Datos principales                     | Cadencia             | Auth          | Score confianza |
|--------------|---------------------------------------|---------------------------------------|----------------------|---------------|-----------------|
| `modelsdev`  | `https://models.dev/api.json`         | modelos + capacidades + precios base  | diaria 06:00 UTC     | ninguno       | A               |
| `litellm`    | GitHub release `model_prices_and_context_window.json` | precios detallados + cache + regiones | semanal dom 00:00 UTC + por release | ninguno | A |
| `aa`         | `https://artificialanalysis.ai/api/v2/data/llms/models` | indice compuesto + speed + latencia | diaria 07:00 UTC     | `AA_API_KEY`  | A               |
| `livebench`  | HF datasets `livebench/*`             | benchmarks mensuales anti-contaminacion | mensual              | ninguno       | A               |
| `replicate`  | npm jsDelivr `replicate-models`       | descubrimiento modelos open           | diaria 08:00 UTC     | ninguno       | B               |
| `seed`       | repo `seed/*.json`                   | curacion humana                       | on PR                | n/a           | A+              |

Score confianza = cuánto confiamos en la **calidad** del dato (no en la frescura). A es trusted, B es discovery, A+ override humano.

## Pasos comunes del pipeline

```
    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
    │  fetch  │ -> │  parse  │ -> │ schema  │ -> │ normali │ -> │  diff   │ -> │ upsert  │ -> │  log    │
    └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘
         │              │              │              │              │              │              │
        retry        json/ndjson    draft-12        slug canon     vs last        via           a R2
         │              │              │              │              │           snapshot        + sync_run
       3× 5s          streaming     abort si        + alias       snapshot       (idempotent)
       backoff                       invalido        table
```

### 1. fetch
- `fetch(url, {signal: AbortSignal.timeout(30_000)})`
- `Retry-After: 5` respetado (cabecera estándar), más backoff genérico `5*(n+1)` segundos (3 intentos).
- Persistir la respuesta cruda a **R2** en `raw/{source}/{YYYY-MM-DD}/raw.{ext}` **antes** de parsear. Esto da reproducibilidad total para debug.

### 2. parse
- JSON / NDJSON streaming con `undici`/`response.body.getReader()`.
- Validación previa: `Content-Type` esperado, `Content-Length` razonable, charset UTF-8.
- Errores de parseo abortan el sync; no se inserta nada en `model_*`.

### 3. schema (JSON Schema Draft 2020-12)
- Cada fuente tiene `schemas/<source>.schema.json` comiteado, revisado por humano antes de añadir fuente.
- Validación con `ajv@8`. Si falla, `sync_run.status='failed'`, `errors_json` con las 5 primeras violaciones, no commit.

### 4. normalize
- slugify: `lowercase().replace(/[^a-z0-9./-]/g, '-')`.
- Separar `provider` y `model_id` desde el patrón `{provider}/{model}` cuando aplique; fallback a `slug.parse`.
- Tabla `model_alias` resuelve cross-source IDs (e.g. AA `gpt-5-2` ↔ `gpt-5.2` ↔ models.dev `gpt-5.2`).

### 5. diff
- Comparar contra el último `snapshot WHERE source = ? AND status='applied'`.
- Salida: `{added: Model[], updated: Model[], removed: string[], aliases_resolved: number}`.
- Si `diff` es vacío, `sync_run.status='succeeded'` con `models_updated=0` y se aborta antes del upsert (ahorra escrituras).

### 6. upsert
- Idempotente: misma fila procesada 2× produce mismo estado.
- Resuelve conflictos vía `source_priority` (ver `SCHEMA.md` §"_conflicts").
- Por cada batch crea `snapshot` con `status='validated'`; al cerrar el sync lo pasa a `'applied'`.

### 7. log
- `sync_run.errors_json` (top 5 errores).
- Logs paso-a-paso a `R2:/logs/{source}/{run_id}.jsonl`.
- PR auto-generado en rama `sync/{source}/{YYYY-MM-DD}` con `gh pr create --fill` SOLO si `models_added > 0` o `models_updated > N threshold` (config por fuente).

## GitHub Actions workflows

```yaml
# .github/workflows/sync-modelsdev.yml
name: sync · models.dev
on:
  schedule: [{ cron: '0 6 * * *' }]
  workflow_dispatch:
permissions:
  contents: write
  pull-requests: write
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npm run sync -- --source=modelsdev --run-id=${{ github.run_id }}
        env:
          D1_DATABASE_ID: ${{ secrets.D1_DATABASE_ID }}
          D1_TOKEN: ${{ secrets.D1_TOKEN }}
          R2_BUCKET: ${{ secrets.R2_BUCKET }}
          R2_TOKEN: ${{ secrets.R2_TOKEN }}
      - uses: peter-evans/create-pull-request@v6
        with: { branch: sync/modelsdev/${{ github.event.head_commit.id }}, title: 'sync: models.dev ${{ env.DATE }}' }
```

Workflows equivalentes por fuente, mismo esqueleto. Los secretos viven en el repo; el D1/R2 se aprovisiona via `wrangler`.

## Idempotencia y rollback

- **Aplicar un snapshot es reversible**: insertar un nuevo snapshot con `status='rolled-back'` que restaura los offering rows al snapshot previo (mediante UPSERT por `UNIQUE(model_id, provider_id, region, snapshot_id)`).
- **Eliminar data = mala práctica**. La deprecación usa `deprecation_date` o `status='deprecated'`; nunca borramos filas históricas.
- **Re-aplicar**: si el último sync quedó `partial`, `npm run sync --source=modelsdev --resume` continúa desde el último `chunk` confirmado en `sync_run`.

## Estado y monitoreo

`/api/health` expone:

```json
{
  "status": "ok",
  "sources": {
    "modelsdev": { "last_success": "2026-10-16T06:01:12Z", "last_status": "succeeded", "lag_hours": 7 },
    "aa":        { "last_success": "2026-10-16T07:01:04Z", "last_status": "succeeded", "lag_hours": 6 },
    "livebench": { "last_success": "2026-10-01T00:04:33Z", "last_status": "succeeded", "lag_hours": 360 },
    "replicate": { "last_success": "2026-10-16T08:00:55Z", "last_status": "partial", "lag_hours": 5, "errors": 3 },
    "litellm":   { "last_success": "2026-10-12T00:02:11Z", "last_status": "succeeded", "lag_hours": 96 },
    "seed":      { "last_success": "2026-10-10T18:32:01Z", "last_status": "succeeded", "lag_hours": 138 }
  },
  "totals": { "models": 312, "benchmarks": 27, "active_offerings": 1872, "open_conflicts": 4 }
}
```

Página `/status` muestra:
- Tarjeta por fuente con último lag, próxima ejecución esperada, link a los últimos 5 logs.
- Conflictos abiertos entre fuentes (`offering_conflicts` con delta > 5%).
- Próximas releases detectadas (heurística: `release_date` en los próximos 7 días según HF API).

## Failure modes

| Modo | Detección | Mitigación |
|------|-----------|------------|
| API upstream caída | `fetch` falla 3× | `sync_run.status='failed'`, no commit, alerta a `DISCORD_WEBHOOK`. |
| Schema upstream cambió | `ajv` rejects | Sync falla, schema actualizado en PR por humano antes de reintentar. |
| Datos corruptos (precios negativos, NaN) | `Number.isFinite()` + `_valid_token_price` | Fila descartada, logueada, sync continúa `partial`. |
| Datos duplicados (aliasing) | `UNIQUE` collisions | Nuevo alias en `model_alias` con `confidence<1`, revisión manual pendiente. |
| D1/R2 indisponible | `wrangler` exit code | Workflow reintenta 1× tras 60s; segunda falla = alerta a Discord. |

## Comandos operativos

```
npm run sync -- --source=modelsdev                  # ejecución manual
npm run sync -- --source=modelsdev --dry-run        # sin escribir, devuelve diff
npm run sync:all                                    # todos los sources en orden
npm run snapshot:rollback -- --snapshot=2026-10-01-modelsdev
npm run alias:resolve -- --alias=gpt-5.2 --to=gpt-5.1
```

## Roadmap del pipeline

- **F3** Sincronización `models.dev` + `litellm` + `aa` (los tres más estables).
- **F4** Replicate + livebench cuando UI esté pulida.
- **F5** Webhooks de providers (Hugging Face releases, OpenRouter announcements) para descubrirlos en horas en vez de días.
- **Futuro** Mirror HF dataset del snapshot completo (CC0 datos) para que terceros reaprovechen.
