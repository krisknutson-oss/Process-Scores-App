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
  onSnapshot,
  Firestore
} from 'firebase/firestore';
import type { 
  RosterDoc, 
  DailyLogDoc, 
  AppConfigDoc, 
  ScoresState, 
  GradeHistoryState,
  CategoryKey
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

// Firestore Collections & Document Helpers
const ROSTERS_COL = 'rosters';
const DAILY_LOGS_COL = 'dailyScores';
const APP_CONFIG_COL = 'appConfig';

/**
 * Fetch roster for a specific grade
 */
export async function getRosterFromFirestore(grade: number): Promise<string[] | null> {
  try {
    const docRef = doc(db, ROSTERS_COL, `grade_${grade}`);
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
 * Save roster for a specific grade
 */
export async function saveRosterToFirestore(grade: number, students: string[]): Promise<boolean> {
  try {
    const docRef = doc(db, ROSTERS_COL, `grade_${grade}`);
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
 * Fetch daily scores for a specific grade and date
 */
export async function getDailyScoresFromFirestore(grade: number, dateISO: string): Promise<ScoresState | null> {
  try {
    const docId = `grade_${grade}_date_${dateISO}`;
    const docRef = doc(db, DAILY_LOGS_COL, docId);
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
 * Save daily scores to Firestore
 */
export async function saveDailyScoresToFirestore(
  grade: number,
  dateISO: string,
  dateDisplay: string,
  teacher: string,
  scores: ScoresState
): Promise<boolean> {
  try {
    const docId = `grade_${grade}_date_${dateISO}`;
    const docRef = doc(db, DAILY_LOGS_COL, docId);
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
export async function getGradeHistoryFromFirestore(grade: number): Promise<GradeHistoryState> {
  const history: GradeHistoryState = {};
  const categories: CategoryKey[] = ['engagement', 'responsibility', 'respect'];

  try {
    const q = query(collection(db, DAILY_LOGS_COL), where('grade', '==', grade));
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
export async function getLoggedDatesForGrade(grade: number): Promise<{ date: string; dateDisplay: string; updatedAt: number }[]> {
  try {
    const q = query(collection(db, DAILY_LOGS_COL), where('grade', '==', grade));
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
export async function getAppConfigFromFirestore(): Promise<AppConfigDoc | null> {
  try {
    const docRef = doc(db, APP_CONFIG_COL, 'settings');
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

export async function saveAppConfigToFirestore(config: Partial<AppConfigDoc>): Promise<boolean> {
  try {
    const docRef = doc(db, APP_CONFIG_COL, 'settings');
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
