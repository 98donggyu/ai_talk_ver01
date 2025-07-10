import React, { useState, useEffect } from 'react';
import { BackHandler } from 'react-native'; // BackHandler import 추가
import AsyncStorage from '@react-native-async-storage/async-storage';
import HomeScreen from './src/screens/HomeScreen';
import SpeakScreen from './src/screens/SpeakScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import HealthScreen from './src/screens/HealthScreen';
import PlayScreen from './src/screens/PlayScreen';

interface MarkedDates { [key: string]: { marked?: boolean; dotColor?: string; note?: string; }; }

const App = () => {
  const [currentScreen, setCurrentScreen] = useState('Home');
  const [markedDates, setMarkedDates] = useState<MarkedDates>({});
  
  // --- 안드로이드 뒤로 가기 버튼 처리 (useEffect) ---
  useEffect(() => {
    const handleBackButton = () => {
      // 현재 화면이 'Home'이 아닐 때만 우리가 원하는 동작을 실행합니다.
      if (currentScreen !== 'Home') {
        setCurrentScreen('Home'); // 홈 화면으로 이동
        return true; // true를 반환하여 앱이 종료되는 것을 막습니다.
      }
      // 현재 화면이 'Home'일 때는, false를 반환하여 기본 동작(앱 종료)을 실행합니다.
      return false;
    };

    // 뒤로 가기 버튼 이벤트 리스너를 추가합니다.
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBackButton,
    );

    // 컴포넌트가 사라질 때 이벤트 리스너를 제거합니다.
    return () => backHandler.remove();
  }, [currentScreen]); // currentScreen이 바뀔 때마다 이 로직을 다시 확인합니다.


  useEffect(() => {
    const loadData = async () => {
      try {
        const savedData = await AsyncStorage.getItem('calendarData');
        if (savedData !== null) { setMarkedDates(JSON.parse(savedData)); }
      } catch (e) { console.error('Failed to load data.', e); }
    };
    loadData();
  }, []);

  const saveData = async (data: MarkedDates) => {
    try {
      const stringifiedData = JSON.stringify(data);
      await AsyncStorage.setItem('calendarData', stringifiedData);
    } catch (e) { console.error('Failed to save data.', e); }
  };

  const handleUpdateEvent = (date: string, note: string) => {
    const newMarkedDates = { ...markedDates };
    if (!note.trim()) { delete newMarkedDates[date]; }
    else { newMarkedDates[date] = { marked: true, dotColor: '#50cebb', note: note }; }
    setMarkedDates(newMarkedDates);
    saveData(newMarkedDates);
  };

  const navigate = (screenName: string) => { if (screenName) { setCurrentScreen(screenName); } };
  const goBackToHome = () => { setCurrentScreen('Home'); };

  switch (currentScreen) {
    case 'Speak':
      return <SpeakScreen navigation={{ goBack: goBackToHome }} />;
    case 'Calendar':
      return ( <CalendarScreen navigation={{ goBack: goBackToHome }} savedDates={markedDates} onUpdateEvent={handleUpdateEvent} /> );
    case 'Health':
      return <HealthScreen navigation={{ goBack: goBackToHome }} />;
    case 'Play':
      return <PlayScreen navigation={{ goBack: goBackToHome }} />;
    default:
      return <HomeScreen navigation={{ navigate: navigate }} />;
  }
};
export default App;