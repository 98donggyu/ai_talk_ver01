// App.tsx
import React, { useState } from 'react';
import HomeScreen from './src/screens/HomeScreen';
import SpeakScreen from './src/screens/SpeakScreen';

const App = () => {
  // 'Home' 또는 'Speak' 문자열로 현재 화면 상태를 관리합니다.
  const [currentScreen, setCurrentScreen] = useState('Home');

  // SpeakScreen으로 이동하는 함수
  const navigateToSpeak = () => {
    setCurrentScreen('Speak');
  };

  // HomeScreen으로 돌아오는 함수
  const goBackToHome = () => {
    setCurrentScreen('Home');
  };

  // 현재 화면 상태에 따라 다른 컴포넌트를 보여줍니다.
  if (currentScreen === 'Speak') {
    // SpeakScreen에는 goBack 함수를 전달합니다.
    return <SpeakScreen navigation={{ goBack: goBackToHome }} />;
  }

  // 기본 화면은 HomeScreen이며, navigate 함수를 전달합니다.
  return <HomeScreen navigation={{ navigate: navigateToSpeak }} />;
};

export default App;