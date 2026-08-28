export type CategoryKey = 'engagement' | 'responsibility' | 'respect';

export type ScoreValue = '1' | '2' | '3' | '4' | '';

export interface StudentScoreMap {
  engagement: string;
  responsibility: string;
  respect: string;
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

export interface DailyLogDoc {
  id?: string;
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
