import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Settings,
  UserPlus,
  RotateCcw,
  Cloud,
  CloudCheck,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Database,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Users,
  Sparkles,
  Award,
  BookOpen
} from 'lucide-react';

import type { CategoryKey, ScoreValue, ScoresState, GradeHistoryState } from './types';
import {
  getRosterFromFirestore,
  saveRosterToFirestore,
  getDailyScoresFromFirestore,
  saveDailyScoresToFirestore,
  getGradeHistoryFromFirestore,
  getAppConfigFromFirestore,
  saveAppConfigToFirestore,
  getLoggedDatesForGrade
} from './lib/firebase';
import { MovableMascot } from './components/MovableMascot';

const GRADES = [6, 7, 8, 9, 10, 11, 12];
const CATEGORIES: CategoryKey[] = ['engagement', 'responsibility', 'respect'];
const CATEGORY_LABELS: Record<CategoryKey, string> = {
  engagement: 'Engagement',
  responsibility: 'Responsibility',
  respect: 'Respect'
};
const CODES: ScoreValue[] = ['4', '3', '2', '1'];

// Default starter roster per grade if empty
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
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState<boolean>(false);
  const [loggedDates, setLoggedDates] = useState<{ date: string; dateDisplay: string; updatedAt: number }[]>([]);
  
  const [saveStatus, setSaveStatus] = useState<string>('Scores sync to Firestore as you grade.');
  const [statusType, setStatusType] = useState<'info' | 'ok' | 'err'>('info');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isFirestoreConnected, setIsFirestoreConnected] = useState<boolean>(true);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Formatted date displays
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

  // Load config on startup
  useEffect(() => {
    async function initSettings() {
      // Check local storage first
      const localTeacher = localStorage.getItem('config:teacherName');
      const localUrl = localStorage.getItem('config:webAppUrl');
      if (localTeacher) setTeacherName(localTeacher);
      if (localUrl) setWebAppUrl(localUrl);

      // Check Firestore config
      const remoteConfig = await getAppConfigFromFirestore();
      if (remoteConfig) {
        if (remoteConfig.teacherName) {
          setTeacherName(remoteConfig.teacherName);
          localStorage.setItem('config:teacherName', remoteConfig.teacherName);
        }
        if (remoteConfig.webAppUrl) {
          setWebAppUrl(remoteConfig.webAppUrl);
          localStorage.setItem('config:webAppUrl', remoteConfig.webAppUrl);
        }
      }
    }
    initSettings();
  }, []);

  // Load grade data when grade or date changes
  const loadGradeData = useCallback(async (grade: number, dateISO: string) => {
    setIsSaving(true);

    // 1. Load Roster: Try Firestore -> then LocalStorage -> then Defaults
    let currentRoster: string[] = [];
    const remoteRoster = await getRosterFromFirestore(grade);
    if (remoteRoster && remoteRoster.length > 0) {
      currentRoster = remoteRoster;
      localStorage.setItem(`roster:${grade}`, JSON.stringify(currentRoster));
    } else {
      const localRoster = localStorage.getItem(`roster:${grade}`);
      if (localRoster) {
        currentRoster = JSON.parse(localRoster);
      } else {
        currentRoster = DEFAULT_INITIAL_ROSTERS[grade] || [];
        if (currentRoster.length > 0) {
          saveRosterToFirestore(grade, currentRoster);
          localStorage.setItem(`roster:${grade}`, JSON.stringify(currentRoster));
        }
      }
    }
    setRoster(currentRoster);

    // 2. Load Scores: Try Firestore -> then LocalStorage -> then Defaults
    let currentScores: ScoresState = {};
    const remoteScores = await getDailyScoresFromFirestore(grade, dateISO);
    if (remoteScores && Object.keys(remoteScores).length > 0) {
      currentScores = remoteScores;
    } else {
      const localScores = localStorage.getItem(`scores:${grade}:${dateISO}`);
      if (localScores) {
        currentScores = JSON.parse(localScores);
      }
    }

    // Ensure all roster members have default score 3 if unassigned
    currentRoster.forEach((name) => {
      if (!currentScores[name]) {
        currentScores[name] = { engagement: '3', responsibility: '3', respect: '3' };
      }
    });
    setScores(currentScores);

    // 3. Load Student History / Averages from Firestore
    const gradeHistory = await getGradeHistoryFromFirestore(grade);
    setHistory(gradeHistory);

    // 4. Fetch available logged dates
    const dates = await getLoggedDatesForGrade(grade);
    setLoggedDates(dates);

    setIsSaving(false);
  }, []);

  useEffect(() => {
    loadGradeData(currentGrade, selectedDate);
  }, [currentGrade, selectedDate, loadGradeData]);

  // Debounced auto-save scores to Firestore & LocalStorage
  const triggerAutoSave = (newScores: ScoresState, updatedRoster = roster) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      // Save locally
      localStorage.setItem(`scores:${currentGrade}:${selectedDate}`, JSON.stringify(newScores));
      localStorage.setItem(`roster:${currentGrade}`, JSON.stringify(updatedRoster));

      // Save to Firestore
      const ok = await saveDailyScoresToFirestore(
        currentGrade,
        selectedDate,
        dateDisplay,
        teacherName || 'Teacher',
        newScores
      );

      if (ok) {
        setSaveStatus(`Saved to Firestore (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
        setStatusType('ok');
        setIsFirestoreConnected(true);
      } else {
        setSaveStatus('Scores saved locally. Firestore sync pending.');
        setStatusType('info');
      }
    }, 400);
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

  // Remove single student
  const handleRemoveStudent = async (student: string) => {
    if (confirm(`Remove ${student} from Grade ${currentGrade}?`)) {
      const updatedRoster = roster.filter((n) => n !== student);
      const newScores = { ...scores };
      delete newScores[student];

      setRoster(updatedRoster);
      setScores(newScores);

      // Persist Roster & Scores to Firestore
      await saveRosterToFirestore(currentGrade, updatedRoster);
      triggerAutoSave(newScores, updatedRoster);
    }
  };

  // Add single student
  const handleAddStudent = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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

    await saveRosterToFirestore(currentGrade, updatedRoster);
    triggerAutoSave(newScores, updatedRoster);
    setSaveStatus(`Added ${name} to Grade ${currentGrade}`);
    setStatusType('ok');
  };

  // Bulk add students
  const handleBulkAdd = async () => {
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

    await saveRosterToFirestore(currentGrade, updatedRoster);
    triggerAutoSave(newScores, updatedRoster);
    setSaveStatus(`Added ${lines.length} students to Grade ${currentGrade}`);
    setStatusType('ok');
  };

  // Reset all students in current grade to 3
  const handleClearAllToThree = () => {
    if (roster.length === 0) return;
    if (
      confirm(
        `Reset today's scores for all ${roster.length} students in Grade ${currentGrade} back to 3? This will overwrite today's entries for this grade.`
      )
    ) {
      const newScores: ScoresState = {};
      roster.forEach((name) => {
        newScores[name] = { engagement: '3', responsibility: '3', respect: '3' };
      });
      setScores(newScores);
      triggerAutoSave(newScores);
      setSaveStatus(`Reset all ${roster.length} students in Grade ${currentGrade} to 3.`);
      setStatusType('info');
    }
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
      currentGrade,
      selectedDate,
      dateDisplay,
      teacherName,
      scores
    );

    await saveRosterToFirestore(currentGrade, roster);
    await saveAppConfigToFirestore({ teacherName, webAppUrl });

    // Refresh history
    const updatedHistory = await getGradeHistoryFromFirestore(currentGrade);
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
      const histories = data.history || {};

      let importedCount = 0;
      for (const gradeKey of Object.keys(rosters)) {
        const grade = parseInt(gradeKey, 10);
        if (!GRADES.includes(grade)) continue;

        const names = (rosters[gradeKey] || []).map((n: string) => String(n).trim()).filter(Boolean);
        if (names.length) {
          const merged = Array.from(new Set([...(roster || []), ...names])).sort((a, b) => a.localeCompare(b));
          await saveRosterToFirestore(grade, merged);
          importedCount += names.length;
        }
      }

      setSaveStatus(`Sync complete! Synced ${importedCount} student names from Sheet.`);
      setStatusType('ok');
      await loadGradeData(currentGrade, selectedDate);
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

  return (
    <div className="min-h-screen bg-[#F6F4EF] text-[#262A2F] font-sans pb-32">
      {/* Movable Mascot / Helper Character (Controlled with Arrow keys Left, Right, Up, Down) */}
      <MovableMascot />

      {/* Main Container */}
      <div className="max-w-[940px] mx-auto px-4 pt-5 pb-8">
        {/* Top Header */}
        <header className="sticky top-0 z-20 bg-[#F6F4EF]/95 backdrop-blur-xs border-b border-[#DCD7CC] pt-3 pb-3.5 mb-5 transition-all">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <h1 className="font-serif-fraunces font-semibold text-2xl tracking-tight text-[#262A2F] flex items-center gap-2">
                <span className="text-[#1F6F6B]">Process Score</span> Daily Checker
              </h1>
              <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#E4EEEC] text-[#164F4C] border border-[#1F6F6B]/30">
                <Database className="w-3 h-3 text-[#1F6F6B]" />
                <span>Firestore Active</span>
              </span>
            </div>

            {/* Date Navigator Stamp */}
            <div className="flex items-center gap-1.5 bg-white border border-[#DCD7CC] rounded-full px-2.5 py-1 shadow-2xs">
              <button
                id="prevDateBtn"
                onClick={() => shiftDate(-1)}
                className="p-1 text-[#6B7078] hover:text-[#1F6F6B] rounded-full transition"
                title="Previous Day"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <label htmlFor="datePickerInput" className="cursor-pointer flex items-center gap-1.5 px-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#1F6F6B]" />
                <span className="font-mono-jb text-xs text-[#262A2F] font-medium">{dateDisplay}</span>
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
                className="p-1 text-[#6B7078] hover:text-[#1F6F6B] rounded-full transition"
                title="Next Day"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              {selectedDate !== new Date().toISOString().slice(0, 10) && (
                <button
                  id="todayBtn"
                  onClick={jumpToToday}
                  className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#E4EEEC] text-[#164F4C] hover:bg-[#1F6F6B] hover:text-white transition ml-1"
                >
                  Today
                </button>
              )}
            </div>
          </div>

          {/* Controls bar */}
          <div className="flex items-center gap-2.5 mt-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <label htmlFor="teacherNameInput" className="text-xs font-semibold text-[#6B7078] uppercase tracking-wider">
                Teacher
              </label>
              <input
                id="teacherNameInput"
                type="text"
                value={teacherName}
                placeholder="Your name"
                onChange={(e) => {
                  setTeacherName(e.target.value);
                  localStorage.setItem('config:teacherName', e.target.value);
                }}
                onBlur={() => saveAppConfigToFirestore({ teacherName })}
                className="font-medium text-sm px-3 py-1.5 rounded-lg border border-[#DCD7CC] bg-white text-[#262A2F] w-36 focus:outline-2 focus:outline-[#1F6F6B] shadow-2xs transition"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <label htmlFor="gradeSelect" className="text-xs font-semibold text-[#6B7078] uppercase tracking-wider">
                Grade
              </label>
              <select
                id="gradeSelect"
                value={currentGrade}
                onChange={(e) => setCurrentGrade(parseInt(e.target.value, 10))}
                className="font-semibold text-sm px-3 py-1.5 pr-8 rounded-lg border border-[#DCD7CC] bg-white text-[#262A2F] cursor-pointer focus:outline-2 focus:outline-[#1F6F6B] shadow-2xs transition"
              >
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    Grade {g}
                  </option>
                ))}
              </select>
            </div>

            <button
              id="clearAllBtn"
              onClick={handleClearAllToThree}
              className="px-3 py-1.5 rounded-lg border border-[#DCD7CC] bg-white hover:border-[#B5583D] hover:text-[#B5583D] text-[#6B7078] font-semibold text-xs transition shadow-2xs cursor-pointer flex items-center gap-1"
              title="Reset every student in this grade back to 3"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear all &amp; reset to 3</span>
            </button>

            <button
              id="gearBtn"
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`p-2 rounded-lg border border-[#DCD7CC] bg-white hover:text-[#262A2F] text-[#6B7078] transition shadow-2xs cursor-pointer ${
                settingsOpen ? 'bg-[#E4EEEC] text-[#164F4C] border-[#1F6F6B]' : ''
              }`}
              title="Settings & Integrations"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Progress indicator */}
            <div className="ml-auto flex items-center gap-2 text-xs text-[#6B7078] font-semibold">
              <span id="progressText">
                {scoredCount} / {roster.length} scored
              </span>
              <div className="w-24 h-1.5 bg-[#DCD7CC] rounded-full overflow-hidden">
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
              className="mt-3 p-4 border border-dashed border-[#DCD7CC] rounded-xl bg-white shadow-xs animate-fade-in space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-sm text-[#262A2F] flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-[#1F6F6B]" />
                    <span>Firestore Database &amp; Sync Settings</span>
                  </h3>
                  <p className="text-xs text-[#6B7078] mt-0.5 leading-relaxed">
                    Student rosters, daily score checks, and multi-day averages are synced in real time to your cloud Firestore database. You can also connect a Google Apps Script Web App URL for Google Sheet synchronization.
                  </p>
                </div>
                <button
                  id="closeSettingsBtn"
                  onClick={() => setSettingsOpen(false)}
                  className="text-[#6B7078] hover:text-[#262A2F] text-xs font-semibold p-1"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div>
                  <label htmlFor="webAppUrlInput" className="block text-[11px] font-semibold text-[#6B7078] uppercase mb-1">
                    Google Apps Script Web App URL (Optional)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="webAppUrlInput"
                      type="text"
                      value={webAppUrl}
                      onChange={(e) => setWebAppUrl(e.target.value)}
                      placeholder="https://script.google.com/macros/s/.../exec"
                      className="flex-1 px-3 py-1.5 border border-[#DCD7CC] rounded-lg font-mono-jb text-xs bg-[#F6F4EF] focus:outline-2 focus:outline-[#1F6F6B]"
                    />
                    <button
                      id="saveUrlBtn"
                      onClick={() => {
                        localStorage.setItem('config:webAppUrl', webAppUrl);
                        saveAppConfigToFirestore({ webAppUrl });
                        setSaveStatus('Settings saved to Firestore.');
                        setStatusType('ok');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#1F6F6B] hover:bg-[#164F4C] text-white font-semibold text-xs transition shadow-2xs cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                </div>

                <div className="flex items-end gap-2">
                  <button
                    id="exportCsvBtn"
                    onClick={handleExportCSV}
                    className="flex-1 px-3 py-2 rounded-lg border border-[#DCD7CC] bg-[#F6F4EF] hover:bg-[#E4EEEC] text-[#164F4C] font-semibold text-xs transition flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-[#1F6F6B]" />
                    <span>Export CSV Summary</span>
                  </button>

                  <button
                    id="bulkAddToggleBtn"
                    onClick={() => setShowBulkAdd(!showBulkAdd)}
                    className="flex-1 px-3 py-2 rounded-lg border border-[#DCD7CC] bg-[#F6F4EF] hover:bg-[#E4EEEC] text-[#164F4C] font-semibold text-xs transition flex items-center justify-center gap-1.5"
                  >
                    <Users className="w-3.5 h-3.5 text-[#1F6F6B]" />
                    <span>Bulk Add Names</span>
                  </button>
                </div>
              </div>

              {/* Bulk add textarea */}
              {showBulkAdd && (
                <div className="pt-2 border-t border-[#DCD7CC] space-y-2">
                  <label htmlFor="bulkTextarea" className="text-xs font-semibold text-[#262A2F]">
                    Paste student names (one per line, e.g. "Last, First"):
                  </label>
                  <textarea
                    id="bulkTextarea"
                    rows={4}
                    value={bulkInput}
                    onChange={(e) => setBulkInput(e.target.value)}
                    placeholder="Smith, John&#10;Doe, Jane&#10;Taylor, Sam"
                    className="w-full p-2.5 text-xs font-mono-jb border border-[#DCD7CC] rounded-lg bg-[#F6F4EF] focus:outline-2 focus:outline-[#1F6F6B]"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      id="cancelBulkBtn"
                      onClick={() => setShowBulkAdd(false)}
                      className="px-3 py-1 text-xs font-semibold text-[#6B7078] hover:text-[#262A2F]"
                    >
                      Cancel
                    </button>
                    <button
                      id="importBulkBtn"
                      onClick={handleBulkAdd}
                      className="px-3 py-1 bg-[#1F6F6B] text-white rounded-md text-xs font-semibold hover:bg-[#164F4C]"
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
        <div className="flex gap-2 mb-4 flex-wrap">
          <form onSubmit={handleAddStudent} className="flex-1 min-w-[240px] flex gap-2">
            <input
              id="newStudentInput"
              type="text"
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
              placeholder="Add a student to this grade (Last, First)"
              className="flex-1 px-3.5 py-2 border border-[#DCD7CC] rounded-lg text-sm bg-white focus:outline-2 focus:outline-[#1F6F6B] shadow-2xs transition"
            />
            <button
              id="addStudentBtn"
              type="submit"
              className="px-4 py-2 rounded-lg border border-[#1F6F6B] bg-white text-[#164F4C] hover:bg-[#E4EEEC] font-semibold text-xs transition shadow-2xs cursor-pointer flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5 text-[#1F6F6B]" />
              <span>Add student</span>
            </button>
          </form>

          {webAppUrl && (
            <button
              id="importBtn"
              onClick={handleSyncWithSheet}
              disabled={isSyncing}
              className="px-3.5 py-2 rounded-lg border border-[#6B7078] hover:border-[#1F6F6B] hover:text-[#164F4C] hover:bg-[#E4EEEC] text-[#6B7078] font-semibold text-xs transition shadow-2xs cursor-pointer flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{isSyncing ? 'Syncing…' : 'Sync roster from Sheet'}</span>
            </button>
          )}
        </div>

        {/* Class Averages Bar */}
        {roster.length > 0 && (
          <div className="mb-4 bg-white border border-[#DCD7CC] rounded-xl px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap shadow-2xs">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-[#1F6F6B]" />
              <span className="font-semibold text-xs text-[#262A2F]">Grade {currentGrade} Daily Class Average:</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-xs font-mono-jb">
                <span className="text-[#6B7078] uppercase text-[10px] font-bold">Engagement:</span>
                <span className="font-bold text-[#164F4C] bg-[#E4EEEC] px-1.5 py-0.5 rounded">{classAverages.engagement}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono-jb">
                <span className="text-[#6B7078] uppercase text-[10px] font-bold">Responsibility:</span>
                <span className="font-bold text-[#164F4C] bg-[#E4EEEC] px-1.5 py-0.5 rounded">{classAverages.responsibility}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono-jb">
                <span className="text-[#6B7078] uppercase text-[10px] font-bold">Respect:</span>
                <span className="font-bold text-[#164F4C] bg-[#E4EEEC] px-1.5 py-0.5 rounded">{classAverages.respect}</span>
              </div>
            </div>
          </div>
        )}

        {/* Roster Student List */}
        <div id="roster" className="flex flex-col gap-2.5">
          {roster.length === 0 ? (
            <div className="py-12 px-6 text-center text-[#6B7078] border border-dashed border-[#DCD7CC] rounded-2xl bg-white shadow-xs">
              <strong className="block text-[#262A2F] font-serif-fraunces text-lg mb-1 font-semibold">
                No students in Grade {currentGrade} yet
              </strong>
              <p className="text-sm">Add students above or paste a class list in settings to start tracking this grade.</p>
            </div>
          ) : (
            roster.map((name) => {
              const s = scores[name] || { engagement: '', responsibility: '', respect: '' };
              const complete = studentIsComplete(name);

              return (
                <div
                  key={name}
                  data-name={name}
                  className={`bg-white border rounded-xl p-3 px-3.5 flex items-center gap-3.5 flex-wrap transition-all shadow-2xs ${
                    complete ? 'border-[#1F6F6B] ring-1 ring-[#1F6F6B]/30' : 'border-[#DCD7CC]'
                  }`}
                >
                  {/* Student Name and Actions */}
                  <div className="min-w-[160px] flex-shrink-0 flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${
                        complete ? 'bg-[#1F6F6B]' : 'bg-[#DCD7CC]'
                      }`}
                    />
                    <span className="font-semibold text-[14px] text-[#262A2F] truncate max-w-[170px]" title={name}>
                      {name}
                    </span>

                    <button
                      id={`clearBtn-${name.replace(/\s+/g, '_')}`}
                      onClick={() => handleClearStudent(name)}
                      className="text-[10px] font-bold uppercase tracking-wider text-[#6B7078] hover:text-[#164F4C] hover:bg-[#E4EEEC] px-1.5 py-0.5 rounded opacity-60 hover:opacity-100 transition cursor-pointer"
                      title="Reset this student's scores to 3"
                    >
                      Clear
                    </button>

                    <button
                      id={`removeBtn-${name.replace(/\s+/g, '_')}`}
                      onClick={() => handleRemoveStudent(name)}
                      className="text-xs text-[#6B7078] hover:text-[#B5583D] opacity-40 hover:opacity-100 p-0.5 transition cursor-pointer"
                      title="Remove student"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Rating Category Code Buttons */}
                  <div className="flex gap-4 flex-wrap flex-1 min-w-[280px]">
                    {CATEGORIES.map((cat) => (
                      <div key={cat} className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wider text-[#6B7078] font-bold">
                          {CATEGORY_LABELS[cat]}
                        </span>
                        <div className="flex gap-1">
                          {CODES.map((code) => {
                            const isActive = s[cat] === code;
                            return (
                              <button
                                key={code}
                                id={`scoreBtn-${name.replace(/\s+/g, '_')}-${cat}-${code}`}
                                type="button"
                                onClick={() => handleScoreClick(name, cat, code)}
                                className={`w-8 h-7.5 rounded-md border font-mono-jb text-xs font-semibold transition-all cursor-pointer ${
                                  isActive
                                    ? 'bg-[#1F6F6B] border-[#1F6F6B] text-white shadow-2xs'
                                    : 'bg-[#F6F4EF] border-[#DCD7CC] text-[#6B7078] hover:border-[#1F6F6B] hover:text-[#1F6F6B]'
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
                  <div className="flex gap-1.5 ml-auto flex-shrink-0 pl-3 border-l border-[#DCD7CC]">
                    {CATEGORIES.map((cat) => {
                      const avg = computeStudentCategoryAverage(name, cat);
                      const isEmpty = avg === null;

                      return (
                        <div
                          key={cat}
                          className={`flex flex-col items-center justify-center w-14 py-1 px-1 rounded-lg border text-center transition-all ${
                            isEmpty
                              ? 'bg-[#F6F4EF] border-[#DCD7CC]'
                              : 'bg-[#E4EEEC] border-[#1F6F6B]/30'
                          }`}
                        >
                          <span
                            className={`text-[8.5px] uppercase tracking-wider font-bold leading-tight ${
                              isEmpty ? 'text-[#6B7078]' : 'text-[#164F4C]'
                            }`}
                          >
                            {CATEGORY_LABELS[cat].slice(0, 4)}
                          </span>
                          <span
                            className={`font-mono-jb text-[13px] font-bold leading-snug mt-0.5 ${
                              isEmpty ? 'text-[#6B7078]' : 'text-[#164F4C]'
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
        <div className="mt-8 p-4 bg-white border border-[#DCD7CC] rounded-xl text-xs text-[#6B7078] space-y-1.5 shadow-2xs">
          <div className="font-semibold text-[#262A2F] flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-[#1F6F6B]" />
            <span>Process Score Rubric Scale</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono-jb text-[11px]">
            <div className="p-1.5 rounded bg-[#F6F4EF] border border-[#DCD7CC]">
              <strong className="text-[#164F4C]">4:</strong> Exceeding expectations
            </div>
            <div className="p-1.5 rounded bg-[#F6F4EF] border border-[#DCD7CC]">
              <strong className="text-[#164F4C]">3:</strong> Consistent &amp; meeting goals
            </div>
            <div className="p-1.5 rounded bg-[#F6F4EF] border border-[#DCD7CC]">
              <strong className="text-[#164F4C]">2:</strong> Developing / partial support
            </div>
            <div className="p-1.5 rounded bg-[#F6F4EF] border border-[#DCD7CC]">
              <strong className="text-[#B5583D]">1:</strong> Direct intervention required
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Sticky Save Bar */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-xs border-t border-[#DCD7CC] py-3 px-4 shadow-lg">
        <div className="max-w-[940px] mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            {statusType === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-[#1F6F6B] flex-shrink-0" />
            ) : statusType === 'err' ? (
              <AlertCircle className="w-4 h-4 text-[#B5583D] flex-shrink-0" />
            ) : (
              <Cloud className="w-4 h-4 text-[#6B7078] flex-shrink-0" />
            )}
            <span
              id="saveStatus"
              className={`text-xs font-medium ${
                statusType === 'ok'
                  ? 'text-[#164F4C] font-semibold'
                  : statusType === 'err'
                  ? 'text-[#B5583D] font-semibold'
                  : 'text-[#6B7078]'
              }`}
            >
              {saveStatus}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="submitBtn"
              onClick={handleManualSave}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-lg bg-[#1F6F6B] hover:bg-[#164F4C] text-white font-bold text-xs transition shadow-sm hover:shadow active:scale-98 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              <Database className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving to Firestore…' : "Save today's scores to Firestore"}</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
