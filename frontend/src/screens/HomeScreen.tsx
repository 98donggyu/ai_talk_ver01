import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Image,
    StatusBar,
} from 'react-native';

interface MenuItem {
    id: number;
    name: string;
    image: any;
    screen?: string;
    }

    const HomeScreen = ({ navigation }: { navigation: any }) => {

    const menuItems: MenuItem[] = [
        { id: 1, name: '말하기', image: require('../images/speak.png'), screen: 'SpeakScreen' },
        { id: 2, name: '가족 마당', image: require('../images/family.png') },
        { id: 3, name: '라디오', image: require('../images/radio.png') },
        { id: 4, name: '놀이', image: require('../images/play.png') },
        { id: 5, name: '건강', image: require('../images/health.png') },
        { id: 6, name: '사진', image: require('../images/photo.png') },
    ];

    const handleMenuPress = (item: MenuItem) => {
        if (item.screen) {
        navigation.navigate(item.screen);
        } else {
        console.log(`${item.name} 기능은 준비 중입니다.`);
        }
    };

    return (
        <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        
        <View style={styles.header}>
            <Text style={styles.greeting}>안녕하세요!</Text>
            <Text style={styles.subtitle}>라기선님</Text>
        </View>

        <View style={styles.menuContainer}>
            {menuItems.map((item) => (
            <TouchableOpacity
                key={item.id}
                style={styles.menuItem}
                onPress={() => handleMenuPress(item)}
            >
                <View style={styles.iconContainer}>
                <Image source={item.image} style={styles.icon} />
                </View>
                <Text style={styles.menuText}>{item.name}</Text>
            </TouchableOpacity>
            ))}
        </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        paddingTop: 50, // SafeAreaView 대신 padding 추가
    },
    header: {
        padding: 20,
        alignItems: 'center',
    },
    greeting: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 5,
    },
    subtitle: {
        fontSize: 24,
        color: '#666',
    },
    menuContainer: {
        flex: 1,
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-around',
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    menuItem: {
        width: '45%',
        aspectRatio: 1,
        backgroundColor: '#fff',
        borderRadius: 20,
        marginBottom: 20,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    iconContainer: {
        width: 80,
        height: 80,
        marginBottom: 10,
    },
    icon: {
        width: '100%',
        height: '100%',
        resizeMode: 'contain',
    },
    menuText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
    },
});

export default HomeScreen;