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

/** Collects data source names from placeholder configs, deduplicated in order of first appearance. */
export function collectDataSourceNames(content: ContentElement[]): string[] {
  const names: string[] = [];
  for (const element of content) {
    if (element.type !== 'placeholder') continue;
    const raw = ((element as PlaceholderElement).config as Record<string, JsonValue | undefined>).dataSource;
    const candidates = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : [];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.length > 0 && !names.includes(candidate)) {
        names.push(candidate);
      }
    }
  }
  return names;
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

/** Renders one data source as markdown: arrays of objects become tables, plain objects become field/value tables. */
export function renderDataSource(value: JsonValue): string {
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every(isPlainObject)) {
      return renderObjectTable(value as Array<{ [key: string]: JsonValue }>);
    }
    return value.map((item) => `- ${renderCell(item)}`).join('\n');
  }
  if (isPlainObject(value)) {
    const lines = ['| Field | Value |', '| --- | --- |'];
    for (const [key, item] of Object.entries(value)) {
      lines.push(`| ${renderCell(key)} | ${renderCell(item)} |`);
    }
    return lines.join('\n');
  }
  return renderCell(value);
}
