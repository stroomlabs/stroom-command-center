// Single source of truth for turning a claim's value_jsonb column into a
// short, human-readable preview string. Used by the Queue ClaimCard, Explore
// claim search cards, entity detail claim rows, and anywhere else a compact
// value summary is needed.
//
// Priority:
//   1. objectName (linked entity canonical_name) wins if set.
//   2. Preferred keys in strict order: value, text, name, consensus, amount.
//   3. Specialized patterns: { data: [...] }, { type, tier }, { range }.
//   4. First scalar value found anywhere in the object.
//   5. Arrays → "[N items]".
//   6. Never "[object Object]".
//
// All returned strings pass through formatValue() which:
//   - Converts snake_case → Title Case
//   - Formats large numbers with commas
//   - Adds $ prefix for currency predicates
//   - Truncates at 120 chars
//   - Formats arrays as "Item 1, Item 2, and N more"

type Jsonb = Record<string, unknown> | null | undefined;

const PREFERRED_KEYS = ['value', 'text', 'name', 'consensus', 'amount'] as const;

const CURRENCY_PREDICATES = [
  'revenue', 'budget', 'salary', 'value_usd', 'cost',
  'price', 'earnings', 'income', 'spend', 'fee',
];

export function resolveClaimDisplayValue(
  jsonb: Jsonb,
  objectName?: string | null,
  predicate?: string | null
): string {
  if (objectName) return formatValue(objectName, predicate);
  if (jsonb == null) return '—';

  if (Array.isArray(jsonb)) {
    return formatArrayPreview(jsonb as unknown[]);
  }

  if (typeof jsonb !== 'object') return formatValue(String(jsonb), predicate);

  // 1) Strict priority: preferred keys with a scalar value.
  for (const key of PREFERRED_KEYS) {
    if (key in jsonb) {
      const v = (jsonb as Record<string, unknown>)[key];
      const scalar = scalarToString(v);
      if (scalar != null) return formatValue(scalar, predicate);
    }
  }

  // 2) Specialized patterns.
  if ('data' in jsonb && Array.isArray((jsonb as any).data)) {
    const arr = (jsonb as any).data as unknown[];
    if (arr.length === 0) return '(empty)';
    const first = arr[0] as Record<string, unknown> | null;
    const firstName =
      (first && (first.name || first.driver || first.team)) ??
      (first && firstScalar(first));
    if (firstName != null) {
      return arr.length === 1
        ? formatValue(String(firstName), predicate)
        : formatArrayPreview(arr.map((item: any) => item?.name ?? item?.driver ?? item?.team ?? firstScalar(item as Record<string, unknown>) ?? '?'));
    }
    return `[${arr.length} items]`;
  }

  if ('type' in jsonb) {
    const typeVal = scalarToString((jsonb as any).type);
    if (typeVal != null) {
      const tier = scalarToString((jsonb as any).tier);
      return tier ? `T${tier} · ${titleCase(typeVal)}` : titleCase(typeVal);
    }
  }

  if ('range' in jsonb) {
    const rangeVal = scalarToString((jsonb as any).range);
    if (rangeVal != null) return formatValue(rangeVal, predicate);
  }

  // 3) First scalar found in the object.
  const firstScalarValue = firstScalar(jsonb as Record<string, unknown>);
  if (firstScalarValue != null) return formatValue(firstScalarValue, predicate);

  // 4) Nested objects / arrays → count items.
  const entries = Object.entries(jsonb as Record<string, unknown>);
  if (entries.length === 0) return '(empty)';
  return `[${entries.length} items]`;
}

// ── Formatting pipeline ──

function formatValue(raw: string, predicate?: string | null): string {
  let s = raw;

  // snake_case → Title Case (only if the string looks like a key/identifier)
  if (/^[a-z][a-z0-9_]+$/.test(s)) {
    s = titleCase(s);
  }

  // Format numbers with commas and optional currency prefix
  const num = Number(s);
  if (!Number.isNaN(num) && s.trim() === String(num)) {
    const isCurrency = predicate
      ? CURRENCY_PREDICATES.some((p) => predicate.toLowerCase().includes(p))
      : false;
    const formatted = formatNumber(num);
    s = isCurrency ? `$${formatted}` : formatted;
  }

  // Truncate
  if (s.length > 120) {
    s = s.slice(0, 117) + '…';
  }

  return s;
}

function formatNumber(n: number): string {
  // Keep decimals if they exist, otherwise integer formatting
  if (Number.isInteger(n)) return n.toLocaleString('en-US');
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatArrayPreview(items: unknown[]): string {
  if (items.length === 0) return '(empty)';
  const strings = items.map((item) => {
    if (typeof item === 'string') return item;
    if (typeof item === 'number') return formatNumber(item);
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      return String(obj.name || obj.driver || obj.team || firstScalar(obj) || '?');
    }
    return String(item);
  });
  if (strings.length === 1) return strings[0];
  if (strings.length === 2) return `${strings[0]} and ${strings[1]}`;
  if (strings.length <= 4) {
    return `${strings.slice(0, -1).join(', ')}, and ${strings[strings.length - 1]}`;
  }
  return `${strings.slice(0, 2).join(', ')}, and ${strings.length - 2} more`;
}

// ── Helpers ──

function scalarToString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v.length > 0 ? v : null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

function firstScalar(obj: Record<string, unknown>): string | null {
  for (const val of Object.values(obj)) {
    const s = scalarToString(val);
    if (s != null) return s;
  }
  return null;
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
