import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

import { useTheme } from '@/hooks/use-theme';

const TABLE_DATA = [
  { hour: '1', temp: '56°', humidity: '24%', moisture: '89%' },
  { hour: '2', temp: '55°', humidity: '25%', moisture: '90%' },
  { hour: '3', temp: '54°', humidity: '27%', moisture: '91%' },
  { hour: '4', temp: '53°', humidity: '29%', moisture: '92%' },
  { hour: '5', temp: '52°', humidity: '30%', moisture: '93%' },
  { hour: '6', temp: '54°', humidity: '28%', moisture: '91%' },
  { hour: '7', temp: '57°', humidity: '26%', moisture: '89%' },
  { hour: '8', temp: '60°', humidity: '23%', moisture: '86%' },
  { hour: '9', temp: '63°', humidity: '21%', moisture: '84%' },
  { hour: '10', temp: '66°', humidity: '19%', moisture: '82%' },
  { hour: '11', temp: '68°', humidity: '18%', moisture: '80%' },
  { hour: '12', temp: '70°', humidity: '17%', moisture: '78%' },
  { hour: '13', temp: '72°', humidity: '16%', moisture: '76%' },
  { hour: '14', temp: '56°', humidity: '24%', moisture: '89%' },
  { hour: '15', temp: '58°', humidity: '22%', moisture: '87%' },
  { hour: '16', temp: '55°', humidity: '25%', moisture: '90%' },
  { hour: '17', temp: '54°', humidity: '26%', moisture: '91%' },
  { hour: '18', temp: '52°', humidity: '28%', moisture: '92%' },
  { hour: '19', temp: '51°', humidity: '30%', moisture: '93%' },
  { hour: '20', temp: '50°', humidity: '32%', moisture: '94%' },
  { hour: '21', temp: '49°', humidity: '33%', moisture: '95%' },
  { hour: '22', temp: '48°', humidity: '35%', moisture: '96%' },
  { hour: '23', temp: '47°', humidity: '36%', moisture: '97%' },
  { hour: '24', temp: '46°', humidity: '38%', moisture: '98%' },
];

export function ReadingsTable() {
  const theme = useTheme();

  const renderHeader = () => (
    <View style={[styles.row, styles.headerRow, { backgroundColor: theme.background },]}>
      <ThemedText style={[styles.cell, styles.headerText]} type="small">Hour</ThemedText>
      <ThemedText style={[styles.cell, styles.headerText]} type="small">Temp</ThemedText>
      <ThemedText style={[styles.cell, styles.headerText]} type="small">Humidity</ThemedText>
      <ThemedText style={[styles.cell, styles.headerText]} type="small">Moisture</ThemedText>
    </View>
  );

  const renderItem = ({ item }) => (
    <View style={styles.row}>
      <ThemedText style={styles.cell} type="subtitle">{item.hour}</ThemedText>
      <ThemedText style={styles.cell} type="subtitle">{item.temp}</ThemedText>
      <ThemedText style={styles.cell} type="subtitle">{item.humidity}</ThemedText>
      <ThemedText style={styles.cell} type="subtitle">{item.moisture}</ThemedText>
    </View>
  );

  return (
    <View style={styles.table}>
      <FlatList
        data={TABLE_DATA}
        keyExtractor={(item) => item.hour}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        stickyHeaderIndices={[0]}
      />
    </View>
  );
};

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.verticalCenter}>
          <View style={styles.noWater}>
            <ThemedText type='subtitle'>No Water</ThemedText>
          </View>

          <View style={styles.heading}>
            <View style={styles.horizontalCenter}>
              <TouchableOpacity style={styles.button}>
                <ThemedText type='title'>&lt;</ThemedText> 
              </TouchableOpacity>
              <TouchableOpacity style={styles.button}>
                <ThemedText type="title">Today</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.button}>
                <ThemedText type='title'>&gt;</ThemedText> 
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.readings}>
            <ReadingsTable />
          </View>

          <View style={styles.waterNow}>
            <TouchableOpacity style={styles.button}>
              <ThemedText type='title'>Water Now</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  verticalCenter: {
    flex: 1,
    width: '100%',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  horizontalCenter: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
  },
  noWater: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderRadius: 10,
    shadowRadius: 50,
    shadowColor: 'red',
  },
  heading: {
    flex: 0.2,
    justifyContent: 'center',
  },
  readings: {
    flex: 0.6,
    width: '100%',
    justifyContent: 'center',
    minHeight: 0,
  },
  waterNow: {
    flex: 0.2,
    justifyContent: 'center',
  },
  scrollable: {
    flex: 1,
  },
  table: {
    flex: 1,
    width: '100%',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'lightgray',
  },
  row: {
    flexDirection: 'row',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
    alignItems: 'center',
  },
  headerRow: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'lightgray',
  },
  cell: {
    flex: 1, // Equal width columns
    textAlign: 'center',
  },
  headerText: {
    fontWeight: 'bold',
  },
  button: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderRadius: 10,
    shadowRadius: 50,
    shadowColor: 'gray',
    backgroundColor: 'gray'
  },
});