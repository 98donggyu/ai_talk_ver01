import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, StatusBar, SafeAreaView, } from 'react-native';
import { SvgXml } from 'react-native-svg';

const settingsIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.44,0.17-0.48-0.41L9.2,5.29C8.61,5.53,8.08,5.85,7.59,6.23L5.2,5.27C4.98,5.19,4.73,5.26,4.61,5.48l-1.92,3.32 C2.58,9.02,2.63,9.29,2.81,9.42l2.03,1.58C4.82,11.36,4.8,11.68,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94 l0.44,2.48c0.04-0.24,0.24-0.41,0.48-0.41h3.84c0.24,0,0.44-0.17,0.48-0.41l0.44-2.48c0.59-0.24,1.12-0.56,1.62-0.94 l2.39,0.96c0.22,0.08,0.47,0.01,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z"/><circle cx="12" cy="12" r="3"/></svg>`;
const calendarIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><path d="m9 16 2 2 4-4"></path></svg>`;

interface MenuItem { id: number; name: string; image: any; screen?: string; }

const HomeScreen = ({ navigation }: { navigation: any }) => {
  const menuItems: MenuItem[] = [
    { id: 1, name: '말하기', image: require('../images/speak.png'), screen: 'Speak' },
    { id: 2, name: '가족 마당', image: require('../images/family.png') },
    { id: 3, name: '라디오', image: require('../images/radio.png'), screen: 'Radio' }, // 'Radio' 스크린으로 연결
    { id: 4, name: '놀이', image: require('../images/play.png'), screen: 'Play' },
    { id: 5, name: '건강', image: require('../images/health.png'), screen: 'Health' },
    { id: 6, name: '사진', image: require('../images/photo.png') },
  ];

  const handlePress = (screenName?: string) => { if (screenName) { navigation.navigate(screenName); } else { console.log('이 기능은 아직 준비 중입니다.'); } };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f5f5f5" />
      <View style={styles.header}><View><Text style={styles.greeting}>안녕하세요!</Text><Text style={styles.userName}>라기선님</Text></View><View style={styles.headerIcons}><TouchableOpacity onPress={() => handlePress()} style={styles.iconButton}><SvgXml xml={settingsIconSvg} width="100%" height="100%" /></TouchableOpacity><TouchableOpacity onPress={() => handlePress('Calendar')} style={styles.iconButton}><SvgXml xml={calendarIconSvg} width="100%" height="100%" /></TouchableOpacity></View></View>
      <View style={styles.menuContainer}>{menuItems.map((item) => (<TouchableOpacity key={item.id} style={styles.menuItem} onPress={() => handlePress(item.screen)}><View style={styles.iconContainer}><Image source={item.image} style={styles.icon} /></View><Text style={styles.menuText}>{item.name}</Text></TouchableOpacity>))}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingHorizontal: 15 },
  header: { paddingHorizontal: 10, paddingTop: 30, paddingBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { fontSize: 30, fontWeight: '600', color: '#666' },
  userName: { fontSize: 42, fontWeight: 'bold', color: '#333' },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  iconButton: { width: 55, height: 55, justifyContent: 'center', alignItems: 'center' },
  menuContainer: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 5, paddingTop: 20 },
  menuItem: { width: '48%', aspectRatio: 1, backgroundColor: '#fff', borderRadius: 25, marginBottom: 15, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 5, elevation: 4 },
  iconContainer: { width: '60%', height: '60%', marginBottom: 10 },
  icon: { width: '100%', height: '100%', resizeMode: 'contain' },
  menuText: { fontSize: 24, fontWeight: 'bold', color: '#333' },
});

export default HomeScreen;