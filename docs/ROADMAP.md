# Roadmap — ai-recommender

> Documento vivo. Última revisión: 2026-10-18. Owners: Mario.
>
> Companion de `PIPELINE.md` (datos), `SCHEMA.md` (DB), `RECOMMENDER.md` (scoring), `STATUS.md` (live state).
> Este doc = **producto**: qué construimos, por qué, y qué NO.

---

## Visión

Un sitio que ayuda a la gente a entender los modelos de IA y elegir uno adecuado. Tres pilares:

1. **Educación** — glosario llano, sin marketing, sin buzzwords. Cada término enlaza al concepto.
2. **Recomendación honesta** — un quiz corto produce un ranking explicable (no black-box, no sponsored).
3. **Catálogo vivo** — todos los modelos públicos, sincronizados diariamente, sin login, comparables.

**North star metric**: visitas a `/recommender` que completan el quiz y abren un provider (afiliado o no). Proxy: scroll-depth + tiempo en página.

---

## Estado actual (live)

**Live**: `mariozetus.github.io/ai-recommender` · CI: ✅ verde · 11.884 páginas pre-renderizadas (9k+ modelo detail pages).

| Feature | Estado | Detalle |
|---|---|---|
| Catálogo de modelos | ✅ shipped | 5.925 modelos · 9.067 offerings · 232 providers · filter client-side (10 filtros) |
| Recommender | ✅ shipped | 6 use cases × 5 deployments × 4 budgets · 22 unit tests · ranking por scoring |
| Glosario | 🟡 parcial | 11 conceptos en EN+ES, 22 páginas |
| Pipeline de sync | 🟡 parcial | Solo `models.dev` (daily vía CI). 4 fuentes más planificadas en F3.2+ |
| i18n | ✅ shipped | EN/ES · hreflang + canonical + og:url correctos |
| CI/CD | ✅ shipped | Tests + smoke + GH Pages deploy automático |
| Comparador side-by-side | 🔜 en curso | Fase C1-C4 (siguiente sprint) |
| Model detail page | ✅ shipped | `/models/[id]` · 9k+ modelos · capacidades + benchmarks + proveedores |
| release_date | ✅ shipped | En DB + datos + columna "Released" en /catalog |

**Métricas**:
- 22/22 unit tests
- 24/24 smoke asserts
- 0 typecheck errors
- 6.6MB dist (gzipped ~2MB)
- 100% modelos con release_date (placeholder 1970-01-01 → null)

---

## Roadmap

### 🔜 Now (sprint actual)

| # | Feature | Por qué ahora |
|---|---|---|
| 1 | **Comparador side-by-side** `/compare` | Cierra la feature anunciada en el home ("Side by side"). Comparteable, sin login, baja fricción. |
| 2 | **release_date en UI** | ✅ Hecho este sprint. Usuarios necesitan saber qué modelos son recientes. |
| 3 | **Model detail page** `/models/[id]` | ✅ Hecho S1. SEO + shareability, 9k+ páginas generadas. |

### 📅 Next (1-2 sprints, 1-2 semanas)

| # | Feature | Valor | Esfuerzo | Por qué |
|---|---|---|---|---|
| 3 | **Más fuentes de sync** (LiteLLM pricing, AA benchmarks, LiveBench) | Alto | 1-2 días | Enriquece pricing + benchmarks. Sin esto, dependemos solo de models.dev. |
| 4 | **Model detail page** `/models/[id]` | Medio | 2-3h | ✅ Hecho S1. SEO + shareability, URL propia por modelo con capacidades, benchmarks y proveedores. |
| 5 | **Cron job diario fuera de CI** | Medio | 4h | Ahora el sync corre solo en push. Quieren sync diario sin depender de PRs. GitHub Actions cron `0 3 * * *`. |
| 6 | **Glosario 11 → 30 conceptos** | Medio | 1 día | Attention, MoE, fine-tuning, RLHF, distillation, quantization, RAG, embeddings, tool use, agents, multimodality, etc. |
| 7 | **URL-state para recommender** | Bajo | 2h | El form ya es URL-shareable, pero el ranking post-submit se pierde al refrescar. Persistir `?use=coding&budget=middle` en ranking client-side. |

### 🔭 Later (1-3 meses)

| # | Feature | Valor | Notas |
|---|---|---|---|
| 8 | **API pública** (REST o GraphQL) | Alto | Permite a terceros consumir nuestro catálogo. Auth opcional. Limit por IP. |
| 9 | **Embed widget** | Medio | "Compare GPT-5 vs Claude 4" en otros sitios (blog, doc). 1 script tag. |
| 10 | **RSS / Atom feed** "AI model changes this week" | Medio | Suscriptores reciben diffs. Marketing orgánico. |
| 11 | **Snapshot changelog** automático | Medio | Cada sync con `+5 modelos`, `+12 offerings`, `−3 deprecated`. Página `/changelog`. |
| 12 | **Newsletter semanal** | Bajo | Derivado del RSS. Sin email server: Buttondown o Substack free tier. |
| 13 | **PWA / installable** | Bajo | Mobile-first. Add to home screen. |
| 14 | **Más idiomas** (PT, FR) | Bajo | i18n ya está; solo añadir diccionarios. Bajo coste. |
| 15 | **Multi-currency** (EUR, USD, MXN) | Bajo | Tabla de conversión + selector. Hoy asumimos USD. |
| 16 | **Bug del recommender en dev** | Bajo | Vite con arrays grandes devuelve 0. No afecta prod. Documentar o fix. |

### 🌱 Future (3+ meses, requiere infra)

| # | Feature | Notas |
|---|---|---|
| 17 | **Reviews de usuarios** (sin login, con captcha) | Alto valor social, alto riesgo de moderación. Out hasta tener moderación clara. |
| 18 | **Comparador con Diff** "modelo A vs A.1" | Muestra qué cambió entre versiones del mismo modelo. Interesante pero niche. |
| 19 | **Playground** (probar el modelo inline) | Requiere API keys de providers. Caro. Out. |
| 20 | **Agentes / workflows** (benchmarks agentic) | Diferente vertical. Out. |
| 21 | **Self-host / Docker** | Para empresas que quieren el sitio on-prem. Docker compose + GHCR. |

---

## No-goals (decisiones explícitas)

- **No reviews/opiniones subjetivas**: mantenemos neutralidad. El ranking es por scoring, no editorial.
- **No login / cuentas**: fricción mata. Sin auth.
- **No hosting de modelos**: no somos un provider. Somos un índice + recomendador.
- **No marketplace / fine-tuning**: no competimos con providers ni marketplaces (HF, Replicate).
- **No ads / sponsored listings**: ingresos serán donaciones o afiliación transparente.
- **No noticias / blog**: no competimos con medios. El changelog es nuestro único editorial.
- **No móvil nativo**: web responsive. PWA si pide instalación.
- **No multi-tenant**: un sitio, una marca, un owner.

---

## Backlog priorizado

| # | Feature | Valor | Esfuerzo | Estado | Sprint |
|---|---|---|---|---|---|
| 1 | release_date en datos + UI | M | XS | ✅ done | S0 |
| 2 | Filter client-side del catalog | H | M | ✅ done | S0 |
| 3 | Comparador side-by-side | H | M | 🔜 WIP | S0 |
| 4 | URL-state recommender | M | S | pending | S1 |
| 5 | Más fuentes sync (litellm, AA, livebench) | H | L | pending | S1 |
| 6 | Model detail page | M | S | ✅ done | S1 |
| 7 | Cron diario GH Actions | M | S | pending | S1 |
| 8 | Glosario 11 → 30 | M | M | pending | S2 |
| 9 | Snapshot changelog auto | M | S | pending | S2 |
| 10 | RSS feed "cambios de la semana" | M | S | pending | S2 |
| 11 | API pública REST | H | L | pending | S3 |
| 12 | Embed widget | M | S | pending | S3 |
| 13 | Multi-currency | L | S | pending | S3 |
| 14 | Más idiomas (PT, FR) | L | S | pending | S3 |
| 15 | PWA / installable | L | S | pending | S4 |
| 16 | Bug Vite recommender en dev | L | ? | pending | S4 |
| 17 | Newsletter semanal | L | S | pending | S4 |
| 18 | Self-host / Docker | L | M | pending | future |
| 19 | Reviews de usuarios | H | XL | blocked (moderación) | future |
| 20 | Playground inline | M | XL | blocked (coste API) | future |
| 21 | Comparador Diff A vs A.1 | L | M | pending | future |

Leyenda: **Valor**: H=alto, M=medio, L=bajo. **Esfuerzo**: XS=<1h, S=<4h, M=1-2d, L=3+d, XL=1+s.

---

## Open questions

1. **Monetización**: ¿donaciones (GitHub Sponsors), afiliación transparente a providers, o sin monetizar? Decisión: sin monetizar hasta tener >100k visitas/mes.
2. **Embed widget**: ¿con qué branding? ¿atribución obligatoria? Decisión: sí, attribution a `ai-recommender` requerida.
3. **API pública**: ¿auth con API key o rate limit por IP? ¿free tier? Decisión: pendiente de tráfico real.
4. **Reviews de usuarios**: si lo activamos, ¿quién modera? ¿captcha? ¿flag? Decisión: bloqueado hasta tener moderación.
5. **Cambio de dominio**: ¿`airecommender.dev`? ¿`aimodelguide.com`? ¿`mariozetus.github.io/ai-recommender` basta? Decisión: cheap GH Pages hasta que duela.
6. **Self-host para empresas**: ¿licencia dual (MIT + comercial)? ¿o AGPL? Decisión: pendiente de demanda.

---

## Cómo actualizar este doc

- Al final de cada sprint: mover features done a "Estado actual" y actualizar contadores.
- Cuando se pospone una feature: añadir razón en "Open questions" o crear sub-issues.
- Si una decisión cambia: añadir nota con fecha al final del doc (no reescribir historia).
