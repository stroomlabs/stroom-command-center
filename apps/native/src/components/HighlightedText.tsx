import React from 'react';
import { Text, StyleSheet, type TextStyle, type StyleProp } from 'react-native';
import { colors, fonts } from '../constants/brand';

// Renders `text` with every case-insensitive occurrence of `query` wrapped in
// a teal-highlighted inline Text segment. Used by Explore / Queue search
// results to show the operator which part of a name, predicate, or value
// matched what they typed. Empty or missing query → plain text, no overhead.
interface HighlightedTextProps {
  text: string;
  query: string | null | undefined;
  style?: StyleProp<TextStyle>;
  highlightStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

export function HighlightedText({
  text,
  query,
  style,
  highlightStyle,
  numberOfLines,
}: HighlightedTextProps) {
  const trimmed = query?.trim();
  if (!trimmed) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }

  const parts = splitOnMatches(text, trimmed);
  if (parts.length === 1 && !parts[0].match) {
    // Fast path: no match anywhere, skip the extra Text wrappers.
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((p, idx) =>
        p.match ? (
          <Text
            key={`h-${idx}`}
            style={[styles.highlight, highlightStyle]}
          >
            {p.text}
          </Text>
        ) : (
          // React Native requires wrapping plain strings in <Text> when they
          // appear alongside sibling <Text> nodes inside the parent Text.
          <Text key={`p-${idx}`}>{p.text}</Text>
        )
      )}
    </Text>
  );
}

// Walks `text` once, collecting runs of non-match and match substrings.
// Case-insensitive. Empty `query` is handled by the caller.
function splitOnMatches(
  text: string,
  query: string
): Array<{ text: string; match: boolean }> {
  const parts: Array<{ text: string; match: boolean }> = [];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let cursor = 0;
  while (cursor < text.length) {
    const hit = lower.indexOf(q, cursor);
    if (hit === -1) {
      parts.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (hit > cursor) {
      parts.push({ text: text.slice(cursor, hit), match: false });
    }
    parts.push({ text: text.slice(hit, hit + q.length), match: true });
    cursor = hit + q.length;
  }
  return parts;
}

const styles = StyleSheet.create({
  highlight: {
    color: colors.teal,
    backgroundColor: 'rgba(0, 161, 155, 0.15)',
    fontFamily: fonts.archivo.semibold,
  },
});
