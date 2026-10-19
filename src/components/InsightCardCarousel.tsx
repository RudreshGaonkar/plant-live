import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.72;

export interface InsightCardData {
  id: string;
  category: string;
  title: string;
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: 'lime' | 'mint' | 'blush' | 'forest';
}

interface InsightCardCarouselProps {
  insights: InsightCardData[];
}

export function InsightCardCarousel({ insights }: InsightCardCarouselProps) {
  const { colors, radii } = useAppTheme();

  const getTintColors = (tint: InsightCardData['tint']) => {
    switch (tint) {
      case 'lime':
        return {
          bg: '#F5FAE8',
          border: `${colors.palette.lime}90`,
          iconBg: `${colors.palette.lime}60`,
          iconColor: '#4A7540',
          categoryColor: '#4A7540',
        };
      case 'mint':
        return {
          bg: '#EDF8EE',
          border: `${colors.palette.mint}80`,
          iconBg: `${colors.palette.mint}50`,
          iconColor: colors.palette.forest,
          categoryColor: colors.palette.forest,
        };
      case 'blush':
        return {
          bg: '#FFF3F4',
          border: `${colors.palette.blush}90`,
          iconBg: `${colors.palette.blush}80`,
          iconColor: '#C0505E',
          categoryColor: '#C0505E',
        };
      case 'forest':
      default:
        return {
          bg: '#F2F7F2',
          border: `${colors.palette.forest}30`,
          iconBg: `${colors.palette.forest}20`,
          iconColor: colors.palette.forest,
          categoryColor: colors.palette.forest,
        };
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <View style={styles.titleRow}>
          <Ionicons name="sparkles" size={16} color={colors.palette.forest} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Plain-Language Insights
          </Text>
        </View>
        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
          Environmental analysis & growth factors
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + 12}
        snapToAlignment="start"
      >
        {insights.map((ins) => {
          const tintColors = getTintColors(ins.tint);
          return (
            <View
              key={ins.id}
              style={[
                styles.card,
                {
                  width: CARD_WIDTH,
                  backgroundColor: tintColors.bg,
                  borderRadius: radii.card,
                  borderColor: tintColors.border,
                },
              ]}
            >
              {/* Card Top Row: Category Chip & Icon */}
              <View style={styles.cardTopRow}>
                <View
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: tintColors.iconBg,
                      borderRadius: radii.sm,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      { color: tintColors.categoryColor },
                    ]}
                  >
                    {ins.category}
                  </Text>
                </View>

                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: tintColors.iconBg,
                    },
                  ]}
                >
                  <Ionicons
                    name={ins.icon}
                    size={16}
                    color={tintColors.iconColor}
                  />
                </View>
              </View>

              {/* Title & Plain-Language Summary Body */}
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {ins.title}
              </Text>
              <Text style={[styles.cardBody, { color: colors.palette.ink }]}>
                {ins.body}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  scrollContent: {
    paddingRight: 16,
    gap: 12,
  },
  card: {
    padding: 16,
    borderWidth: 1.5,
    justifyContent: 'space-between',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  categoryChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardBody: {
    fontSize: 12.5,
    fontWeight: '400',
    lineHeight: 18,
  },
});
