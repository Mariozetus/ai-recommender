// src/scripts/compare.ts — client-side logic para /compare.
// Lazy-fetch /data/compare.json + /data/benchmarks.json, render tabla
// side-by-side de 2-4 modelos. Selección persistida en URL (?m=ids) y
// localStorage (sobrevive refresh). Search para añadir más, X para quitar,
// share para copiar URL, clear para vaciar.

interface CompareRow {
  i: string; n: string; f: string | null; l: string | null; c: number | null;
  rd: string | null;
  bs: Record<string, number>;
  bp: { pn: string; ic: number; oc: number; n: number } | null;
  fl: { fc: 0|1; cr: 0|1; vi: 0|1; lo: 0|1; em: 0|1; jm: 0|1; sm: 0|1; pc: 0|1; tb: 0|1; tc: 0|1; tf: 0|1 };
}

interface BenchmarkRow {
  id: string; name: string; category: string;
}

interface CompareI18n {
  title: string;
  lede: string;
  searchPh: string;
  searchResults: string;
  noResults: string;
  add: string;
  share: string;
  copied: string;
  clear: string;
  emptyTitle: string;
  emptyBody: string;
  emptyCta: string;
  max4: string;
  remove: string;       // aria-label del X
  headers: { family: string; license: string; context: string; released: string; cheapest: string; providers: string; capabilities: string; benchmarks: string };
  capLabels: { fc: string; cr: string; vi: string; lo: string; em: string; jm: string; sm: string; pc: string; tb: string; tc: string; tf: string };
}

const MAX_COMPARE = 4;
const STORAGE_KEY = 'compare:models';

export function initCompare(i18n: CompareI18n): void {
  const root = document.querySelector<HTMLElement>('[data-compare-root]');
  if (!root) return;
  const grid = root.querySelector<HTMLElement>('[data-compare-grid]');
  const empty = root.querySelector<HTMLElement>('[data-compare-empty]');
  const searchInput = root.querySelector<HTMLInputElement>('[data-compare-search]');
  const searchResults = root.querySelector<HTMLElement>('[data-compare-results]');
  const shareBtn = root.querySelector<HTMLButtonElement>('[data-compare-share]');
  const clearBtn = root.querySelector<HTMLButtonElement>('[data-compare-clear]');
  const loadingEl = root.querySelector<HTMLElement>('[data-compare-loading]');
  if (!grid || !empty || !searchInput || !searchResults) return;

  let cache: CompareRow[] | null = null;
  let benchCache: BenchmarkRow[] | null = null;
  let inflight: Promise<CompareRow[]> | null = null;
  let inflightBench: Promise<BenchmarkRow[]> | null = null;
  let selected: string[] = [];

  async function loadCompare(): Promise<CompareRow[]> {
    if (cache) return cache;
    if (inflight) return inflight;
    inflight = fetch('data/compare.json').then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as CompareRow[];
    }).then((rows) => { cache = rows; inflight = null; return rows; });
    return inflight;
  }
  async function loadBenchmarks(): Promise<BenchmarkRow[]> {
    if (benchCache) return benchCache;
    if (inflightBench) return inflightBench;
    inflightBench = fetch('data/benchmarks.json').then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as BenchmarkRow[];
    }).then((b) => { benchCache = b; inflightBench = null; return b; });
    return inflightBench;
  }

  function esc(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
  }

  function readSelection(): string[] {
    const sp = new URLSearchParams(location.search);
    const fromUrl = sp.get('m')?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
    if (fromUrl.length > 0) return fromUrl.slice(0, MAX_COMPARE);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw).slice(0, MAX_COMPARE);
    } catch { /* localStorage blocked or corrupt */ }
    return [];
  }

  function writeSelection(): void {
    const sp = new URLSearchParams(location.search);
    if (selected.length > 0) sp.set('m', selected.join(','));
    else sp.delete('m');
    const qs = sp.toString();
    const newUrl = qs ? `?${qs}` : location.pathname;
    history.replaceState(null, '', newUrl);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(selected)); } catch { /* noop */ }
  }

  function fmtCtx(n: number | null): string {
    if (n == null) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    return `${Math.round(n / 1000)}k`;
  }
  function fmtCost(n: number | null): string {
    if (n == null) return '—';
    if (n === 0) return i18n.capLabels.fc === '—' ? '—' : 'Gratis';
    if (n < 0.01) return '< $0.01';
    return `$${n.toFixed(2)}`;
  }
  function fmtCostM(n: number | null): string {
    if (n == null) return '—';
    if (n === 0) return 'Gratis';
    return `$${n.toFixed(2)}/M`;
  }
  function capIcons(fl: CompareRow['fl']): string {
    const parts: string[] = [];
    if (fl.fc) parts.push(`<span title="${esc(i18n.capLabels.fc)}">🔧</span>`);
    if (fl.cr) parts.push(`<span title="${esc(i18n.capLabels.cr)}">🧠</span>`);
    if (fl.vi) parts.push(`<span title="${esc(i18n.capLabels.vi)}">👁</span>`);
    if (fl.lo) parts.push(`<span title="${esc(i18n.capLabels.lo)}">📏</span>`);
    if (fl.em) parts.push(`<span title="${esc(i18n.capLabels.em)}">🔢</span>`);
    if (fl.jm) parts.push(`<span title="${esc(i18n.capLabels.jm)}">{ }</span>`);
    if (fl.tb) parts.push(`<span title="${esc(i18n.capLabels.tb)}">🌐</span>`);
    if (fl.tc) parts.push(`<span title="${esc(i18n.capLabels.tc)}">⏱</span>`);
    if (fl.tf) parts.push(`<span title="${esc(i18n.capLabels.tf)}">📁</span>`);
    return parts.join(' ');
  }

  function renderShell(rows: CompareRow[]): void {
    if (rows.length === 0) {
      grid!.hidden = true;
      empty!.hidden = false;
      return;
    }
    grid!.hidden = false;
    empty!.hidden = true;

    // Header: model name + remove X
    const headerCells = rows.map((m) => `
      <th class="px-3 py-2 text-left align-top min-w-[180px]">
        <div class="font-semibold">${esc(m.n)}</div>
        <div class="text-xs font-mono text-[color:var(--color-muted)]">${esc(m.i)}</div>
        <button type="button" data-remove="${esc(m.i)}" aria-label="${esc(i18n.remove)}" class="mt-1 text-xs text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] underline">×</button>
      </th>`).join('');

    // Family / License / Context / Released
    const baseRows = [
      { label: i18n.headers.family, value: (m: CompareRow) => esc(m.f ?? '—') },
      { label: i18n.headers.license, value: (m: CompareRow) => esc(m.l ?? '—') },
      { label: i18n.headers.context, value: (m: CompareRow) => esc(fmtCtx(m.c)) },
      { label: i18n.headers.released, value: (m: CompareRow) => esc(m.rd ?? '—') },
    ].map(({ label, value }) => `
      <tr class="border-t border-[color:var(--color-border)]">
        <th class="px-3 py-2 text-left text-xs font-medium text-[color:var(--color-muted)] whitespace-nowrap">${esc(label)}</th>
        ${rows.map((m) => `<td class="px-3 py-2 text-sm">${value(m)}</td>`).join('')}
      </tr>`).join('');

    // Cheapest offering row (provider + ic/oc + count of providers)
    const cheapestRow = `
      <tr class="border-t border-[color:var(--color-border)]">
        <th class="px-3 py-2 text-left text-xs font-medium text-[color:var(--color-muted)] whitespace-nowrap">${esc(i18n.headers.cheapest)}</th>
        ${rows.map((m) => {
          const bp = m.bp;
          if (!bp) return `<td class="px-3 py-2 text-sm text-[color:var(--color-muted)]">—</td>`;
          return `<td class="px-3 py-2 text-sm">
            <div>${esc(bp.pn)}</div>
            <div class="text-xs text-[color:var(--color-muted)]">${esc(fmtCostM(bp.ic))} · ${esc(fmtCostM(bp.oc))}</div>
          </td>`;
        }).join('')}
      </tr>`;

    const providersRow = `
      <tr class="border-t border-[color:var(--color-border)]">
        <th class="px-3 py-2 text-left text-xs font-medium text-[color:var(--color-muted)] whitespace-nowrap">${esc(i18n.headers.providers)}</th>
        ${rows.map((m) => `<td class="px-3 py-2 text-sm">${m.bp ? m.bp.n : '—'}</td>`).join('')}
      </tr>`;

    const capsRow = `
      <tr class="border-t border-[color:var(--color-border)]">
        <th class="px-3 py-2 text-left text-xs font-medium text-[color:var(--color-muted)] whitespace-nowrap">${esc(i18n.headers.capabilities)}</th>
        ${rows.map((m) => `<td class="px-3 py-2 text-sm">${capIcons(m.fl)}</td>`).join('')}
      </tr>`;

    // Benchmarks: show all benchmarks that at least one selected model has.
    const seenBench = new Set<string>();
    for (const m of rows) for (const b of Object.keys(m.bs)) seenBench.add(b);
    const benchIds = Array.from(seenBench).sort();
    const benchMap: Record<string, BenchmarkRow> = benchCache
      ? Object.fromEntries(benchCache.map((b) => [b.id, b]))
      : {};

    const benchHeader = benchIds.length > 0 ? `
      <tr class="border-t-2 border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
        <th colspan="${rows.length + 1}" class="px-3 py-2 text-left text-xs font-semibold">${esc(i18n.headers.benchmarks)}</th>
      </tr>` : '';

    const benchRows = benchIds.map((bid) => {
      const meta = benchMap[bid];
      const label = meta ? meta.name : bid;
      const cells = rows.map((m) => {
        const v = m.bs[bid];
        return `<td class="px-3 py-2 text-right font-mono text-xs">${v != null ? v.toFixed(1) : '—'}</td>`;
      }).join('');
      return `<tr class="border-t border-[color:var(--color-border)]">
        <th class="px-3 py-2 text-left text-xs font-mono text-[color:var(--color-muted)] whitespace-nowrap">${esc(label)}</th>
        ${cells}
      </tr>`;
    }).join('');

    grid!.innerHTML = `
      <div class="rounded-lg border border-[color:var(--color-border)] overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead class="text-left bg-[color:var(--color-surface)]">
            <tr>
              <th class="px-3 py-2 text-left text-xs font-medium text-[color:var(--color-muted)] w-32"></th>
              ${headerCells}
            </tr>
          </thead>
          <tbody>
            ${baseRows}
            ${cheapestRow}
            ${providersRow}
            ${capsRow}
            ${benchHeader}
            ${benchRows}
          </tbody>
        </table>
      </div>`;

    // Bind remove buttons
    grid!.querySelectorAll<HTMLButtonElement>('button[data-remove]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-remove');
        if (!id) return;
        selected = selected.filter((s) => s !== id);
        writeSelection();
        doRender();
      });
    });
  }

  async function doRender(): Promise<void> {
    if (loadingEl) loadingEl.hidden = false;
    try {
      const [rows, bench] = await Promise.all([loadCompare(), loadBenchmarks()]);
      benchCache = bench;
      const selectedRows = selected.map((id) => rows.find((r) => r.i === id)).filter((r): r is CompareRow => !!r);
      renderShell(selectedRows);
    } catch {
      grid!.innerHTML = `<div class="px-3 py-6 text-center text-[color:var(--color-muted)]">Failed to load.</div>`;
    } finally {
      if (loadingEl) loadingEl.hidden = true;
    }
  }

  // Search → dropdown
  function onSearch(): void {
    const q = searchInput!.value.trim().toLowerCase();
    if (q.length < 2) {
      searchResults!.innerHTML = '';
      searchResults!.hidden = true;
      return;
    }
    if (!cache) {
      loadCompare().then(() => onSearch());
      return;
    }
    const matches = cache.filter((m) => !selected.includes(m.i) && (
      m.i.toLowerCase().includes(q) || m.n.toLowerCase().includes(q) || (m.f ?? '').toLowerCase().includes(q)
    )).slice(0, 8);
    if (matches.length === 0) {
      searchResults!.innerHTML = `<div class="px-3 py-2 text-sm text-[color:var(--color-muted)]">${esc(i18n.noResults)}</div>`;
      searchResults!.hidden = false;
      return;
    }
    searchResults!.innerHTML = matches.map((m) => `
      <button type="button" data-add="${esc(m.i)}" class="w-full text-left px-3 py-2 text-sm hover:bg-[color:var(--color-surface)] border-t border-[color:var(--color-border)] first:border-t-0">
        <div class="font-medium">${esc(m.n)}</div>
        <div class="text-xs text-[color:var(--color-muted)] font-mono">${esc(m.i)}${m.f ? ' · ' + esc(m.f) : ''}</div>
      </button>`).join('');
    searchResults!.hidden = false;
    searchResults!.querySelectorAll<HTMLButtonElement>('button[data-add]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-add');
        if (!id) return;
        if (selected.length >= MAX_COMPARE) {
          alert(i18n.max4);
          return;
        }
        if (!selected.includes(id)) selected.push(id);
        searchInput!.value = '';
        searchResults!.innerHTML = '';
        searchResults!.hidden = true;
        writeSelection();
        doRender();
      });
    });
  }

  // Wire actions
  if (searchInput) {
    searchInput.addEventListener('input', onSearch);
    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim().length >= 2) onSearch();
    });
  }
  document.addEventListener('click', (e) => {
    if (searchResults && !searchResults.contains(e.target as Node) && e.target !== searchInput) {
      searchResults.hidden = true;
    }
  });
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const url = location.href;
      try {
        await navigator.clipboard.writeText(url);
        const original = shareBtn.textContent;
        shareBtn.textContent = i18n.copied;
        setTimeout(() => { if (shareBtn) shareBtn.textContent = original; }, 1500);
      } catch {
        // Fallback: select and prompt
        prompt('Copy URL:', url);
      }
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      selected = [];
      writeSelection();
      doRender();
    });
  }

  // Init
  selected = readSelection();
  doRender();
}
