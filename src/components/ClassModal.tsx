import React, { useState, useEffect } from 'react';
import { Plus, Check, Trash2, Layers, Sparkles, BookOpen } from 'lucide-react';
import type { ClassDoc } from '../types';

export const CLASS_COLORS: { id: string; name: string; bg: string; text: string; border: string; pillBg: string }[] = [
  { id: 'teal', name: 'Teal', bg: '#E8F2F0', text: '#1F6F6B', border: '#1F6F6B', pillBg: '#1F6F6B' },
  { id: 'indigo', name: 'Indigo', bg: '#EEF2FF', text: '#4338CA', border: '#4F46E5', pillBg: '#4F46E5' },
  { id: 'amber', name: 'Amber', bg: '#FEF3C7', text: '#B45309', border: '#D97706', pillBg: '#D97706' },
  { id: 'emerald', name: 'Emerald', bg: '#ECFDF5', text: '#047857', border: '#059669', pillBg: '#059669' },
  { id: 'rose', name: 'Rose', bg: '#FFE4E6', text: '#BE123C', border: '#E11D48', pillBg: '#E11D48' },
  { id: 'blue', name: 'Blue', bg: '#EFF6FF', text: '#1D4ED8', border: '#2563EB', pillBg: '#2563EB' },
  { id: 'purple', name: 'Purple', bg: '#F3E8FF', text: '#6D28D9', border: '#7C3AED', pillBg: '#7C3AED' },
];

const COMMON_SUBJECTS = ['Math', 'Science', 'English / Language Arts', 'Social Studies', 'History', 'Art', 'PE', 'Music', 'Robotics', 'Homeroom', 'General'];
const COMMON_PERIODS = ['Period 1', 'Period 2', 'Period 3', 'Period 4', 'Period 5', 'Period 6', 'Period 7', 'Period 8', 'Block A', 'Block B', 'Morning', 'Afternoon'];
const GRADES = [6, 7, 8, 9, 10, 11, 12];

interface ClassModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialClass?: ClassDoc | null;
  existingClassesCount: number;
  onClose: () => void;
  onSave: (classData: Omit<ClassDoc, 'createdAt' | 'updatedAt'> & { starterStudentsText?: string }) => Promise<void>;
  onDelete?: (classId: string) => Promise<void>;
}

export function ClassModal({
  isOpen,
  mode,
  initialClass,
  existingClassesCount,
  onClose,
  onSave,
  onDelete,
}: ClassModalProps) {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState<number>(8);
  const [subject, setSubject] = useState('');
  const [period, setPeriod] = useState('');
  const [color, setColor] = useState('teal');
  const [starterStudentsText, setStarterStudentsText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && initialClass) {
        setName(initialClass.name);
        setGrade(initialClass.grade);
        setSubject(initialClass.subject || '');
        setPeriod(initialClass.period || '');
        setColor(initialClass.color || 'teal');
        setStarterStudentsText('');
      } else {
        // Suggested name for new class
        const defaultGrade = 8;
        setName(`Grade ${defaultGrade} - Period ${existingClassesCount + 1}`);
        setGrade(defaultGrade);
        setSubject('');
        setPeriod(`Period ${existingClassesCount + 1}`);
        const colorOption = CLASS_COLORS[existingClassesCount % CLASS_COLORS.length].id;
        setColor(colorOption);
        setStarterStudentsText('');
      }
      setError(null);
      setShowDeleteConfirm(false);
      setIsSubmitting(false);
    }
  }, [isOpen, mode, initialClass, existingClassesCount]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter a class name.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSave({
        id: initialClass?.id || `cls_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: trimmedName,
        grade,
        subject: subject.trim() || undefined,
        period: period.trim() || undefined,
        color,
        students: initialClass?.students || [],
        starterStudentsText: mode === 'create' ? starterStudentsText : undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save class. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!initialClass?.id || !onDelete) return;
    setIsSubmitting(true);
    try {
      await onDelete(initialClass.id);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete class.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#18191B]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white border-2 border-[#18191B] rounded-2xl p-6 max-w-lg w-full bold-shadow space-y-5 my-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#E8F2F0] border-2 border-[#18191B] flex items-center justify-center text-[#1F6F6B] flex-shrink-0">
              <Layers className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="font-serif-fraunces font-black text-xl text-[#18191B]">
                {mode === 'create' ? 'Create New Class' : 'Edit Class Details'}
              </h3>
              <p className="text-xs text-[#5C626A] font-medium">
                {mode === 'create'
                  ? 'Add a section, subject, or period to your teacher account'
                  : `Managing settings for ${initialClass?.name}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg border-2 border-[#18191B] hover:bg-[#18191B] hover:text-white flex items-center justify-center font-black text-xs transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 bg-[#FBEBE7] border-2 border-[#D94826] rounded-xl text-xs font-bold text-[#D94826]">
            {error}
          </div>
        )}

        {/* Delete Confirmation View */}
        {showDeleteConfirm ? (
          <div className="p-4 bg-[#FBEBE7] border-2 border-[#D94826] rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-[#D94826]">
              <Trash2 className="w-5 h-5 stroke-[2.5]" />
              <h4 className="font-black text-sm uppercase tracking-wider">Confirm Delete Class</h4>
            </div>
            <p className="text-xs text-[#18191B] font-medium leading-relaxed">
              Are you sure you want to delete <strong className="font-black">{initialClass?.name}</strong>?
              This will remove the class and its student roster list from your teacher account.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3.5 py-1.5 rounded-lg border-2 border-[#18191B] bg-white text-xs font-bold hover:bg-[#F6F5F0] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleDelete}
                className="px-4 py-1.5 rounded-lg bg-[#D94826] text-white border-2 border-[#18191B] text-xs font-black uppercase tracking-wider hover:bg-[#B8381A] transition bold-shadow-sm cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? 'Deleting…' : 'Yes, Delete Class'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Class Name */}
            <div>
              <label htmlFor="classNameInput" className="block text-[11px] font-black text-[#18191B] uppercase tracking-wider mb-1">
                Class Name <span className="text-[#D94826]">*</span>
              </label>
              <input
                id="classNameInput"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Period 2 - Grade 8 Science"
                className="w-full px-3.5 py-2 border-2 border-[#18191B] rounded-lg text-sm bg-white font-bold placeholder:text-[#5C626A]/60 focus:outline-none focus:ring-2 focus:ring-[#1F6F6B] bold-shadow-sm transition"
              />
            </div>

            {/* Grade Level & Period in two columns */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="classGradeSelect" className="block text-[11px] font-black text-[#18191B] uppercase tracking-wider mb-1">
                  Grade Level
                </label>
                <select
                  id="classGradeSelect"
                  value={grade}
                  onChange={(e) => setGrade(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 border-2 border-[#18191B] rounded-lg text-xs font-black bg-white focus:outline-none focus:ring-2 focus:ring-[#1F6F6B] cursor-pointer bold-shadow-sm"
                >
                  {GRADES.map((g) => (
                    <option key={g} value={g} className="font-bold">
                      Grade {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="classPeriodInput" className="block text-[11px] font-black text-[#18191B] uppercase tracking-wider mb-1">
                  Period / Block
                </label>
                <input
                  id="classPeriodInput"
                  type="text"
                  value={period}
                  list="periodSuggestions"
                  onChange={(e) => setPeriod(e.target.value)}
                  placeholder="e.g. Period 1"
                  className="w-full px-3 py-2 border-2 border-[#18191B] rounded-lg text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-[#1F6F6B] bold-shadow-sm"
                />
                <datalist id="periodSuggestions">
                  {COMMON_PERIODS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Subject / Course */}
            <div>
              <label htmlFor="classSubjectInput" className="block text-[11px] font-black text-[#18191B] uppercase tracking-wider mb-1">
                Subject / Course Name (Optional)
              </label>
              <input
                id="classSubjectInput"
                type="text"
                value={subject}
                list="subjectSuggestions"
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Science, Mathematics, Robotics"
                className="w-full px-3 py-2 border-2 border-[#18191B] rounded-lg text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-[#1F6F6B] bold-shadow-sm"
              />
              <datalist id="subjectSuggestions">
                {COMMON_SUBJECTS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            {/* Color Accent Picker */}
            <div>
              <label className="block text-[11px] font-black text-[#18191B] uppercase tracking-wider mb-1.5">
                Class Color Accent
              </label>
              <div className="flex items-center gap-2.5 flex-wrap">
                {CLASS_COLORS.map((c) => {
                  const isSelected = color === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setColor(c.id)}
                      className={`h-7 px-2.5 rounded-lg border-2 flex items-center gap-1.5 text-xs font-black transition cursor-pointer ${
                        isSelected
                          ? 'border-[#18191B] -translate-y-0.5 bold-shadow-sm'
                          : 'border-transparent hover:border-[#18191B]/40 opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c.bg, color: c.text }}
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.pillBg }} />
                      <span className="text-[11px] font-bold">{c.name}</span>
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Starter Roster (Only on create) */}
            {mode === 'create' && (
              <div className="pt-2 border-t-2 border-[#18191B]/15">
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="starterStudentsInput" className="text-[11px] font-black text-[#18191B] uppercase tracking-wider">
                    Initial Student Names (Optional)
                  </label>
                  <span className="text-[10px] text-[#5C626A] font-mono-jb">One name per line</span>
                </div>
                <textarea
                  id="starterStudentsInput"
                  rows={3}
                  value={starterStudentsText}
                  onChange={(e) => setStarterStudentsText(e.target.value)}
                  placeholder="Adams, Lucas&#10;Baker, Chloe&#10;Chen, Ethan"
                  className="w-full p-2.5 border-2 border-[#18191B] rounded-lg font-mono-jb text-xs font-bold bg-[#F6F5F0] focus:outline-none focus:ring-2 focus:ring-[#1F6F6B]"
                />
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-3 border-t-2 border-[#18191B]">
              {mode === 'edit' && onDelete ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-xs font-bold text-[#D94826] hover:text-[#B8381A] hover:bg-[#FBEBE7] px-2.5 py-1.5 rounded-lg border border-transparent hover:border-[#D94826]/30 transition cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Delete Class</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border-2 border-[#18191B] text-xs font-bold text-[#18191B] hover:bg-[#F6F5F0] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-[#18191B] hover:bg-[#1F6F6B] text-white border-2 border-[#18191B] text-xs font-black uppercase tracking-wider bold-shadow-sm transition cursor-pointer flex items-center gap-1.5 active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-60"
                >
                  {mode === 'create' ? <Plus className="w-4 h-4 stroke-[3]" /> : <Check className="w-4 h-4 stroke-[3]" />}
                  <span>{isSubmitting ? 'Saving…' : mode === 'create' ? 'Create Class' : 'Save Changes'}</span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
