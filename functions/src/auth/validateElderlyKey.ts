import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Validate an elderly access key and return elderly info
 * Used for elderly login flow
 */
export const validateElderlyKey = onCall({ cors: true }, async (request) => {
  const { accessKey } = request.data;

  if (!accessKey || typeof accessKey !== 'string') {
    throw new HttpsError('invalid-argument', 'Access key is required');
  }

  const normalizedKey = accessKey.trim().toUpperCase();

  try {
    const db = admin.firestore();

    // Find elderly with this access key
    const elderlySnapshot = await db
      .collection('elderly')
      .where('accessKey', '==', normalizedKey)
      .limit(1)
      .get();

    if (elderlySnapshot.empty) {
      throw new HttpsError('not-found', 'Invalid access key');
    }

    const elderlyDoc = elderlySnapshot.docs[0];
    const elderlyData = elderlyDoc.data();

    // Create a custom token for the elderly user
    const elderlyUid = `elderly_${elderlyDoc.id}`;
    const customToken = await admin.auth().createCustomToken(elderlyUid, {
      elderlyId: elderlyDoc.id,
      caregiverId: elderlyData.caregiverId,
      role: 'elderly',
    });

    logger.info('Elderly login successful', {
      elderlyId: elderlyDoc.id,
      accessKey: normalizedKey
    });

    return {
      success: true,
      elderlyId: elderlyDoc.id,
      elderlyName: elderlyData.name,
      caregiverId: elderlyData.caregiverId,
      customToken,
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    logger.error('Elderly key validation failed', error);
    throw new HttpsError('internal', 'Failed to validate access key');
  }
});
