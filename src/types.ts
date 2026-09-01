export type CategoryKey = 'engagement' | 'responsibility' | 'respect';

export type ScoreValue = '1' | '2' | '3' | '4' | '';

export interface StudentScoreMap {
  engagement: string;
  responsibility: string;
  respect: string;
  comment?: string;
  notes?: string;
}

export interface ScoresState {
  [studentName: string]: StudentScoreMap;
}

export interface StudentCategoryHistory {
  sum: number;
  count: number;
}

export interface GradeHistoryState {
  [studentName: string]: {
    [key in CategoryKey]?: StudentCategoryHistory;
  };
}

export interface TeacherProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface ClassDoc {
  id: string;
  name: string;
  grade: number;
  subject?: string;
  period?: string;
  color?: string;
  students: string[];
  createdAt: number;
  updatedAt: number;
}

export interface DailyLogDoc {
  id?: string;
  classId?: string;
  grade: number;
  date: string; // YYYY-MM-DD
  dateDisplay: string;
  teacher: string;
  scores: ScoresState;
  updatedAt: number;
}

export interface RosterDoc {
  grade: number;
  students: string[];
  updatedAt: number;
}

export interface AppConfigDoc {
  teacherName: string;
  webAppUrl?: string;
  updatedAt: number;
}

export interface Position {
  x: number;
  y: number;
}
