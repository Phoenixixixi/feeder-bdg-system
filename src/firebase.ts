import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfigData from '../firebase-applet-config.json';

export interface FirebaseAppConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  firestoreDatabaseId?: string;
}

export function getActiveFirebaseConfig(): FirebaseAppConfig {
  try {
    const saved = localStorage.getItem('feeder_custom_firebase_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.projectId && parsed.apiKey) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Could not read custom firebase config from localStorage:', e);
  }

  return {
    apiKey: firebaseConfigData.apiKey,
    authDomain: firebaseConfigData.authDomain,
    projectId: firebaseConfigData.projectId,
    storageBucket: firebaseConfigData.storageBucket,
    messagingSenderId: firebaseConfigData.messagingSenderId,
    appId: firebaseConfigData.appId,
    firestoreDatabaseId: firebaseConfigData.firestoreDatabaseId,
  };
}

export function saveCustomFirebaseConfig(config: FirebaseAppConfig): void {
  localStorage.setItem('feeder_custom_firebase_config', JSON.stringify(config));
}

export function clearCustomFirebaseConfig(): void {
  localStorage.removeItem('feeder_custom_firebase_config');
}

const activeConfig = getActiveFirebaseConfig();

const firebaseConfig = {
  apiKey: activeConfig.apiKey,
  authDomain: activeConfig.authDomain,
  projectId: activeConfig.projectId,
  storageBucket: activeConfig.storageBucket,
  messagingSenderId: activeConfig.messagingSenderId,
  appId: activeConfig.appId,
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Use the specific firestoreDatabaseId if provided, otherwise default
const targetDbId = activeConfig.firestoreDatabaseId || firebaseConfigData.firestoreDatabaseId;
export const db = targetDbId && targetDbId !== '(default)'
  ? getFirestore(app, targetDbId)
  : getFirestore(app);

export default app;

