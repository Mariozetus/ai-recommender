// src/scripts/recommender-state.ts — URL-state persistence para /recommender.
// Mantiene los resultados del quiz persistidos en sessionStorage para que
// refresh o compartir la URL devuelva el mismo ranking.
//
// Flujo:
//   1. Form submit → SSR renderiza resultados + guarda en sessionStorage
//   2. Refresh → cliente lee sessionStorage, restaura resultados (mismo ranking)
//   3. Share → botón copia URL con hash #r= que fuerza ese ranking concreto
//
// Sin JS activo el form sigue funcionando (GET params → SSR).

const STORAGE_KEY = 'rec:results';
const MAX_STORED_RESULTS = 20;

// Información mínima para reconstruir el ranking sin recomputar
interface StoredRec {
  model_id: string;
  model_name: string;
  provider_name: string;
  total: number; // score 0-1 ya multiplicado × 100
  confidence: string;
  notes: string[];
  breakdown: { calidad: number; costo: number; capabilities: number; despliegue: number; idioma: number };
  offering: { input_cost: number | null; output_cost: number | null; context_window: number | null; monthly_usd: number | null };
}

interface StoredResults {
  params: string; // serialized search params
  results: StoredRec[];
  storedAt: number;
}

function getStoredResults(): StoredResults | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredResults;
    if (!parsed.params || !Array.isArray(parsed.results)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function storeResults(params: string, results: StoredRec[]): void {
  try {
    const data: StoredResults = { params, results: results.slice(0, MAX_STORED_RESULTS), storedAt: Date.now() };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage full or unavailable — non-fatal
  }
}

function currentParams(): string {
  return window.location.search;
}

function extractResultsFromDOM(): StoredRec[] {
  const items = document.querySelectorAll<HTMLElement>('[data-rec-item]');
  if (!items.length) return [];
  return Array.from(items).map((el) => {
    const totalEl = el.querySelector('[data-rec-total]');
    const nameEl = el.querySelector('[data-rec-name]');
    const providerEl = el.querySelector('[data-rec-provider]');
    const confidenceEl = el.querySelector('[data-rec-confidence]');
    const notesEl = el.querySelector('[data-rec-notes]');
    const offeringEl = el.querySelector('[data-rec-offering]');

    const notes: string[] = [];
    notesEl?.querySelectorAll('li').forEach((li) => notes.push(li.textContent ?? ''));

    let monthlyUsd: number | null = null;
    const offeringText = offeringEl?.textContent ?? '';
    const match = offeringText.match(/\$([0-9.]+)\/mes/);
    if (match) monthlyUsd = parseFloat(match[1]);

    const breakdown: StoredRec['breakdown'] = { calidad: 0, costo: 0, capabilities: 0, despliegue: 0, idioma: 0 };
    el.querySelectorAll('[data-rec-breakdown]').forEach((bd) => {
      const key = bd.getAttribute('data-rec-breakdown') as keyof typeof breakdown;
      const val = parseFloat((bd as HTMLElement).dataset.recBreakdownValue ?? '0');
      if (key in breakdown) breakdown[key] = val;
    });

    return {
      model_id: el.dataset.recId ?? '',
      model_name: nameEl?.textContent ?? '',
      provider_name: providerEl?.textContent ?? '',
      total: totalEl ? parseFloat(totalEl.textContent ?? '0') : 0,
      confidence: confidenceEl?.textContent ?? 'medium',
      notes,
      breakdown,
      offering: {
        input_cost: null,
        output_cost: null,
        context_window: null,
        monthly_usd: monthlyUsd,
      },
    };
  });
}

function renderResults(results: StoredRec[], i18n: Record<string, string>): void {
  const container = document.querySelector<HTMLElement>('[data-rec-results]');
  if (!container || !results.length) return;

  const t = (key: string): string => {
    const map: Record<string, string> = {
      breakdown: i18n.breakdown ?? 'Breakdown',
      calidad: i18n.calidad ?? 'Quality',
      costo: i18n.costo ?? 'Cost',
      capabilities: i18n.capabilities ?? 'Capabilities',
      despliegue: i18n.despliegue ?? 'Deployment',
      idioma: i18n.idioma ?? 'Language',
    };
    return map[key] ?? key;
  };
  const confClass: Record<string, string> = { high: 'bg-[color:var(--color-success)]/20', medium: 'bg-[color:var(--color-warning)]/20', low: 'bg-[color:var(--color-muted)]/20' };

  container.innerHTML = results.map((r, i) => `
    <li class="rounded-lg border border-[color:var(--color-border)] p-4" data-rec-item data-rec-id="${r.model_id}">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono text-[color:var(--color-muted)]">#${i + 1}</span>
            <h3 class="text-lg font-semibold" data-rec-name>${r.model_name}</h3>
            <span class="text-xs px-2 py-0.5 rounded ${confClass[r.confidence] ?? ''}" data-rec-confidence>${r.confidence}</span>
          </div>
          <div class="mt-1 text-xs text-[color:var(--color-muted)] font-mono" data-rec-provider>${r.provider_name}</div>
        </div>
        <div class="text-right">
          <div class="text-2xl font-semibold tabular-nums" data-rec-total>${(r.total).toFixed(0)}<span class="text-xs">/100</span></div>
          <div class="text-xs text-[color:var(--color-muted)]">${r.offering.monthly_usd != null ? `≈ $${r.offering.monthly_usd.toFixed(2)}/mes` : '—'}</div>
        </div>
      </div>
      <details class="mt-3">
        <summary class="text-xs text-[color:var(--color-muted)] cursor-pointer">${t('rec.results.breakdown')}</summary>
        <div class="mt-2 grid grid-cols-5 gap-2 text-xs">
          <div class="text-center" data-rec-breakdown="calidad" data-rec-breakdown-value="${r.breakdown.calidad.toFixed(2)}">
            <div class="font-mono">${r.breakdown.calidad.toFixed(2)}</div>
            <div class="text-[color:var(--color-muted)]">${t('rec.results.calidad')}</div>
          </div>
          <div class="text-center" data-rec-breakdown="costo" data-rec-breakdown-value="${r.breakdown.costo.toFixed(2)}">
            <div class="font-mono">${r.breakdown.costo.toFixed(2)}</div>
            <div class="text-[color:var(--color-muted)]">${t('rec.results.costo')}</div>
          </div>
          <div class="text-center" data-rec-breakdown="capabilities" data-rec-breakdown-value="${r.breakdown.capabilities.toFixed(2)}">
            <div class="font-mono">${r.breakdown.capabilities.toFixed(2)}</div>
            <div class="text-[color:var(--color-muted)]">${t('rec.results.capabilities')}</div>
          </div>
          <div class="text-center" data-rec-breakdown="despliegue" data-rec-breakdown-value="${r.breakdown.despliegue.toFixed(2)}">
            <div class="font-mono">${r.breakdown.despliegue.toFixed(2)}</div>
            <div class="text-[color:var(--color-muted)]">${t('rec.results.despliegue')}</div>
          </div>
          <div class="text-center" data-rec-breakdown="idioma" data-rec-breakdown-value="${r.breakdown.idioma.toFixed(2)}">
            <div class="font-mono">${r.breakdown.idioma.toFixed(2)}</div>
            <div class="text-[color:var(--color-muted)]">${t('rec.results.idioma')}</div>
          </div>
        </div>
      </details>
      <ul class="mt-3 space-y-1 text-sm" data-rec-notes>
        ${r.notes.map((n) => `<li>${n}</li>`).join('')}
      </ul>
    </li>
  `).join('');
}

function encodeHash(results: StoredRec[]): string {
  // Top-10 IDs only — suficiente para identificar el ranking
  const top = results.slice(0, 10).map((r) => r.model_id.replace(/\//g, '~')).join(',');
  return btoa(encodeURIComponent(top));
}

function decodeHash(hash: string): string[] {
  try {
    return decodeURIComponent(atob(hash)).split(',').map((id) => id.replace(/~/g, '/'));
  } catch {
    return [];
  }
}

function reorderResults(results: StoredRec[], orderedIds: string[]): StoredRec[] {
  const map = new Map(results.map((r) => [r.model_id, r]));
  const ordered: StoredRec[] = [];
  let rest: StoredRec[] = [];
  for (const id of orderedIds) {
    const r = map.get(id);
    if (r) { ordered.push(r); map.delete(id); }
    else rest.push(...results.filter((x) => x.model_id === id && !ordered.includes(x) && !rest.includes(x)));
  }
  return [...ordered, ...rest, ...map.values()];
}

export function initRecommenderState(i18n: Record<string, string>): void {
  const params = currentParams();
  if (!params) return; // no quiz submitted yet

  const results = extractResultsFromDOM();
  if (results.length > 0) {
    storeResults(params, results);
  }

  // On load: check hash first, then sessionStorage
  const hash = window.location.hash;
  const stored = getStoredResults();

  if (hash.startsWith('#r=')) {
    const orderedIds = decodeHash(hash.slice(3));
    if (orderedIds.length > 0 && stored) {
      const reordered = reorderResults(stored.results, orderedIds);
      renderResults(reordered, i18n);
    }
  } else if (stored && stored.params === params && results.length === 0) {
    // Refresh: restore from sessionStorage
    renderResults(stored.results, i18n);
  }

  // Share button: append stable hash to current URL
  const shareBtn = document.querySelector<HTMLButtonElement>('[data-rec-share]');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      const currentResults = extractResultsFromDOM();
      if (!currentResults.length) return;
      const hashVal = encodeHash(currentResults);
      const shareUrl = `${window.location.origin}${window.location.pathname}${params}#r=${hashVal}`;
      navigator.clipboard.writeText(shareUrl).then(() => {
        const orig = shareBtn.textContent ?? '';
        shareBtn.textContent = i18n.copied ?? '✓ Copied!';
        shareBtn.disabled = true;
        setTimeout(() => { shareBtn.textContent = orig; shareBtn.disabled = false; }, 2000);
      }).catch(() => {
        navigator.clipboard.writeText(window.location.href);
      });
    });
  }
}
