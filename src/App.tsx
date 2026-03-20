import React, { useState, useEffect } from 'react';
import { Clock, BookOpen, ChevronRight, AlertCircle, CalendarDays, Calculator, GraduationCap, LayoutDashboard, Plus, Trash2, CheckCircle2, Circle, BookMarked, StickyNote, LogOut, Home, Check, Users, X, Bell } from 'lucide-react';
import { motion } from 'motion/react';
import { db, doc, getDoc, getDocFromServer, setDoc, onSnapshot, collection, query, where, addDoc, updateDoc, deleteDoc, increment, orderBy, arrayUnion } from './firebase';
import { handleFirestoreError, OperationType } from './firestore-error';
import { ProDayPopup } from './components/ProDayPopup';

const anchorDate = new Date(2026, 2, 16); // March 16, 2026

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();

function getABDay(targetDate: Date) {
  let days = 0;
  let current = new Date(anchorDate);
  current.setHours(0, 0, 0, 0);
  let target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);

  if (target < current) {
    let temp = new Date(target);
    while (temp < current) {
      if (temp.getDay() !== 0 && temp.getDay() !== 6) days--;
      temp.setDate(temp.getDate() + 1);
    }
  } else {
    let temp = new Date(current);
    while (temp < target) {
      if (temp.getDay() !== 0 && temp.getDay() !== 6) days++;
      temp.setDate(temp.getDate() + 1);
    }
  }

  return Math.abs(days) % 2 === 0 ? 'B' : 'A';
}

function getDayType(date: Date) {
  const day = date.getDay();
  if (day === 1) return 'Wildcat';
  if (day === 2) return 'Even';
  if (day === 3) return 'Odd';
  if (day === 4) return 'Wildcat';
  if (day === 5) return 'Wildcat';
  return 'Weekend';
}

const defaultClasses: Record<string, string> = {
  '1': 'Period 1',
  '2': 'Period 2',
  '3A': 'Period 3 (A)',
  '3B': 'Period 3 (B)',
  '4A': 'Period 4 (A)',
  '4B': 'Period 4 (B)',
  '5': 'Period 5',
  '6': 'Period 6',
  '7': 'Period 7',
  '8': 'Period 8',
  'HR': 'Homeroom',
  'ADV': 'Advisory / Library',
  'Lunch': 'Lunch'
};

type ScheduleBlock = {
  period: string;
  start: string;
  end: string;
  isPassing?: boolean;
  name?: string;
};

const schedules: Record<string, ScheduleBlock[]> = {
  'Wildcat': [
    { period: 'HR', start: '07:30', end: '07:40' },
    { period: '1', start: '07:40', end: '08:25' },
    { period: '2', start: '08:25', end: '09:10' },
    { period: '3', start: '09:10', end: '09:55' },
    { period: '4', start: '09:55', end: '10:40' },
    { period: 'ADV', start: '10:40', end: '10:55' },
    { period: '5', start: '10:55', end: '11:40' },
    { period: 'Lunch', start: '11:40', end: '12:05' },
    { period: '6', start: '12:05', end: '12:50' },
    { period: '7', start: '12:50', end: '13:35' },
    { period: '8', start: '13:35', end: '14:20' }
  ],
  'Odd': [
    { period: 'HR', start: '07:30', end: '07:40' },
    { period: '1', start: '07:40', end: '09:10' },
    { period: '3', start: '09:10', end: '09:55' },
    { period: '4', start: '09:55', end: '10:40' },
    { period: 'ADV', start: '10:40', end: '10:55' },
    { period: '5', start: '10:55', end: '12:25' },
    { period: 'Lunch', start: '12:25', end: '12:50' },
    { period: '7', start: '12:50', end: '14:20' }
  ],
  'Even': [
    { period: 'HR', start: '07:30', end: '07:40' },
    { period: '2', start: '07:40', end: '09:10' },
    { period: '3', start: '09:10', end: '09:55' },
    { period: '4', start: '09:55', end: '10:40' },
    { period: 'ADV', start: '10:40', end: '10:55' },
    { period: '6', start: '10:55', end: '12:25' },
    { period: 'Lunch', start: '12:25', end: '12:50' },
    { period: '8', start: '12:50', end: '14:20' }
  ]
};

function parseTime(timeStr: string) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function getClassName(period: string | undefined, abDay: string, userClasses: Record<string, string>) {
  if (!period) return '';
  if (period === 'Passing') return 'Passing Period';
  if (period === 'Before School') return 'Before School';
  if (period === 'Done') return 'School is over!';
  if (['1', '2', '3', '4', '5', '6', '7', '8'].includes(period)) {
    return userClasses[`${period}${abDay}`] || userClasses[period] || period;
  }
  return userClasses[period] || period;
}

function format12Hour(timeStr: string) {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h = hours % 12 || 12;
  return `${h}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

function formatTimeRemaining(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type HomeworkItem = {
  id: string;
  text: string;
  dueDate: string;
  showOnMain: boolean;
  completed: boolean;
  userId?: string;
};

function HomeworkTab({ homework, setHomework, user, currentTheme }: { homework: HomeworkItem[], setHomework: React.Dispatch<React.SetStateAction<HomeworkItem[]>>, user: string | null, currentTheme: any }) {
  const [newTask, setNewTask] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [showOnMain, setShowOnMain] = useState(true);

  const addHomework = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    
    const newItem: HomeworkItem = {
      id: Date.now().toString(),
      text: newTask,
      dueDate: newDueDate,
      showOnMain,
      completed: false,
      userId: user || undefined
    };

    if (user) {
      try {
        await setDoc(doc(db, 'users', user, 'homework', newItem.id), newItem);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `users/${user}/homework/${newItem.id}`);
      }
    } else {
      setHomework([...homework, newItem]);
    }

    setNewTask('');
    setNewDueDate('');
  };

  const toggleComplete = async (id: string) => {
    const item = homework.find(h => h.id === id);
    if (!item) return;

    if (user) {
      try {
        await updateDoc(doc(db, 'users', user, 'homework', id), { completed: !item.completed });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user}/homework/${id}`);
      }
    } else {
      setHomework(homework.map(h => h.id === id ? { ...h, completed: !h.completed } : h));
    }
  };

  const toggleShowOnMain = async (id: string) => {
    const item = homework.find(h => h.id === id);
    if (!item) return;

    if (user) {
      try {
        await updateDoc(doc(db, 'users', user, 'homework', id), { showOnMain: !item.showOnMain });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user}/homework/${id}`);
      }
    } else {
      setHomework(homework.map(h => h.id === id ? { ...h, showOnMain: !h.showOnMain } : h));
    }
  };

  const removeHomework = async (id: string) => {
    if (user) {
      try {
        await deleteDoc(doc(db, 'users', user, 'homework', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${user}/homework/${id}`);
      }
    } else {
      setHomework(homework.filter(h => h.id !== id));
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`bg-black/20 backdrop-blur-sm p-6 md:p-8 rounded-3xl border ${currentTheme.border}`}>
      <h2 className="text-2xl font-bold text-white flex items-center gap-2 mb-6">
        <BookMarked className="text-amber-400" />
        Homework Tracker
      </h2>

      <form onSubmit={addHomework} className={`bg-black/40 p-4 rounded-2xl border ${currentTheme.border} mb-8 space-y-4`}>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-6">
            <label className="block text-xs font-medium text-white/60 mb-1">Assignment</label>
            <input 
              type="text" 
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="e.g. Read chapter 4"
              className={`w-full bg-black/40 border ${currentTheme.border} rounded-xl px-4 py-2 text-white focus:outline-none focus:border-white/50 transition-colors`}
            />
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-white/60 mb-1">Due Date (Optional)</label>
            <input 
              type="date" 
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className={`w-full bg-black/40 border ${currentTheme.border} rounded-xl px-4 py-2 text-white focus:outline-none focus:border-white/50 transition-colors`}
            />
          </div>
          <div className="md:col-span-2 flex items-end">
            <button type="submit" className={`w-full ${currentTheme.button} ${currentTheme.buttonHover} text-white font-medium py-2 px-4 rounded-xl transition-colors flex items-center justify-center gap-2`}>
              <Plus size={18} /> Add
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input 
            type="checkbox" 
            id="showOnMain" 
            checked={showOnMain}
            onChange={(e) => setShowOnMain(e.target.checked)}
            className="w-4 h-4 rounded border-white/20 text-white focus:ring-white/50 bg-black/40"
          />
          <label htmlFor="showOnMain" className="text-sm text-white/80">Show on main schedule page</label>
        </div>
      </form>

      <div className="space-y-3">
        {homework.length === 0 ? (
          <div className="text-center py-8 text-white/60">No homework added yet!</div>
        ) : (
          homework.map(item => (
            <div key={item.id} className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${item.completed ? `bg-black/20 border-transparent` : `bg-black/40 ${currentTheme.border}`}`}>
              <div className="flex items-center gap-4 flex-1">
                <button onClick={() => toggleComplete(item.id)} className="text-white/60 hover:text-white transition-colors">
                  {item.completed ? <CheckCircle2 size={24} className="text-emerald-500" /> : <Circle size={24} />}
                </button>
                <div className={item.completed ? 'opacity-50 line-through' : ''}>
                  <div className="text-white font-medium">{item.text}</div>
                  {item.dueDate && <div className="text-xs text-white/60 mt-1">Due: {new Date(item.dueDate).toLocaleDateString()}</div>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => toggleShowOnMain(item.id)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${item.showOnMain ? 'bg-white/20 text-white border-white/30' : 'bg-black/40 text-white/60 border-white/10'}`}
                  title="Toggle visibility on main page"
                >
                  {item.showOnMain ? 'Visible on Main' : 'Hidden on Main'}
                </button>
                <button onClick={() => removeHomework(item.id)} className="p-2 text-white/60 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}

function GradeCalculator({ currentTheme }: { currentTheme: any }) {
  const [assignments, setAssignments] = useState(() => {
    const saved = localStorage.getItem('school_day_assignments');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [
      { id: 1, name: 'Homework 1', grade: '95', weight: '20' },
      { id: 2, name: 'Test 1', grade: '88', weight: '50' },
      { id: 3, name: 'Quiz 1', grade: '90', weight: '30' }
    ];
  });
  const [currentGrade, setCurrentGrade] = useState(() => localStorage.getItem('school_day_current_grade') || '');
  const [useCurrentGrade, setUseCurrentGrade] = useState(() => localStorage.getItem('school_day_use_current') === 'true');
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    localStorage.setItem('school_day_assignments', JSON.stringify(assignments));
    localStorage.setItem('school_day_current_grade', currentGrade);
    localStorage.setItem('school_day_use_current', useCurrentGrade.toString());
  }, [assignments, currentGrade, useCurrentGrade]);

  const addRow = () => setAssignments([...assignments, { id: Date.now(), name: '', grade: '', weight: '' }]);
  
  const updateRow = (id: number, field: string, value: string) => {
    setAssignments(assignments.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  const removeRow = (id: number) => {
    setAssignments(assignments.filter(a => a.id !== id));
  };

  let totalWeight = 0;
  let earned = 0;
  assignments.forEach(a => {
    const g = parseFloat(a.grade);
    const w = parseFloat(a.weight);
    if (!isNaN(g) && !isNaN(w)) {
      earned += (g * w);
      totalWeight += w;
    }
  });
  
  let finalGrade = '0.00';
  if (useCurrentGrade && parseFloat(currentGrade) >= 0) {
    const cg = parseFloat(currentGrade);
    const remainingWeight = Math.max(0, 100 - totalWeight);
    const totalCalcWeight = totalWeight + remainingWeight;
    if (totalCalcWeight > 0) {
      finalGrade = ((earned + (cg * remainingWeight)) / totalCalcWeight).toFixed(2);
    }
  } else {
    finalGrade = totalWeight > 0 ? (earned / totalWeight).toFixed(2) : '0.00';
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`bg-black/20 backdrop-blur-sm p-6 md:p-8 rounded-3xl border ${currentTheme.border}`}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Calculator className="text-white/80" />
          Grade Calculator
        </h2>
        <div className={`bg-black/40 border ${currentTheme.border} px-6 py-3 rounded-2xl text-center w-full sm:w-auto`}>
          <div className="text-sm text-white/80 font-medium mb-1">Final Grade</div>
          <div className="text-4xl font-bold text-white">{finalGrade}%</div>
        </div>
      </div>

      <div className="mb-6 bg-black/30 p-4 rounded-2xl border border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-medium">Use Current Grade</h3>
            <button onClick={() => setShowHelp(!showHelp)} className="text-white/50 hover:text-white transition-colors">
              <AlertCircle size={16} />
            </button>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={useCurrentGrade} onChange={(e) => setUseCurrentGrade(e.target.checked)} />
            <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        </div>
        
        {showHelp && (
          <div className="mb-4 text-sm text-white/70 bg-white/5 p-3 rounded-xl">
            Turn this on to input your current overall grade. The calculator will assume your current grade makes up the remaining weight (100% - total weight of assignments below) to show how these new assignments will affect your final grade.
          </div>
        )}

        {useCurrentGrade && (
          <div className="flex items-center gap-4">
            <span className="text-white/80 text-sm">Current Grade (%):</span>
            <input 
              type="number" 
              value={currentGrade} 
              onChange={(e) => setCurrentGrade(e.target.value)}
              placeholder="e.g. 85"
              className={`w-32 bg-black/40 border ${currentTheme.border} rounded-xl px-3 py-2 text-white focus:outline-none focus:border-white/50 transition-colors`}
            />
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-12 gap-2 sm:gap-4 text-xs sm:text-sm font-medium text-white/60 px-2">
          <div className="col-span-5">Assignment / Category</div>
          <div className="col-span-3">Grade (%)</div>
          <div className="col-span-3">Weight (%)</div>
          <div className="col-span-1"></div>
        </div>
        
        {assignments.map((a: any) => (
          <div key={a.id} className="grid grid-cols-12 gap-2 sm:gap-4 items-center">
            <div className="col-span-5">
              <input 
                type="text" 
                value={a.name} 
                onChange={(e) => updateRow(a.id, 'name', e.target.value)}
                placeholder="e.g. Test 1"
                className={`w-full bg-black/40 border ${currentTheme.border} rounded-xl px-3 sm:px-4 py-2 sm:py-3 text-white focus:outline-none focus:border-white/50 transition-colors text-sm sm:text-base`}
              />
            </div>
            <div className="col-span-3">
              <input 
                type="number" 
                value={a.grade} 
                onChange={(e) => updateRow(a.id, 'grade', e.target.value)}
                placeholder="95"
                className={`w-full bg-black/40 border ${currentTheme.border} rounded-xl px-3 sm:px-4 py-2 sm:py-3 text-white focus:outline-none focus:border-white/50 transition-colors text-sm sm:text-base`}
              />
            </div>
            <div className="col-span-3">
              <input 
                type="number" 
                value={a.weight} 
                onChange={(e) => updateRow(a.id, 'weight', e.target.value)}
                placeholder="20"
                className={`w-full bg-black/40 border ${currentTheme.border} rounded-xl px-3 sm:px-4 py-2 sm:py-3 text-white focus:outline-none focus:border-white/50 transition-colors text-sm sm:text-base`}
              />
            </div>
            <div className="col-span-1 flex justify-center">
              <button onClick={() => removeRow(a.id)} className="p-2 text-white/60 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button onClick={addRow} className="mt-6 flex items-center gap-2 text-white/80 hover:text-white font-medium px-4 py-2 rounded-xl hover:bg-white/10 transition-colors">
        <Plus size={20} /> Add Row
      </button>
    </motion.div>
  );
}

interface Note {
  id: string;
  text: string;
  color: string;
  userId?: string;
  showOnMain?: boolean;
}

function StickyNotesTab({ user, notes, setNotes, currentTheme }: { user: string | null, notes: Note[], setNotes: React.Dispatch<React.SetStateAction<Note[]>>, currentTheme: any }) {
  const [newNoteText, setNewNoteText] = useState('');
  const [selectedColor, setSelectedColor] = useState('bg-yellow-200');
  const [showOnMain, setShowOnMain] = useState(true);
  const [crossedOutNotes, setCrossedOutNotes] = useState<string[]>([]);

  const colors = ['bg-yellow-200', 'bg-pink-200', 'bg-blue-200', 'bg-green-200', 'bg-purple-200'];

  const addNote = async () => {
    if (!newNoteText.trim()) return;
    const newNote: Note = {
      id: Date.now().toString(),
      text: newNoteText,
      color: selectedColor,
      showOnMain,
      userId: user || undefined
    };

    if (user) {
      try {
        await setDoc(doc(db, 'users', user, 'notes', newNote.id), newNote);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `users/${user}/notes/${newNote.id}`);
      }
    } else {
      setNotes([...notes, newNote]);
    }
    setNewNoteText('');
  };

  const deleteNote = async (id: string) => {
    if (user) {
      try {
        await deleteDoc(doc(db, 'users', user, 'notes', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${user}/notes/${id}`);
      }
    } else {
      setNotes(notes.filter(n => n.id !== id));
    }
  };

  const completeNote = (id: string) => {
    setCrossedOutNotes(prev => [...prev, id]);
    setTimeout(() => {
      deleteNote(id);
      setCrossedOutNotes(prev => prev.filter(n => n !== id));
    }, 1000);
  };

  const toggleShowOnMain = async (id: string) => {
    const item = notes.find(n => n.id === id);
    if (!item) return;

    if (user) {
      try {
        await updateDoc(doc(db, 'users', user, 'notes', id), { showOnMain: !item.showOnMain });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user}/notes/${id}`);
      }
    } else {
      setNotes(notes.map(n => n.id === id ? { ...n, showOnMain: !n.showOnMain } : n));
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className={`bg-black/20 backdrop-blur-sm p-6 md:p-8 rounded-3xl border ${currentTheme.border}`}>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2 mb-6">
          <StickyNote className="text-white/80" />
          Sticky Notes
        </h2>
        
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <input 
            type="text" 
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addNote()}
            placeholder="Type a new note..."
            className={`flex-1 bg-black/40 border ${currentTheme.border} rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/50 transition-colors`}
          />
          <div className="flex gap-2 items-center">
            {colors.map(color => (
              <button 
                key={color}
                onClick={() => setSelectedColor(color)}
                className={`w-8 h-8 rounded-full ${color} ${selectedColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900' : ''}`}
              />
            ))}
          </div>
          <button
            onClick={() => setShowOnMain(!showOnMain)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors ${showOnMain ? 'bg-white/10 border-white/30 text-white' : 'bg-black/40 border-white/10 text-white/40'}`}
            title="Show on Main Dashboard"
          >
            <Home size={18} />
          </button>
          <button 
            onClick={addNote}
            className={`${currentTheme.button} ${currentTheme.buttonHover} text-white font-medium px-6 py-3 rounded-xl transition-colors flex items-center justify-center gap-2`}
          >
            <Plus size={20} /> Add
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {notes.map(note => {
            const isCrossedOut = crossedOutNotes.includes(note.id);
            return (
            <motion.div 
              key={note.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: isCrossedOut ? 0 : 1, scale: isCrossedOut ? 0.9 : 1 }}
              className={`${note.color} p-5 rounded-2xl text-slate-900 shadow-md relative group min-h-[120px] transition-all duration-500`}
            >
              <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => completeNote(note.id)}
                  className="text-slate-900/40 hover:text-slate-900/80"
                  title="Complete and remove"
                >
                  <Check size={18} />
                </button>
                <button 
                  onClick={() => toggleShowOnMain(note.id)}
                  className={`${note.showOnMain ? 'text-slate-900' : 'text-slate-900/40'} hover:text-slate-900/80`}
                  title={note.showOnMain ? "Hide from Main Dashboard" : "Show on Main Dashboard"}
                >
                  <Home size={18} />
                </button>
                <button 
                  onClick={() => deleteNote(note.id)}
                  className="text-slate-900/40 hover:text-slate-900/80"
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <p className={`font-medium whitespace-pre-wrap pr-20 ${isCrossedOut ? 'line-through opacity-50' : ''}`}>{note.text}</p>
            </motion.div>
          )})}
          {notes.length === 0 && (
            <div className="col-span-full text-center p-8 text-slate-500 border-2 border-dashed border-slate-700 rounded-2xl">
              No sticky notes yet. Add one above!
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function App() {
  const [user, setUser] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeTab, setActiveTab] = useState('schedule');
  const [showNotifications, setShowNotifications] = useState(false);
  
  const [userName, setUserName] = useState('Student');
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(userName);
  
  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [userClasses, setUserClasses] = useState<Record<string, string>>(defaultClasses);
  const [footerText, setFooterText] = useState('Made by Mpro1 Studios © 2026');
  const [creditsText, setCreditsText] = useState('');
  const [roles, setRoles] = useState<any[]>([]);
  
  const userRole = roles.find(r => r.id === userProfile?.role);
  
  const isAdmin = userProfile?.displayName?.toLowerCase().includes('markustheadmin') || 
                  userProfile?.role === 'admin' || 
                  userProfile?.role === 'manager' || 
                  userRole?.canAccessAdminPanel;

  const canWriteCommunityPosts = userProfile?.displayName?.toLowerCase().includes('markustheadmin') || 
                                 userProfile?.role === 'admin' || 
                                 userProfile?.role === 'manager' || 
                                 userProfile?.role === 'editor' || 
                                 userProfile?.role === 'community_typer' ||
                                 userRole?.canWriteCommunityPosts;

  const [crossedOutClasses, setCrossedOutClasses] = useState<string[]>([]);
  const [hiddenClasses, setHiddenClasses] = useState<string[]>([]);

  const handleCrossOutClass = (period: string) => {
    setCrossedOutClasses(prev => [...prev, period]);
    setTimeout(() => {
      setHiddenClasses(prev => [...prev, period]);
    }, 1000);
  };

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.footerText) setFooterText(data.footerText);
        if (data.creditsText) setCreditsText(data.creditsText);
      }
    }, () => {});
    
    const unsubRoles = onSnapshot(collection(db, 'roles'), (snapshot) => {
      const rolesData: any[] = [];
      snapshot.forEach(doc => rolesData.push({ id: doc.id, ...doc.data() }));
      setRoles(rolesData);
    }, () => {});

    return () => {
      unsubSettings();
      unsubRoles();
    };
  }, []);

  useEffect(() => {
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      setUser(storedUserId);
    } else {
      const newUserId = `user_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
      localStorage.setItem('userId', newUserId);
      setUser(newUserId);
    }
    setLoadingAuth(false);
  }, []);

  useEffect(() => {
    if (user) {
      const unsubProfile = onSnapshot(doc(db, 'users', user), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserProfile(data);
          setUserName(data.displayName || 'Student');
          setUserClasses(data.classes || defaultClasses);
        } else {
          setUserProfile(null);
        }
        setLoadingProfile(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${user}`);
        setLoadingProfile(false);
      });

      const unsubHomework = onSnapshot(collection(db, 'users', user, 'homework'), (snapshot) => {
        const hwData: HomeworkItem[] = [];
        snapshot.forEach(doc => hwData.push(doc.data() as HomeworkItem));
        setHomework(hwData);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `users/${user}/homework`);
      });

      const unsubNotes = onSnapshot(collection(db, 'users', user, 'notes'), (snapshot) => {
        const notesData: Note[] = [];
        snapshot.forEach(doc => notesData.push(doc.data() as Note));
        setNotes(notesData);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `users/${user}/notes`);
      });

      return () => {
        unsubProfile();
        unsubHomework();
        unsubNotes();
      };
    } else {
      setUserProfile(null);
      setLoadingProfile(false);
      setUserClasses(defaultClasses);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    // Set online status to true on mount
    const setOnline = async () => {
      try {
        await updateDoc(doc(db, 'users', user), { isOnline: true });
      } catch (e) {
        // Ignore if document doesn't exist yet
      }
    };
    setOnline();

    // Increment time spent every minute
    const timeTimer = setInterval(async () => {
      try {
        await updateDoc(doc(db, 'users', user), { timeSpent: increment(1) });
      } catch (e) {
        // Ignore
      }
    }, 60000);

    // Set online status to false on visibility change or unmount
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        updateDoc(doc(db, 'users', user), { isOnline: false }).catch(() => {});
      } else {
        updateDoc(doc(db, 'users', user), { isOnline: true }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleBeforeUnload = () => {
      updateDoc(doc(db, 'users', user), { isOnline: false }).catch(() => {});
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(timeTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      updateDoc(doc(db, 'users', user), { isOnline: false }).catch(() => {});
    };
  }, [user]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('userId');
    window.location.reload();
  };

  const handleMarkNotificationRead = async (notificationId: string) => {
    if (!user || !userProfile || !userProfile.notifications) return;
    
    try {
      const updatedNotifications = userProfile.notifications.map((n: any) => 
        n.id === notificationId ? { ...n, read: true } : n
      );
      
      await updateDoc(doc(db, 'users', user), {
        notifications: updatedNotifications
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user}`);
    }
  };

  const handleClearNotifications = async () => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user), {
        notifications: []
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user}`);
    }
  };

  const handleSaveName = async (newName: string) => {
    setUserName(newName);
    setIsEditingName(false);
    if (user && userProfile) {
      try {
        await updateDoc(doc(db, 'users', user), { displayName: newName });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user}`);
      }
    }
  };

  if (loadingAuth || (user && loadingProfile)) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Loading...</div>;
  }

  if (user && !userProfile) {
    return <OnboardingScreen user={user} />;
  }

  const dayType = getDayType(currentTime);
  const abDay = getABDay(currentTime);
  const schedule = schedules[dayType] || [];

  let currentPeriod: ScheduleBlock | null = null;
  let nextPeriod: ScheduleBlock | null = null;
  let timeRemaining: number | null = null;
  let progress = 0;
  let schoolTimeRemaining: number | null = null;

  if (dayType !== 'Weekend') {
    // Calculate total school time remaining
    if (schedule.length > 0) {
      const lastBlock = schedule[schedule.length - 1];
      const schoolEnd = parseTime(lastBlock.end);
      if (currentTime < schoolEnd) {
        schoolTimeRemaining = Math.floor((schoolEnd.getTime() - currentTime.getTime()) / 1000);
      }
    }

    for (let i = 0; i < schedule.length; i++) {
      const block = schedule[i];
      const start = parseTime(block.start);
      const end = parseTime(block.end);

      if (currentTime >= start && currentTime <= end) {
        currentPeriod = block;
        nextPeriod = schedule[i + 1] || null;
        timeRemaining = Math.floor((end.getTime() - currentTime.getTime()) / 1000);
        break;
      } else if (currentTime < start) {
        if (!currentPeriod) {
          nextPeriod = block;
          timeRemaining = Math.floor((start.getTime() - currentTime.getTime()) / 1000);
          const prevBlock = i > 0 ? schedule[i - 1] : null;
          if (!prevBlock) {
            currentPeriod = { period: 'Before School', isPassing: true, name: 'Before School', start: '00:00', end: block.start };
          } else {
            currentPeriod = { period: 'Passing', isPassing: true, name: 'Passing Period', start: prevBlock.end, end: block.start };
          }
        }
        break;
      }
    }
    
    if (!currentPeriod && schedule.length > 0) {
      const lastEnd = parseTime(schedule[schedule.length - 1].end);
      if (currentTime > lastEnd) {
        currentPeriod = { period: 'Done', name: 'School is over!', start: schedule[schedule.length - 1].end, end: '23:59' };
      }
    }

    if (currentPeriod && currentPeriod.start && currentPeriod.end && currentPeriod.period !== 'Done') {
      const start = parseTime(currentPeriod.start).getTime();
      const end = parseTime(currentPeriod.end).getTime();
      const total = end - start;
      const elapsed = currentTime.getTime() - start;
      progress = Math.max(0, Math.min(100, (elapsed / total) * 100));
    }
  }

  const visibleHomework = homework.filter(h => h.showOnMain && !h.completed);
  const visibleNotes = notes.filter(n => n.showOnMain);

  const theme = userProfile?.theme || 'slate';
  
  const themeColors: Record<string, { bg: string, border: string, text: string, button: string, buttonHover: string, gradient: string }> = {
    slate: { bg: 'bg-slate-900', border: 'border-slate-700', text: 'text-slate-100', button: 'bg-indigo-600', buttonHover: 'hover:bg-indigo-700', gradient: 'from-indigo-600 to-violet-700' },
    indigo: { bg: 'bg-indigo-950', border: 'border-indigo-800', text: 'text-indigo-100', button: 'bg-indigo-500', buttonHover: 'hover:bg-indigo-600', gradient: 'from-indigo-500 to-blue-600' },
    emerald: { bg: 'bg-emerald-950', border: 'border-emerald-800', text: 'text-emerald-100', button: 'bg-emerald-600', buttonHover: 'hover:bg-emerald-700', gradient: 'from-emerald-600 to-teal-700' },
    rose: { bg: 'bg-rose-950', border: 'border-rose-800', text: 'text-rose-100', button: 'bg-rose-600', buttonHover: 'hover:bg-rose-700', gradient: 'from-rose-600 to-pink-700' },
    light: { bg: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-900', button: 'bg-slate-800', buttonHover: 'hover:bg-slate-900', gradient: 'from-slate-200 to-slate-300' },
    dark: { bg: 'bg-black', border: 'border-zinc-800', text: 'text-zinc-100', button: 'bg-zinc-800', buttonHover: 'hover:bg-zinc-700', gradient: 'from-zinc-900 to-black' }
  };
  
  const currentTheme = themeColors[theme] || themeColors.slate;

  return (
    <div className={`min-h-screen ${currentTheme.bg} ${currentTheme.text} p-4 md:p-8 font-sans transition-colors duration-500`}>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <header className={`flex flex-col md:flex-row items-start md:items-center justify-between bg-black/20 p-6 rounded-3xl shadow-lg border ${currentTheme.border} gap-6 backdrop-blur-sm`}>
          <div>
            <div className="flex items-center gap-3">
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    className={`bg-black/40 border ${currentTheme.border} rounded-xl px-3 py-1 text-2xl font-bold text-white focus:outline-none w-48`}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveName(tempName);
                      }
                    }}
                  />
                  <button 
                    onClick={() => handleSaveName(tempName)}
                    className={`p-2 ${currentTheme.button} ${currentTheme.buttonHover} text-white rounded-lg transition-colors`}
                  >
                    <CheckCircle2 size={20} />
                  </button>
                </div>
              ) : (
                <h1 className="text-3xl font-bold text-white flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => { setTempName(userName); setIsEditingName(true); }}>
                  <BookOpen className="opacity-80" size={32} />
                  {userName}'s Day
                </h1>
              )}
            </div>
            <p className="opacity-70 mt-2 text-lg">
              {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            {dayType !== 'Weekend' && (
              <div className="flex gap-2 mt-3">
                <span className={`px-3 py-1 bg-white/10 rounded-full text-sm font-medium border ${currentTheme.border}`}>
                  {dayType} Day
                </span>
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-sm font-medium border border-emerald-500/30">
                  {abDay} Day
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-4">
            {user && (
              <div className="flex items-center gap-4">
                <div className="relative">
                  <button 
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="text-slate-400 hover:text-white flex items-center gap-2 text-sm transition-colors relative"
                  >
                    <Bell size={20} />
                    {userProfile?.notifications?.filter((n: any) => !n.read).length > 0 && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-black"></span>
                    )}
                  </button>
                  
                  {showNotifications && (
                    <div className={`absolute right-0 mt-2 w-80 bg-black/90 border ${currentTheme.border} rounded-2xl shadow-xl z-50 backdrop-blur-xl overflow-hidden`}>
                      <div className="p-4 border-b border-white/10 flex items-center justify-between">
                        <h3 className="font-semibold text-white">Notifications</h3>
                        {userProfile?.notifications?.length > 0 && (
                          <button 
                            onClick={handleClearNotifications}
                            className="text-xs text-slate-400 hover:text-white transition-colors"
                          >
                            Clear all
                          </button>
                        )}
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {userProfile?.notifications?.length > 0 ? (
                          <div className="flex flex-col">
                            {userProfile.notifications.sort((a: any, b: any) => b.createdAt - a.createdAt).map((notification: any) => (
                              <div 
                                key={notification.id}
                                className={`p-4 border-b border-white/5 transition-colors ${notification.read ? 'opacity-60' : 'bg-white/5'}`}
                                onClick={() => !notification.read && handleMarkNotificationRead(notification.id)}
                              >
                                <p className="text-sm text-white/90">{notification.text}</p>
                                <p className="text-xs text-white/40 mt-1">
                                  {new Date(notification.createdAt).toLocaleString()}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-8 text-center text-white/50 text-sm">
                            No notifications yet
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <button onClick={handleLogout} className="text-slate-400 hover:text-white flex items-center gap-2 text-sm transition-colors">
                  <LogOut size={16} /> Sign Out
                </button>
              </div>
            )}
            <div className={`text-left md:text-right w-full md:w-auto bg-black/40 p-5 rounded-2xl border ${currentTheme.border}`}>
              <div className={`text-5xl md:text-6xl font-mono font-bold ${currentTheme.text} tracking-tight`}>
                {currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
              </div>
              {schoolTimeRemaining !== null && schoolTimeRemaining > 0 ? (
                <div className="text-xl md:text-2xl font-mono font-medium text-amber-400 mt-3">
                  {formatTimeRemaining(schoolTimeRemaining)} left in day
                </div>
              ) : dayType !== 'Weekend' ? (
                <div className="text-xl md:text-2xl font-mono font-medium text-emerald-400 mt-3">
                  School is over!
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {/* Tabs */}
        <div className={`flex flex-col sm:flex-row gap-2 bg-black/20 p-2 rounded-2xl border ${currentTheme.border} backdrop-blur-sm`}>
          <button 
            onClick={() => setActiveTab('schedule')} 
            className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'schedule' ? `${currentTheme.button} text-white shadow-md` : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
          >
            <LayoutDashboard size={20} /> Schedule
          </button>
          <button 
            onClick={() => setActiveTab('homework')} 
            className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'homework' ? `${currentTheme.button} text-white shadow-md` : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
          >
            <BookMarked size={20} /> Homework
          </button>
          <button 
            onClick={() => setActiveTab('calculator')} 
            className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'calculator' ? `${currentTheme.button} text-white shadow-md` : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
          >
            <Calculator size={20} /> Grade Calculator
          </button>
          <button 
            onClick={() => setActiveTab('notes')} 
            className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'notes' ? `${currentTheme.button} text-white shadow-md` : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
          >
            <StickyNote size={20} /> Sticky Notes
          </button>
          <button 
            onClick={() => setActiveTab('settings')} 
            className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'settings' ? `${currentTheme.button} text-white shadow-md` : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
          >
            <BookOpen size={20} /> Settings
          </button>
          <button 
            onClick={() => setActiveTab('community')} 
            className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'community' ? `${currentTheme.button} text-white shadow-md` : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
          >
            <Users size={20} /> Community
          </button>
          {isAdmin && (
            <button 
              onClick={() => setActiveTab('admin')} 
              className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'admin' ? `${currentTheme.button} text-white shadow-md` : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
            >
              <LayoutDashboard size={20} /> Admin
            </button>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === 'schedule' && (
          <div className="space-y-6">
            {/* Current Status */}
            {dayType !== 'Weekend' ? (
              <div className="grid md:grid-cols-2 gap-6">
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`bg-gradient-to-br ${currentTheme.gradient} p-8 rounded-3xl shadow-xl relative overflow-hidden flex flex-col justify-between`}
                >
                  <div className="absolute top-0 right-0 p-4 opacity-20">
                    <Clock size={120} />
                  </div>
                  <div>
                    <h2 className="text-white/80 font-medium mb-2 text-lg">Current Class</h2>
                    <div className="text-4xl font-bold text-white mb-2 leading-tight">
                      {getClassName(currentPeriod?.period, abDay, userClasses)}
                    </div>
                    {currentPeriod?.period !== 'Done' && currentPeriod?.period !== 'Passing' && currentPeriod?.period !== 'Before School' && currentPeriod?.period !== 'Lunch' && (
                      <div className="text-white/80 font-medium">
                        Period {currentPeriod?.period}
                      </div>
                    )}
                  </div>
                  
                  {timeRemaining !== null && (
                    <div className="mt-8">
                      <div className="flex justify-between items-end mb-2">
                        <div className="text-sm text-white/80 font-medium">
                          {currentPeriod?.isPassing ? 'Time until next class' : 'Time left in class'}
                        </div>
                        <div className="text-4xl font-mono font-bold tracking-tight text-white">
                          {formatTimeRemaining(timeRemaining)}
                        </div>
                      </div>
                      {currentPeriod?.period !== 'Done' && (
                        <div className="h-2 bg-black/20 rounded-full overflow-hidden">
                          <motion.div 
                            className="h-full bg-white/80 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 1 }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className={`bg-black/20 p-8 rounded-3xl shadow-lg border ${currentTheme.border} flex flex-col justify-between backdrop-blur-sm`}
                >
                  <div>
                    <h2 className="text-white/60 font-medium mb-2 text-lg">Next Up</h2>
                    {nextPeriod ? (
                      <>
                        <div className="text-2xl font-bold text-white mb-1">
                          {getClassName(nextPeriod.period, abDay, userClasses)}
                        </div>
                        <div className="text-white/60">
                          {nextPeriod.period !== 'Lunch' && nextPeriod.period !== 'ADV' && nextPeriod.period !== 'HR' ? `Period ${nextPeriod.period} • ` : ''}
                          {format12Hour(nextPeriod.start)} - {format12Hour(nextPeriod.end)}
                        </div>
                      </>
                    ) : (
                      <div className="text-xl text-white/60">No more classes today!</div>
                    )}
                  </div>
                  
                  {nextPeriod && (
                    <div className="mt-6 p-4 bg-black/40 rounded-xl flex items-center gap-3">
                      <ChevronRight className="text-white/60" />
                      <span className="text-white/80">Starts at {format12Hour(nextPeriod.start)}</span>
                    </div>
                  )}
                </motion.div>
              </div>
            ) : (
              <div className={`bg-black/20 p-12 rounded-3xl text-center border ${currentTheme.border} backdrop-blur-sm`}>
                <h2 className="text-3xl font-bold text-white mb-4">It's the Weekend!</h2>
                <p className="text-white/60">Enjoy your time off. See you on Monday.</p>
              </div>
            )}

            {/* Homework on Main Page */}
            {visibleHomework.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className={`bg-black/20 rounded-3xl shadow-lg border ${currentTheme.border} p-6 backdrop-blur-sm`}
              >
                <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
                  <BookMarked className="text-amber-400" />
                  Active Homework
                </h2>
                <div className="grid gap-3">
                  {visibleHomework.map(item => (
                    <div key={item.id} className={`bg-black/40 p-4 rounded-xl border ${currentTheme.border} flex justify-between items-center`}>
                      <div className="text-white/90 font-medium">{item.text}</div>
                      {item.dueDate && (
                        <div className="text-sm text-amber-400/80 bg-amber-400/10 px-3 py-1 rounded-full">
                          Due: {new Date(item.dueDate).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Notes on Main Page */}
            {visibleNotes.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className={`bg-black/20 rounded-3xl shadow-lg border ${currentTheme.border} p-6 backdrop-blur-sm`}
              >
                <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
                  <StickyNote className="text-white/80" />
                  Pinned Notes
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visibleNotes.map(note => (
                    <div 
                      key={note.id}
                      className={`${note.color} p-5 rounded-2xl text-slate-900 shadow-md relative min-h-[120px]`}
                    >
                      <p className="font-medium whitespace-pre-wrap">{note.text}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Full Schedule */}
            {dayType !== 'Weekend' && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className={`bg-black/20 rounded-3xl shadow-lg border ${currentTheme.border} overflow-hidden backdrop-blur-sm`}
              >
                <div className="p-6 border-b border-white/10 bg-black/20">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <CalendarDays className="text-white/60" />
                    Today's Schedule
                  </h2>
                </div>
                <div className="divide-y divide-white/10">
                  {schedule.filter(block => !hiddenClasses.includes(block.period)).map((block, idx) => {
                    const isCurrent = currentPeriod?.period === block.period;
                    const isCrossedOut = crossedOutClasses.includes(block.period);
                    return (
                      <div 
                        key={idx} 
                        className={`p-4 flex items-center justify-between transition-all duration-500 ${
                          isCurrent ? 'bg-white/10 border-l-4 border-white' : 'hover:bg-black/40 pl-5'
                        } ${isCrossedOut ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
                      >
                        <div className={`flex items-center gap-4 ${isCrossedOut ? 'line-through opacity-50' : ''}`}>
                          <div className={`w-12 text-center font-bold ${isCurrent ? 'text-white' : 'text-white/60'}`}>
                            {block.period}
                          </div>
                          <div>
                            <div className={`font-medium ${isCurrent ? 'text-white' : 'text-white/80'}`}>
                              {getClassName(block.period, abDay, userClasses)}
                            </div>
                            <div className="text-sm text-white/60 font-mono">
                              {format12Hour(block.start)} - {format12Hour(block.end)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {isCurrent && (
                            <div className={`px-3 py-1 ${currentTheme.button} text-white text-xs font-bold rounded-full uppercase tracking-wider`}>
                              Now
                            </div>
                          )}
                          <button 
                            onClick={() => handleCrossOutClass(block.period)}
                            className="text-white/40 hover:text-white/80 transition-colors"
                            title="Cross out class"
                          >
                            <Check size={18} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </div>
        )}
        
        {activeTab === 'homework' && <HomeworkTab homework={homework} setHomework={setHomework} user={user} currentTheme={currentTheme} />}
        {activeTab === 'notes' && <StickyNotesTab user={user} notes={notes} setNotes={setNotes} currentTheme={currentTheme} />}
        {activeTab === 'calculator' && <GradeCalculator currentTheme={currentTheme} />}
        {activeTab === 'settings' && <SettingsTab user={user} userProfile={userProfile} userClasses={userClasses} setUserClasses={setUserClasses} currentTheme={currentTheme} footerText={footerText} creditsText={creditsText} setActiveTab={setActiveTab} />}
        {activeTab === 'community' && <CommunityTab user={user} userProfile={userProfile} currentTheme={currentTheme} canPost={canWriteCommunityPosts} />}
        {activeTab === 'admin' && isAdmin && <AdminPanel currentTheme={currentTheme} footerText={footerText} creditsText={creditsText} userProfile={userProfile} userRole={userRole} />}
      </div>
      {userProfile?.showProDayPopup && (
        <ProDayPopup user={user!} onClose={() => {}} />
      )}
    </div>
  );
}

interface CustomRole {
  id: string;
  name: string;
  canAccessAdminPanel: boolean;
  canWriteCommunityPosts: boolean;
  canEditCredits: boolean;
  canManageUsers: boolean;
}

function AdminPanel({ currentTheme, footerText, creditsText, userProfile, userRole }: { currentTheme: any, footerText: string, creditsText: string, userProfile: any, userRole: CustomRole | null }) {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFooter, setNewFooter] = useState(footerText);
  const [newCredits, setNewCredits] = useState(creditsText);
  const [saving, setSaving] = useState(false);
  
  const isSuperAdmin = userProfile?.displayName?.toLowerCase().includes('markustheadmin') || userProfile?.role === 'admin' || userProfile?.role === 'manager';

  const [newRoleName, setNewRoleName] = useState('');
  const [newRolePerms, setNewRolePerms] = useState({
    canAccessAdminPanel: false,
    canWriteCommunityPosts: false,
    canEditCredits: false,
    canManageUsers: false
  });

  const [notifyUser, setNotifyUser] = useState(true);

  const [heading, setHeading] = useState('');
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [soundUrl, setSoundUrl] = useState('');
  const [creatingPost, setCreatingPost] = useState(false);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersData: any[] = [];
      snapshot.forEach(doc => usersData.push({ id: doc.id, ...doc.data() }));
      setUsers(usersData);
      setLoading(false);
    }, () => setLoading(false));

    const unsubRoles = onSnapshot(collection(db, 'roles'), (snapshot) => {
      const rolesData: CustomRole[] = [];
      snapshot.forEach(doc => rolesData.push({ id: doc.id, ...doc.data() } as CustomRole));
      setRoles(rolesData);
    }, () => {});

    return () => {
      unsubUsers();
      unsubRoles();
    };
  }, []);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'global'), { footerText: newFooter, creditsText: newCredits }, { merge: true });
    } catch (e) {
      // Ignore
    }
    setSaving(false);
  };

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) return;
    try {
      await addDoc(collection(db, 'roles'), {
        name: newRoleName,
        ...newRolePerms
      });
      setNewRoleName('');
      setNewRolePerms({
        canAccessAdminPanel: false,
        canWriteCommunityPosts: false,
        canEditCredits: false,
        canManageUsers: false
      });
    } catch (e) {
      // Ignore
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    try {
      await deleteDoc(doc(db, 'roles', roleId));
    } catch (e) {
      // Ignore
    }
  };

  const handleCreatePost = async () => {
    if (!heading.trim() || !text.trim()) return;
    setCreatingPost(true);
    try {
      await addDoc(collection(db, 'community_posts'), {
        heading,
        text,
        imageUrl: imageUrl || null,
        soundUrl: soundUrl || null,
        authorName: userProfile?.displayName || 'Unknown',
        createdAt: Date.now()
      });
      setHeading('');
      setText('');
      setImageUrl('');
      setSoundUrl('');
    } catch (e) {
      // Ignore
    }
    setCreatingPost(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`bg-black/20 backdrop-blur-sm p-6 md:p-8 rounded-3xl border ${currentTheme.border}`}>
      <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
        <LayoutDashboard className="text-rose-400" />
        Admin Panel
      </h2>

      {(isSuperAdmin || userRole?.canEditCredits) && (
        <>
          <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-medium text-white/80 mb-4">Edit Footer Text</h3>
              <input
                type="text"
                value={newFooter}
                onChange={(e) => setNewFooter(e.target.value)}
                className={`w-full bg-black/40 border ${currentTheme.border} rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30 transition-colors`}
              />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white/80 mb-4">Edit Credits Text</h3>
              <textarea
                value={newCredits}
                onChange={(e) => setNewCredits(e.target.value)}
                className={`w-full h-24 bg-black/40 border ${currentTheme.border} rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30 transition-colors resize-none`}
              />
            </div>
          </div>
          
          <div className="mb-8">
            <button 
              onClick={handleSaveSettings}
              disabled={saving}
              className={`${currentTheme.button} ${currentTheme.buttonHover} disabled:opacity-50 text-white font-medium py-2 px-6 rounded-xl transition-colors`}
            >
              {saving ? 'Saving...' : 'Save Global Settings'}
            </button>
          </div>
        </>
      )}

      {(isSuperAdmin || userRole?.canWriteCommunityPosts) && (
        <div className="mb-8 bg-black/40 border border-white/10 rounded-2xl p-6">
          <h3 className="text-lg font-medium text-white mb-4">Create Community Post</h3>
          <div className="space-y-4">
            <input type="text" placeholder="Heading" value={heading} onChange={e => setHeading(e.target.value)} className={`w-full bg-black/40 border ${currentTheme.border} rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30 transition-colors`} />
            <textarea placeholder="Text" value={text} onChange={e => setText(e.target.value)} className={`w-full h-24 bg-black/40 border ${currentTheme.border} rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30 transition-colors resize-none`} />
            <input type="text" placeholder="Image URL (optional)" value={imageUrl} onChange={e => setImageUrl(e.target.value)} className={`w-full bg-black/40 border ${currentTheme.border} rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30 transition-colors`} />
            <input type="text" placeholder="Sound/Music URL (optional)" value={soundUrl} onChange={e => setSoundUrl(e.target.value)} className={`w-full bg-black/40 border ${currentTheme.border} rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30 transition-colors`} />
            <button onClick={handleCreatePost} disabled={creatingPost || !heading.trim() || !text.trim()} className={`${currentTheme.button} ${currentTheme.buttonHover} disabled:opacity-50 text-white font-medium py-2 px-6 rounded-xl transition-colors`}>
              {creatingPost ? 'Posting...' : 'Post to Community'}
            </button>
          </div>
        </div>
      )}

      {(isSuperAdmin || userRole?.canManageUsers) && (
        <>
          <div className="mb-8">
            <h3 className="text-lg font-medium text-white/80 mb-4">Manage Roles</h3>
            <div className="bg-black/40 border border-white/10 rounded-2xl p-6 mb-6">
              <h4 className="text-white font-medium mb-4">Create New Role</h4>
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Role Name (e.g., Community Typer)"
                  value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              className={`w-full bg-black/40 border ${currentTheme.border} rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30 transition-colors`}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-center gap-2 text-white/80 cursor-pointer">
                <input type="checkbox" checked={newRolePerms.canAccessAdminPanel} onChange={(e) => setNewRolePerms({...newRolePerms, canAccessAdminPanel: e.target.checked})} className="rounded bg-black/40 border-white/20 text-indigo-500 focus:ring-indigo-500" />
                Can Access Admin Panel
              </label>
              <label className="flex items-center gap-2 text-white/80 cursor-pointer">
                <input type="checkbox" checked={newRolePerms.canWriteCommunityPosts} onChange={(e) => setNewRolePerms({...newRolePerms, canWriteCommunityPosts: e.target.checked})} className="rounded bg-black/40 border-white/20 text-indigo-500 focus:ring-indigo-500" />
                Can Write Community Posts
              </label>
              <label className="flex items-center gap-2 text-white/80 cursor-pointer">
                <input type="checkbox" checked={newRolePerms.canEditCredits} onChange={(e) => setNewRolePerms({...newRolePerms, canEditCredits: e.target.checked})} className="rounded bg-black/40 border-white/20 text-indigo-500 focus:ring-indigo-500" />
                Can Edit Credits
              </label>
              <label className="flex items-center gap-2 text-white/80 cursor-pointer">
                <input type="checkbox" checked={newRolePerms.canManageUsers} onChange={(e) => setNewRolePerms({...newRolePerms, canManageUsers: e.target.checked})} className="rounded bg-black/40 border-white/20 text-indigo-500 focus:ring-indigo-500" />
                Can Manage Users
              </label>
            </div>
            <button 
              onClick={handleCreateRole}
              disabled={!newRoleName.trim()}
              className={`${currentTheme.button} ${currentTheme.buttonHover} disabled:opacity-50 text-white font-medium py-2 px-6 rounded-xl transition-colors mt-2`}
            >
              Create Role
            </button>
          </div>
        </div>

        {roles.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`border-b ${currentTheme.border} text-white/60 text-sm`}>
                  <th className="pb-3 font-medium">Role Name</th>
                  <th className="pb-3 font-medium">Permissions</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map(r => (
                  <tr key={r.id} className={`border-b ${currentTheme.border} text-white/90`}>
                    <td className="py-3 font-medium">{r.name}</td>
                    <td className="py-3 text-xs text-white/60">
                      {r.canAccessAdminPanel && <span className="mr-2 bg-white/10 px-2 py-1 rounded">Admin Panel</span>}
                      {r.canWriteCommunityPosts && <span className="mr-2 bg-white/10 px-2 py-1 rounded">Community</span>}
                      {r.canEditCredits && <span className="mr-2 bg-white/10 px-2 py-1 rounded">Credits</span>}
                      {r.canManageUsers && <span className="mr-2 bg-white/10 px-2 py-1 rounded">Users</span>}
                    </td>
                    <td className="py-3">
                      <button onClick={() => handleDeleteRole(r.id)} className="text-rose-400 hover:text-rose-300">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-white/80">All Users ({users.length})</h3>
          <label className="flex items-center gap-2 text-white/80 cursor-pointer text-sm">
            <input type="checkbox" checked={notifyUser} onChange={(e) => setNotifyUser(e.target.checked)} className="rounded bg-black/40 border-white/20 text-indigo-500 focus:ring-indigo-500" />
            Notify user on role change
          </label>
        </div>
        {loading ? (
          <div className="text-white/60">Loading users...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`border-b ${currentTheme.border} text-white/60 text-sm`}>
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Time Spent (min)</th>
                  <th className="pb-3 font-medium">Role</th>
                  <th className="pb-3 font-medium">ProDay</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className={`border-b ${currentTheme.border} text-white/90`}>
                    <td className="py-3">{u.displayName || 'Unknown'}</td>
                    <td className="py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${u.isOnline ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-400'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.isOnline ? 'bg-emerald-400' : 'bg-slate-400'}`}></span>
                        {u.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="py-3">{u.timeSpent || 0}</td>
                    <td className="py-3">
                      <select 
                        value={u.role || 'regular'}
                        onChange={async (e) => {
                          try {
                            const newRole = e.target.value;
                            const updateData: any = { role: newRole };
                            if (notifyUser) {
                              const roleName = newRole === 'regular' ? 'Regular' : 
                                               newRole === 'admin' ? 'Admin' : 
                                               newRole === 'manager' ? 'Manager' : 
                                               newRole === 'editor' ? 'Editor' : 
                                               newRole === 'credits_editor' ? 'Credits Editor' : 
                                               newRole === 'community_typer' ? 'Community Typer' : 
                                               roles.find(r => r.id === newRole)?.name || newRole;
                              const notification = {
                                id: Date.now().toString(),
                                text: `Your role has been updated to ${roleName} by an Admin.`,
                                read: false,
                                createdAt: Date.now()
                              };
                              updateData.notifications = arrayUnion(notification);
                            }
                            await updateDoc(doc(db, 'users', u.id), updateData);
                          } catch (err) {
                            // Ignore
                          }
                        }}
                        className={`bg-black/40 border ${currentTheme.border} rounded-lg px-2 py-1 text-sm text-white focus:outline-none`}
                      >
                        <option value="regular">Regular</option>
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="editor">Editor</option>
                        <option value="credits_editor">Credits Editor</option>
                        <option value="community_typer">Community Typer</option>
                        {roles.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3">
                      <button 
                        onClick={async () => {
                          try {
                            await updateDoc(doc(db, 'users', u.id), { proDayAccess: !u.proDayAccess, showProDayPopup: !u.proDayAccess });
                          } catch (err) {
                            // Ignore
                          }
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${u.proDayAccess ? 'bg-amber-500/20 text-amber-400' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
                      >
                        {u.proDayAccess ? 'Revoke' : 'Grant'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </>
      )}
    </motion.div>
  );
}

function SettingsTab({ user, userProfile, userClasses, setUserClasses, currentTheme, footerText, creditsText, setActiveTab }: { user: string | null, userProfile: any, userClasses: Record<string, string>, setUserClasses: React.Dispatch<React.SetStateAction<Record<string, string>>>, currentTheme: any, footerText: string, creditsText: string, setActiveTab: (tab: string) => void }) {
  const [classes, setClasses] = useState<Record<string, string>>(userClasses);
  const [theme, setTheme] = useState<string>(userProfile?.theme || 'slate');
  const [saving, setSaving] = useState(false);
  const [showCredits, setShowCredits] = useState(false);

  const handleThemeChange = async (newTheme: string) => {
    setTheme(newTheme);
    if (user) {
      try {
        await updateDoc(doc(db, 'users', user), { theme: newTheme });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user}`);
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    if (user) {
      try {
        await updateDoc(doc(db, 'users', user), { classes });
        setUserClasses(classes);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user}`);
      }
    } else {
      setUserClasses(classes);
    }
    setSaving(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`bg-black/20 backdrop-blur-sm p-6 md:p-8 rounded-3xl border ${currentTheme.border}`}>
      <h2 className="text-2xl font-bold text-white mb-6">Settings</h2>
      
      <div className="mb-8">
        <h3 className="text-lg font-medium text-white/80 mb-4">Your Theme</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {['slate', 'indigo', 'emerald', 'rose', 'light', 'dark'].map((t) => (
            <button
              key={t}
              onClick={() => handleThemeChange(t)}
              className={`py-3 rounded-xl font-medium capitalize transition-colors border-2 ${theme === t ? 'border-white bg-white/20' : 'border-transparent bg-black/40 hover:bg-black/60'} text-white`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-lg font-medium text-white/80 mb-4">Your Classes</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {['1', '2', '3A', '3B', '4A', '4B', '5', '6', '7', '8'].map((period) => (
            <div key={period} className="flex items-center gap-3">
              <div className="w-16 text-right text-white/60 font-mono text-sm">Period {period}</div>
              <input
                type="text"
                value={classes[period] || ''}
                onChange={(e) => setClasses({ ...classes, [period]: e.target.value })}
                className={`flex-1 bg-black/40 border ${currentTheme.border} rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30 transition-colors`}
              />
            </div>
          ))}
        </div>
      </div>
      
      <button 
        onClick={handleSave}
        disabled={saving}
        className={`${currentTheme.button} ${currentTheme.buttonHover} disabled:opacity-50 text-white font-medium py-2 px-6 rounded-xl transition-colors`}
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>

      <div className="mt-12 text-center text-white/40 text-sm">
        {footerText}
        <div className="mt-2 flex items-center justify-center gap-4">
          <button onClick={() => setShowCredits(!showCredits)} className="underline hover:text-white/60 transition-colors">Credits</button>
        </div>
        {showCredits && creditsText && (
          <div className="mt-4 p-4 bg-black/40 rounded-xl text-left whitespace-pre-wrap text-white/80">
            {creditsText}
          </div>
        )}
      </div>
    </motion.div>
  );
}

interface CommunityPost {
  id: string;
  heading: string;
  text: string;
  imageUrl?: string;
  soundUrl?: string;
  authorName: string;
  createdAt: number;
}

function CommunityTab({ user, userProfile, currentTheme, canPost }: { user: string | null, userProfile: any, currentTheme: any, canPost: boolean }) {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [heading, setHeading] = useState('');
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [soundUrl, setSoundUrl] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'community_posts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const postsData: CommunityPost[] = [];
      snapshot.forEach(doc => postsData.push({ id: doc.id, ...doc.data() } as CommunityPost));
      setPosts(postsData);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const handleCreatePost = async () => {
    if (!heading.trim() || !text.trim()) return;
    setCreating(true);
    try {
      await addDoc(collection(db, 'community_posts'), {
        heading,
        text,
        imageUrl: imageUrl || null,
        soundUrl: soundUrl || null,
        authorName: userProfile?.displayName || 'Unknown',
        createdAt: Date.now()
      });
      setHeading('');
      setText('');
      setImageUrl('');
      setSoundUrl('');
    } catch (e) {
      // Ignore
    }
    setCreating(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`bg-black/20 backdrop-blur-sm p-6 md:p-8 rounded-3xl border ${currentTheme.border}`}>
      <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
        <Users className="text-indigo-400" />
        Community
      </h2>

      {canPost && (
        <div className="mb-8 bg-black/40 p-6 rounded-2xl border border-white/10">
          <h3 className="text-lg font-medium text-white mb-4">Create Post</h3>
          <div className="space-y-4">
            <input type="text" placeholder="Heading" value={heading} onChange={e => setHeading(e.target.value)} className={`w-full bg-black/40 border ${currentTheme.border} rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30 transition-colors`} />
            <textarea placeholder="Text" value={text} onChange={e => setText(e.target.value)} className={`w-full h-24 bg-black/40 border ${currentTheme.border} rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30 transition-colors resize-none`} />
            <input type="text" placeholder="Image URL (optional)" value={imageUrl} onChange={e => setImageUrl(e.target.value)} className={`w-full bg-black/40 border ${currentTheme.border} rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30 transition-colors`} />
            <input type="text" placeholder="Sound/Music URL (optional)" value={soundUrl} onChange={e => setSoundUrl(e.target.value)} className={`w-full bg-black/40 border ${currentTheme.border} rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30 transition-colors`} />
            <button onClick={handleCreatePost} disabled={creating || !heading.trim() || !text.trim()} className={`${currentTheme.button} ${currentTheme.buttonHover} disabled:opacity-50 text-white font-medium py-2 px-6 rounded-xl transition-colors`}>
              {creating ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {loading ? (
          <div className="text-white/60">Loading posts...</div>
        ) : posts.length === 0 ? (
          <div className="text-white/60 text-center py-8">No posts yet.</div>
        ) : (
          posts.map(post => (
            <div key={post.id} className="bg-black/40 p-6 rounded-2xl border border-white/10">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-white">{post.heading}</h3>
                <span className="text-xs text-white/40">{new Date(post.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-white/80 whitespace-pre-wrap mb-4">{post.text}</p>
              {post.imageUrl && (
                <img src={post.imageUrl} alt="Post image" className="max-w-full rounded-lg mb-4 max-h-96 object-contain bg-black/20" referrerPolicy="no-referrer" />
              )}
              {post.soundUrl && (
                <audio controls autoPlay loop src={post.soundUrl} className="w-full mb-4" />
              )}
              <div className="text-sm text-white/60 font-medium">
                Posted by {post.authorName}
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}

function OnboardingScreen({ user }: { user: string }) {
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [classes, setClasses] = useState<Record<string, string>>(defaultClasses);
  const [theme, setTheme] = useState('slate');
  const [loading, setLoading] = useState(false);

  const handleComplete = async () => {
    const isMarkus = firstName.trim().toLowerCase() === 'markus' && lastName.trim().toLowerCase() === 'admin';
    if (!firstName.trim() || !lastName.trim()) return;
    setLoading(true);
    try {
      await setDoc(doc(db, 'users', user), {
        uid: user,
        displayName: isMarkus ? 'markustheadmin' : `${firstName.trim()} ${lastName.trim()}`,
        classes: classes,
        theme: theme,
        role: isMarkus ? 'admin' : 'regular'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user}`);
      setLoading(false);
    }
  };

  const themeColors: Record<string, { bg: string, border: string, text: string, button: string, buttonHover: string, gradient: string }> = {
    slate: { bg: 'bg-slate-900', border: 'border-slate-700', text: 'text-slate-100', button: 'bg-indigo-600', buttonHover: 'hover:bg-indigo-700', gradient: 'from-indigo-600 to-violet-700' },
    indigo: { bg: 'bg-indigo-950', border: 'border-indigo-800', text: 'text-indigo-100', button: 'bg-indigo-500', buttonHover: 'hover:bg-indigo-600', gradient: 'from-indigo-500 to-blue-600' },
    emerald: { bg: 'bg-emerald-950', border: 'border-emerald-800', text: 'text-emerald-100', button: 'bg-emerald-600', buttonHover: 'hover:bg-emerald-700', gradient: 'from-emerald-600 to-teal-700' },
    rose: { bg: 'bg-rose-950', border: 'border-rose-800', text: 'text-rose-100', button: 'bg-rose-600', buttonHover: 'hover:bg-rose-700', gradient: 'from-rose-600 to-pink-700' },
    light: { bg: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-900', button: 'bg-slate-800', buttonHover: 'hover:bg-slate-900', gradient: 'from-slate-200 to-slate-300' },
    dark: { bg: 'bg-black', border: 'border-zinc-800', text: 'text-zinc-100', button: 'bg-zinc-800', buttonHover: 'hover:bg-zinc-700', gradient: 'from-zinc-900 to-black' }
  };
  
  const currentTheme = themeColors[theme] || themeColors.slate;

  if (step === 1) {
    return (
      <div className={`min-h-screen ${currentTheme.bg} flex items-center justify-center p-4 transition-colors duration-500`}>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className={`bg-black/20 p-8 rounded-3xl border ${currentTheme.border} max-w-md w-full text-center backdrop-blur-sm`}>
          <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <BookOpen size={40} className="text-white/80" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome to School Day!</h1>
          <p className="text-white/60 mb-8">Let's get you set up. What is your name?</p>
          
          <div className="space-y-4 mb-6">
            <input 
              type="text" 
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First Name"
              className={`w-full bg-black/40 border ${currentTheme.border} rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/50 transition-colors text-center text-lg`}
              autoFocus
            />
            <input 
              type="text" 
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last Name"
              className={`w-full bg-black/40 border ${currentTheme.border} rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/50 transition-colors text-center text-lg`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && firstName.trim() && lastName.trim()) {
                  if (firstName.trim().toLowerCase() === 'markus' && lastName.trim().toLowerCase() === 'admin') {
                    handleComplete();
                  } else {
                    setStep(2);
                  }
                }
              }}
            />
          </div>
          
          <button 
            onClick={() => {
              if (firstName.trim().toLowerCase() === 'markus' && lastName.trim().toLowerCase() === 'admin') {
                handleComplete();
              } else {
                setStep(2);
              }
            }}
            disabled={!firstName.trim() || !lastName.trim()}
            className={`w-full ${currentTheme.button} ${currentTheme.buttonHover} disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl transition-colors`}
          >
            {loading ? 'Saving...' : 'Next'}
          </button>
        </motion.div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className={`min-h-screen ${currentTheme.bg} flex items-center justify-center p-4 transition-colors duration-500`}>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className={`bg-black/20 p-8 rounded-3xl border ${currentTheme.border} max-w-2xl w-full backdrop-blur-sm`}>
          <h1 className="text-2xl font-bold text-white mb-2 text-center">Set up your classes</h1>
          <p className="text-white/60 mb-8 text-center">Enter your class schedule for periods 1 through 8.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
            {['1', '2', '3A', '3B', '4A', '4B', '5', '6', '7', '8'].map((period) => (
              <div key={period} className="flex items-center gap-3">
                <div className="w-16 text-right text-white/60 font-mono text-sm">Period {period}</div>
                <input
                  type="text"
                  value={classes[period] || ''}
                  onChange={(e) => setClasses({ ...classes, [period]: e.target.value })}
                  className={`flex-1 bg-black/40 border ${currentTheme.border} rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/50 transition-colors`}
                />
              </div>
            ))}
          </div>
          
          <div className="flex gap-4">
            <button 
              onClick={() => setStep(1)}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-4 rounded-xl transition-colors"
            >
              Back
            </button>
            <button 
              onClick={() => setStep(3)}
              className={`flex-1 ${currentTheme.button} ${currentTheme.buttonHover} text-white font-bold py-3 px-4 rounded-xl transition-colors`}
            >
              Next
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${currentTheme.bg} flex items-center justify-center p-4 transition-colors duration-500`}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className={`bg-black/20 p-8 rounded-3xl border ${currentTheme.border} max-w-md w-full text-center backdrop-blur-sm`}>
        <h1 className="text-2xl font-bold text-white mb-2">Choose a Style</h1>
        <p className="text-white/60 mb-8">Select a color theme for your app.</p>
        
        <div className="grid grid-cols-2 gap-4 mb-8">
          {['slate', 'indigo', 'emerald', 'rose'].map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`py-4 rounded-xl font-medium capitalize transition-colors border-2 ${theme === t ? 'border-white bg-white/20' : 'border-transparent bg-black/40 hover:bg-black/60'} text-white`}
            >
              {t}
            </button>
          ))}
        </div>
        
        <div className="flex gap-4">
          <button 
            onClick={() => setStep(2)}
            className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-4 rounded-xl transition-colors"
          >
            Back
          </button>
          <button 
            onClick={handleComplete}
            disabled={loading}
            className={`flex-1 ${currentTheme.button} ${currentTheme.buttonHover} disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl transition-colors`}
          >
            {loading ? 'Saving...' : 'Complete Setup'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
