import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { Text, List, Button, Divider, HelperText } from 'react-native-paper';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import * as DocumentPicker from 'expo-document-picker';
import { db, auth } from '../../config/firebase';
import { createVoiceClone } from '../../services/voiceApiService';
import { AudioRecorder } from '../../components/AudioRecorder';
import { SoundPickerScreen } from './SoundPickerScreen';
import { getSoundLabel } from '../../constants/sounds';
import type { EmergencyContact } from '../../services/authService';

interface SettingsScreenProps {
  onNavigateToContacts?: () => void;
}

export function SettingsScreen({ onNavigateToContacts }: SettingsScreenProps) {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [sounds, setSounds] = useState<{ regular: string; emergency: string }>({
    regular: 'default',
    emergency: 'urgent',
  });
  const [processingVoice, setProcessingVoice] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [voiceMessage, setVoiceMessage] = useState('');
  const [showRecorder, setShowRecorder] = useState(false);
  const [hasVoiceClone, setHasVoiceClone] = useState(false);
  const [showSoundPicker, setShowSoundPicker] = useState(false);
  const [savingSounds, setSavingSounds] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const userId = auth.currentUser?.uid;
      if (!userId) return;
      const userDoc = await getDoc(doc(db, 'users', userId));
      const data = userDoc.data();
      if (data?.emergencyContacts) {
        setContacts(data.emergencyContacts);
      }
      if (data?.notificationSounds) {
        setSounds(data.notificationSounds);
      }
      if (data?.elevenLabsVoiceId) {
        setHasVoiceClone(true);
      }
    };
    loadSettings();
  }, []);

  const handleVoiceCloneUpload = useCallback(async (blob: Blob) => {
    setProcessingVoice(true);
    setVoiceStatus('idle');
    setVoiceMessage('');
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('Not authenticated');

      const result = await createVoiceClone(blob, `caregiver-${userId}`);

      if (result.success && result.voiceId) {
        await updateDoc(doc(db, 'users', userId), {
          elevenLabsVoiceId: result.voiceId,
          voiceUpdatedAt: new Date().toISOString(),
        });
        setHasVoiceClone(true);
        setVoiceStatus('success');
        setVoiceMessage('Voice clone created successfully!');
        setShowRecorder(false);
      }
    } catch (err) {
      console.error('Voice cloning failed:', err);
      setVoiceStatus('error');
      setVoiceMessage(err instanceof Error ? err.message : 'Voice cloning failed');
    } finally {
      setProcessingVoice(false);
    }
  }, []);

  const handleRecordingComplete = useCallback((blob: Blob) => {
    handleVoiceCloneUpload(blob);
  }, [handleVoiceCloneUpload]);

  const handleSoundSelect = useCallback(async (regular: string, emergency: string) => {
    setSounds({ regular, emergency });
    setSavingSounds(true);
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) return;
      await updateDoc(doc(db, 'users', userId), {
        notificationSounds: { regular, emergency },
      });
    } catch (err) {
      console.error('Failed to save sounds:', err);
    } finally {
      setSavingSounds(false);
    }
  }, []);

  const handleFileUpload = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/webm'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const file = result.assets[0];

      // Fetch the file and convert to blob
      const response = await fetch(file.uri);
      const blob = await response.blob();

      await handleVoiceCloneUpload(blob);
    } catch (err) {
      console.error('File upload failed:', err);
      setVoiceStatus('error');
      setVoiceMessage(err instanceof Error ? err.message : 'File upload failed');
    }
  }, [handleVoiceCloneUpload]);

  return (
    <ScrollView style={styles.container}>
      <List.Section>
        <List.Subheader>Notification Sounds</List.Subheader>
        <List.Item
          title="Regular reminders"
          description={getSoundLabel(sounds.regular, 'regular')}
          left={(props) => <List.Icon {...props} icon="bell" />}
          onPress={() => setShowSoundPicker(!showSoundPicker)}
          right={() => (
            <Button
              mode="outlined"
              onPress={() => setShowSoundPicker(!showSoundPicker)}
              loading={savingSounds}
            >
              {showSoundPicker ? 'Hide' : 'Change'}
            </Button>
          )}
        />
        <List.Item
          title="Emergency alerts"
          description={getSoundLabel(sounds.emergency, 'emergency')}
          left={(props) => <List.Icon {...props} icon="alert" />}
          onPress={() => setShowSoundPicker(!showSoundPicker)}
        />
        {showSoundPicker && (
          <View style={styles.soundPickerContainer}>
            <SoundPickerScreen
              selectedRegular={sounds.regular}
              selectedEmergency={sounds.emergency}
              onSelect={handleSoundSelect}
            />
          </View>
        )}
      </List.Section>
      <Divider />
      <List.Section>
        <List.Subheader>Emergency Contacts</List.Subheader>
        {contacts.map((c, i) => (
          <List.Item
            key={i}
            title={c.name}
            description={`${c.phone}${c.relationship ? ` • ${c.relationship}` : ''}`}
            left={(props) => <List.Icon {...props} icon="account" />}
          />
        ))}
        {contacts.length === 0 && (
          <List.Item
            title="No emergency contacts"
            description="Add during registration"
            left={(props) => <List.Icon {...props} icon="account-off" />}
          />
        )}
      </List.Section>
      <Divider />
      <List.Section>
        <List.Subheader>Voice Clone</List.Subheader>
        <List.Item
          title="Current status"
          description={hasVoiceClone ? 'Voice clone configured' : 'No voice clone set up'}
          left={(props) => <List.Icon {...props} icon={hasVoiceClone ? 'check-circle' : 'alert-circle-outline'} />}
        />
        <List.Item
          title="Record new voice sample"
          description="Record 10-30 seconds of your voice"
          left={(props) => <List.Icon {...props} icon="microphone" />}
          right={() => (
            <Button
              mode="outlined"
              onPress={() => setShowRecorder(!showRecorder)}
              disabled={processingVoice}
            >
              {showRecorder ? 'Hide' : 'Record'}
            </Button>
          )}
        />
        {showRecorder && (
          <View style={styles.recorderContainer}>
            <Text variant="bodySmall" style={styles.recorderHint}>
              Speak clearly for 10-30 seconds. Read any text or describe your day.
            </Text>
            <AudioRecorder onRecordingComplete={handleRecordingComplete} />
            {processingVoice && (
              <Text variant="bodySmall" style={styles.processingText}>
                Processing voice clone... This may take a minute.
              </Text>
            )}
          </View>
        )}
        <List.Item
          title="Upload audio file"
          description="Upload a .wav or .mp3 file (10-30 seconds)"
          left={(props) => <List.Icon {...props} icon="upload" />}
          right={() => (
            <Button
              mode="outlined"
              onPress={handleFileUpload}
              loading={processingVoice}
              disabled={processingVoice}
            >
              Upload
            </Button>
          )}
        />
        {voiceStatus !== 'idle' && (
          <HelperText type={voiceStatus === 'success' ? 'info' : 'error'} style={styles.voiceHelper}>
            {voiceMessage}
          </HelperText>
        )}
      </List.Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  recorderContainer: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  recorderHint: {
    marginBottom: 12,
    color: '#666',
    textAlign: 'center',
  },
  processingText: {
    marginTop: 12,
    color: '#1B3A6B',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  voiceHelper: {
    marginHorizontal: 16,
  },
  soundPickerContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D0E8E8',
  },
});
