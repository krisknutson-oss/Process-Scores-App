import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Settings,
  UserPlus,
  RotateCcw,
  Cloud,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Database,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertCircle,
  Users,
  Award,
  BookOpen,
  LogOut,
  LogIn,
  ShieldCheck,
  Lock,
  Sparkles,
  Trash2,
  UserX,
  Clock
} from 'lucide-react';
import type { User } from 'firebase/auth';

import type { CategoryKey, ScoreValue, ScoresState, GradeHistoryState } from './types';
import {
  signInWithGoogle,
  logOut,
  onTeacherAuthChange,
  getRosterFromFirestore,
  saveRosterToFirestore,
  getDailyScoresFromFirestore,
  saveDailyScoresToFirestore,
  getGradeHistoryFromFirestore,
  getAppConfigFromFirestore,
  saveAppConfigToFirestore,
  getLoggedDatesForGrade
} from './lib/firebase';

const GRADES = [6, 7, 8, 9, 10, 11, 12];
const CATEGORIES: CategoryKey[] = ['engagement', 'responsibility', 'respect'];
const CATEGORY_LABELS: Record<CategoryKey, string> = {
  engagement: 'Engagement',
  responsibility: 'Responsibility',
  respect: 'Respect'
};
const CODES: ScoreValue[] = ['4', '3', '2', '1'];

// Default starter roster per grade for new teacher accounts
const DEFAULT_INITIAL_ROSTERS: Record<number, string[]> = {
  6: ['Adams, Lucas', 'Baker, Chloe', 'Chen, Ethan', 'Davis, Maya', 'Evans, Noah'],
  7: ['Garcia, Sofia', 'Hall, Oliver', 'Ito, Ren', 'Johnson, Liam', 'Kim, Min-seo'],
  8: ['Lee, Marcus', 'Miller, Ava', 'Nguyen, Khoi', 'Patel, Aarav', 'Rivera, Elena'],
  9: ['Smith, Jackson', 'Taylor, Emma', 'Uchida, Kenji', 'Vance, Zoe', 'Wang, Leo'],
  10: ['White, Isabella', 'Xu, Bowen', 'Young, Mason', 'Zhang, Lily'],
  11: ['Anderson, Lucas', 'Brown, Harper', 'Clark, Benjamin'],
  12: ['Davies, Charlotte', 'Foster, Alexander', 'Gomez, Mateo']
};

export default function App() {
  // Teacher Authentication state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // App & Grading State
  const [currentGrade, setCurrentGrade] = useState<number>(8);
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [teacherName, setTeacherName] = useState<string>('');
  const [webAppUrl, setWebAppUrl] = useState<string>('');
  
  const [roster, setRoster] = useState<string[]>([]);
  const [scores, setScores] = useState<ScoresState>({});
  const [history, setHistory] = useState<GradeHistoryState>({});
  
  const [newStudentName, setNewStudentName] = useState<string>('');
  const [bulkInput, setBulkInput] = useState<string>('');
  const [showBulkAdd, setShowBulkAdd] = useState<boolean>(false);
  
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [loggedDates, setLoggedDates] = useState<{ date: string; dateDisplay: string; updatedAt: number }[]>([]);
  
  // Custom confirmation modals (avoids iframe window.confirm blocking)
  const [studentToDelete, setStudentToDelete] = useState<string | null>(null);
  const [showResetAllModal, setShowResetAllModal] = useState<boolean>(false);

  const [saveStatus, setSaveStatus] = useState<string>('Scores sync to Firestore as you grade.');
  const [statusType, setStatusType] = useState<'info' | 'ok' | 'err'>('info');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastAutoSaveTimestamp, setLastAutoSaveTimestamp] = useState<string | null>(() => {
    return localStorage.getItem('last_post_330_autosave') || null;
  });

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to Firebase Google Auth state
  useEffect(() => {
    // Failsafe timeout: ensure we never hang on blank/loading screen if auth response is delayed
    const timeoutTimer = setTimeout(() => {
      setIsAuthLoading(false);
    }, 1500);

    const unsubscribe = onTeacherAuthChange((user) => {
      clearTimeout(timeoutTimer);
      setCurrentUser(user);
      setIsAuthLoading(false);
      if (user) {
        setAuthError(null);
        // Default display name if none set
        const defaultName = user.displayName || (user.email ? user.email.split('@')[0] : 'Teacher');
        const localTeacher = localStorage.getItem(`config:${user.uid}:teacherName`);
        setTeacherName(localTeacher || defaultName);
      }
    });

    return () => {
      clearTimeout(timeoutTimer);
      unsubscribe();
    };
  }, []);

  // Formatted date display
  const dateDisplay = useMemo(() => {
    try {
      const [y, m, d] = selectedDate.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      return dateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // Load teacher config from Firestore when authenticated
  useEffect(() => {
    async function initTeacherSettings() {
      if (!currentUser) return;
      const uid = currentUser.uid;

      // 1. Check local storage
      const localTeacher = localStorage.getItem(`config:${uid}:teacherName`);
      const localUrl = localStorage.getItem(`config:${uid}:webAppUrl`);
      if (localTeacher) setTeacherName(localTeacher);
      if (localUrl) setWebAppUrl(localUrl);

      // 2. Fetch remote teacher config
      const remoteConfig = await getAppConfigFromFirestore(uid);
      if (remoteConfig) {
        if (remoteConfig.teacherName) {
          setTeacherName(remoteConfig.teacherName);
          localStorage.setItem(`config:${uid}:teacherName`, remoteConfig.teacherName);
        }
        if (remoteConfig.webAppUrl) {
          setWebAppUrl(remoteConfig.webAppUrl);
          localStorage.setItem(`config:${uid}:webAppUrl`, remoteConfig.webAppUrl);
        }
      }
    }

    if (currentUser) {
      initTeacherSettings();
    }
  }, [currentUser]);

  // Load grade data when grade, date, or teacher changes
  const loadGradeData = useCallback(async (grade: number, dateISO: string, uid: string) => {
    if (!uid) return;
    setIsSaving(true);

    // 1. Load Roster: Try Firestore -> then LocalStorage -> then Defaults
    let currentRoster: string[] = [];
    const remoteRoster = await getRosterFromFirestore(uid, grade);
    if (remoteRoster && remoteRoster.length > 0) {
      currentRoster = remoteRoster;
      localStorage.setItem(`roster:${uid}:${grade}`, JSON.stringify(currentRoster));
    } else {
      const localRoster = localStorage.getItem(`roster:${uid}:${grade}`);
      if (localRoster) {
        try {
          currentRoster = JSON.parse(localRoster);
        } catch {
          currentRoster = DEFAULT_INITIAL_ROSTERS[grade] || [];
        }
      } else {
        currentRoster = DEFAULT_INITIAL_ROSTERS[grade] || [];
        if (currentRoster.length > 0) {
          saveRosterToFirestore(uid, grade, currentRoster);
          localStorage.setItem(`roster:${uid}:${grade}`, JSON.stringify(currentRoster));
        }
      }
    }
    setRoster(currentRoster);

    // 2. Load Scores: Try Firestore -> then LocalStorage -> then Defaults
    let currentScores: ScoresState = {};
    const remoteScores = await getDailyScoresFromFirestore(uid, grade, dateISO);
    if (remoteScores && Object.keys(remoteScores).length > 0) {
      currentScores = remoteScores;
    } else {
      const localScores = localStorage.getItem(`scores:${uid}:${grade}:${dateISO}`);
      if (localScores) {
        try {
          currentScores = JSON.parse(localScores);
        } catch {
          currentScores = {};
        }
      }
    }

    // Ensure all roster members have default score 3 if unassigned
    currentRoster.forEach((name) => {
      if (!currentScores[name]) {
        currentScores[name] = { engagement: '3', responsibility: '3', respect: '3' };
      }
    });
    setScores(currentScores);

    // 3. Load Student History / Averages for this teacher
    const gradeHistory = await getGradeHistoryFromFirestore(uid, grade);
    setHistory(gradeHistory);

    // 4. Fetch available logged dates
    const dates = await getLoggedDatesForGrade(uid, grade);
    setLoggedDates(dates);

    setIsSaving(false);
  }, []);

  useEffect(() => {
    if (currentUser?.uid) {
      loadGradeData(currentGrade, selectedDate, currentUser.uid);
    }
  }, [currentUser, currentGrade, selectedDate, loadGradeData]);

  // Debounced auto-save scores to Firestore & LocalStorage for the current teacher
  const triggerAutoSave = (newScores: ScoresState, updatedRoster = roster) => {
    if (!currentUser?.uid) return;
    const uid = currentUser.uid;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      // Save locally
      localStorage.setItem(`scores:${uid}:${currentGrade}:${selectedDate}`, JSON.stringify(newScores));
      localStorage.setItem(`roster:${uid}:${currentGrade}`, JSON.stringify(updatedRoster));

      // Save to Firestore
      const ok = await saveDailyScoresToFirestore(
        uid,
        currentGrade,
        selectedDate,
        dateDisplay,
        teacherName || currentUser.displayName || 'Teacher',
        newScores
      );

      if (ok) {
        setSaveStatus(`Saved to Firestore (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
        setStatusType('ok');
      } else {
        setSaveStatus('Scores saved locally. Cloud sync pending.');
        setStatusType('info');
      }
    }, 400);
  };

  // Daily Post-3:30 PM Auto-Save Scheduler (runs every 30 seconds when tab is open)
  useEffect(() => {
    if (!currentUser?.uid || roster.length === 0) return;

    const checkAndAutoSavePost330 = async () => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const todayISO = now.toISOString().slice(0, 10);

      // Check if current user time is post 3:30 PM (15:30)
      const isPost330 = currentHour > 15 || (currentHour === 15 && currentMinute >= 30);

      if (isPost330) {
        const lastSavedKey = `autosave_330:${currentUser.uid}:${todayISO}:${currentGrade}`;
        const alreadyRanToday = localStorage.getItem(lastSavedKey);

        if (!alreadyRanToday && Object.keys(scores).length > 0) {
          const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          console.log(`[AutoSave] Triggering daily 3:30 PM scheduled auto-save for Grade ${currentGrade} at ${timeStr}`);

          const ok = await saveDailyScoresToFirestore(
            currentUser.uid,
            currentGrade,
            selectedDate,
            dateDisplay,
            teacherName || currentUser.displayName || 'Teacher',
            scores
          );

          if (ok) {
            localStorage.setItem(lastSavedKey, timeStr);
            setLastAutoSaveTimestamp(`Today at ${timeStr}`);
            setSaveStatus(`Auto-saved at 3:30 PM milestone (${timeStr})`);
            setStatusType('ok');
          }
        }
      }
    };

    // Run initial check
    checkAndAutoSavePost330();

    // Check periodically every 30 seconds
    const interval = setInterval(checkAndAutoSavePost330, 30000);
    return () => clearInterval(interval);
  }, [currentUser, currentGrade, selectedDate, dateDisplay, teacherName, scores, roster]);

  // Google Sign In action
  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      if (err?.code === 'auth/popup-blocked') {
        setAuthError('Popup was blocked by your browser. Please allow popups for this site and try again.');
      } else if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        setAuthError('Sign in failed: ' + (err?.message || 'Please try again.'));
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  // Sign out action
  const handleSignOut = async () => {
    if (confirm('Are you sure you want to sign out?')) {
      await logOut();
      setRoster([]);
      setScores({});
      setHistory({});
      setSettingsOpen(false);
    }
  };

  // Student completion check
  const studentIsComplete = (name: string): boolean => {
    const s = scores[name];
    if (!s) return false;
    return CATEGORIES.every((c) => s[c] !== '' && s[c] !== undefined);
  };

  // Progress metrics
  const scoredCount = useMemo(() => {
    return roster.filter(studentIsComplete).length;
  }, [roster, scores]);

  const progressPercent = useMemo(() => {
    return roster.length ? Math.round((scoredCount / roster.length) * 100) : 0;
  }, [roster.length, scoredCount]);

  // Class averages for current grade
  const classAverages = useMemo(() => {
    const sums: Record<CategoryKey, number> = { engagement: 0, responsibility: 0, respect: 0 };
    const counts: Record<CategoryKey, number> = { engagement: 0, responsibility: 0, respect: 0 };

    roster.forEach((name) => {
      const s = scores[name];
      if (!s) return;
      CATEGORIES.forEach((cat) => {
        const val = s[cat];
        if (val && val !== '') {
          sums[cat] += Number(val);
          counts[cat] += 1;
        }
      });
    });

    return {
      engagement: counts.engagement > 0 ? (sums.engagement / counts.engagement).toFixed(2) : '—',
      responsibility: counts.responsibility > 0 ? (sums.responsibility / counts.responsibility).toFixed(2) : '—',
      respect: counts.respect > 0 ? (sums.respect / counts.respect).toFixed(2) : '—'
    };
  }, [roster, scores]);

  // Score button toggle
  const handleScoreClick = (student: string, cat: CategoryKey, code: ScoreValue) => {
    const currentVal = scores[student]?.[cat];
    const nextVal = currentVal === code ? '' : code;

    const newScores: ScoresState = {
      ...scores,
      [student]: {
        ...(scores[student] || { engagement: '', responsibility: '', respect: '' }),
        [cat]: nextVal
      }
    };

    setScores(newScores);
    triggerAutoSave(newScores);
  };

  // Clear single student
  const handleClearStudent = (student: string) => {
    const newScores: ScoresState = {
      ...scores,
      [student]: { engagement: '3', responsibility: '3', respect: '3' }
    };
    setScores(newScores);
    triggerAutoSave(newScores);
    setSaveStatus(`Reset scores to 3 for ${student}`);
    setStatusType('info');
  };

  // Request remove student confirmation
  const handleInitiateRemoveStudent = (student: string) => {
    setStudentToDelete(student);
  };

  // Confirm and perform student removal
  const handleConfirmRemoveStudent = async () => {
    if (!currentUser?.uid || !studentToDelete) return;
    const student = studentToDelete;
    const updatedRoster = roster.filter((n) => n !== student);
    const newScores = { ...scores };
    delete newScores[student];

    setRoster(updatedRoster);
    setScores(newScores);
    setStudentToDelete(null);

    await saveRosterToFirestore(currentUser.uid, currentGrade, updatedRoster);
    triggerAutoSave(newScores, updatedRoster);
    setSaveStatus(`Removed ${student} from Grade ${currentGrade}`);
    setStatusType('ok');
  };

  // Add single student
  const handleAddStudent = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentUser?.uid) return;
    const name = newStudentName.trim();
    if (!name) return;

    if (roster.includes(name)) {
      setNewStudentName('');
      return;
    }

    const updatedRoster = [...roster, name].sort((a, b) => a.localeCompare(b));
    const newScores: ScoresState = {
      ...scores,
      [name]: { engagement: '3', responsibility: '3', respect: '3' }
    };

    setRoster(updatedRoster);
    setScores(newScores);
    setNewStudentName('');

    await saveRosterToFirestore(currentUser.uid, currentGrade, updatedRoster);
    triggerAutoSave(newScores, updatedRoster);
    setSaveStatus(`Added ${name} to Grade ${currentGrade}`);
    setStatusType('ok');
  };

  // Bulk add students
  const handleBulkAdd = async () => {
    if (!currentUser?.uid) return;
    const lines = bulkInput
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return;

    const mergedSet = new Set([...roster, ...lines]);
    const updatedRoster = Array.from(mergedSet).sort((a, b) => a.localeCompare(b));

    const newScores = { ...scores };
    updatedRoster.forEach((name) => {
      if (!newScores[name]) {
        newScores[name] = { engagement: '3', responsibility: '3', respect: '3' };
      }
    });

    setRoster(updatedRoster);
    setScores(newScores);
    setBulkInput('');
    setShowBulkAdd(false);

    await saveRosterToFirestore(currentUser.uid, currentGrade, updatedRoster);
    triggerAutoSave(newScores, updatedRoster);
    setSaveStatus(`Added ${lines.length} students to Grade ${currentGrade}`);
    setStatusType('ok');
  };

  // Open confirmation for reset all
  const handleClearAllToThree = () => {
    if (roster.length === 0) return;
    setShowResetAllModal(true);
  };

  // Perform reset all students in current grade to 3
  const handleConfirmResetAllToThree = () => {
    if (roster.length === 0) return;
    const newScores: ScoresState = {};
    roster.forEach((name) => {
      newScores[name] = { engagement: '3', responsibility: '3', respect: '3' };
    });
    setScores(newScores);
    triggerAutoSave(newScores);
    setShowResetAllModal(false);
    setSaveStatus(`Reset all ${roster.length} students in Grade ${currentGrade} to 3.`);
    setStatusType('info');
  };

  // Category average computation (combines lifetime history + today's scores)
  const computeStudentCategoryAverage = (student: string, cat: CategoryKey): number | null => {
    const h = history[student]?.[cat] || { sum: 0, count: 0 };
    let sum = h.sum;
    let count = h.count;

    const todayVal = scores[student]?.[cat];
    if (todayVal && todayVal !== '' && !isNaN(Number(todayVal))) {
      sum += Number(todayVal);
      count += 1;
    }

    if (count === 0) return null;
    return sum / count;
  };

  // Explicit Save button to Firestore and optionally Google Sheet
  const handleManualSave = async () => {
    if (!currentUser?.uid) return;
    const uid = currentUser.uid;

    if (!teacherName.trim()) {
      setSaveStatus('Please enter your Teacher name above before submitting.');
      setStatusType('err');
      const teacherInput = document.getElementById('teacherNameInput');
      teacherInput?.focus();
      return;
    }

    setIsSaving(true);
    setSaveStatus('Saving scores to Firestore…');
    setStatusType('info');

    // 1. Save to Firestore
    const ok = await saveDailyScoresToFirestore(
      uid,
      currentGrade,
      selectedDate,
      dateDisplay,
      teacherName,
      scores
    );

    await saveRosterToFirestore(uid, currentGrade, roster);
    await saveAppConfigToFirestore(uid, { teacherName, webAppUrl });

    // Refresh history
    const updatedHistory = await getGradeHistoryFromFirestore(uid, currentGrade);
    setHistory(updatedHistory);

    // 2. If WebAppUrl provided, also send to Google Apps Script
    let sheetNote = '';
    if (webAppUrl && webAppUrl.trim().startsWith('http')) {
      try {
        const entries = roster
          .filter((name) => CATEGORIES.some((c) => scores[name]?.[c] !== ''))
          .map((name) => ({
            student: name,
            engagement: scores[name].engagement,
            responsibility: scores[name].responsibility,
            respect: scores[name].respect
          }));

        await fetch(webAppUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            date: selectedDate,
            dateDisplay,
            grade: currentGrade,
            teacher: teacherName,
            teacherEmail: currentUser.email,
            entries
          })
        });
        sheetNote = ' & Google Sheet';
      } catch (err) {
        console.warn('Google Sheet webhook error:', err);
      }
    }

    setIsSaving(false);
    if (ok) {
      setSaveStatus(`Successfully saved Grade ${currentGrade} scores to Firestore${sheetNote}!`);
      setStatusType('ok');
    } else {
      setSaveStatus('Saved locally. Firestore connection had a hiccup.');
      setStatusType('info');
    }
  };

  // Import / Sync Roster & Averages from Google Sheet if URL provided
  const handleSyncWithSheet = async () => {
    if (!currentUser?.uid) return;
    if (!webAppUrl) {
      setSettingsOpen(true);
      setSaveStatus('Enter your Google Apps Script Web App URL in settings first.');
      setStatusType('err');
      return;
    }

    setIsSyncing(true);
    setSaveStatus('Syncing with Google Sheet…');
    setStatusType('info');

    try {
      const res = await fetch(webAppUrl, { method: 'GET' });
      const data = await res.json();
      const rosters = data.rosters || {};

      let importedCount = 0;
      for (const gradeKey of Object.keys(rosters)) {
        const grade = parseInt(gradeKey, 10);
        if (!GRADES.includes(grade)) continue;

        const names = (rosters[gradeKey] || []).map((n: string) => String(n).trim()).filter(Boolean);
        if (names.length) {
          const merged = Array.from(new Set([...(roster || []), ...names])).sort((a, b) => a.localeCompare(b));
          await saveRosterToFirestore(currentUser.uid, grade, merged);
          importedCount += names.length;
        }
      }

      setSaveStatus(`Sync complete! Synced ${importedCount} student names from Sheet.`);
      setStatusType('ok');
      await loadGradeData(currentGrade, selectedDate, currentUser.uid);
    } catch (err) {
      setSaveStatus('Could not sync with Google Sheet. Please check the Web App URL.');
      setStatusType('err');
    } finally {
      setIsSyncing(false);
    }
  };

  // Date stepper
  const shiftDate = (days: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d + days);
    const newIso = dateObj.toISOString().slice(0, 10);
    setSelectedDate(newIso);
  };

  const jumpToToday = () => {
    const today = new Date().toISOString().slice(0, 10);
    setSelectedDate(today);
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Student Name', 'Grade', 'Date', 'Engagement', 'Responsibility', 'Respect', 'Engagement Avg', 'Responsibility Avg', 'Respect Avg'];
    const rows = roster.map((name) => {
      const s = scores[name] || { engagement: '', responsibility: '', respect: '' };
      const engAvg = computeStudentCategoryAverage(name, 'engagement')?.toFixed(1) || '';
      const respAvg = computeStudentCategoryAverage(name, 'responsibility')?.toFixed(1) || '';
      const respkAvg = computeStudentCategoryAverage(name, 'respect')?.toFixed(1) || '';
      return [
        `"${name}"`,
        currentGrade,
        selectedDate,
        s.engagement,
        s.responsibility,
        s.respect,
        engAvg,
        respAvg,
        respkAvg
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `process_scores_grade_${currentGrade}_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 1. Initial Loading State
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#F6F5F0] text-[#18191B] flex flex-col items-center justify-center p-6 select-none">
        <div className="bg-white border-2 border-[#18191B] rounded-2xl p-8 bold-shadow max-w-sm w-full text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-[#E8F2F0] border-2 border-[#18191B] flex items-center justify-center mx-auto text-[#1F6F6B]">
            <Database className="w-6 h-6 animate-pulse" />
          </div>
          <h2 className="font-serif-fraunces font-black text-xl text-[#18191B]">Process Score Checker</h2>
          <p className="text-xs text-[#5C626A] font-medium">Connecting to secure teacher workspace…</p>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated View: Teacher Sign In with Google
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#F6F5F0] text-[#18191B] flex flex-col items-center justify-center p-4 sm:p-6 selection:bg-[#18191B] selection:text-white">
        <div className="max-w-md w-full bg-white border-2 border-[#18191B] rounded-3xl p-6 sm:p-8 bold-shadow space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-[#E8F2F0] border-2 border-[#18191B] flex items-center justify-center mx-auto bold-shadow-sm mb-3">
              <BookOpen className="w-7 h-7 text-[#1F6F6B] stroke-[2.5]" />
            </div>
            <h1 className="font-serif-fraunces font-black text-2xl sm:text-3xl text-[#18191B] tracking-tight">
              Process Score Checker
            </h1>
            <p className="text-xs text-[#5C626A] font-medium leading-relaxed">
              Teacher Learning Skills evaluation with private cloud storage and Google authentication.
            </p>
          </div>

          {/* Privacy & Isolation Highlight */}
          <div className="bg-[#F6F5F0] border-2 border-[#18191B] rounded-2xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-[#E8F2F0] border border-[#18191B] flex items-center justify-center text-[#1F6F6B] flex-shrink-0 mt-0.5">
                <Lock className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-xs font-black text-[#18191B] uppercase tracking-wider">Isolated Teacher Accounts</h3>
                <p className="text-[11px] text-[#5C626A] font-medium mt-0.5 leading-snug">
                  Your student rosters, daily scores, and historical averages are strictly private to your Google profile. Other teachers cannot view your accounts.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 pt-1 border-t border-[#18191B]/15">
              <div className="w-7 h-7 rounded-lg bg-[#E8F2F0] border border-[#18191B] flex items-center justify-center text-[#1F6F6B] flex-shrink-0 mt-0.5">
                <ShieldCheck className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-xs font-black text-[#18191B] uppercase tracking-wider">Secure Google Sign-In</h3>
                <p className="text-[11px] text-[#5C626A] font-medium mt-0.5 leading-snug">
                  Sign in with any standard Gmail or school Google Workspace account.
                </p>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {authError && (
            <div className="p-3 bg-[#FBEBE7] border-2 border-[#D94826] rounded-xl flex items-start gap-2.5 text-[#D94826] text-xs font-bold">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {/* Google Sign In Button */}
          <button
            id="googleSignInBtn"
            onClick={handleGoogleSignIn}
            disabled={isSigningIn}
            className="w-full py-3.5 px-4 bg-[#18191B] hover:bg-[#1F6F6B] text-white font-black text-sm uppercase tracking-wider rounded-xl border-2 border-[#18191B] bold-shadow flex items-center justify-center gap-3 transition-all cursor-pointer active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50"
          >
            {/* Google G Logo SVG */}
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.97 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span>{isSigningIn ? 'Signing in…' : 'Sign in with Google'}</span>
          </button>

          <p className="text-[10px] text-center text-[#5C626A] font-medium">
            By signing in, your account profile and private data will be securely created in Google Cloud Firestore.
          </p>
        </div>
      </div>
    );
  }

  // 3. Authenticated App View
  return (
    <div className="min-h-screen bg-[#F6F5F0] text-[#18191B] font-sans pb-36 selection:bg-[#18191B] selection:text-white">
      {/* Main Container */}
      <div className="max-w-[980px] mx-auto px-4 sm:px-6 pt-6 pb-12">
        {/* Top Header */}
        <header className="sticky top-0 z-20 bg-[#F6F5F0]/95 backdrop-blur-md border-b-2 border-[#18191B] pt-4 pb-4 mb-6 transition-all">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <h1 className="font-serif-fraunces font-black text-2xl sm:text-3xl tracking-tight text-[#18191B] flex items-center gap-2.5">
                <span className="text-[#1F6F6B] font-black underline decoration-4 decoration-[#18191B]">Process Score</span>
                <span className="font-extrabold text-[#18191B]">Daily Checker</span>
              </h1>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono-jb font-bold px-2.5 py-1 rounded-md bg-[#18191B] text-white border-2 border-[#18191B] bold-shadow-sm">
                <Lock className="w-3 h-3 text-[#5EEAD4]" />
                <span>PRIVATE ACCOUNT</span>
              </span>
            </div>

            {/* Authenticated Teacher Profile Badge & Date Navigator */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Teacher Avatar & Sign Out */}
              <div className="flex items-center gap-2 bg-white border-2 border-[#18191B] rounded-lg px-2.5 py-1 bold-shadow-sm">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'Teacher'}
                    referrerPolicy="no-referrer"
                    className="w-6 h-6 rounded-full border border-[#18191B] object-cover"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-[#1F6F6B] text-white flex items-center justify-center text-[10px] font-black font-mono-jb">
                    {(currentUser.displayName || currentUser.email || 'T').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex flex-col text-left">
                  <span className="text-xs font-black text-[#18191B] leading-none max-w-[120px] truncate">
                    {currentUser.displayName || teacherName || 'Teacher'}
                  </span>
                  <span className="text-[9px] text-[#5C626A] font-mono-jb leading-none truncate max-w-[120px]">
                    {currentUser.email}
                  </span>
                </div>
                <button
                  id="signOutBtn"
                  onClick={handleSignOut}
                  className="ml-1 p-1 text-[#5C626A] hover:text-[#D94826] hover:bg-[#FBEBE7] rounded transition cursor-pointer"
                  title="Sign Out / Switch Teacher"
                >
                  <LogOut className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>

              {/* Date Navigator Stamp */}
              <div className="flex items-center gap-1 bg-white border-2 border-[#18191B] rounded-lg px-2.5 py-1 bold-shadow-sm">
                <button
                  id="prevDateBtn"
                  onClick={() => shiftDate(-1)}
                  className="p-1 text-[#18191B] hover:bg-[#F6F5F0] rounded transition cursor-pointer active:scale-95"
                  title="Previous Day"
                >
                  <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
                </button>

                <label htmlFor="datePickerInput" className="cursor-pointer flex items-center gap-2 px-2">
                  <Calendar className="w-4 h-4 text-[#1F6F6B] stroke-[2.5]" />
                  <span className="font-mono-jb text-xs sm:text-sm text-[#18191B] font-bold tracking-tight">{dateDisplay}</span>
                </label>
                <input
                  id="datePickerInput"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                  className="sr-only"
                />

                <button
                  id="nextDateBtn"
                  onClick={() => shiftDate(1)}
                  className="p-1 text-[#18191B] hover:bg-[#F6F5F0] rounded transition cursor-pointer active:scale-95"
                  title="Next Day"
                >
                  <ChevronRight className="w-4 h-4 stroke-[2.5]" />
                </button>

                {selectedDate !== new Date().toISOString().slice(0, 10) && (
                  <button
                    id="todayBtn"
                    onClick={jumpToToday}
                    className="text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded bg-[#1F6F6B] text-white hover:bg-[#164F4C] transition ml-1 cursor-pointer"
                  >
                    Today
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Controls bar */}
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <label htmlFor="teacherNameInput" className="text-[11px] font-black text-[#18191B] uppercase tracking-wider">
                Teacher:
              </label>
              <input
                id="teacherNameInput"
                type="text"
                value={teacherName}
                placeholder="Your name"
                onChange={(e) => {
                  setTeacherName(e.target.value);
                  if (currentUser?.uid) {
                    localStorage.setItem(`config:${currentUser.uid}:teacherName`, e.target.value);
                  }
                }}
                onBlur={() => {
                  if (currentUser?.uid) {
                    saveAppConfigToFirestore(currentUser.uid, { teacherName });
                  }
                }}
                className="font-bold text-sm px-3 py-1.5 rounded-lg border-2 border-[#18191B] bg-white text-[#18191B] w-44 focus:outline-none focus:ring-2 focus:ring-[#1F6F6B] bold-shadow-sm transition"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <label htmlFor="gradeSelect" className="text-[11px] font-black text-[#18191B] uppercase tracking-wider">
                Grade:
              </label>
              <select
                id="gradeSelect"
                value={currentGrade}
                onChange={(e) => setCurrentGrade(parseInt(e.target.value, 10))}
                className="font-black text-sm px-3.5 py-1.5 pr-8 rounded-lg border-2 border-[#18191B] bg-white text-[#18191B] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1F6F6B] bold-shadow-sm transition"
              >
                {GRADES.map((g) => (
                  <option key={g} value={g} className="font-bold">
                    Grade {g}
                  </option>
                ))}
              </select>
            </div>

            <button
              id="clearAllBtn"
              onClick={handleClearAllToThree}
              className="px-3.5 py-1.5 rounded-lg border-2 border-[#18191B] bg-white hover:bg-[#FBEBE7] hover:text-[#D94826] text-[#18191B] font-bold text-xs transition bold-shadow-sm hover:translate-x-0.5 hover:translate-y-0.5 active:translate-x-0 active:translate-y-0 cursor-pointer flex items-center gap-1.5"
              title="Reset every student in this grade back to 3"
            >
              <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Reset all to 3</span>
            </button>

            <button
              id="gearBtn"
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`p-2 rounded-lg border-2 border-[#18191B] bg-white hover:bg-[#E8F2F0] text-[#18191B] transition bold-shadow-sm cursor-pointer ${
                settingsOpen ? 'bg-[#18191B] text-white border-[#18191B]' : ''
              }`}
              title="Settings & Account"
            >
              <Settings className="w-4 h-4 stroke-[2.5]" />
            </button>

            {/* Progress indicator */}
            <div className="ml-auto flex items-center gap-3 text-xs text-[#18191B] font-extrabold bg-white px-3 py-1.5 rounded-lg border-2 border-[#18191B] bold-shadow-sm">
              <span id="progressText" className="font-mono-jb font-bold text-xs">
                {scoredCount} / {roster.length} SCORED
              </span>
              <div className="w-24 h-2.5 bg-[#E4DFC8] rounded-full overflow-hidden border border-[#18191B]">
                <div
                  id="progressFill"
                  className="h-full bg-[#1F6F6B] transition-all duration-300 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Settings / Integrations Panel */}
          {settingsOpen && (
            <div
              id="settingsPanel"
              className="mt-4 p-5 border-2 border-[#18191B] rounded-xl bg-white bold-shadow space-y-4 animate-fade-in"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-black text-base text-[#18191B] flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#1F6F6B] stroke-[2.5]" />
                    <span>Teacher Account &amp; Sync Settings</span>
                  </h3>
                  <p className="text-xs text-[#5C626A] mt-1 font-medium leading-relaxed max-w-2xl">
                    Signed in as <strong className="text-[#18191B]">{currentUser.email}</strong>. All student rosters, daily scores, and multi-day averages are stored strictly in your private teacher collection.
                  </p>
                </div>
                <button
                  id="closeSettingsBtn"
                  onClick={() => setSettingsOpen(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border-2 border-[#18191B] hover:bg-[#18191B] hover:text-white font-black text-xs transition cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div>
                  <label htmlFor="webAppUrlInput" className="block text-[11px] font-black text-[#18191B] uppercase tracking-wider mb-1">
                    Google Apps Script Web App URL (Optional)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="webAppUrlInput"
                      type="text"
                      value={webAppUrl}
                      onChange={(e) => setWebAppUrl(e.target.value)}
                      placeholder="https://script.google.com/macros/s/.../exec"
                      className="flex-1 px-3 py-2 border-2 border-[#18191B] rounded-lg font-mono-jb text-xs bg-[#F6F5F0] focus:outline-none focus:ring-2 focus:ring-[#1F6F6B] font-bold"
                    />
                    <button
                      id="saveUrlBtn"
                      onClick={() => {
                        if (currentUser?.uid) {
                          localStorage.setItem(`config:${currentUser.uid}:webAppUrl`, webAppUrl);
                          saveAppConfigToFirestore(currentUser.uid, { webAppUrl });
                          setSaveStatus('Settings saved to Firestore.');
                          setStatusType('ok');
                        }
                      }}
                      className="px-4 py-2 rounded-lg bg-[#18191B] hover:bg-[#1F6F6B] text-white font-black text-xs transition bold-shadow-sm cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                </div>

                <div className="flex items-end gap-2.5">
                  <button
                    id="exportCsvBtn"
                    onClick={handleExportCSV}
                    className="flex-1 px-4 py-2.5 rounded-lg border-2 border-[#18191B] bg-[#E8F2F0] hover:bg-[#1F6F6B] hover:text-white text-[#18191B] font-bold text-xs transition bold-shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4 stroke-[2.5]" />
                    <span>Export CSV Summary</span>
                  </button>

                  <button
                    id="bulkAddToggleBtn"
                    onClick={() => setShowBulkAdd(!showBulkAdd)}
                    className="flex-1 px-4 py-2.5 rounded-lg border-2 border-[#18191B] bg-white hover:bg-[#F6F5F0] text-[#18191B] font-bold text-xs transition bold-shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Users className="w-4 h-4 text-[#1F6F6B] stroke-[2.5]" />
                    <span>Bulk Add Names</span>
                  </button>
                </div>
              </div>

              {/* Bulk add textarea */}
              {showBulkAdd && (
                <div className="pt-3 border-t-2 border-[#18191B] space-y-2">
                  <label htmlFor="bulkTextarea" className="text-xs font-black text-[#18191B] uppercase tracking-wider">
                    Paste student names (one per line, e.g. "Last, First"):
                  </label>
                  <textarea
                    id="bulkTextarea"
                    rows={4}
                    value={bulkInput}
                    onChange={(e) => setBulkInput(e.target.value)}
                    placeholder="Smith, John&#10;Doe, Jane&#10;Taylor, Sam"
                    className="w-full p-3 text-xs font-mono-jb font-bold border-2 border-[#18191B] rounded-lg bg-[#F6F5F0] focus:outline-none focus:ring-2 focus:ring-[#1F6F6B]"
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      id="cancelBulkBtn"
                      onClick={() => setShowBulkAdd(false)}
                      className="px-3 py-1.5 text-xs font-bold text-[#5C626A] hover:text-[#18191B] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      id="importBulkBtn"
                      onClick={handleBulkAdd}
                      className="px-4 py-1.5 bg-[#18191B] text-white rounded-lg text-xs font-black hover:bg-[#1F6F6B] border-2 border-[#18191B] bold-shadow-sm cursor-pointer transition"
                    >
                      Add to Grade {currentGrade} Roster
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </header>

        {/* Add Student & Sync Row */}
        <div className="flex gap-3 mb-5 flex-wrap">
          <form onSubmit={handleAddStudent} className="flex-1 min-w-[260px] flex gap-2">
            <input
              id="newStudentInput"
              type="text"
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
              placeholder="Add student to this grade (e.g. Last, First)"
              className="flex-1 px-4 py-2.5 border-2 border-[#18191B] rounded-lg text-sm bg-white font-bold placeholder:text-[#5C626A]/70 focus:outline-none focus:ring-2 focus:ring-[#1F6F6B] bold-shadow-sm transition"
            />
            <button
              id="addStudentBtn"
              type="submit"
              className="px-5 py-2.5 rounded-lg border-2 border-[#18191B] bg-[#18191B] text-white hover:bg-[#1F6F6B] hover:border-[#1F6F6B] font-black text-xs uppercase tracking-wider transition bold-shadow-sm cursor-pointer flex items-center gap-1.5 active:translate-x-0.5 active:translate-y-0.5"
            >
              <UserPlus className="w-4 h-4 stroke-[2.5]" />
              <span>Add Student</span>
            </button>
          </form>

          {webAppUrl && (
            <button
              id="importBtn"
              onClick={handleSyncWithSheet}
              disabled={isSyncing}
              className="px-4 py-2.5 rounded-lg border-2 border-[#18191B] bg-white hover:bg-[#E8F2F0] text-[#18191B] font-black text-xs transition bold-shadow-sm cursor-pointer flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#1F6F6B] stroke-[2.5]" />
              <span>{isSyncing ? 'Syncing…' : 'Sync from Sheet'}</span>
            </button>
          )}
        </div>

        {/* Class Averages Bar */}
        {roster.length > 0 && (
          <div className="mb-6 bg-white border-2 border-[#18191B] rounded-xl px-5 py-3.5 flex items-center justify-between gap-4 flex-wrap bold-shadow">
            <div className="flex items-center gap-2.5">
              <Award className="w-5 h-5 text-[#1F6F6B] stroke-[2.5]" />
              <span className="font-black text-sm uppercase tracking-wider text-[#18191B]">Grade {currentGrade} Class Daily Average:</span>
            </div>
            <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
              <div className="flex items-center gap-2 text-xs font-mono-jb">
                <span className="text-[#5C626A] uppercase text-[10px] font-black tracking-wider">Engagement</span>
                <span className="font-black text-sm text-[#18191B] bg-[#E8F2F0] border-2 border-[#18191B] px-2 py-0.5 rounded-md bold-shadow-sm">
                  {classAverages.engagement}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono-jb">
                <span className="text-[#5C626A] uppercase text-[10px] font-black tracking-wider">Responsibility</span>
                <span className="font-black text-sm text-[#18191B] bg-[#E8F2F0] border-2 border-[#18191B] px-2 py-0.5 rounded-md bold-shadow-sm">
                  {classAverages.responsibility}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono-jb">
                <span className="text-[#5C626A] uppercase text-[10px] font-black tracking-wider">Respect</span>
                <span className="font-black text-sm text-[#18191B] bg-[#E8F2F0] border-2 border-[#18191B] px-2 py-0.5 rounded-md bold-shadow-sm">
                  {classAverages.respect}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Roster Student List */}
        <div id="roster" className="flex flex-col gap-3">
          {roster.length === 0 ? (
            <div className="py-14 px-6 text-center text-[#5C626A] border-2 border-dashed border-[#18191B] rounded-2xl bg-white bold-shadow">
              <strong className="block text-[#18191B] font-serif-fraunces text-xl mb-1.5 font-black">
                No students in Grade {currentGrade} yet
              </strong>
              <p className="text-sm font-medium">Add students above or paste a class list in settings to start tracking this grade.</p>
            </div>
          ) : (
            roster.map((name) => {
              const s = scores[name] || { engagement: '', responsibility: '', respect: '' };
              const complete = studentIsComplete(name);

              return (
                <div
                  key={name}
                  data-name={name}
                  className={`bg-white border-2 rounded-xl p-3.5 sm:p-4 flex items-center justify-between gap-4 flex-wrap md:flex-nowrap transition-all ${
                    complete
                      ? 'border-[#18191B] bg-[#FAFAF7] bold-shadow'
                      : 'border-[#18191B] bold-shadow-sm'
                  }`}
                >
                  {/* Student Name & Actions Column (Reset to 3 & Remove Student below) */}
                  <div className="w-full sm:w-48 md:w-56 flex-shrink-0 flex flex-col justify-center gap-2 pr-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-3 h-3 rounded-full flex-shrink-0 border border-[#18191B] transition-colors ${
                          complete ? 'bg-[#1F6F6B]' : 'bg-[#E4DFC8]'
                        }`}
                        title={complete ? 'All scores complete' : 'Pending scores'}
                      />
                      <span className="font-black text-[15px] text-[#18191B] truncate" title={name}>
                        {name}
                      </span>
                    </div>

                    {/* Action buttons stacked below the student name */}
                    <div className="flex flex-col gap-1.5 pl-5">
                      <button
                        id={`clearBtn-${name.replace(/\s+/g, '_')}`}
                        onClick={() => handleClearStudent(name)}
                        className="text-[10px] font-black uppercase tracking-wider text-[#5C626A] hover:text-[#18191B] bg-[#F6F5F0] hover:bg-[#E8F2F0] px-2.5 py-1 rounded-md border border-[#18191B]/40 hover:border-[#18191B] transition cursor-pointer flex items-center gap-1.5 active:translate-x-0.5 active:translate-y-0.5 w-fit"
                        title="Reset this student's scores to 3"
                      >
                        <RotateCcw className="w-3 h-3 stroke-[2.5]" />
                        <span>Reset to 3</span>
                      </button>

                      <button
                        id={`removeBtn-${name.replace(/\s+/g, '_')}`}
                        onClick={() => handleInitiateRemoveStudent(name)}
                        className="text-[10px] font-bold text-[#5C626A] hover:text-[#D94826] hover:bg-[#FBEBE7] px-2.5 py-0.5 rounded-md border border-transparent hover:border-[#D94826]/40 transition cursor-pointer flex items-center gap-1.5 w-fit"
                        title={`Remove ${name} from this grade`}
                      >
                        <Trash2 className="w-3 h-3 stroke-[2.5]" />
                        <span>Remove student</span>
                      </button>
                    </div>
                  </div>

                  {/* Process Scores Row */}
                  <div className="flex items-center gap-4 sm:gap-6 flex-1 flex-wrap lg:flex-nowrap justify-start sm:justify-center py-1 sm:py-0">
                    {CATEGORIES.map((cat) => (
                      <div key={cat} className="flex flex-col gap-1 items-start">
                        <span className="text-[10px] uppercase tracking-wider text-[#18191B] font-black">
                          {CATEGORY_LABELS[cat]}
                        </span>
                        <div className="flex items-center gap-1 sm:gap-1.5">
                          {CODES.map((code) => {
                            const isActive = s[cat] === code;
                            return (
                              <button
                                key={code}
                                id={`scoreBtn-${name.replace(/\s+/g, '_')}-${cat}-${code}`}
                                type="button"
                                onClick={() => handleScoreClick(name, cat, code)}
                                className={`w-8 h-8 rounded-lg border-2 font-mono-jb text-xs font-black transition-all cursor-pointer ${
                                  isActive
                                    ? 'bg-[#18191B] border-[#18191B] text-white bold-shadow-sm -translate-y-0.5'
                                    : 'bg-[#F6F5F0] border-[#18191B]/40 text-[#18191B] hover:border-[#18191B] hover:bg-white'
                                }`}
                              >
                                {code}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Multi-day Category Averages */}
                  <div className="flex items-center gap-1.5 sm:gap-2 ml-auto flex-shrink-0 pl-3 sm:pl-4 border-t sm:border-t-0 sm:border-l-2 border-[#18191B] pt-2 sm:pt-0 w-full sm:w-auto justify-end">
                    {CATEGORIES.map((cat) => {
                      const avg = computeStudentCategoryAverage(name, cat);
                      const isEmpty = avg === null;

                      return (
                        <div
                          key={cat}
                          className={`flex flex-col items-center justify-center w-12 sm:w-13 py-1 px-1 rounded-lg border-2 text-center transition-all ${
                            isEmpty
                              ? 'bg-[#F6F5F0] border-[#18191B]/30'
                              : 'bg-[#E8F2F0] border-[#18191B] bold-shadow-sm'
                          }`}
                          title={`${CATEGORY_LABELS[cat]} Multi-day Average`}
                        >
                          <span className="text-[9px] uppercase tracking-wider font-black leading-tight text-[#18191B]">
                            {CATEGORY_LABELS[cat].slice(0, 4)}
                          </span>
                          <span
                            className={`font-mono-jb text-[12px] sm:text-[13px] font-black leading-snug mt-0.5 ${
                              isEmpty ? 'text-[#5C626A]' : 'text-[#18191B]'
                            }`}
                          >
                            {avg === null ? '—' : avg.toFixed(1)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Legend / Rubric explanation */}
        <div className="mt-10 p-5 bg-white border-2 border-[#18191B] rounded-xl text-xs text-[#18191B] space-y-2 bold-shadow">
          <div className="font-black text-sm text-[#18191B] uppercase tracking-wider flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#1F6F6B] stroke-[2.5]" />
            <span>Process Score Rubric Scale</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 font-mono-jb text-[11px]">
            <div className="p-2 rounded-lg bg-[#F6F5F0] border-2 border-[#18191B]">
              <strong className="text-[#18191B] font-black text-xs mr-1 bg-[#E8F2F0] px-1 py-0.5 rounded border border-[#18191B]">4:</strong> Exceeding expectations
            </div>
            <div className="p-2 rounded-lg bg-[#F6F5F0] border-2 border-[#18191B]">
              <strong className="text-[#18191B] font-black text-xs mr-1 bg-[#E8F2F0] px-1 py-0.5 rounded border border-[#18191B]">3:</strong> Consistent &amp; on goal
            </div>
            <div className="p-2 rounded-lg bg-[#F6F5F0] border-2 border-[#18191B]">
              <strong className="text-[#18191B] font-black text-xs mr-1 bg-[#E8F2F0] px-1 py-0.5 rounded border border-[#18191B]">2:</strong> Developing / partial
            </div>
            <div className="p-2 rounded-lg bg-[#FBEBE7] border-2 border-[#D94826]">
              <strong className="text-[#D94826] font-black text-xs mr-1 bg-white px-1 py-0.5 rounded border border-[#D94826]">1:</strong> Direct support needed
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal: Remove Student */}
      {studentToDelete && (
        <div className="fixed inset-0 z-50 bg-[#18191B]/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white border-2 border-[#18191B] rounded-2xl p-6 max-w-md w-full bold-shadow space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FBEBE7] border-2 border-[#D94826] flex items-center justify-center text-[#D94826] flex-shrink-0">
                <Trash2 className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="font-serif-fraunces font-black text-lg text-[#18191B]">Remove Student</h3>
                <p className="text-xs text-[#5C626A] font-medium">Grade {currentGrade} Roster</p>
              </div>
            </div>

            <p className="text-sm text-[#18191B] font-medium leading-relaxed">
              Are you sure you want to remove <strong className="font-black text-[#18191B] underline">{studentToDelete}</strong> from Grade {currentGrade}?
            </p>
            <p className="text-[11px] text-[#5C626A] font-medium">
              This will remove them from the grade roster and delete their today's temporary scores.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setStudentToDelete(null)}
                className="px-4 py-2 rounded-lg border-2 border-[#18191B] text-xs font-bold text-[#18191B] hover:bg-[#F6F5F0] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveStudent}
                className="px-4 py-2 rounded-lg bg-[#D94826] hover:bg-[#B8381A] text-white border-2 border-[#18191B] text-xs font-black uppercase tracking-wider bold-shadow-sm transition cursor-pointer flex items-center gap-1.5 active:translate-x-0.5 active:translate-y-0.5"
              >
                <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Yes, Remove Student</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Reset All to 3 */}
      {showResetAllModal && (
        <div className="fixed inset-0 z-50 bg-[#18191B]/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white border-2 border-[#18191B] rounded-2xl p-6 max-w-md w-full bold-shadow space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#E8F2F0] border-2 border-[#1F6F6B] flex items-center justify-center text-[#1F6F6B] flex-shrink-0">
                <RotateCcw className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="font-serif-fraunces font-black text-lg text-[#18191B]">Reset All Scores to 3</h3>
                <p className="text-xs text-[#5C626A] font-medium">Grade {currentGrade} • {dateDisplay}</p>
              </div>
            </div>

            <p className="text-sm text-[#18191B] font-medium leading-relaxed">
              Are you sure you want to reset scores for all <strong className="font-black">{roster.length}</strong> students in Grade {currentGrade} back to <strong className="font-black">3</strong> for today?
            </p>
            <p className="text-[11px] text-[#5C626A] font-medium">
              This will update today's Engagement, Responsibility, and Respect scores to standard grade-level expectation (3).
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowResetAllModal(false)}
                className="px-4 py-2 rounded-lg border-2 border-[#18191B] text-xs font-bold text-[#18191B] hover:bg-[#F6F5F0] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmResetAllToThree}
                className="px-4 py-2 rounded-lg bg-[#18191B] hover:bg-[#1F6F6B] text-white border-2 border-[#18191B] text-xs font-black uppercase tracking-wider bold-shadow-sm transition cursor-pointer flex items-center gap-1.5 active:translate-x-0.5 active:translate-y-0.5"
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Reset All to 3</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sticky Save Bar */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t-2 border-[#18191B] py-3.5 px-4 sm:px-6 shadow-2xl">
        <div className="max-w-[980px] mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5 flex-1 min-w-[220px] flex-wrap">
            <div className="flex items-center gap-2">
              {statusType === 'ok' ? (
                <CheckCircle2 className="w-5 h-5 text-[#1F6F6B] stroke-[2.5] flex-shrink-0" />
              ) : statusType === 'err' ? (
                <AlertCircle className="w-5 h-5 text-[#D94826] stroke-[2.5] flex-shrink-0" />
              ) : (
                <Cloud className="w-5 h-5 text-[#18191B] stroke-[2.5] flex-shrink-0" />
              )}
              <span
                id="saveStatus"
                className={`text-xs sm:text-sm font-bold ${
                  statusType === 'ok'
                    ? 'text-[#1F6F6B]'
                    : statusType === 'err'
                    ? 'text-[#D94826]'
                    : 'text-[#18191B]'
                }`}
              >
                {saveStatus}
              </span>
            </div>

            <div className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#E8F2F0] border border-[#18191B]/20 text-[10px] font-mono-jb text-[#1F6F6B] font-bold" title="Auto-saves to Firestore after 3:30 PM local teacher time each day">
              <Clock className="w-3 h-3 stroke-[2.5]" />
              <span>Daily 3:30 PM Autosave Enabled</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="submitBtn"
              onClick={handleManualSave}
              disabled={isSaving}
              className="px-6 py-2.5 rounded-lg bg-[#18191B] hover:bg-[#1F6F6B] text-white font-black text-xs uppercase tracking-wider transition bold-shadow border-2 border-[#18191B] hover:border-[#1F6F6B] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              <Database className="w-4 h-4 stroke-[2.5] text-[#5EEAD4]" />
              <span>{isSaving ? 'Saving to Firestore…' : "Save Today's Scores"}</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
