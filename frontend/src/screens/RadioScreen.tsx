import React, { useState, useEffect } from 'react';
import {
    SafeAreaView, View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Alert, ActivityIndicator,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Video from 'react-native-video';

// --- 아이콘 SVG 데이터 ---
const emptyStarIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
const filledStarIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="#FFC107" stroke="#FFC107" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
const playIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>`;
const pauseIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#fff"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

// --- 라디오 채널 데이터 (안정적인 https 주소로 교체) ---
const radioChannels = [
    { id: 'sbs', name: 'SBS 파워FM', logo: require('../images/sbs_logo.png'), url: 'https://radio.bsod.kr/sbs-powerfm.m3u8' },
    { id: 'mbc', name: 'MBC FM4U', logo: require('../images/mbc_logo.png'), url: 'https://radio.bsod.kr/mbc-fm4u.m3u8' },
    { id: 'kbs1', name: 'KBS 클래식FM', logo: require('../images/kbs_logo.png'), url: 'https://radio.bsod.kr/kbs-1radio.m3u8' },
];

const RadioScreen = ({ navigation }: { navigation: any }) => {
    const [favorites, setFavorites] = useState<string[]>([]);
    const [currentTab, setCurrentTab] = useState<'all' | 'favorites'>('all');
    const [playingChannel, setPlayingChannel] = useState<any>(null);
    const [isPaused, setIsPaused] = useState(true);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const loadFavorites = async () => {
        try {
            const savedFavorites = await AsyncStorage.getItem('radioFavorites');
            if (savedFavorites !== null) { setFavorites(JSON.parse(savedFavorites)); }
        } catch (e) { console.error('Failed to load favorites.', e); }
        };
        loadFavorites();
    }, []);

    const saveFavorites = async (newFavorites: string[]) => {
        try {
        await AsyncStorage.setItem('radioFavorites', JSON.stringify(newFavorites));
        } catch (e) { console.error('Failed to save favorites.', e); }
    };

    const toggleFavorite = (channelId: string) => {
        const newFavorites = favorites.includes(channelId) ? favorites.filter(id => id !== channelId) : [...favorites, channelId];
        setFavorites(newFavorites);
        saveFavorites(newFavorites);
    };

    const handlePlayPause = (channel: any) => {
        if (playingChannel?.id === channel.id) {
        setIsPaused(!isPaused);
        } else {
        setPlayingChannel(channel);
        setIsPaused(false);
        setIsLoading(true);
        }
    };
    
    const displayedChannels = currentTab === 'all'
        ? radioChannels
        : radioChannels.filter(channel => favorites.includes(channel.id));

    return (
        <SafeAreaView style={styles.safeArea}>
        {playingChannel && (
            <Video
            source={{ uri: playingChannel.url }}
            paused={isPaused}
            playInBackground={true}
            style={{ height: 0, width: 0 }}
            onLoadStart={() => setIsLoading(true)}
            onLoad={() => setIsLoading(false)}
            onError={(error) => {
                setIsLoading(false);
                setIsPaused(true);
                console.log('재생 오류:', error);
                Alert.alert(
                '오류',
                '라디오 방송국에 연결할 수 없어요. 다른 채널을 선택해 보세요.'
                );
            }}
            />
        )}
        <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.backButtonText}>‹</Text></TouchableOpacity>
            <Text style={styles.headerTitle}>라디오 듣기</Text>
            <View style={{ width: 32 }} />
        </View>

        <ScrollView style={styles.container}>
            {displayedChannels.map(channel => (
            <View key={channel.id} style={styles.channelRow}>
                <TouchableOpacity style={styles.channelInfo} onPress={() => handlePlayPause(channel)}>
                <Image source={channel.logo} style={styles.logo} />
                <Text style={styles.channelName}>{channel.name}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => toggleFavorite(channel.id)} style={styles.starButton}>
                <SvgXml xml={favorites.includes(channel.id) ? filledStarIcon : emptyStarIcon} />
                </TouchableOpacity>
            </View>
            ))}
            <View style={{ height: 100 }} />
        </ScrollView>

        <View style={styles.footer}>
            {playingChannel && (
            <View style={styles.playerContainer}>
                {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
                ) : (
                <Text style={styles.playerText} numberOfLines={1}>
                    {isPaused ? '일시 정지됨' : `현재 재생중: ${playingChannel.name}`}
                </Text>
                )}
                <TouchableOpacity style={styles.playPauseButton} onPress={() => setIsPaused(!isPaused)}>
                <SvgXml xml={isPaused ? playIcon : pauseIcon} />
                </TouchableOpacity>
            </View>
            )}
            <View style={styles.tabContainer}>
            <TouchableOpacity style={styles.tabButton} onPress={() => setCurrentTab('all')}>
                <Text style={[styles.tabText, currentTab === 'all' && styles.activeTabText]}>전체 목록</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tabButton} onPress={() => setCurrentTab('favorites')}>
                <Text style={[styles.tabText, currentTab === 'favorites' && styles.activeTabText]}>즐겨찾기</Text>
            </TouchableOpacity>
            </View>
        </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#fff' },
    container: { flex: 1, },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee', backgroundColor: '#fff' },
    backButtonText: { fontSize: 32, color: '#007aff', fontWeight: 'bold' },
    headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
    channelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, paddingHorizontal: 20, borderBottomWidth: 1, borderColor: '#f2f2f2' },
    channelInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    logo: { width: 40, height: 40, resizeMode: 'contain', marginRight: 20 },
    channelName: { fontSize: 24, fontWeight: '600', color: '#333' },
    starButton: { padding: 10 },
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee' },
    playerContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#333', minHeight: 50 },
    playerText: { fontSize: 18, color: '#fff', flex: 1, marginRight: 10 },
    playPauseButton: { padding: 5, backgroundColor: '#555', borderRadius: 30 },
    tabContainer: { flexDirection: 'row', height: 60, },
    tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    tabText: { fontSize: 20, color: '#888' },
    activeTabText: { fontSize: 22, fontWeight: 'bold', color: '#007aff' },
});

export default RadioScreen;