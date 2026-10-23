import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { AmPm } from '../types/reminder';

interface Props {
  hour: number;
  minute: number;
  amPm: AmPm;
  onHourChange: (h: number) => void;
  onMinuteChange: (m: number) => void;
  onAmPmChange: (v: AmPm) => void;
}

const ITEM_HEIGHT = 40;
const VISIBLE_ROWS = 3;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS; // 120px
const CENTER_OFFSET = ITEM_HEIGHT; // 40px

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS: AmPm[] = ['AM', 'PM'];

interface WheelColProps<T> {
  items: T[];
  selectedIndex: number;
  formatItem: (item: T) => string;
  onSelectIndex: (idx: number) => void;
  width: number;
  textAlign?: 'left' | 'center' | 'right';
}

function WheelCol<T>({
  items,
  selectedIndex,
  formatItem,
  onSelectIndex,
  width,
  textAlign = 'center',
}: WheelColProps<T>) {
  const scrollRef = useRef<ScrollView>(null);
  const isInteracting = useRef(false);
  const [visualIndex, setVisualIndex] = useState(selectedIndex);

  const scrollToIndex = useCallback(
    (idx: number, animated = true) => {
      if (idx >= 0 && idx < items.length) {
        scrollRef.current?.scrollTo({
          y: idx * ITEM_HEIGHT,
          animated,
        });
      }
    },
    [items.length]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToIndex(selectedIndex, false);
      setVisualIndex(selectedIndex);
    }, 40);
    return () => clearTimeout(timer);
  }, [selectedIndex, scrollToIndex]);

  useEffect(() => {
    if (!isInteracting.current) {
      setVisualIndex(selectedIndex);
      scrollToIndex(selectedIndex, true);
    }
  }, [selectedIndex, scrollToIndex]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    if (clamped !== visualIndex) {
      setVisualIndex(clamped);
    }
  };

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    setVisualIndex(clamped);
    onSelectIndex(clamped);
    isInteracting.current = false;
  };

  return (
    <View style={[styles.columnWrap, { width }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.wheelScroll}
        contentContainerStyle={styles.wheelContent}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        nestedScrollEnabled={true}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          isInteracting.current = true;
        }}
        onScrollEndDrag={handleScrollEnd}
        onMomentumScrollEnd={handleScrollEnd}
      >
        {items.map((item, idx) => {
          const dist = Math.abs(idx - visualIndex);

          let fontSize = 24;
          let fontWeight: '700' | '600' | '500' | '400' = '400';
          let color = '#1B5E20';
          let opacity = 1;

          if (dist === 0) {
            fontSize = 24;
            fontWeight = '700';
            color = '#1B5E20';
            opacity = 1;
          } else if (dist === 1) {
            fontSize = 19;
            fontWeight = '500';
            color = '#757575';
            opacity = 0.55;
          } else {
            fontSize = 16;
            fontWeight = '400';
            color = '#BDBDBD';
            opacity = 0.2;
          }

          return (
            <TouchableOpacity
              key={idx}
              style={[styles.itemRow, { width }]}
              onPress={() => {
                scrollToIndex(idx, true);
                setVisualIndex(idx);
                onSelectIndex(idx);
              }}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.itemText,
                  {
                    fontSize,
                    fontWeight,
                    color,
                    opacity,
                    textAlign,
                  },
                ]}
                numberOfLines={1}
              >
                {formatItem(item)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function TimePicker({
  hour,
  minute,
  amPm,
  onHourChange,
  onMinuteChange,
  onAmPmChange,
}: Props) {
  const selectedHourIndex = Math.max(0, HOURS.indexOf(hour));
  const selectedMinuteIndex = Math.max(0, MINUTES.indexOf(minute));
  const selectedPeriodIndex = Math.max(0, PERIODS.indexOf(amPm));

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Choose Time</Text>

      {/* Wheel Card */}
      <View style={styles.card}>
        {/* Soft mint highlight bar in the middle row */}
        <View style={styles.highlightBar} pointerEvents="none" />

        {/* 3 Wheel Columns with Colon */}
        <View style={styles.columnsRow}>
          {/* Hour */}
          <WheelCol<number>
            items={HOURS}
            selectedIndex={selectedHourIndex}
            formatItem={(h) => String(h).padStart(2, '0')}
            onSelectIndex={(idx) => onHourChange(HOURS[idx])}
            width={70}
            textAlign="center"
          />

          {/* Colon */}
          <View style={styles.colonWrap}>
            <Text style={styles.colon}>:</Text>
          </View>

          {/* Minute */}
          <WheelCol<number>
            items={MINUTES}
            selectedIndex={selectedMinuteIndex}
            formatItem={(m) => String(m).padStart(2, '0')}
            onSelectIndex={(idx) => onMinuteChange(MINUTES[idx])}
            width={70}
            textAlign="center"
          />

          {/* Period (AM/PM) */}
          <WheelCol<AmPm>
            items={PERIODS}
            selectedIndex={selectedPeriodIndex}
            formatItem={(p) => p}
            onSelectIndex={(idx) => onAmPmChange(PERIODS[idx])}
            width={64}
            textAlign="center"
          />
        </View>

        {/* Top Gradient Fade */}
        <View style={styles.topFade} pointerEvents="none">
          <View style={[styles.fadeSlice, { backgroundColor: 'rgba(255, 255, 255, 0.95)' }]} />
          <View style={[styles.fadeSlice, { backgroundColor: 'rgba(255, 255, 255, 0.65)' }]} />
          <View style={[styles.fadeSlice, { backgroundColor: 'rgba(255, 255, 255, 0.25)' }]} />
        </View>

        {/* Bottom Gradient Fade */}
        <View style={styles.bottomFade} pointerEvents="none">
          <View style={[styles.fadeSlice, { backgroundColor: 'rgba(255, 255, 255, 0.25)' }]} />
          <View style={[styles.fadeSlice, { backgroundColor: 'rgba(255, 255, 255, 0.65)' }]} />
          <View style={[styles.fadeSlice, { backgroundColor: 'rgba(255, 255, 255, 0.95)' }]} />
        </View>
      </View>

      <Text style={styles.hint}>Scroll or tap to choose time</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 10,
  },
  card: {
    height: PICKER_HEIGHT,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8E2D9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  highlightBar: {
    position: 'absolute',
    top: CENTER_OFFSET,
    left: 10,
    right: 10,
    height: ITEM_HEIGHT,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#C8E6C9',
    zIndex: 0,
  },
  columnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: PICKER_HEIGHT,
    zIndex: 1,
  },
  columnWrap: {
    height: PICKER_HEIGHT,
    overflow: 'hidden',
  },
  wheelScroll: {
    height: PICKER_HEIGHT,
  },
  wheelContent: {
    paddingTop: CENTER_OFFSET,
    paddingBottom: CENTER_OFFSET,
  },
  itemRow: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    letterSpacing: 0.5,
  },
  colonWrap: {
    height: PICKER_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  colon: {
    fontSize: 26,
    fontWeight: '800',
    color: '#2E7D32',
    lineHeight: 28,
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 34,
    zIndex: 2,
    flexDirection: 'column',
  },
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 34,
    zIndex: 2,
    flexDirection: 'column',
  },
  fadeSlice: {
    flex: 1,
    width: '100%',
  },
  hint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9E9E9E',
    marginTop: 8,
    letterSpacing: 0.3,
  },
});
