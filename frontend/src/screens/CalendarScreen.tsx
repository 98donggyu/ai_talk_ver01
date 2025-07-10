import React, { useState, useMemo } from 'react';
import {
    SafeAreaView, View, Text, TouchableOpacity, StyleSheet, Modal, TextInput,
} from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';

LocaleConfig.locales['ko'] = {
    monthNames: ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'],
    monthNamesShort: ['1.','2.','3.','4.','5.','6.','7.','8.','9.','10.','11.','12.'],
    dayNames: ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'],
    dayNamesShort: ['일','월','화','수','목','금','토'],
    today: '오늘',
};
LocaleConfig.defaultLocale = 'ko';

interface MarkedDates {
    [key: string]: { marked?: boolean; dotColor?: string; note?: string; };
}

// App.tsx로부터 받을 props 타입을 정의합니다.
interface CalendarScreenProps {
    navigation: any;
    savedDates: MarkedDates;
    onUpdateEvent: (date: string, note: string) => void;
}

const CalendarScreen = ({ navigation, savedDates, onUpdateEvent }: CalendarScreenProps) => {
    const [selectedDate, setSelectedDate] = useState('');
    const [isModalVisible, setModalVisible] = useState(false);
    const [eventText, setEventText] = useState('');
    
    // 이제 CalendarScreen은 자체적으로 markedDates state를 갖지 않습니다.
    // const [markedDates, setMarkedDates] = useState<MarkedDates>({...}); // 이 줄을 삭제!

    const todayString = useMemo(() => new Date().toISOString().split('T')[0], []);

    const handleDayPress = (day: any) => {
        const dateString = day.dateString;
        setSelectedDate(dateString);
        // App.tsx에서 받은 savedDates를 사용합니다.
        setEventText(savedDates[dateString]?.note || '');
        setModalVisible(true);
    };

    const handleSaveEvent = () => {
        // App.tsx에서 받은 onUpdateEvent 함수를 호출합니다.
        onUpdateEvent(selectedDate, eventText);
        setModalVisible(false);
        setEventText('');
    };

    return (
        <SafeAreaView style={calendarStyles.safeArea}>
            <View style={calendarStyles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Text style={calendarStyles.backButtonText}>‹</Text>
                </TouchableOpacity>
                <Text style={calendarStyles.headerTitle}>일정 관리</Text>
                <View style={{ width: 24 }} />
            </View>

            <Calendar
                onDayPress={handleDayPress}
                markedDates={savedDates} // App.tsx에서 받은 데이터를 사용
                monthFormat={'yyyy년 MM월'}
                theme={{
                    selectedDayBackgroundColor: '#00adf5',
                    arrowColor: '#00adf5',
                    dotColor: '#50cebb',
                    todayTextColor: '#00adf5',
                }}
                style={{marginBottom: 10}}
            />
            
            <View style={calendarStyles.todayScheduleContainer}>
                <Text style={calendarStyles.todayDateText}>오늘의 일정 ({todayString})</Text>
                {savedDates[todayString]?.note ? ( // App.tsx에서 받은 데이터를 사용
                    <Text style={calendarStyles.todayScheduleText}>
                        {savedDates[todayString]?.note}
                    </Text>
                ) : (
                    <Text style={calendarStyles.noScheduleText}>
                        오늘은 등록된 일정이 없어요.
                    </Text>
                )}
            </View>

            <Modal
                animationType="fade"
                transparent={true}
                visible={isModalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={calendarStyles.centeredView}>
                    <View style={calendarStyles.modalView}>
                        <Text style={calendarStyles.modalDateText}>{selectedDate}</Text>
                        <TextInput
                            style={calendarStyles.input}
                            placeholder="일정을 입력하세요"
                            placeholderTextColor="#999"
                            value={eventText}
                            onChangeText={setEventText}
                        />
                        <View style={calendarStyles.modalButtons}>
                            <TouchableOpacity 
                                style={[calendarStyles.button, calendarStyles.buttonClose]}
                                onPress={() => setModalVisible(false)}
                            >
                                <Text style={calendarStyles.buttonText}>취소</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[calendarStyles.button, calendarStyles.buttonSave]}
                                onPress={handleSaveEvent}
                            >
                                <Text style={calendarStyles.buttonText}>저장</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const calendarStyles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#f5f5f5' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EEE', backgroundColor: '#fff' },
    backButtonText: { fontSize: 32, color: '#333', fontWeight: 'bold' },
    headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
    todayScheduleContainer: { padding: 20, backgroundColor: '#fff', marginHorizontal: 10, borderRadius: 15, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 3, },
    todayDateText: { fontSize: 20, fontWeight: 'bold', color: '#555', marginBottom: 10, },
    todayScheduleText: { fontSize: 26, fontWeight: 'bold', color: '#333', },
    noScheduleText: { fontSize: 20, color: '#888', },
    centeredView: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalView: { width: '90%', backgroundColor: 'white', borderRadius: 20, padding: 25, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5, },
    modalDateText: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, },
    input: { width: '100%', height: 60, borderColor: '#ccc', borderWidth: 1, borderRadius: 10, marginBottom: 30, paddingHorizontal: 15, fontSize: 22, backgroundColor: '#f9f9f9', },
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', },
    button: { borderRadius: 10, paddingVertical: 15, paddingHorizontal: 20, elevation: 2, flex: 1, marginHorizontal: 10, alignItems: 'center', },
    buttonClose: { backgroundColor: '#777', },
    buttonSave: { backgroundColor: '#2196F3', },
    buttonText: { color: 'white', fontWeight: 'bold', fontSize: 20, }
});

export default CalendarScreen;