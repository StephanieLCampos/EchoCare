import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import type { Reminder } from '../types';

const REMINDERS_COLLECTION = 'reminders';

export interface CreateReminderDetails {
  title: string;
  taskInfo?: string;
  priority: string;
  category: string;
  medicationId?: string;
  schedule: Record<string, unknown>;
  responseTimeLimit: number;
}

export const createReminder = async (
  caregiverId: string,
  elderlyId: string,
  type: 'video' | 'audio',
  mediaFile: Blob,
  details: CreateReminderDetails & { initialStatus?: 'scheduled' | 'sent' }
) => {
  const folder = type === 'video' ? 'videos' : 'audio';
  const ext = type === 'video' ? 'webm' : 'mp3';
  const mediaRef = ref(storage, `${folder}/${Date.now()}.${ext}`);
  await uploadBytes(mediaRef, mediaFile);
  const mediaUrl = await getDownloadURL(mediaRef);

  const status = details.initialStatus ?? 'scheduled';
  const reminderRef = await addDoc(collection(db, REMINDERS_COLLECTION), {
    caregiverId,
    elderlyId,
    type,
    mediaUrl,
    title: details.title,
    taskInfo: details.taskInfo ?? null,
    priority: details.priority,
    category: details.category,
    medicationId: details.medicationId ?? null,
    schedule: details.schedule,
    responseTimeLimit: details.responseTimeLimit,
    status,
    sentAt: status === 'sent' ? new Date() : null,
    acknowledgedAt: null,
    escalatedAt: null,
    createdAt: new Date(),
  });

  return reminderRef.id;
};

/**
 * Create a reminder with a pre-existing media URL (from Cloud Functions TTS)
 * Avoids re-uploading audio that's already in Firebase Storage
 */
export const createReminderWithUrl = async (
  caregiverId: string,
  elderlyId: string,
  type: 'video' | 'audio',
  mediaUrl: string,
  details: CreateReminderDetails & { initialStatus?: 'scheduled' | 'sent' }
) => {
  const status = details.initialStatus ?? 'scheduled';
  const reminderRef = await addDoc(collection(db, REMINDERS_COLLECTION), {
    caregiverId,
    elderlyId,
    type,
    mediaUrl,
    title: details.title,
    taskInfo: details.taskInfo ?? null,
    priority: details.priority,
    category: details.category,
    medicationId: details.medicationId ?? null,
    schedule: details.schedule,
    responseTimeLimit: details.responseTimeLimit,
    status,
    sentAt: status === 'sent' ? new Date() : null,
    acknowledgedAt: null,
    escalatedAt: null,
    createdAt: new Date(),
  });

  return reminderRef.id;
};

export const getRemindersByUser = async (caregiverId: string): Promise<Reminder[]> => {
  const q = query(
    collection(db, REMINDERS_COLLECTION),
    where('caregiverId', '==', caregiverId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Reminder));
};

export const getReminderById = async (id: string): Promise<Reminder | null> => {
  const docSnap = await getDoc(doc(db, REMINDERS_COLLECTION, id));
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as Reminder;
};

export const updateReminder = async (
  id: string,
  data: Partial<Reminder>
): Promise<void> => {
  await updateDoc(doc(db, REMINDERS_COLLECTION, id), data);
};

export const deleteReminder = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, REMINDERS_COLLECTION, id));
};
