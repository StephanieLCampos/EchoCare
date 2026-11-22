import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../../config/firebase';
import type { Elderly } from '../../types';

interface SelectElderlyForReminderScreenProps {
  onSelect: (elderly: Elderly) => void;
  onAddElderly: () => void;
  onBack: () => void;
}

export function SelectElderlyForReminderScreen({
  onSelect,
  onAddElderly,
  onBack,
}: SelectElderlyForReminderScreenProps) {
  const [elderly, setElderly] = useState<Elderly[]>([]);

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const q = query(
      collection(db, 'elderly'),
      where('caregiverId', '==', userId),
      where('isActive', '==', true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setElderly(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Elderly)));
    });

    return () => unsubscribe();
  }, []);

  if (elderly.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Create Reminder</Text>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Add a care recipient first</Text>
          <Text style={styles.emptySubtext}>You need at least one person before creating reminders</Text>
          <Pressable style={styles.addButton} onPress={onAddElderly}>
            <Text style={styles.addButtonText}>Add Care Recipient</Text>
          </Pressable>
        </View>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Who is this reminder for?</Text>
      <FlatList
        data={elderly}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => onSelect(item)}
          >
            <Text style={styles.cardName}>{item.name}</Text>
          </Pressable>
        )}
      />
      <Pressable onPress={onBack} style={styles.backLink}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#EBF5F5',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1B3A6B',
    marginBottom: 24,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1B3A6B',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#7A9A9A',
    marginTop: 8,
    textAlign: 'center',
  },
  addButton: {
    marginTop: 24,
    paddingVertical: 16,
    paddingHorizontal: 32,
    backgroundColor: '#3DBDA7',
    borderRadius: 12,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
  },
  cardName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1B3A6B',
  },
  backLink: {
    marginTop: 24,
  },
  backText: {
    fontSize: 16,
    color: '#3DBDA7',
    fontWeight: 'bold',
  },
});
