import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, ScrollView, Image, Platform } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { Video, ResizeMode, Audio } from 'expo-av';
import { doc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { getMedicationById } from '../../services/elderlyService';
import { SOUND_ASSETS, DEFAULT_REGULAR_ID, DEFAULT_EMERGENCY_ID, REGULAR_SOUNDS, EMERGENCY_SOUNDS } from '../../constants/sounds';
import { isAudioReady } from '../../services/audioService';

// Resolve sound id from stored value (handles both id and label)
function resolveSoundId(storedValue: string, isEmergency: boolean): string {
  // First check if it's already a valid id
  if (SOUND_ASSETS[storedValue]) {
    return storedValue;
  }
  // Otherwise try to find by label
  const sounds = isEmergency ? EMERGENCY_SOUNDS : REGULAR_SOUNDS;
  const found = sounds.find((s) => s.label === storedValue || s.id === storedValue);
  return found ? found.id : (isEmergency ? DEFAULT_EMERGENCY_ID : DEFAULT_REGULAR_ID);
}

interface ElderlyReminderScreenProps {
  reminderId: string;
  onAcknowledged: () => void;
  onBack: () => void;
}

export function ElderlyReminderScreen({
  reminderId,
  onAcknowledged,
  onBack,
}: ElderlyReminderScreenProps) {
  const [reminder, setReminder] = useState<{
    title: string;
    type: string;
    mediaUrl?: string;
    status: string;
    medicationId?: string | null;
    taskInfo?: string;
    priority?: string;
    caregiverId?: string;
  } | null>(null);
  const [medication, setMedication] = useState<{
    name: string;
    dosage: string;
    notes?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioSound, setAudioSound] = useState<Audio.Sound | null>(null);

  // Alarm state
  const [alarmPlaying, setAlarmPlaying] = useState(false);
  const [taskStarted, setTaskStarted] = useState(false);
  const [alarmAttempted, setAlarmAttempted] = useState(false);
  const alarmSoundRef = useRef<Audio.Sound | null>(null);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioSound) {
        audioSound.unloadAsync();
      }
      // Stop alarm on unmount
      stopAlarm();
    };
  }, [audioSound]);

  // Stop alarm function
  const stopAlarm = useCallback(() => {
    if (alarmSoundRef.current) {
      alarmSoundRef.current.stopAsync();
      alarmSoundRef.current.unloadAsync();
      alarmSoundRef.current = null;
    }
    setAlarmPlaying(false);
  }, []);

  // Play alarm based on priority and caregiver's sound settings
  const playAlarm = useCallback(async (priority: string, caregiverId: string) => {
    // Check if audio is ready (unlocked from home screen)
    if (Platform.OS === 'web' && !isAudioReady()) {
      console.warn('Audio not unlocked - user needs to tap on home screen first');
      return;
    }

    try {
      // Get caregiver's sound preferences
      const isEmergency = priority === 'important';
      let soundId = isEmergency ? DEFAULT_EMERGENCY_ID : DEFAULT_REGULAR_ID;

      if (caregiverId) {
        const caregiverDoc = await getDoc(doc(db, 'users', caregiverId));
        const caregiverData = caregiverDoc.data();
        if (caregiverData?.notificationSounds) {
          const storedValue = isEmergency
            ? caregiverData.notificationSounds.emergency
            : caregiverData.notificationSounds.regular;
          if (storedValue) {
            soundId = resolveSoundId(storedValue, isEmergency);
          }
        }
      }

      const soundAsset = SOUND_ASSETS[soundId];
      if (!soundAsset) {
        console.warn('Sound asset not found after resolution:', soundId);
        return;
      }

      // Set audio mode for proper playback
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const { sound } = await Audio.Sound.createAsync(soundAsset, { isLooping: true });
      alarmSoundRef.current = sound;
      await sound.playAsync();
      setAlarmPlaying(true);
    } catch (error) {
      console.error('Failed to play alarm:', error);
      setAlarmPlaying(false);
    }
  }, []);

  // Start playing alarm IMMEDIATELY when reminder loads
  useEffect(() => {
    if (reminder && !taskStarted && !alarmAttempted && reminder.caregiverId) {
      setAlarmAttempted(true);
      // Play alarm immediately on screen load
      playAlarm(reminder.priority || 'normal', reminder.caregiverId);
    }
  }, [reminder, taskStarted, alarmAttempted, playAlarm]);

  // Handle Start Task button
  const handleStartTask = useCallback(() => {
    stopAlarm();
    setTaskStarted(true);
  }, [stopAlarm]);

  const handlePlayAudio = useCallback(async () => {
    if (!reminder?.mediaUrl) return;

    if (Platform.OS === 'web') {
      const audio = new window.Audio(reminder.mediaUrl);
      audio.onplay = () => setAudioPlaying(true);
      audio.onended = () => setAudioPlaying(false);
      audio.onpause = () => setAudioPlaying(false);
      try {
        await audio.play();
      } catch (e) {
        console.error('Audio playback failed:', e);
        setAudioPlaying(false);
      }
    } else {
      try {
        if (audioSound) {
          await audioSound.unloadAsync();
        }
        const { sound } = await Audio.Sound.createAsync({ uri: reminder.mediaUrl });
        setAudioSound(sound);
        setAudioPlaying(true);
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && !status.isPlaying && status.didJustFinish) {
            setAudioPlaying(false);
          }
        });
        await sound.playAsync();
      } catch (e) {
        console.error('Audio playback failed:', e);
        setAudioPlaying(false);
      }
    }
  }, [reminder?.mediaUrl, audioSound]);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'reminders', reminderId), (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        setReminder({
          title: d.title,
          type: d.type,
          mediaUrl: d.mediaUrl,
          status: d.status,
          medicationId: d.medicationId,
          taskInfo: d.taskInfo,
          priority: d.priority || 'normal',
          caregiverId: d.caregiverId,
        });
        if (d?.medicationId) {
          getMedicationById(d.medicationId).then(setMedication);
        } else {
          setMedication(null);
        }
      }
    });
    return () => unsubscribe();
  }, [reminderId]);

  const handleDone = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'reminders', reminderId), {
        status: 'acknowledged',
        acknowledgedAt: new Date(),
      });
      onAcknowledged();
    } catch (err) {
      console.error('Failed to acknowledge:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!reminder) {
    return (
      <View style={styles.outerContainer}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loading}>Loading...</Text>
        </View>
      </View>
    );
  }

  const schedule = reminder as { schedule?: { time?: string } };
  const timeStr = typeof schedule.schedule === 'object' && schedule.schedule?.time
    ? (() => {
        const [h, m] = schedule.schedule!.time!.split(':').map(Number);
        const period = h >= 12 ? 'PM' : 'AM';
        return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${period}`;
      })()
    : '—';

  return (
    <View style={styles.outerContainer}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={true}
        bounces={true}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={true}
      >
      <Image
        source={require('../../../assets/logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      {/* Priority badge */}
      {reminder.priority === 'important' && (
        <View style={styles.priorityBadge}>
          <Text style={styles.priorityBadgeText}>🚨 IMPORTANT</Text>
        </View>
      )}

      <Text style={styles.title}>{reminder.title}</Text>

      {/* Show Start Task button - alarm plays immediately on screen load */}
      {!taskStarted && (
        <View style={styles.alarmContainer}>
          <Text style={styles.alarmIcon}>
            {reminder.priority === 'important' ? '🚨' : '🔔'}
          </Text>
          <Text style={styles.alarmText}>
            {reminder.priority === 'important' ? 'Important Reminder!' : 'You have a reminder!'}
          </Text>
          {alarmPlaying && (
            <Text style={styles.alarmPlayingText}>🔊 Alarm playing...</Text>
          )}
          <Button
            mode="contained"
            onPress={handleStartTask}
            style={styles.startTaskButton}
            contentStyle={styles.startTaskContent}
            labelStyle={styles.startTaskLabel}
          >
            Start Task
          </Button>
        </View>
      )}

      {/* Only show media after task is started */}
      {taskStarted && reminder.mediaUrl && reminder.type === 'video' && (
        <View style={styles.medicineImageWrap}>
          {Platform.OS === 'web' ? (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            <video
              src={reminder.mediaUrl}
              controls
              autoPlay
              style={webVideoStyle as any}
            />
          ) : (
            <Video
              source={{ uri: reminder.mediaUrl }}
              style={styles.nativeVideo}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
            />
          )}
        </View>
      )}

      {taskStarted && reminder.mediaUrl && reminder.type === 'audio' && (
        <View style={styles.audioPlayerWrap}>
          <View style={styles.audioPlayer}>
            <Text style={styles.audioIcon}>🔊</Text>
            <Text style={styles.audioLabel}>Voice Message from Caregiver</Text>
            <Button
              mode="contained"
              onPress={handlePlayAudio}
              disabled={audioPlaying}
              style={styles.playButton}
              contentStyle={styles.playButtonContent}
              icon={audioPlaying ? 'pause' : 'play'}
            >
              {audioPlaying ? 'Playing...' : 'Play Message'}
            </Button>
          </View>
        </View>
      )}

      {/* Show details only after task is started */}
      {taskStarted && (
        <>
          <View style={styles.detailsCard}>
            <Text style={styles.cardTitle}>
              {reminder.type === 'video' ? '🎥 Video Reminder' : '💊 Medication Details'}
            </Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Pill Name</Text>
              <Text style={styles.detailValue}>{medication?.name ?? reminder.title}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Dosage</Text>
              <Text style={styles.detailValue}>{medication?.dosage ?? '—'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Instructions</Text>
              <Text style={styles.detailValue}>{medication?.notes ?? '—'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Time</Text>
              <Text style={styles.detailValue}>{timeStr}</Text>
            </View>
            {reminder.taskInfo ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Caregiver's message</Text>
                <Text style={styles.detailValue}>{reminder.taskInfo}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.buttonWrap}>
            <Button
              mode="contained"
              onPress={handleDone}
              loading={loading}
              disabled={loading}
              style={styles.doneButton}
              contentStyle={styles.doneButtonContent}
            >
              Done
            </Button>
          </View>
        </>
      )}
      </ScrollView>
    </View>
  );
}

const webVideoStyle = {
  width: '100%',
  maxWidth: 480,
  maxHeight: 300,
  borderRadius: 16,
  backgroundColor: '#000',
  display: 'block',
};

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 150,
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loading: {
    fontSize: 16,
    color: '#7A9A9A',
  },
  logo: {
    width: 100,
    height: 100,
    marginTop: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1B3A6B',
    textAlign: 'center',
    marginTop: 32,
  },
  medicineImageWrap: {
    marginTop: 24,
    width: '100%',
    maxWidth: 320,
  },
  medicineImage: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    backgroundColor: '#EBF5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativeVideo: {
    width: '100%',
    height: 250,
    borderRadius: 16,
    backgroundColor: '#000',
  },
  audioPlayerWrap: {
    marginTop: 24,
    width: '100%',
    maxWidth: 320,
  },
  audioPlayer: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#1B3A6B',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  audioIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  audioLabel: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  playButton: {
    backgroundColor: '#3DBDA7',
    borderRadius: 12,
    minWidth: 180,
  },
  playButtonContent: {
    height: 56,
  },
  detailsCard: {
    marginTop: 24,
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#EBF5F5',
    borderRadius: 16,
    padding: 24,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1B3A6B',
    marginBottom: 16,
  },
  detailRow: {
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#7A9A9A',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1B3A6B',
  },
  buttonWrap: {
    marginTop: 32,
    marginBottom: 32,
  },
  doneButton: {
    width: 320,
    borderRadius: 12,
    backgroundColor: '#3DBDA7',
  },
  doneButtonContent: {
    height: 80,
  },
  priorityBadge: {
    backgroundColor: '#E53935',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 16,
  },
  priorityBadgeText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  alarmContainer: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#1B3A6B',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginTop: 32,
  },
  alarmIcon: {
    fontSize: 80,
    marginBottom: 16,
  },
  alarmText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  alarmPlayingText: {
    fontSize: 16,
    color: '#3DBDA7',
    textAlign: 'center',
    marginBottom: 16,
  },
  startTaskButton: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#3DBDA7',
  },
  startTaskContent: {
    height: 72,
  },
  startTaskLabel: {
    fontSize: 24,
    fontWeight: 'bold',
  },
});
