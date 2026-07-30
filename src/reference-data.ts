/**
 * Reference data sections.
 *
 * A placeholder's config may name one or more data sources through the
 * reserved `dataSource` key (a variable name or array of variable names).
 * The compiler renders each referenced variable once in a REFERENCE DATA
 * section above the template, so the model can ground generated content in
 * the data without the data appearing in the rendered output; a processing
 * instruction tells the model the section is context only.
 */

import type { ContentElement, PlaceholderElement } from './types.js';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const REFERENCE_DATA_INSTRUCTION =
  'Use the REFERENCE DATA section as context when generating placeholder content - never include the reference data itself in your output';

export interface DataSourceRequest {
  name: string;
  /** Maximum items or fields to include, or null for the full data. */
  limit: number | null;
}

/**
 * Collects data sources from placeholder configs, deduplicated in order of
 * first appearance. A placeholder's optional dataLimit config caps how much
 * of each of its sources is included; when several placeholders reference
 * the same source the most generous request wins (no limit beats any limit,
 * otherwise the maximum).
 */
export function collectDataSources(content: ContentElement[]): DataSourceRequest[] {
  const requests: DataSourceRequest[] = [];
  for (const element of content) {
    if (element.type !== 'placeholder') continue;
    const config = (element as PlaceholderElement).config as Record<string, JsonValue | undefined>;
    const raw = config.dataSource;
    const rawLimit = config.dataLimit;
    const limit = typeof rawLimit === 'number' && Number.isInteger(rawLimit) && rawLimit >= 1 ? rawLimit : null;
    const candidates = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : [];
    for (const candidate of candidates) {
      if (typeof candidate !== 'string' || candidate.length === 0) continue;
      const existing = requests.find((request) => request.name === candidate);
      if (existing === undefined) {
        requests.push({ name: candidate, limit });
      } else if (existing.limit !== null) {
        existing.limit = limit === null ? null : Math.max(existing.limit, limit);
      }
    }
  }
  return requests;
}

/** @deprecated Use collectDataSources; kept for API compatibility. */
export function collectDataSourceNames(content: ContentElement[]): string[] {
  return collectDataSources(content).map((request) => request.name);
}

function isPlainObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Cell rendering: strings verbatim, everything else compact JSON. Kept in sync with the Python compiler. */
function renderCell(value: JsonValue | undefined): string {
  if (value === undefined) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function renderObjectTable(rows: Array<{ [key: string]: JsonValue }>): string {
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  const lines = [
    `| ${columns.join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map((column) => renderCell(row[column])).join(' | ')} |`),
  ];
  return lines.join('\n');
}

/**
 * Renders one data source as markdown: arrays of objects become tables,
 * plain objects become field/value tables. A limit caps how many items or
 * fields are included, with the truncation stated so the model knows the
 * data is partial.
 */
export function renderDataSource(value: JsonValue, limit: number | null = null): string {
  if (Array.isArray(value)) {
    const items = limit !== null && limit < value.length ? value.slice(0, limit) : value;
    const note = items.length < value.length ? `\n\nShowing the first ${items.length} of ${value.length} items.` : '';
    if (items.length > 0 && items.every(isPlainObject)) {
      return renderObjectTable(items as Array<{ [key: string]: JsonValue }>) + note;
    }
    return items.map((item) => `- ${renderCell(item)}`).join('\n') + note;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    const shown = limit !== null && limit < entries.length ? entries.slice(0, limit) : entries;
    const note = shown.length < entries.length ? `\n\nShowing the first ${shown.length} of ${entries.length} fields.` : '';
    const lines = ['| Field | Value |', '| --- | --- |'];
    for (const [key, item] of shown) {
      lines.push(`| ${renderCell(key)} | ${renderCell(item)} |`);
    }
    return lines.join('\n') + note;
  }
  return renderCell(value);
}
