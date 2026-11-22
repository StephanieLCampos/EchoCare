import React, { useState } from 'react';
import { StyleSheet, ScrollView } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { AudioRecorder } from '../../components/AudioRecorder';

interface VoiceCloneScreenProps {
  onVoiceRecorded: (uri: string) => void;
}

export function VoiceCloneScreen({ onVoiceRecorded }: VoiceCloneScreenProps) {
  const [recordedUri, setRecordedUri] = useState<string | null>(null);

  const handleRecordingComplete = (_blob: Blob, uri?: string) => {
    if (uri) setRecordedUri(uri);
  };

  const handleContinue = () => {
    if (recordedUri) {
      onVoiceRecorded(recordedUri);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="titleLarge" style={styles.title}>
        Record voice sample
      </Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        Record a sample of your voice. We'll use it to create audio reminders that sound like you.
      </Text>
      <AudioRecorder onRecordingComplete={handleRecordingComplete} />
      {recordedUri && (
        <Button
          mode="contained"
          onPress={handleContinue}
          style={styles.continue}
        >
          Continue
        </Button>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
  },
  title: {
    marginBottom: 8,
  },
  subtitle: {
    marginBottom: 24,
    color: '#666',
  },
  continue: {
    marginTop: 24,
  },
});
