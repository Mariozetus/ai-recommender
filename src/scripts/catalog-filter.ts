// src/scripts/catalog-filter.ts — client-side filter para /catalog.
// En static mode el form no llega al server; lo interceptamos y re-renderizamos
// la tabla in-place con /data/catalog-lite.json (1.5MB, fetched lazy al primer submit).

interface LiteRow {
  i: string; n: string; l: string | null; c: number | null;
  fc: 0 | 1; cr: 0 | 1; vi: 0 | 1;
  p: string; pn: string; pt: string;
  ic: number | null; oc: number | null;
}

export interface CatalogI18n {
  results: string;      // "resultados" / "results"
  empty: string;         // "no se encontraron modelos" / "no models found"
  page: string;          // "Página" / "Page"
  of: string;            // "de" / "of"
  prev: string;          // "Anterior" / "Prev"
  next: string;          // "Siguiente" / "Next"
  loading: string;       // "Cargando…" / "Loading…"
  errorLoad: string;     // "Error al cargar datos" / "Failed to load data"
}

export interface CatalogFilters {
  q: string; provider: string; license: string;
  capFc: boolean; capReasoning: boolean; capVision: boolean; capLongCtx: boolean; capOpen: boolean;
  minCtx: number; maxIn: number; page: number;
}

const PAGE_SIZE = 50;
const IN_TOKENS = 500_000;
const OUT_TOKENS = 2_000_000;
const LONG_CONTEXT_MIN = 100_000;
const OPEN_LICENSE_RE = /apache|mit|open|community|llama|mrl|deepseek/i;

export function initCatalogFilter(i18n: CatalogI18n): void {
  const form = document.querySelector<HTMLFormElement>('form[data-catalog-filter]');
  if (!form) return;
  const tableBody = document.querySelector<HTMLTableSectionElement>('[data-catalog-tbody]');
  const countEl = document.querySelector<HTMLElement>('[data-catalog-count]');
  const pagEl = document.querySelector<HTMLElement>('[data-catalog-pagination]');
  const loadingEl = document.querySelector<HTMLElement>('[data-catalog-loading]');
  if (!tableBody || !countEl) return;

  let cache: LiteRow[] | null = null;
  let inflight: Promise<LiteRow[]> | null = null;

  async function load(): Promise<LiteRow[]> {
    if (cache) return cache;
    if (inflight) return inflight;
    inflight = fetch('data/catalog-lite.json').then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as LiteRow[];
    }).then((rows) => {
      cache = rows;
      inflight = null;
      return rows;
    });
    return inflight;
  }

  function esc(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
  }

  function monthlyUsd(ic: number | null, oc: number | null): number | null {
    if (ic == null || oc == null) return null;
    return (IN_TOKENS / 1_000_000) * ic + (OUT_TOKENS / 1_000_000) * oc;
  }
  function monthlyLabel(usd: number | null): string {
    if (usd == null) return '—';
    if (usd === 0) return 'Gratis';
    if (usd < 0.01) return '< $0.01';
    if (usd < 1) return `≈ $${usd.toFixed(2)}`;
    if (usd < 100) return `≈ $${usd.toFixed(1)}`;
    return `≈ $${Math.round(usd)}`;
  }

  function getFilters(): CatalogFilters {
    const sp = new URLSearchParams(location.search);
    return {
      q: (sp.get('q') ?? '').toLowerCase(),
      provider: sp.get('provider') ?? '',
      license: sp.get('license') ?? '',
      capFc: sp.get('cap_fc') === '1',
      capReasoning: sp.get('cap_reasoning') === '1',
      capVision: sp.get('cap_vision') === '1',
      capLongCtx: sp.get('cap_longctx') === '1',
      capOpen: sp.get('cap_open') === '1',
      minCtx: sp.get('min_ctx') ? Number(sp.get('min_ctx')) : 0,
      maxIn: sp.get('max_in') ? Number(sp.get('max_in')) : Number.POSITIVE_INFINITY,
      page: sp.get('page') ? Math.max(1, Number(sp.get('page'))) : 1,
    };
  }

  function matches(r: LiteRow, f: CatalogFilters): boolean {
    if (f.provider && r.p !== f.provider) return false;
    if (f.license && r.l !== f.license) return false;
    if (f.capFc && !r.fc) return false;
    if (f.capReasoning && !r.cr) return false;
    if (f.capVision && !r.vi) return false;
    if (f.capLongCtx && (r.c ?? 0) < LONG_CONTEXT_MIN) return false;
    if (f.minCtx && (r.c ?? 0) < f.minCtx) return false;
    if (Number.isFinite(f.maxIn) && r.ic != null && r.ic > f.maxIn) return false;
    if (f.capOpen && !OPEN_LICENSE_RE.test(r.l ?? '')) return false;
    if (f.q && !`${r.n} ${r.i}`.toLowerCase().includes(f.q)) return false;
    return true;
  }

  function render(rows: LiteRow[]): void {
    const f = getFilters();
    const matched = rows.filter((r) => matches(r, f));
    matched.sort((a, b) => a.n.localeCompare(b.n) || a.pn.localeCompare(b.pn));
    const total = matched.length;
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(f.page, pageCount);
    const start = (page - 1) * PAGE_SIZE;
    const slice = matched.slice(start, start + PAGE_SIZE);

    countEl!.textContent = `${total} ${i18n.results}`;

    if (slice.length === 0) {
      tableBody!.innerHTML = `<tr><td colspan="8" class="px-3 py-6 text-center text-[color:var(--color-muted)]">${esc(i18n.empty)}</td></tr>`;
    } else {
      tableBody!.innerHTML = slice.map((r) => {
        const month = monthlyLabel(monthlyUsd(r.ic, r.oc));
        return `<tr class="border-t border-[color:var(--color-border)]">
          <td class="px-3 py-2">
            <div class="font-medium">${esc(r.n)}</div>
            <div class="text-xs text-[color:var(--color-muted)] font-mono">${esc(r.i)}</div>
          </td>
          <td class="px-3 py-2">
            <div>${esc(r.pn)}</div>
            <div class="text-xs text-[color:var(--color-muted)]">${esc(r.pt)}</div>
          </td>
          <td class="px-3 py-2 text-right font-mono text-xs">${r.ic != null ? `$${r.ic.toFixed(2)}` : '—'}</td>
          <td class="px-3 py-2 text-right font-mono text-xs">${r.oc != null ? `$${r.oc.toFixed(2)}` : '—'}</td>
          <td class="px-3 py-2 text-right font-mono text-xs">${esc(month)}</td>
          <td class="px-3 py-2 text-right font-mono text-xs">${r.c ? `${(r.c / 1000).toFixed(0)}k` : '—'}</td>
          <td class="px-3 py-2 text-xs">${esc(r.l ?? '—')}</td>
          <td class="px-3 py-2 text-xs">${r.fc ? '🔧 ' : ''}${r.cr ? '🧠 ' : ''}${r.vi ? '👁 ' : ''}</td>
        </tr>`;
      }).join('');
    }

    if (!pagEl) return;
    if (pageCount <= 1) { pagEl.innerHTML = ''; return; }
    const prevPage = page > 1 ? page - 1 : null;
    const nextPage = page < pageCount ? page + 1 : null;
    const buildHref = (p: number): string => {
      const sp = new URLSearchParams(location.search);
      sp.set('page', String(p));
      return `?${sp.toString()}`;
    };
    pagEl.innerHTML = `
      <span>${esc(i18n.page)} ${page} ${esc(i18n.of)} ${pageCount}</span>
      <div class="flex gap-2">
        ${prevPage ? `<a href="${buildHref(prevPage)}" data-page="${prevPage}" class="px-3 py-1.5 rounded border border-[color:var(--color-border)]">${esc(i18n.prev)}</a>` : ''}
        ${nextPage ? `<a href="${buildHref(nextPage)}" data-page="${nextPage}" class="px-3 py-1.5 rounded border border-[color:var(--color-border)]">${esc(i18n.next)}</a>` : ''}
      </div>`;
    pagEl.querySelectorAll<HTMLAnchorElement>('a[data-page]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const p = Number(a.getAttribute('data-page'));
        const sp = new URLSearchParams(location.search);
        sp.set('page', String(p));
        history.pushState(null, '', `?${sp}`);
        if (cache) render(cache);
      });
    });
  }

  function setLoading(on: boolean): void {
    if (loadingEl) loadingEl.hidden = !on;
  }

  function setError(msg: string): void {
    tableBody!.innerHTML = `<tr><td colspan="8" class="px-3 py-6 text-center text-[color:var(--color-muted)]">${esc(msg)}</td></tr>`;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const sp = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      if (typeof v === 'string' && v !== '') sp.set(k, v);
    }
    sp.delete('page');
    history.pushState(null, '', `?${sp}`);
    setLoading(true);
    try {
      const rows = await load();
      render(rows);
    } catch {
      setError(i18n.errorLoad);
    } finally {
      setLoading(false);
    }
  });

  window.addEventListener('popstate', () => {
    if (!cache) return;
    render(cache);
  });

  // Auto-render si la URL trae params (compartida, deep-link, back/forward)
  if (location.search && location.search !== '?') {
    setLoading(true);
    load().then((rows) => { render(rows); }).catch(() => setError(i18n.errorLoad)).finally(() => setLoading(false));
  }
}
