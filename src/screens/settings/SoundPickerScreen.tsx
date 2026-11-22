import React, { useState, useCallback } from 'react';
import { StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { Text } from 'react-native-paper';
import { Audio } from 'expo-av';
import {
  REGULAR_SOUNDS,
  EMERGENCY_SOUNDS,
  SOUND_ASSETS,
  DEFAULT_REGULAR_ID,
  DEFAULT_EMERGENCY_ID,
} from '../../constants/sounds';

function resolveRegular(val: string): string {
  const found = REGULAR_SOUNDS.find((s) => s.id === val || s.label === val);
  return found ? found.id : DEFAULT_REGULAR_ID;
}

function resolveEmergency(val: string): string {
  const found = EMERGENCY_SOUNDS.find((s) => s.id === val || s.label === val);
  return found ? found.id : DEFAULT_EMERGENCY_ID;
}

interface SoundPickerScreenProps {
  selectedRegular?: string;
  selectedEmergency?: string;
  onSelect: (regular: string, emergency: string) => void;
}

export function SoundPickerScreen({
  selectedRegular,
  selectedEmergency,
  onSelect,
}: SoundPickerScreenProps) {
  const [regular, setRegular] = useState(resolveRegular(selectedRegular ?? ''));
  const [emergency, setEmergency] = useState(resolveEmergency(selectedEmergency ?? ''));
  const [playingId, setPlayingId] = useState<string | null>(null);

  const playSound = useCallback(async (soundId: string) => {
    const asset = SOUND_ASSETS[soundId];
    if (!asset) {
      console.warn('Sound asset not found:', soundId);
      return;
    }

    setPlayingId(soundId);

    try {
      if (Platform.OS === 'web') {
        // Web: use Audio API
        // For web with expo-av, we need to handle it differently
        const { sound } = await Audio.Sound.createAsync(asset);
        await sound.playAsync();
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && !status.isPlaying && status.didJustFinish) {
            setPlayingId(null);
            sound.unloadAsync();
          }
        });
      } else {
        // Native: use expo-av
        const { sound } = await Audio.Sound.createAsync(asset);
        await sound.playAsync();
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && !status.isPlaying && status.didJustFinish) {
            setPlayingId(null);
            sound.unloadAsync();
          }
        });
      }
    } catch (error) {
      console.error('Error playing sound:', error);
      setPlayingId(null);
    }
  }, []);

  const handleRegularChange = (soundId: string) => {
    setRegular(soundId);
    onSelect(soundId, emergency);
    playSound(soundId);
  };

  const handleEmergencyChange = (soundId: string) => {
    setEmergency(soundId);
    onSelect(regular, soundId);
    playSound(soundId);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Regular Reminder Sound</Text>
      <Text style={styles.hint}>For daily medications and normal reminders</Text>
      {REGULAR_SOUNDS.map((sound) => (
        <Pressable
          key={sound.id}
          style={[
            styles.soundButton,
            regular === sound.id && styles.soundButtonSelected,
          ]}
          onPress={() => handleRegularChange(sound.id)}
        >
          <Text style={[styles.soundText, regular === sound.id && styles.soundTextSelected]}>
            {sound.label}
          </Text>
          <Text style={styles.soundIcon}>
            {playingId === sound.id ? '🔉' : '🔊'}
          </Text>
        </Pressable>
      ))}

      <Text style={[styles.sectionTitle, { marginTop: 32 }]}>
        Important/Emergency Sound
      </Text>
      <Text style={styles.hint}>For urgent reminders and emergencies</Text>
      {EMERGENCY_SOUNDS.map((sound) => (
        <Pressable
          key={sound.id}
          style={[
            styles.soundButton,
            emergency === sound.id && styles.soundButtonSelected,
          ]}
          onPress={() => handleEmergencyChange(sound.id)}
        >
          <Text style={[styles.soundText, emergency === sound.id && styles.soundTextSelected]}>
            {sound.label}
          </Text>
          <Text style={styles.soundIcon}>
            {playingId === sound.id ? '🔉' : '🚨'}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EBF5F5',
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1B3A6B',
    marginBottom: 4,
  },
  hint: {
    fontSize: 12,
    color: '#7A9A9A',
    marginBottom: 12,
  },
  soundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#1B3A6B',
    backgroundColor: 'transparent',
    marginBottom: 8,
  },
  soundButtonSelected: {
    backgroundColor: '#3DBDA7',
    borderColor: '#3DBDA7',
  },
  soundText: {
    fontSize: 14,
    color: '#1B3A6B',
  },
  soundTextSelected: {
    color: '#FFFFFF',
  },
  soundIcon: {
    fontSize: 18,
  },
});
