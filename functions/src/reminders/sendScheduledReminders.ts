import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Scheduled function that runs every minute to check for reminders that need to be sent.
 * Uses PST (America/Los_Angeles) timezone.
 */
export const sendScheduledReminders = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'America/Los_Angeles',
  },
  async () => {
    const db = admin.firestore();
    const now = new Date();

    // Get current time in PST
    const pstTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);

    logger.info('Checking for scheduled reminders', { currentTimePST: pstTime });

    try {
      // Find all reminders that are scheduled and due
      const remindersSnapshot = await db
        .collection('reminders')
        .where('status', '==', 'scheduled')
        .get();

      if (remindersSnapshot.empty) {
        logger.info('No scheduled reminders found');
        return;
      }

      const batch = db.batch();
      let updatedCount = 0;

      for (const doc of remindersSnapshot.docs) {
        const reminder = doc.data();
        const schedule = reminder.schedule;

        if (!schedule || !schedule.time) continue;

        // Check if it's time to send this reminder
        const scheduledTime = schedule.time; // Format: "HH:MM"

        // For immediate check, compare current time with scheduled time
        if (isTimeToSend(scheduledTime, pstTime, schedule.frequency, schedule.days)) {
          logger.info('Sending reminder', {
            reminderId: doc.id,
            scheduledTime,
            currentTime: pstTime
          });

          batch.update(doc.ref, {
            status: 'sent',
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          updatedCount++;

          // TODO: Send FCM notification to elderly device
          // This would require the elderly's FCM token stored in their document
          if (reminder.elderlyId) {
            await sendPushNotification(db, reminder, doc.id);
          }
        }
      }

      if (updatedCount > 0) {
        await batch.commit();
        logger.info(`Sent ${updatedCount} reminders`);
      }
    } catch (error) {
      logger.error('Error processing scheduled reminders', error);
    }
  }
);

/**
 * Check if the current time matches the scheduled time
 */
function isTimeToSend(
  scheduledTime: string,
  currentTime: string,
  frequency?: string,
  days?: number[]
): boolean {
  // Compare HH:MM
  const [schedHour, schedMin] = scheduledTime.split(':').map(Number);
  const [currHour, currMin] = currentTime.split(':').map(Number);

  if (schedHour !== currHour || schedMin !== currMin) {
    return false;
  }

  // Check day of week for weekly reminders
  if (frequency === 'weekly' && days && days.length > 0) {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
    if (!days.includes(dayOfWeek)) {
      return false;
    }
  }

  return true;
}

/**
 * Send FCM push notification to elderly device
 */
async function sendPushNotification(
  db: admin.firestore.Firestore,
  reminder: admin.firestore.DocumentData,
  reminderId: string
): Promise<void> {
  try {
    // Get elderly's FCM token
    const elderlyDoc = await db.collection('elderly').doc(reminder.elderlyId).get();

    if (!elderlyDoc.exists) {
      logger.warn('Elderly document not found', { elderlyId: reminder.elderlyId });
      return;
    }

    const elderlyData = elderlyDoc.data();
    const fcmToken = elderlyData?.fcmToken;

    if (!fcmToken) {
      logger.warn('No FCM token for elderly', { elderlyId: reminder.elderlyId });
      return;
    }

    // Get caregiver info for the notification
    const caregiverDoc = await db.collection('users').doc(reminder.caregiverId).get();
    const caregiverName = caregiverDoc.data()?.name || 'Your caregiver';

    // Send FCM notification
    const message: admin.messaging.Message = {
      token: fcmToken,
      notification: {
        title: reminder.priority === 'important' ? '🚨 Important Reminder!' : '💊 Reminder',
        body: reminder.title,
      },
      data: {
        reminderId,
        type: reminder.type,
        priority: reminder.priority || 'normal',
        caregiverName,
        click_action: 'OPEN_REMINDER',
      },
      android: {
        priority: reminder.priority === 'important' ? 'high' : 'normal',
        notification: {
          channelId: reminder.priority === 'important' ? 'emergency_channel' : 'reminder_channel',
          sound: reminder.priority === 'important' ? 'emergency_sound' : 'reminder_sound',
        },
      },
    };

    await admin.messaging().send(message);
    logger.info('FCM notification sent', { reminderId, elderlyId: reminder.elderlyId });
  } catch (error) {
    logger.error('Failed to send FCM notification', { error, reminderId });
  }
}
