import React, { useState } from 'react';
import HomeScreen from './src/screens/HomeScreen';
import SpeakScreen from './src/screens/SpeakScreen';

const App = () => {
  const [currentScreen, setCurrentScreen] = useState('Home');

  const navigate = (screen: string) => {
    setCurrentScreen(screen);
  };

  const goBack = () => {
    setCurrentScreen('Home');
  };

  if (currentScreen === 'SpeakScreen') {
    return <SpeakScreen navigation={{ goBack }} />;
  }

  return <HomeScreen navigation={{ navigate }} />;
};

export default App;