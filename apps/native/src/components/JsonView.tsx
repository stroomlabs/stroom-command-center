import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { colors, fonts, spacing, radius } from '../constants/brand';

// Human-readable renderer for arbitrary JSONB blobs (intel.claims.value_jsonb,
// entity metadata, etc.). Objects render as labeled rows, arrays of objects as
// stacked mini-cards, scalars as plain text. Snake_case keys → Title Case.
//
// Intentionally NOT a code-style pretty printer — the goal is readable data,
// not JSON.stringify with fancy coloring.

interface JsonViewProps {
  value: unknown;
  // Internal: current indent depth for nested structures.
  depth?: number;
}

export function JsonView({ value, depth = 0 }: JsonViewProps) {
  if (value == null) {
    return <Text style={styles.emptyValue}>—</Text>;
  }

  if (Array.isArray(value)) {
    return <JsonArray items={value} depth={depth} />;
  }

  if (typeof value === 'object') {
    return <JsonObject object={value as Record<string, unknown>} depth={depth} />;
  }

  // Scalar
  return <ScalarValue value={value} />;
}

function JsonObject({
  object,
  depth,
}: {
  object: Record<string, unknown>;
  depth: number;
}) {
  const entries = Object.entries(object).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    return <Text style={styles.emptyValue}>(empty)</Text>;
  }

  return (
    <View style={depth > 0 ? styles.nested : undefined}>
      {entries.map(([key, val], idx) => (
        <Row key={key} label={key} value={val} depth={depth} isLast={idx === entries.length - 1} />
      ))}
    </View>
  );
}

function Row({
  label,
  value,
  depth,
  isLast,
}: {
  label: string;
  value: unknown;
  depth: number;
  isLast: boolean;
}) {
  const isComplex =
    value != null &&
    typeof value === 'object' &&
    (Array.isArray(value) ? value.length > 0 : Object.keys(value as object).length > 0);

  return (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <Text style={styles.key}>{titleCase(label)}</Text>
      {isComplex ? (
        <View style={styles.complexValueWrap}>
          <JsonView value={value} depth={depth + 1} />
        </View>
      ) : (
        <View style={styles.scalarValueWrap}>
          <JsonView value={value} depth={depth + 1} />
        </View>
      )}
    </View>
  );
}

function JsonArray({ items, depth }: { items: unknown[]; depth: number }) {
  if (items.length === 0) {
    return <Text style={styles.emptyValue}>(empty)</Text>;
  }

  const allScalar = items.every((i) => i == null || typeof i !== 'object');
  if (allScalar) {
    return (
      <View style={styles.scalarList}>
        {items.map((item, i) => (
          <View key={i} style={styles.scalarListItem}>
            <Text style={styles.bullet}>•</Text>
            <View style={{ flex: 1 }}>
              <ScalarValue value={item} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  // Array of objects → stacked mini cards
  return (
    <View style={styles.arrayStack}>
      {items.map((item, i) => (
        <View key={i} style={styles.arrayCard}>
          <Text style={styles.arrayIndex}>#{i + 1}</Text>
          <JsonView value={item} depth={depth + 1} />
        </View>
      ))}
    </View>
  );
}

function ScalarValue({ value }: { value: unknown }) {
  if (value == null) return <Text style={styles.emptyValue}>—</Text>;

  if (typeof value === 'boolean') {
    return (
      <Text style={[styles.value, value ? styles.valueTrue : styles.valueFalse]}>
        {value ? 'Yes' : 'No'}
      </Text>
    );
  }

  if (typeof value === 'number') {
    return <Text style={[styles.value, styles.valueNumber]}>{formatNumber(value)}</Text>;
  }

  const str = String(value);

  // URL → tappable teal link
  if (/^https?:\/\//.test(str)) {
    return (
      <Pressable onPress={() => Linking.openURL(str).catch(() => {})}>
        <Text style={[styles.value, styles.valueLink]} numberOfLines={2}>
          {str}
        </Text>
      </Pressable>
    );
  }

  // ISO date → locale date
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return (
        <Text style={styles.value}>
          {d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </Text>
      );
    }
  }

  return <Text style={styles.value}>{str}</Text>;
}

export function titleCase(key: string): string {
  return key
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

const styles = StyleSheet.create({
  nested: {
    marginTop: 4,
  },
  row: {
    paddingVertical: 6,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
  },
  key: {
    fontFamily: fonts.archivo.medium,
    fontSize: 11,
    color: colors.slate,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  scalarValueWrap: {
    // scalar renders on its own line under the key
  },
  complexValueWrap: {
    paddingLeft: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.glassBorder,
    marginTop: 2,
  },
  value: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.silver,
    lineHeight: 19,
  },
  valueNumber: {
    fontFamily: fonts.mono.medium,
    color: colors.alabaster,
    fontVariant: ['tabular-nums'],
  },
  valueTrue: {
    color: colors.statusApprove,
    fontFamily: fonts.archivo.semibold,
  },
  valueFalse: {
    color: colors.slate,
    fontFamily: fonts.archivo.semibold,
  },
  valueLink: {
    color: colors.teal,
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(0, 161, 155, 0.4)',
  },
  emptyValue: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.slate,
    fontStyle: 'italic',
  },
  scalarList: {
    gap: 4,
  },
  scalarListItem: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  bullet: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.teal,
    lineHeight: 19,
  },
  arrayStack: {
    gap: spacing.sm,
    marginTop: 4,
  },
  arrayCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
  },
  arrayIndex: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    color: colors.teal,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
});
