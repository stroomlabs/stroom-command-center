import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Switch,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import type { GovernancePolicy, GovernanceAction } from '@stroom/types';
import { useGovernancePolicies } from '../src/hooks/useGovernancePolicies';
import { useBrandAlert } from '../src/components/BrandAlert';
import { colors, fonts, spacing, radius, gradient } from '../src/constants/brand';

const ACTIONS: { key: GovernanceAction; label: string; color: string }[] = [
  { key: 'auto_approve', label: 'Approve', color: colors.statusApprove },
  { key: 'auto_flag', label: 'Flag', color: colors.statusPending },
  { key: 'auto_reject', label: 'Reject', color: colors.statusReject },
];

export default function PoliciesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    policies,
    loading,
    error,
    refresh,
    patchPolicy,
    addPolicy,
    sweep,
    sweeping,
    lastSweep,
  } = useGovernancePolicies();
  const { alert } = useBrandAlert();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleSweep = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await sweep();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      alert(
        'Sweep complete',
        `${result.approved} approved · ${result.flagged} flagged · ${result.rejected} rejected`,
        [{ text: 'OK' }]
      );
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleCreate = async () => {
    Haptics.selectionAsync();
    try {
      const created = await addPolicy({
        name: 'New policy',
        description: null,
        is_active: false,
        min_trust_score: 7.5,
        min_confidence_score: 7.5,
        min_corroborations: 1,
        action: 'auto_flag',
        applies_to_predicates: null,
        applies_to_entity_types: null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      alert('Policy created', `"${created.name}" is inactive — toggle it on when ready.`);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  return (
    <LinearGradient
      colors={[gradient.background[0], gradient.background[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
          <Text style={styles.backText}>Ops</Text>
        </Pressable>
        <Text style={styles.title}>Policies</Text>
        <Text style={styles.subtitle}>
          {policies.length} auto-governance {policies.length === 1 ? 'policy' : 'policies'}
          {lastSweep &&
            ` · last sweep ${lastSweep.approved}✓ ${lastSweep.flagged}? ${lastSweep.rejected}✗`}
        </Text>
      </View>

      {loading && policies.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.teal}
            />
          }
        >
          {/* Action bar */}
          <View style={styles.actionRow}>
            <Pressable
              onPress={handleSweep}
              disabled={sweeping}
              style={({ pressed }) => [
                styles.sweepBtn,
                (pressed || sweeping) && { opacity: 0.75 },
              ]}
            >
              {sweeping ? (
                <ActivityIndicator size="small" color={colors.obsidian} />
              ) : (
                <Ionicons name="sparkles" size={16} color={colors.obsidian} />
              )}
              <Text style={styles.sweepText}>
                {sweeping ? 'Sweeping…' : 'Run Sweep'}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleCreate}
              style={({ pressed }) => [
                styles.createBtn,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name="add" size={16} color={colors.teal} />
              <Text style={styles.createText}>Create Policy</Text>
            </Pressable>
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="warning-outline" size={14} color={colors.statusReject} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {policies.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="shield-outline" size={40} color={colors.slate} />
              <Text style={styles.emptyTitle}>No policies yet</Text>
              <Text style={styles.emptyBody}>
                Create a policy to start auto-governing claims based on trust and confidence thresholds.
              </Text>
            </View>
          ) : (
            policies.map((p) => (
              <PolicyCard
                key={p.id}
                policy={p}
                onChange={(patch) => patchPolicy(p.id, patch)}
              />
            ))
          )}
        </ScrollView>
      )}
    </LinearGradient>
  );
}

function PolicyCard({
  policy,
  onChange,
}: {
  policy: GovernancePolicy;
  onChange: (patch: Partial<GovernancePolicy>) => void;
}) {
  const actionColor =
    ACTIONS.find((a) => a.key === policy.action)?.color ?? colors.teal;

  return (
    <View
      style={[
        styles.card,
        { borderLeftColor: actionColor, borderLeftWidth: 3 },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <TextInput
            value={policy.name}
            onChangeText={(next) => onChange({ name: next })}
            style={styles.nameInput}
            placeholder="Policy name"
            placeholderTextColor={colors.slate}
          />
          <TextInput
            value={policy.description ?? ''}
            onChangeText={(next) => onChange({ description: next || null })}
            style={styles.descInput}
            placeholder="Description"
            placeholderTextColor={colors.slate}
            multiline
          />
        </View>
        <Switch
          value={policy.is_active}
          onValueChange={(v) => {
            Haptics.selectionAsync();
            onChange({ is_active: v });
          }}
          trackColor={{ false: colors.surfaceCard, true: colors.teal }}
          thumbColor={colors.alabaster}
          ios_backgroundColor={colors.surfaceCard}
        />
      </View>

      <ThresholdSlider
        label="Min Trust Score"
        value={policy.min_trust_score ?? 0}
        min={0}
        max={10}
        step={0.1}
        onChange={(v) => onChange({ min_trust_score: v })}
      />
      <ThresholdSlider
        label="Min Confidence"
        value={policy.min_confidence_score ?? 0}
        min={0}
        max={10}
        step={0.1}
        onChange={(v) => onChange({ min_confidence_score: v })}
      />
      <ThresholdSlider
        label="Min Corroborations"
        value={policy.min_corroborations ?? 0}
        min={0}
        max={10}
        step={1}
        onChange={(v) => onChange({ min_corroborations: Math.round(v) })}
      />

      <Text style={styles.sectionLabel}>ACTION</Text>
      <View style={styles.actionPicker}>
        {ACTIONS.map((a) => {
          const active = policy.action === a.key;
          return (
            <Pressable
              key={a.key}
              onPress={() => {
                Haptics.selectionAsync();
                onChange({ action: a.key });
              }}
              style={({ pressed }) => [
                styles.actionPill,
                active && { backgroundColor: `${a.color}22`, borderColor: a.color },
                pressed && !active && { opacity: 0.7 },
              ]}
            >
              <Text
                style={[
                  styles.actionPillText,
                  active && { color: a.color },
                ]}
              >
                {a.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {(policy.applies_to_predicates?.length ?? 0) > 0 && (
        <Text style={styles.scopeHint}>
          Applies to: {policy.applies_to_predicates!.join(', ')}
        </Text>
      )}
      {(policy.applies_to_entity_types?.length ?? 0) > 0 && (
        <Text style={styles.scopeHint}>
          Entity types: {policy.applies_to_entity_types!.join(', ')}
        </Text>
      )}
    </View>
  );
}

function ThresholdSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
}) {
  const [local, setLocal] = useState(value);
  // Keep in sync when upstream changes
  React.useEffect(() => setLocal(value), [value]);

  return (
    <View style={styles.sliderBlock}>
      <View style={styles.sliderHeader}>
        <Text style={styles.sliderLabel}>{label}</Text>
        <Text style={styles.sliderValue}>{local.toFixed(step < 1 ? 1 : 0)}</Text>
      </View>
      <Slider
        value={local}
        minimumValue={min}
        maximumValue={max}
        step={step}
        minimumTrackTintColor={colors.teal}
        maximumTrackTintColor="rgba(255,255,255,0.1)"
        thumbTintColor={colors.teal}
        onValueChange={setLocal}
        onSlidingComplete={(v) => {
          Haptics.selectionAsync();
          onChange(v);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  backText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 16,
    color: colors.alabaster,
    marginLeft: 2,
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 30,
    color: colors.alabaster,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.slate,
    marginTop: 2,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sweepBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.teal,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  sweepText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 14,
    color: colors.obsidian,
    letterSpacing: -0.2,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
  },
  createText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 13,
    color: colors.teal,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    fontFamily: fonts.archivo.medium,
    fontSize: 12,
    color: colors.statusReject,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fonts.archivo.bold,
    fontSize: 18,
    color: colors.alabaster,
    marginTop: spacing.sm,
  },
  emptyBody: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.slate,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  nameInput: {
    fontFamily: fonts.archivo.bold,
    fontSize: 16,
    color: colors.alabaster,
    paddingVertical: 0,
  },
  descInput: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.silver,
    paddingVertical: 0,
    marginTop: 4,
    lineHeight: 17,
  },
  sliderBlock: {
    marginTop: spacing.xs,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  sliderLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 11,
    color: colors.slate,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sliderValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 13,
    color: colors.teal,
    fontVariant: ['tabular-nums'],
  },
  sectionLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  actionPicker: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actionPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
  },
  actionPillText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 12,
    color: colors.silver,
  },
  scopeHint: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    marginTop: 2,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
