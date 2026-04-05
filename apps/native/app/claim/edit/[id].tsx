import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { updateClaim } from '@stroom/supabase';
import type { ClaimStatus } from '@stroom/types';
import { useClaimDetail } from '../../../src/hooks/useClaimDetail';
import supabase from '../../../src/lib/supabase';
import { titleCase } from '../../../src/components/JsonView';
import { colors, fonts, spacing, radius, gradient } from '../../../src/constants/brand';

const STATUS_OPTIONS: ClaimStatus[] = [
  'draft',
  'pending_review',
  'approved',
  'published',
  'rejected',
  'superseded',
];

export default function ClaimEditScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { claim, loading, error } = useClaimDetail(id);

  const [status, setStatus] = useState<ClaimStatus>('draft');
  const [confidence, setConfidence] = useState<string>('');
  const [jsonbValue, setJsonbValue] = useState<unknown>({});
  const [rawJson, setRawJson] = useState<string>('');
  const [rawMode, setRawMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Hydrate from fetched claim
  useEffect(() => {
    if (!claim) return;
    setStatus(claim.status);
    setConfidence(claim.confidence_score != null ? String(claim.confidence_score) : '');
    const jsonb = claim.value_jsonb ?? {};
    setJsonbValue(jsonb);
    setRawJson(JSON.stringify(jsonb, null, 2));
    setRawMode(false); // Fields view is always the default
  }, [claim]);

  // Keep raw JSON mirror up to date while editing in fields mode so toggling
  // shows the current working state rather than the original payload.
  useEffect(() => {
    if (!rawMode) {
      try {
        setRawJson(JSON.stringify(jsonbValue, null, 2));
      } catch {
        // non-serializable — leave prior raw intact
      }
    }
  }, [jsonbValue, rawMode]);

  const canSave = useMemo(() => {
    if (saving) return false;
    const c = confidence.trim();
    if (c.length > 0) {
      const num = Number(c);
      if (Number.isNaN(num) || num < 0 || num > 10) return false;
    }
    if (rawMode) {
      try {
        JSON.parse(rawJson);
      } catch {
        return false;
      }
    }
    return true;
  }, [confidence, rawJson, rawMode, saving]);

  const handleSave = useCallback(async () => {
    if (!claim || !canSave) return;
    setSaving(true);
    setSaveError(null);

    let nextJsonb: unknown;
    try {
      if (rawMode) {
        nextJsonb = JSON.parse(rawJson);
      } else {
        nextJsonb = jsonbValue;
      }
    } catch (e: any) {
      setSaveError('Invalid JSON: ' + (e.message ?? 'parse error'));
      setSaving(false);
      return;
    }

    const confNum = confidence.trim().length > 0 ? Number(confidence) : null;

    try {
      await updateClaim(supabase, claim.id, {
        value_jsonb: nextJsonb as Record<string, unknown> | null,
        status,
        confidence_score: confNum,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: any) {
      setSaveError(e.message ?? 'Failed to save');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  }, [claim, canSave, rawMode, rawJson, jsonbValue, confidence, status, router]);

  const handleDiscard = useCallback(() => {
    Alert.alert('Discard changes?', 'Any edits will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  }, [router]);

  if (loading) {
    return (
      <LinearGradient
        colors={[gradient.background[0], gradient.background[1]]}
        style={styles.container}
      >
        <View style={styles.centered}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      </LinearGradient>
    );
  }

  if (error || !claim) {
    return (
      <LinearGradient
        colors={[gradient.background[0], gradient.background[1]]}
        style={styles.container}
      >
        <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
          <BackButton onPress={() => router.back()} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? 'Claim not found'}</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[gradient.background[0], gradient.background[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable
            onPress={handleDiscard}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
            hitSlop={10}
          >
            <Ionicons name="close" size={22} color={colors.alabaster} />
            <Text style={styles.backText}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Edit Claim</Text>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: 96 + Math.max(insets.bottom, spacing.md) },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Status picker */}
          <Text style={styles.sectionHeader}>STATUS</Text>
          <View style={styles.statusGrid}>
            {STATUS_OPTIONS.map((s) => {
              const active = status === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setStatus(s);
                  }}
                  style={({ pressed }) => [
                    styles.statusPill,
                    active && styles.statusPillActive,
                    pressed && !active && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      active && styles.statusTextActive,
                    ]}
                  >
                    {s.replace(/_/g, ' ')}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Confidence */}
          <Text style={styles.sectionHeader}>CONFIDENCE SCORE (0–10)</Text>
          <TextInput
            value={confidence}
            onChangeText={setConfidence}
            keyboardType="decimal-pad"
            placeholder="e.g. 8.5"
            placeholderTextColor={colors.slate}
            style={styles.input}
          />

          {/* Value JSONB */}
          <View style={styles.jsonHeaderRow}>
            <Text style={styles.sectionHeader}>VALUE</Text>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setRawMode((m) => !m);
              }}
              style={({ pressed }) => [
                styles.modeToggle,
                rawMode && styles.modeToggleActive,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons
                name={rawMode ? 'list-outline' : 'code-slash-outline'}
                size={12}
                color={colors.teal}
              />
              <Text style={styles.modeToggleText}>
                {rawMode ? 'Back to fields' : 'Advanced: raw JSON'}
              </Text>
            </Pressable>
          </View>

          {rawMode ? (
            <TextInput
              value={rawJson}
              onChangeText={setRawJson}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, styles.jsonInput]}
              placeholder="{}"
              placeholderTextColor={colors.slate}
            />
          ) : (
            <FieldsEditor value={jsonbValue} onChange={setJsonbValue} />
          )}

          {saveError && (
            <View style={styles.errorBox}>
              <Ionicons name="warning-outline" size={14} color={colors.statusReject} />
              <Text style={styles.errorBoxText}>{saveError}</Text>
            </View>
          )}
        </ScrollView>

        {/* Save bar */}
        <View
          style={[
            styles.saveBar,
            { paddingBottom: Math.max(insets.bottom, spacing.md) },
          ]}
        >
          <Pressable
            onPress={handleDiscard}
            disabled={saving}
            style={({ pressed }) => [
              styles.cancelBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            style={({ pressed }) => [
              styles.saveBtn,
              !canSave && styles.saveBtnDisabled,
              pressed && canSave && { opacity: 0.85 },
            ]}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.obsidian} />
            ) : (
              <Ionicons name="save" size={16} color={colors.obsidian} />
            )}
            <Text style={styles.saveText}>Save Changes</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
      hitSlop={10}
    >
      <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
      <Text style={styles.backText}>Back</Text>
    </Pressable>
  );
}

// ── Recursive Fields editor ──
//
// Renders arbitrary JSONB structures as labeled inputs:
//   - object → labeled rows per key (Title Case)
//   - nested object → indented sub-fields behind a teal guide rail
//   - array of objects → expandable cards, each with editable fields inside
//   - array of scalars → numbered list of inputs
//   - scalar → TextInput (with typed keyboard for numbers)
// Typed scalars (number / boolean) round-trip their original JSON type.

function FieldsEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  return (
    <View style={styles.fieldsList}>
      <ValueNode value={value} onChange={onChange} depth={0} />
    </View>
  );
}

function ValueNode({
  value,
  onChange,
  depth,
  typeHint,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
  depth: number;
  typeHint?: 'string' | 'number' | 'boolean';
}) {
  if (value !== null && typeof value === 'object') {
    if (Array.isArray(value)) {
      return <ArrayNode items={value} onChange={onChange} depth={depth} />;
    }
    return (
      <ObjectNode
        obj={value as Record<string, unknown>}
        onChange={onChange}
        depth={depth}
      />
    );
  }
  // Scalar or null
  return <ScalarInput value={value} onChange={onChange} typeHint={typeHint} />;
}

function ObjectNode({
  obj,
  onChange,
  depth,
}: {
  obj: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  depth: number;
}) {
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return <Text style={styles.emptyValue}>(empty object)</Text>;
  }
  return (
    <View style={depth > 0 ? styles.nestedBlock : undefined}>
      {entries.map(([key, val]) => {
        const isComplex = val !== null && typeof val === 'object';
        return (
          <View key={key} style={styles.nestedFieldRow}>
            <Text style={styles.fieldLabel}>{titleCase(key)}</Text>
            {isComplex ? (
              <ValueNode
                value={val}
                onChange={(next) => onChange({ ...obj, [key]: next })}
                depth={depth + 1}
              />
            ) : (
              <ScalarInput
                value={val}
                onChange={(next) => onChange({ ...obj, [key]: next })}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

function ArrayNode({
  items,
  onChange,
  depth,
}: {
  items: unknown[];
  onChange: (next: unknown[]) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([0]));

  if (items.length === 0) {
    return <Text style={styles.emptyValue}>(empty list)</Text>;
  }

  const allObjects = items.every(
    (i) => i !== null && typeof i === 'object' && !Array.isArray(i)
  );

  const updateAt = (idx: number, next: unknown) => {
    const copy = items.slice();
    copy[idx] = next;
    onChange(copy);
  };

  if (!allObjects) {
    // Array of scalars or mixed — render indexed inputs
    return (
      <View style={styles.arrayStack}>
        {items.map((item, i) => (
          <View key={i} style={styles.arrayScalarRow}>
            <Text style={styles.arrayIndex}>#{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <ScalarInput value={item} onChange={(next) => updateAt(i, next)} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  // Array of objects — expandable cards
  return (
    <View style={styles.arrayStack}>
      {items.map((item, i) => {
        const isOpen = expanded.has(i);
        const preview = summarizeObject(item as Record<string, unknown>);
        return (
          <View key={i} style={styles.expandableCard}>
            <Pressable
              onPress={() => {
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  return next;
                });
              }}
              style={({ pressed }) => [
                styles.expandableHeader,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.arrayIndex}>#{i + 1}</Text>
              <Text style={styles.expandablePreview} numberOfLines={1}>
                {preview}
              </Text>
              <Ionicons
                name={isOpen ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={colors.slate}
              />
            </Pressable>
            {isOpen && (
              <View style={styles.expandableBody}>
                <ObjectNode
                  obj={item as Record<string, unknown>}
                  onChange={(next) => updateAt(i, next)}
                  depth={depth + 1}
                />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function ScalarInput({
  value,
  onChange,
  typeHint,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
  typeHint?: 'string' | 'number' | 'boolean';
}) {
  // Remember the original type so the payload round-trips cleanly.
  const originalType = typeHint ?? (value == null ? 'string' : typeof value as 'string' | 'number' | 'boolean');

  if (originalType === 'boolean') {
    const bool = value === true;
    return (
      <View style={styles.boolRow}>
        {[true, false].map((b) => {
          const active = bool === b;
          return (
            <Pressable
              key={String(b)}
              onPress={() => onChange(b)}
              style={({ pressed }) => [
                styles.boolPill,
                active && styles.boolPillActive,
                pressed && !active && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.boolText, active && styles.boolTextActive]}>
                {b ? 'True' : 'False'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  const text = value == null ? '' : String(value);

  return (
    <TextInput
      value={text}
      onChangeText={(next) => {
        if (next.length === 0) {
          onChange(null);
          return;
        }
        if (originalType === 'number') {
          const n = Number(next);
          if (!Number.isNaN(n) && /^-?\d*\.?\d*$/.test(next)) {
            onChange(n);
            return;
          }
          // Invalid numeric input — keep original value, let operator fix
          return;
        }
        onChange(next);
      }}
      keyboardType={originalType === 'number' ? 'decimal-pad' : 'default'}
      placeholder="—"
      placeholderTextColor={colors.slate}
      style={styles.fieldInput}
    />
  );
}

function summarizeObject(obj: Record<string, unknown>): string {
  if (!obj || typeof obj !== 'object') return '';
  // Pick the first string-ish field as a preview label
  for (const k of ['name', 'title', 'label', 'driver', 'team', 'id']) {
    if (k in obj && typeof obj[k] !== 'object') return String(obj[k]);
  }
  const first = Object.entries(obj).find(([, v]) => typeof v !== 'object');
  return first ? `${titleCase(first[0])}: ${String(first[1]).slice(0, 40)}` : '';
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  backText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 16,
    color: colors.alabaster,
    marginLeft: 2,
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 28,
    color: colors.alabaster,
    letterSpacing: -0.6,
    marginTop: spacing.sm,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 14,
    color: colors.statusReject,
  },
  sectionHeader: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1.2,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  statusPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.surfaceElevated,
  },
  statusPillActive: {
    backgroundColor: colors.tealDim,
    borderColor: colors.teal,
  },
  statusText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 12,
    color: colors.silver,
    textTransform: 'capitalize',
  },
  statusTextActive: {
    color: colors.teal,
  },
  input: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.alabaster,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  jsonHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  modeToggleText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    color: colors.teal,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  jsonInput: {
    fontFamily: fonts.mono.regular,
    fontSize: 12,
    minHeight: 160,
    textAlignVertical: 'top',
    lineHeight: 17,
  },
  fieldsList: {
    gap: spacing.sm,
  },
  nestedBlock: {
    marginTop: 4,
    paddingLeft: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0, 161, 155, 0.35)',
    gap: spacing.xs,
  },
  nestedFieldRow: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: 4,
  },
  fieldRow: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  fieldLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  fieldInput: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.alabaster,
    paddingVertical: 0,
  },
  arrayStack: {
    gap: spacing.xs,
    marginTop: 4,
  },
  arrayScalarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  arrayIndex: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    color: colors.teal,
    letterSpacing: 0.5,
  },
  expandableCard: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  expandableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  expandablePreview: {
    flex: 1,
    fontFamily: fonts.archivo.medium,
    fontSize: 13,
    color: colors.silver,
  },
  expandableBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
    gap: spacing.xs,
  },
  boolRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: 2,
  },
  boolPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  boolPillActive: {
    backgroundColor: colors.tealDim,
    borderColor: colors.teal,
  },
  boolText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 12,
    color: colors.silver,
  },
  boolTextActive: {
    color: colors.teal,
  },
  modeToggleActive: {
    backgroundColor: 'rgba(0, 161, 155, 0.2)',
  },
  emptyValue: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.slate,
    fontStyle: 'italic',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.sm + 2,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: radius.sm,
  },
  errorBoxText: {
    flex: 1,
    fontFamily: fonts.archivo.medium,
    fontSize: 12,
    color: colors.statusReject,
  },
  saveBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  cancelBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.surfaceCard,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.silver,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.teal,
  },
  saveBtnDisabled: {
    opacity: 0.35,
  },
  saveText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 14,
    color: colors.obsidian,
    letterSpacing: -0.2,
  },
});
