# Recomendador — diseño v0.2 (post-feedback)

> **Premisas** (fijadas tras feedback):
> - Quiz sin jerga. Cada chip del paso 1 lleva tooltip de una frase y link al glosario.
> - Coste en unidades humanas (€/mes, $/proyecto), no $/1M tokens en la UI principal.
> - Proveedor = primera clase: la recomendación es un par **(modelo, provider)**, no solo un modelo.

## Filosofía

Un usuario que nunca tocó IA llega, responde 4 preguntas, y sale con:
1. Una recomendación concreta con coste realista para su bolsillo.
2. Tres bullets que explican el porqué en lenguaje llano.
3. Un link "qué significa esto" por cada bullet, abriendo el glosario.

Cualquier término técnico (token, embedding, context window, function calling…) tiene:
- Glosario en `/[locale]/concepts/<slug>` con definición, ejemplo, analogía.
- Tooltip inline en el chip que lo introduzca.

## Quiz en 4 pasos + capa avanzada colapsable

### Paso 1 — "¿Qué quieres hacer?"

| Chip (UI)                       | Concepto canónico | Benchmarks pesados                                                | Capabilities críticas                              |
|---------------------------------|--------------------|-------------------------------------------------------------------|---------------------------------------------------|
| "Hablar y redactar"             | chat general       | MMLU-Pro · GPQA · HLE · MT-Bench · TruthfulQA                      | text in/out                                       |
| "Programar y debuggear"         | coding             | SWE-bench-Verified · LiveCodeBench · Aider · HumanEval+            | function_calling, long_horizon                     |
| "Agentes que actúan por mí"     | agent              | τ-bench · GAIA · OSWorld · WebArena · BrowseComp                   | function_calling, tool_browse/code_exec/file_search, long_horizon |
| "Entender imágenes y documentos"| vision             | MMMU · ChartQA · DocVQA · MMVet                                   | mod_image_in                                      |
| "Buscar en mis documentos"      | long-context RAG   | RULER · LongBench-v2 · NoCha                                       | context_window ≥ 100k                             |
| "Embeddings para búsqueda"      | embedding          | MTEB · BEIR · MIRACL                                               | mod_embedding                                     |
| "Generar imágenes o audio"      | (futuro)           | —                                                                 | —                                                 |

Cada chip en UI: icono SVG + etiqueta + tooltip "Una frase que lo explica" + link "Explicado en detalle". El link abre `/[locale]/concepts/<use_case>` que es un page_content cargada de la tabla homónima.

### Paso 2 — "¿Dónde corre?"

| Chip                            | Significado                 | Filtro aplicado                         |
|---------------------------------|------------------------------|------------------------------------------|
| "En la nube, sin instalar nada" | Cloud API                    | offering.provider.type = cloud-api       |
| "En mi propio servidor u ordenador" | Self-hosted              | offering.provider.type = self-hosted     |
| "En el navegador"               | Web/WASM (futuro)            | offering.provider.runnable_in_browser    |
| "No lo sé, recomiéndame"        | Default = cloud API          | sin filtro                               |

### Paso 3 — "¿Cuánto al mes?" (anchors humanos)

| Chip                          | Bin         | Volumen chars/mes asumido (IN + OUT)          | Equivalencia humana                                       |
|-------------------------------|-------------|----------------------------------------------|-----------------------------------------------------------|
| "Gratis, $0"                  | `free`      |                                              | Solo modelos con free tier u open-source self-hosted       |
| "Menos de $5 / mes"           | `low`       | 300k IN + 600k OUT ≈ 100 conversaciones cortas | Uso personal ligero                                       |
| "Entre $5 y $50 / mes"        | `middle`    | 2M IN + 8M OUT ≈ 500-1000 iteraciones        | Uso personal intensivo / equipo pequeño                  |
| "Más de $50 / mes"            | `premium`   | 20M IN + 80M OUT                             | Producción o empresa                                      |
| "Mostrame todas las opciones" | `no-limit`  | sin techo                                    | Sin filtro de precio                                       |

**Anclaje humano explícito por chip**: cada opción muestra tooltip "≈ 100 conversaciones de ~1500 caracteres, o un proyecto pequeño". El recomendador ordena también por presentación del coste (no solo números abstractos).

### Paso 4 — "Avanzado" (colapsable, opt-in)

Defaults que aplica el recomendador si el usuario no expande este paso:

| Campo         | Default     | Opciones UI                                              |
|---------------|-------------|----------------------------------------------------------|
| Idiomas       | `multi`     | en / es / multi / non-en                                 |
| Capacidades   | (sin extras) | vision · json_strict · prompt_caching · tools · agent    |
| Contexto      | `>=8k`      | <8k · 32k · 128k · 1M+                                   |
| Privacidad    | `cloud OK`  | cloud OK · local obligatorio                             |

## Modelo de scoring

Fórmula sin cambios de v0.1:

```
score = w_q·calidad + w_p·(1−costo) + w_c·ajuste_cap + w_d·ajuste_deploy + w_r·ajuste_idioma
```

w_q+w_p+w_c+w_d+w_r = 1. w_q = slider calidad↔precio (default **0.5**, no 0.7 — respeta más el bolsillo).

### Cambio: `costo` como ratio del bin elegido

```
costo_in_norm   = (input_cost_per_million_usd  · IN_chars  / 1_000_000) / budget_cap
costo_out_norm  = (output_cost_per_million_usd · OUT_chars / 1_000_000) / budget_cap
costo_norm      = saturate(0..1, costo_in_norm + costo_out_norm)

budget_cap = [
  free     → 0,
  low      → 5,         // USD/mes
  middle   → 50,
  premium  → 500,
  no-limit → +∞         // el ranking se hace por absoluto, no relativo
]
```

`IN_chars` y `OUT_chars` son los del bin de presupuesto (paso 3), no del caso de uso (eso es backstop para `costo_in_norm`). Permite que el propio bin actúe como autorregulador:

- El usuario marca "low" → `budget_cap = 5` → cualquier offering con costo > $5/mes para ese volumen sale del top automáticamente.
- Si no hay candidato dentro del bin, se relaja: rank por score absoluto + UI muestra "ninguno encaja estrictamente en tu presupuesto; aquí tienes lo más cercano".

### UI: solo unidades humanas

El panel de resultado **nunca** enseña $/M tokens. La página de detalle del modelo (no del resultado) sí lo permite, detrás de un toggle "modo avanzado" colapsable por defecto.

Mostramos en su lugar:
- "≈ **$0.80 / mes** con uso ligero (100 conversaciones/mes)"
- "≈ **$14 / mes** si procesas 500k caracteres al día"
- "Open source → **gratis si lo corres tú** (necesitas 16 GB de RAM)"

## Proveedores como primera clase

- **Atomic unit of recommendation: `(model_id, provider_id, region)`.**
- Cada par (modelo, provider) tiene fila propia en `model_provider_offering`.
- Una consulta del recomendador devuelve los `Recommendation` con su `provider_id` y región explícitos.
- UI de catálogo/filtros muestra también:
  - `provider.type` (cloud-api · self-hosted · hybrid)
  - `provider.region` (global · EU · US · Asia)
  - Badge "Open source" si `model.license ∈ {mit, apache-2.0, …}`
  - Badge "Self-hostable" si hay offering self-hosted
  - Badge "Free tier" si hay offering free

### Página de detalle del modelo

Tabla "Dónde se ofrece":

```
| Provider        | $/M in | $/M out | Región | Notas                          |
|-----------------|--------|---------|--------|--------------------------------|
| OpenAI          | 3.00   | 12.00   | global | oficial                        |
| Azure           | 3.00   | 12.00   | EU     | data residency UE               |
| OpenRouter      | 2.70   | 11.00   | global | agregador                       |
| AWS Bedrock     | 3.50   | 14.00   | US     | requiere VPC                    |
| OpenCode        | 2.10   | 9.80    | global | precio variable por routing     |
| Self-host (Ollama)| 0    | 0       | local  | gratis, tu hardware            |
```

Conflicto entre fuentes > 5%: ícono ⚠ con tooltip que muestra el rango completo.

## Explicabilidad

Cada `Recommendation` lleva `notes: string[]` en lenguaje llano:

```
✓ Cubre razonamiento y tareas de agente según GAIA (0.71) y τ-bench.
✓ Open source: puedes correrlo tú, sin límites de rate ni coste por token.
⚠ Más caro que la mediana para coding (pagas +20% vs promedio).
⚠ No tiene visión nativa; si subes imágenes, fallará o necesitarás otro modelo.
```

Cada bullet enlaza al glosario (`/es/concepts/gaia`, `/es/concepts/open-source`, …).

## Determinismo

Igual: `recommend(quiz, snapshot_id, candidates): Recommendation[]`. Función pura. URL state preserva inputs y snapshot para compartir resultado byte-a-byte.

## Edge cases

| Caso | Manejo |
|------|--------|
| Sin candidatos para el bin de presupuesto | "Ningún modelo entra estrictamente en tu presupuesto. Aquí tienes lo más cercano (ordenado por utilidad por euro)." |
| Sin offerings para el deployment | Sale del ranking con `reason='no offering for deployment'`. |
| Conflicto precio entre providers > 5% | UI enseña ambos; score usa `source_priority` mayor. |
| Modelo `deprecation_date ≤ hoy` | Sale del ranking salvo que el usuario lo pidió explícitamente. |
| Modelo sin benchmarks pesados en su use case | `confidence='low'` por 30 días; después se oculta. |
| Usuario marca "free" pero el modelo requiere pago | Sale del ranking. UI advierte. |

## Glosario (contenido educativo a escribir en F4)

`/[locale]/concepts/<slug>` con tabla `page_content`. Cada término técnico de la UI tiene su contraparte en el glosario. Es lazo cerrado entre recomendador y sección educativa.

Slugs ya identificados: `transformer`, `context-window`, `tokens`, `temperature`, `embedding`, `rag`, `function-calling`, `json-mode`, `tool-use`, `prompt-caching`, `quantization`, `license-open-source`, `provider-cloud-vs-self-hosted`, `benchmark-mmlu-pro`, `benchmark-swe-bench`, `benchmark-gpqa`, etc.
