import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '../lib/haptics';
import { useModalTransition } from '../hooks/useModalTransition';
import { useBrandToast } from './BrandToast';
import supabase from '../lib/supabase';
import { colors, fonts, spacing, radius } from '../constants/brand';
import { ModalBackdrop } from './ModalBackdrop';

const ENTITY_TYPES = [
  'person',
  'team',
  'venue',
  'series',
  'organization',
  'ship',
  'park',
  'attraction',
  'event',
] as const;

const DOMAINS = [
  'motorsports',
  'cruise',
  'theme_parks',
  'ncaa',
  'nfl',
  'activities',
  'general',
  'culture',
  'stadiums',
] as const;

interface EntityEditSheetProps {
  visible: boolean;
  entity: {
    id: string;
    canonical_name: string | null;
    canonical_slug: string | null;
    entity_type: string | null;
    domain: string | null;
    description: string | null;
  } | null;
  onDismiss: () => void;
  onSaved: () => void;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function EntityEditSheet({
  visible,
  entity,
  onDismiss,
  onSaved,
}: EntityEditSheetProps) {
  const { cardStyle } = useModalTransition(visible);
  const { show: showToast } = useBrandToast();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugDirty, setSlugDirty] = useState(false);
  const [entityType, setEntityType] = useState<string>('');
  const [domain, setDomain] = useState<string>('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Seed form state whenever the sheet opens with a new entity.
  useEffect(() => {
    if (!visible || !entity) return;
    setName(entity.canonical_name ?? '');
    setSlug(entity.canonical_slug ?? '');
    setSlugDirty(false);
    setEntityType(entity.entity_type ?? '');
    setDomain(entity.domain ?? '');
    setDescription(entity.description ?? '');
  }, [visible, entity?.id]);

  // Auto-regenerate the slug from the name while the user hasn't hand-edited
  // the slug field.
  useEffect(() => {
    if (slugDirty) return;
    setSlug(slugify(name));
  }, [name, slugDirty]);

  const handleSave = async () => {
    if (!entity) return;
    const patch: Record<string, unknown> = {};
    if ((entity.canonical_name ?? '') !== name.trim()) patch.canonical_name = name.trim();
    if ((entity.canonical_slug ?? '') !== slug.trim()) patch.canonical_slug = slug.trim();
    if ((entity.entity_type ?? '') !== entityType) patch.entity_type = entityType || null;
    if ((entity.domain ?? '') !== domain) patch.domain = domain || null;
    if ((entity.description ?? '') !== description) patch.description = description || null;

    if (Object.keys(patch).length === 0) {
      onDismiss();
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.schema('intel').rpc('update_entity', {
        entity_id: entity.id,
        new_canonical_name: patch.canonical_name ?? null,
        new_canonical_slug: patch.canonical_slug ?? null,
        new_entity_type: patch.entity_type ?? null,
        new_domain: patch.domain ?? null,
        new_description: patch.description ?? null,
      });
      if (error) throw error;
      haptics.success();
      showToast('Entity updated', 'success');
      onSaved();
      onDismiss();
    } catch (e: any) {
      haptics.error();
      showToast(e?.message ?? 'Update failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <ModalBackdrop onPress={onDismiss}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}
        >
          <Animated.View style={[styles.sheetWrap, cardStyle]}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <View style={styles.header}>
                <Text style={styles.title}>Edit Entity</Text>
                <Pressable onPress={onDismiss} hitSlop={10}>
                  <Ionicons name="close" size={22} color={colors.silver} />
                </Pressable>
              </View>

              <ScrollView
                style={styles.scroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Field label="NAME">
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Canonical name"
                    placeholderTextColor={colors.slate}
                    style={styles.input}
                    selectionColor={colors.teal}
                    keyboardAppearance="dark"
                  />
                </Field>

                <Field label="SLUG">
                  <TextInput
                    value={slug}
                    onChangeText={(v) => {
                      setSlug(v);
                      setSlugDirty(true);
                    }}
                    placeholder="auto-generated"
                    placeholderTextColor={colors.slate}
                    style={[styles.input, styles.monoInput]}
                    selectionColor={colors.teal}
                    keyboardAppearance="dark"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Field>

                <Field label="TYPE">
                  <ChipPicker
                    options={ENTITY_TYPES}
                    value={entityType}
                    onChange={setEntityType}
                  />
                </Field>

                <Field label="DOMAIN">
                  <ChipPicker
                    options={DOMAINS}
                    value={domain}
                    onChange={setDomain}
                  />
                </Field>

                <Field label="DESCRIPTION">
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Short description (optional)"
                    placeholderTextColor={colors.slate}
                    style={[styles.input, styles.textarea]}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    selectionColor={colors.teal}
                    keyboardAppearance="dark"
                  />
                </Field>
              </ScrollView>

              <View style={styles.footer}>
                <Pressable
                  onPress={onDismiss}
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
                  disabled={saving || !name.trim()}
                  style={({ pressed }) => [
                    styles.saveBtn,
                    (saving || !name.trim()) && { opacity: 0.45 },
                    pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
                  ]}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.obsidian} />
                  ) : (
                    <Ionicons name="save" size={14} color={colors.obsidian} />
                  )}
                  <Text style={styles.saveText}>Save</Text>
                </Pressable>
              </View>
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </ModalBackdrop>
    </Modal>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ChipPicker({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <Pressable
            key={opt}
            onPress={() => {
              haptics.tap.light();
              onChange(active ? '' : opt);
            }}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && !active && { opacity: 0.7 },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                active && { color: colors.teal },
              ]}
            >
              {opt.replace(/_/g, ' ')}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  kav: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  sheet: {
    backgroundColor: colors.surfaceSheet,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    padding: spacing.md,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 18,
    color: colors.alabaster,
    letterSpacing: -0.2,
  },
  scroll: {
    maxHeight: 520,
  },
  field: {
    marginBottom: spacing.md,
    gap: 6,
  },
  fieldLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1,
  },
  input: {
    fontFamily: fonts.archivo.regular,
    fontSize: 15,
    color: colors.alabaster,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  monoInput: {
    fontFamily: fonts.mono.regular,
    fontSize: 13,
  },
  textarea: {
    minHeight: 96,
    paddingTop: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  chipActive: {
    backgroundColor: colors.tealDim,
    borderColor: colors.teal,
  },
  chipText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 12,
    color: colors.silver,
    textTransform: 'capitalize',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  cancelText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.silver,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.teal,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 3,
  },
  saveText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 14,
    color: colors.obsidian,
    letterSpacing: 0.3,
  },
});
