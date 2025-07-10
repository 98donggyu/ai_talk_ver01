import React, { useState, useEffect } from 'react';
import { BackHandler } from 'react-native'; // BackHandler import
import AsyncStorage from '@react-native-async-storage/async-storage';
import HomeScreen from './src/screens/HomeScreen';
import SpeakScreen from './src/screens/SpeakScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import HealthScreen from './src/screens/HealthScreen';
import PlayScreen from './src/screens/PlayScreen';
import RadioScreen from './src/screens/RadioScreen';

interface MarkedDates { [key: string]: { marked?: boolean; dotColor?: string; note?: string; }; }

const App = () => {
  const [currentScreen, setCurrentScreen] = useState('Home');
  const [markedDates, setMarkedDates] = useState<MarkedDates>({});

  // --- 안드로이드 뒤로 가기 버튼 처리 (가장 중요!) ---
  useEffect(() => {
    const handleBackButton = () => {
      // 현재 화면이 'Home'이 아닐 때,
      if (currentScreen !== 'Home') {
        // 홈 화면으로 이동시킵니다.
        setCurrentScreen('Home');
        // true를 반환하여 앱이 종료되는 기본 동작을 막습니다.
        return true;
      }
      // 현재 화면이 'Home'일 때는, false를 반환하여 앱을 종료합니다.
      return false;
    };

    // 뒤로 가기 버튼 감시병을 설치합니다.
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBackButton,
    );

    // 화면이 바뀔 때마다 감시병을 제거했다가 다시 설치합니다.
    return () => backHandler.remove();
  }, [currentScreen]); // currentScreen 값이 바뀔 때마다 감시합니다.


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
    case 'Radio':
      return <RadioScreen navigation={{ goBack: goBackToHome }} />;
    default:
      return <HomeScreen navigation={{ navigate: navigate }} />;
  }
};
export default App;