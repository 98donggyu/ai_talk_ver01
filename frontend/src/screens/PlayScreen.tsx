import React from 'react';
import {
    SafeAreaView,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Image,
    } from 'react-native';

const PlayScreen = ({ navigation }: { navigation: any }) => {
    // 각 놀이 메뉴를 눌렀을 때의 동작 (지금은 기능이 없으므로 콘솔에 로그만 출력)
    const handleGamePress = (gameName: string) => {
        console.log(`${gameName} 게임을 시작합니다.`);
        // 나중에 실제 게임 화면으로 이동하는 코드를 여기에 추가할 수 있습니다.
        // 예: navigation.navigate('MatgoGameScreen');
    };

    return (
        <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>재미있는 놀이</Text>
            <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={styles.container}>
            <TouchableOpacity style={styles.gameCard} onPress={() => handleGamePress('맞고')}>
            <Image source={require('../images/gostop.png')} style={styles.gameImage} />
            <Text style={styles.gameTitle}>맞고</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.gameCard} onPress={() => handleGamePress('퀴즈')}>
            <Image source={require('../images/play.png')} style={styles.gameImage} />
            <Text style={styles.gameTitle}>문제</Text>
            </TouchableOpacity>
        </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#f2f2f7' },
    container: {
        padding: 20,
    },
    header: { 
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
        paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, 
        borderBottomColor: '#dcdcdc', backgroundColor: '#fff' 
    },
    backButtonText: { fontSize: 32, color: '#007aff', fontWeight: 'bold' },
    headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
    gameCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
        alignItems: 'center',
        marginBottom: 25,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 5,
        elevation: 4,
    },
    gameImage: {
        width: 150,
        height: 150,
        resizeMode: 'contain',
        marginBottom: 15,
    },
    gameTitle: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#333',
    },
});

export default PlayScreen;