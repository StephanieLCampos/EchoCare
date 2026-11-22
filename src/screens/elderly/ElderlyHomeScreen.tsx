import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Image, Pressable, ScrollView } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ReminderItem {
  id: string;
  title: string;
  type: string;
  status: string;
  sentAt?: unknown;
  mediaUrl?: string;
}

interface ElderlyHomeScreenProps {
  elderlyId: string;
  elderlyName: string;
  onReminderPress: (reminderId: string) => void;
  onSignOut: () => void;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export function ElderlyHomeScreen({
  elderlyId,
  elderlyName,
  onReminderPress,
  onSignOut,
}: ElderlyHomeScreenProps) {
  const [reminders, setReminders] = useState<ReminderItem[]>([]);

  useEffect(() => {
    AsyncStorage.setItem('elderlyId', elderlyId);
  }, [elderlyId]);

  useEffect(() => {
    const q = query(
      collection(db, 'reminders'),
      where('elderlyId', '==', elderlyId),
      where('status', '==', 'sent')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ReminderItem[];
      setReminders(list);
    });

    return () => unsubscribe();
  }, [elderlyId]);

  const currentReminder = reminders[0];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Greeting - 36px bold #1B3A6B */}
      <Text style={styles.greeting}>
        {getGreeting()}, {elderlyName}
      </Text>

      {/* Logo - 120x120 */}
      <Image
        source={require('../../../assets/logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      {currentReminder ? (
        <>
          {/* Reminder card - 320x180 navy */}
          <View style={styles.reminderCard}>
            <Text style={styles.reminderTitle}>{currentReminder.title}</Text>
          </View>

          {/* Start Task button - 320x80 teal */}
          <Pressable
            style={styles.startButton}
            onPress={() => onReminderPress(currentReminder.id)}
          >
            <Text style={styles.startButtonText}>Start Task</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>All done for now!</Text>
        </View>
      )}

      <Button mode="text" onPress={onSignOut} style={styles.signOut}>
        Sign Out
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  greeting: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1B3A6B',
    textAlign: 'center',
    marginTop: 16,
  },
  logo: {
    width: 120,
    height: 120,
    marginTop: 32,
  },
  reminderCard: {
    width: 320,
    height: 180,
    backgroundColor: '#1B3A6B',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 48,
  },
  reminderTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  startButton: {
    width: 320,
    height: 80,
    backgroundColor: '#3DBDA7',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
  },
  startButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  empty: {
    marginTop: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: '#7A9A9A',
  },
  signOut: {
    marginTop: 48,
  },
});
