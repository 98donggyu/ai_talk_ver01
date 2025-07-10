import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';

// --- 아이콘 SVG 데이터 ---
const footprintIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="#4CAF50"><path d="M12 3.7c.3 0 .6.1.8.4.2.3.4.6.4.9v.1c0 .3-.1.6-.4.8-.2.2-.5.4-.8.4s-.6-.1-.8-.4c-.3-.2-.4-.5-.4-.8v-.1c0-.3.1-.6.4-.9.2-.3.5-.4.8-.4zm-2.8 1.8c.4 0 .7.1 1 .4.3.3.5.6.5 1v.1c0 .4-.2.7-.5 1-.3.3-.6.4-1 .4s-.7-.1-1-.4c-.3-.3-.5-.6-.5-1v-.1c0-.4.2-.7.5-1 .3-.3.6-.4 1-.4zm5.6 0c.4 0 .7.1 1 .4.3.3.5.6.5 1v.1c0 .4-.2.7-.5 1-.3.3-.6.4-1 .4s-.7-.1-1-.4c-.3-.3-.5-.6-.5-1v-.1c0-.4.2-.7.5-1 .3-.3.6-.4 1-.4zM8.1 8.3c.5 0 .9.2 1.3.6.4.4.6.9.6 1.4v.1c0 .5-.2.9-.6 1.3-.4.4-.8.6-1.3.6s-.9-.2-1.3-.6c-.4-.4-.6-.8-.6-1.3v-.1c0-.5.2-.9.6-1.4.4-.4.8-.6 1.3-.6zm7.8 0c.5 0 .9.2 1.3.6.4.4.6.9.6 1.4v.1c0 .5-.2.9-.6 1.3-.4.4-.8.6-1.3.6s-.9-.2-1.3-.6c-.4-.4-.6-.8-.6-1.3v-.1c0-.5.2-.9.6-1.4.4-.4.8-.6 1.3-.6zM12 13.5c-2.2 0-4.1.8-5.7 2.3-1.6 1.5-2.3 3.4-2.3 5.7v.1h16v-.1c0-2.3-.8-4.2-2.3-5.7-1.6-1.5-3.5-2.3-5.7-2.3z"/></svg>`;
const morningIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="#FFC107"><path d="M12 9c-1.65 0-3 1.35-3 3s1.35 3 3 3 3-1.35 3-3-1.35-3-3-3zm0 4c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm0-8c-4.41 0-8 3.59-8 8s3.59 8 8 8 8-3.59 8-8-3.59-8-8-8zm0 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zM20 11h-2.05c-.17-1.39-.52-2.7-1.04-3.89l1.44-1.44c.39-.39.39-1.02 0-1.41-.39-.39-1.02-.39-1.41 0l-1.44 1.44C15.6 5.2 14.39 4.84 13 4.69V2.64c0-.55-.45-1-1-1s-1 .45-1 1v2.05c-1.39.17-2.7.52-3.89 1.04L5.67 4.22c-.39-.39-1.02-.39-1.41 0-.39.39-.39 1.02 0 1.41l1.44 1.44C5.2 8.3 4.84 9.61 4.69 11H2.64c-.55 0-1 .45-1 1s.45 1 1 1h2.05c.17 1.39.52 2.7 1.04 3.89l-1.44 1.44c-.39-.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.44-1.44c1.19.52 2.5.88 3.89 1.04v2.05c0 .55.45 1 1 1s1-.45 1-1v-2.05c1.39-.17 2.7-.52 3.89-1.04l1.44 1.44c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41l-1.44-1.44c.52-1.19.88-2.5 1.04-3.89h2.05c.55 0 1-.45 1-1s-.45-1-1-1z"/></svg>`;
const lunchIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="#FF9800"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>`;
const dinnerIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="#607D8B"><path d="M12.34 2.02c-2.83-.19-5.48 1.03-7.34 3.52-3.35 4.48-1.54 10.92 3.82 13.56 2.44 1.21 5.2.85 7.33-1.06-.32 2.29-1.89 4.2-3.98 5.06-2.09.86-4.5.45-6.32-1.03-2.5-2.06-3.8-5.32-3.15-8.62.65-3.3 3.4-5.93 6.6-6.52.28-.05.56.15.61.43.05.28-.15.56-.43.61-2.82.52-5.22 2.87-5.8 5.74-.58 2.87.56 5.75 2.79 7.6 1.58 1.3 3.66 1.63 5.46.87 1.8-.75 3.12-2.33 3.53-4.25.1-.47.53-.76.99-.66.47.1.76.53.66.99-.5 2.3-2.11 4.28-4.28 5.17-2.17.89-4.75.5-6.79-1.09-3.7-3.04-5.18-8.6-2.59-12.53 2.2-3.48 6.01-5.18 9.61-4.5.31.05.5.35.45.66-.05.31-.35.5-.66.45z"/></svg>`;
const checkIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="#4CAF50"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;

interface MedicationStatus { morning: boolean; lunch: boolean; dinner: boolean; }

const HealthScreen = ({ navigation }: { navigation: any }) => {
  const [medicationStatus, setMedicationStatus] = useState<MedicationStatus>({
    morning: false, lunch: false, dinner: false,
  });

  useEffect(() => {
    const loadMedicationStatus = async () => {
      try {
        const savedStatus = await AsyncStorage.getItem('medicationStatus');
        if (savedStatus !== null) { setMedicationStatus(JSON.parse(savedStatus)); }
      } catch (e) { console.error('Failed to load medication status.', e); }
    };
    loadMedicationStatus();
  }, []);

  const saveMedicationStatus = async (status: MedicationStatus) => {
    try {
      await AsyncStorage.setItem('medicationStatus', JSON.stringify(status));
    } catch (e) { console.error('Failed to save medication status.', e); }
  };

  const handleMedicationPress = (meal: keyof MedicationStatus) => {
    const newStatus = { ...medicationStatus, [meal]: !medicationStatus[meal] };
    setMedicationStatus(newStatus);
    saveMedicationStatus(newStatus);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={navigation.goBack}>
            <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>건강 관리</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView style={styles.container}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>오늘의 걸음</Text>
          <View style={styles.card}>
            <SvgXml xml={footprintIconSvg} />
            <Text style={styles.stepCountText}>측정 준비 중</Text>
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>약 복용 확인</Text>
          <TouchableOpacity style={styles.card} onPress={() => handleMedicationPress('morning')}>
            <SvgXml xml={morningIconSvg} /><Text style={styles.medicationText}>아침 약</Text>
            <View style={styles.checkbox}>{medicationStatus.morning && <SvgXml xml={checkIconSvg} />}</View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.card} onPress={() => handleMedicationPress('lunch')}>
            <SvgXml xml={lunchIconSvg} /><Text style={styles.medicationText}>점심 약</Text>
            <View style={styles.checkbox}>{medicationStatus.lunch && <SvgXml xml={checkIconSvg} />}</View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.card} onPress={() => handleMedicationPress('dinner')}>
            <SvgXml xml={dinnerIconSvg} /><Text style={styles.medicationText}>저녁 약</Text>
            <View style={styles.checkbox}>{medicationStatus.dinner && <SvgXml xml={checkIconSvg} />}</View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f2f2f7' },
  container: { flex: 1, padding: 15, },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#dcdcdc', backgroundColor: '#fff' },
  backButtonText: { fontSize: 32, color: '#007aff', fontWeight: 'bold' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  section: { marginBottom: 30, },
  sectionTitle: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 15, paddingLeft: 5, },
  card: { backgroundColor: '#fff', borderRadius: 20, paddingVertical: 20, paddingHorizontal: 25, flexDirection: 'row', alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, marginBottom: 15, },
  stepCountText: { fontSize: 32, fontWeight: 'bold', marginLeft: 20, color: '#333', },
  medicationText: { fontSize: 28, fontWeight: '600', marginLeft: 20, flex: 1, color: '#333', },
  checkbox: { width: 40, height: 40, borderWidth: 3, borderColor: '#ccc', borderRadius: 10, justifyContent: 'center', alignItems: 'center', }
});

export default HealthScreen;