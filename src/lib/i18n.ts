// Tiny i18n helper. Astro's built-in i18n handles routes; this handles message lookup.

import en from '../i18n/en.json';
import es from '../i18n/es.json';

export type Locale = 'en' | 'es';

const messages: Record<Locale, Record<string, string>> = {
  en: en as Record<string, string>,
  es: es as Record<string, string>,
};

export function t(locale: Locale, key: string): string {
  const dict = messages[locale];
  const fallback = messages.en;
  return dict[key] ?? fallback[key] ?? key;
}

export function pickLocale(input: string | null | undefined): Locale {
  if (input === 'es') return 'es';
  return 'en';
}
