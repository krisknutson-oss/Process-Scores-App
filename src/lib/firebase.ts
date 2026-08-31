import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  getDocs, 
  query, 
  where,
  Firestore 
} from 'firebase/firestore';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User,
  Auth
} from 'firebase/auth';
import type { 
  RosterDoc, 
  DailyLogDoc, 
  AppConfigDoc, 
  ScoresState, 
  GradeHistoryState,
  CategoryKey,
  TeacherProfile
} from '../types';

import firebaseConfigData from '../../firebase-applet-config.json';

const defaultFirebaseConfig = {
  projectId: "gen-lang-client-0426297362",
  appId: "1:727251518687:web:12d26294db95479c4dd56a",
  apiKey: "AIzaSyBU4nX6mt-rWedXOlnWDoPfMqNXtZmPQjQ",
  authDomain: "gen-lang-client-0426297362.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-processscoredail-09806b9d-0bc6-4228-8be8-d9bbc32df920",
  storageBucket: "gen-lang-client-0426297362.firebasestorage.app",
  messagingSenderId: "727251518687",
};

const resolvedConfig = firebaseConfigData || defaultFirebaseConfig;

const firebaseConfig = {
  apiKey: resolvedConfig.apiKey || defaultFirebaseConfig.apiKey,
  authDomain: resolvedConfig.authDomain || defaultFirebaseConfig.authDomain,
  projectId: resolvedConfig.projectId || defaultFirebaseConfig.projectId,
  storageBucket: resolvedConfig.storageBucket || defaultFirebaseConfig.storageBucket,
  messagingSenderId: resolvedConfig.messagingSenderId || defaultFirebaseConfig.messagingSenderId,
  appId: resolvedConfig.appId || defaultFirebaseConfig.appId,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Use custom firestore database ID if specified, or default
const customDbId = (resolvedConfig.firestoreDatabaseId && resolvedConfig.firestoreDatabaseId.trim() !== '')
  ? resolvedConfig.firestoreDatabaseId
  : defaultFirebaseConfig.firestoreDatabaseId;

export const db: Firestore = customDbId
  ? getFirestore(app, customDbId)
  : getFirestore(app);

export const auth: Auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Sign in with Google Popup
 */
export async function signInWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    if (result.user) {
      await syncTeacherProfile(result.user);
    }
    return result.user;
  } catch (error: any) {
    // Suppress popup cancellation or blocked popup warnings gracefully
    if (error?.code !== 'auth/popup-closed-by-user' && error?.code !== 'auth/cancelled-popup-request') {
      console.error('Sign-in error:', error);
    }
    throw error;
  }
}

/**
 * Sign out current teacher
 */
export async function logOut(): Promise<void> {
  await signOut(auth);
}

/**
 * Subscribe to Auth State Changes
 */
export function onTeacherAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        await syncTeacherProfile(user);
      } catch (err) {
        console.warn('Profile sync notice:', err);
      }
    }
    callback(user);
  });
}

/**
 * Sync teacher profile to their private user document
 */
export async function syncTeacherProfile(user: User): Promise<void> {
  if (!user || !user.uid) return;
  try {
    const userDocRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userDocRef);
    const now = Date.now();

    const profileData: TeacherProfile = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'Teacher'),
      photoURL: user.photoURL,
      updatedAt: now
    };

    if (!snap.exists()) {
      profileData.createdAt = now;
      await setDoc(userDocRef, profileData);
    } else {
      await setDoc(userDocRef, profileData, { merge: true });
    }
  } catch (err) {
    console.warn('Error saving teacher profile:', err);
  }
}

// Sub-collections under `/users/{userId}/...`
const ROSTERS_COL = 'rosters';
const DAILY_LOGS_COL = 'dailyScores';
const APP_CONFIG_COL = 'appConfig';

/**
 * Fetch roster for a specific grade for an authenticated teacher
 */
export async function getRosterFromFirestore(userId: string, grade: number): Promise<string[] | null> {
  if (!userId) return null;
  try {
    const docRef = doc(db, 'users', userId, ROSTERS_COL, `grade_${grade}`);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as RosterDoc;
      return data.students || [];
    }
    return null;
  } catch (error) {
    console.warn(`Firestore getRoster error for grade ${grade}:`, error);
    return null;
  }
}

/**
 * Save roster for a specific grade for an authenticated teacher
 */
export async function saveRosterToFirestore(userId: string, grade: number, students: string[]): Promise<boolean> {
  if (!userId) return false;
  try {
    const docRef = doc(db, 'users', userId, ROSTERS_COL, `grade_${grade}`);
    await setDoc(docRef, {
      grade,
      students,
      updatedAt: Date.now()
    }, { merge: true });
    return true;
  } catch (error) {
    console.error(`Firestore saveRoster error for grade ${grade}:`, error);
    return false;
  }
}

/**
 * Fetch daily scores for a specific grade and date for an authenticated teacher
 */
export async function getDailyScoresFromFirestore(userId: string, grade: number, dateISO: string): Promise<ScoresState | null> {
  if (!userId) return null;
  try {
    const docId = `grade_${grade}_date_${dateISO}`;
    const docRef = doc(db, 'users', userId, DAILY_LOGS_COL, docId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as DailyLogDoc;
      return data.scores || null;
    }
    return null;
  } catch (error) {
    console.warn(`Firestore getDailyScores error for grade ${grade} on ${dateISO}:`, error);
    return null;
  }
}

/**
 * Save daily scores to Firestore for an authenticated teacher
 */
export async function saveDailyScoresToFirestore(
  userId: string,
  grade: number,
  dateISO: string,
  dateDisplay: string,
  teacher: string,
  scores: ScoresState
): Promise<boolean> {
  if (!userId) return false;
  try {
    const docId = `grade_${grade}_date_${dateISO}`;
    const docRef = doc(db, 'users', userId, DAILY_LOGS_COL, docId);
    await setDoc(docRef, {
      grade,
      date: dateISO,
      dateDisplay,
      teacher,
      scores,
      updatedAt: Date.now()
    }, { merge: true });
    return true;
  } catch (error) {
    console.error(`Firestore saveDailyScores error for grade ${grade}:`, error);
    return false;
  }
}

/**
 * Compute student averages across all saved daily scores in Firestore for a given grade
 */
export async function getGradeHistoryFromFirestore(userId: string, grade: number): Promise<GradeHistoryState> {
  const history: GradeHistoryState = {};
  if (!userId) return history;
  const categories: CategoryKey[] = ['engagement', 'responsibility', 'respect'];

  try {
    const q = query(
      collection(db, 'users', userId, DAILY_LOGS_COL), 
      where('grade', '==', grade)
    );
    const querySnapshot = await getDocs(q);

    querySnapshot.forEach((docSnap) => {
      const log = docSnap.data() as DailyLogDoc;
      if (!log.scores) return;

      Object.entries(log.scores).forEach(([studentName, stuScores]) => {
        if (!history[studentName]) {
          history[studentName] = {
            engagement: { sum: 0, count: 0 },
            responsibility: { sum: 0, count: 0 },
            respect: { sum: 0, count: 0 }
          };
        }

        categories.forEach((cat) => {
          const val = stuScores[cat];
          if (val && val !== '' && !isNaN(Number(val))) {
            const num = Number(val);
            if (!history[studentName][cat]) {
              history[studentName][cat] = { sum: 0, count: 0 };
            }
            history[studentName][cat]!.sum += num;
            history[studentName][cat]!.count += 1;
          }
        });
      });
    });

    return history;
  } catch (error) {
    console.warn(`Firestore getGradeHistory error for grade ${grade}:`, error);
    return history;
  }
}

/**
 * Get all available logged dates for a grade
 */
export async function getLoggedDatesForGrade(userId: string, grade: number): Promise<{ date: string; dateDisplay: string; updatedAt: number }[]> {
  if (!userId) return [];
  try {
    const q = query(
      collection(db, 'users', userId, DAILY_LOGS_COL), 
      where('grade', '==', grade)
    );
    const querySnapshot = await getDocs(q);
    const dates: { date: string; dateDisplay: string; updatedAt: number }[] = [];
    
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data() as DailyLogDoc;
      if (data.date) {
        dates.push({
          date: data.date,
          dateDisplay: data.dateDisplay || data.date,
          updatedAt: data.updatedAt || 0
        });
      }
    });

    return dates.sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.warn(`Error fetching logged dates for grade ${grade}:`, error);
    return [];
  }
}

/**
 * Save / Load app configuration (teacher name, WebApp URL)
 */
export async function getAppConfigFromFirestore(userId: string): Promise<AppConfigDoc | null> {
  if (!userId) return null;
  try {
    const docRef = doc(db, 'users', userId, APP_CONFIG_COL, 'settings');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as AppConfigDoc;
    }
    return null;
  } catch (error) {
    console.warn('Firestore getAppConfig error:', error);
    return null;
  }
}

export async function saveAppConfigToFirestore(userId: string, config: Partial<AppConfigDoc>): Promise<boolean> {
  if (!userId) return false;
  try {
    const docRef = doc(db, 'users', userId, APP_CONFIG_COL, 'settings');
    await setDoc(docRef, {
      ...config,
      updatedAt: Date.now()
    }, { merge: true });
    return true;
  } catch (error) {
    console.error('Firestore saveAppConfig error:', error);
    return false;
  }
}
