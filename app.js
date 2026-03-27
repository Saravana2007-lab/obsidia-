// =====================================================
// app.js v25 - Combined Stable Build
// Features: Supabase + LocalStorage hybrid, Timer, Sessions, 
// PDF/Image viewer, AI Guide (Groq), Reminders, Flow view
// =====================================================

// Polyfill for older browsers
window.AudioContext = window.AudioContext || window.webkitAudioContext;

// ===============================
// Global Error Handling
// ===============================
window.addEventListener('error', (event) => {
  // Ignore browser extension errors
  if (event.message && (
    event.message.includes('Receiving end does not exist') ||
    event.message.includes('content-all.js') ||
    event.message.includes('Extension context invalidated') ||
    event.message.includes('Could not establish connection')
  )) {
    event.preventDefault();
    return false;
  }
  console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  // Ignore browser extension promise rejections
  if (event.reason && (
    event.reason.message?.includes('Receiving end does not exist') ||
    event.reason.message?.includes('content-all.js') ||
    event.reason.message?.includes('Extension context invalidated') ||
    event.reason.message?.includes('Could not establish connection')
  )) {
    event.preventDefault();
    return false;
  }
  console.error('Unhandled promise rejection:', event.reason);
});

// ===============================
// GLOBAL TIMER STATE
// ===============================
let timerInterval = null;
let timeLeft = 25 * 60; // seconds

const TimerState = {
  state: 'idle', // 'idle' | 'running' | 'paused'
  get isRunning() { return this.state === 'running'; },
  setState(newState) { this.state = newState; }
};

// ===============================
// Supabase Config
// ===============================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://sunzeftpfptqlufosjpj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1bnplZnRwZnB0cWx1Zm9zanBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwNjQ4MzgsImV4cCI6MjA4MjY0MDgzOH0.pqTzVTeApTrx7rUxSRLaaPOuv2HN35a8vsa9E_nwUK0';

const CLOUD_ENABLED = false;

let supabase = null;

if (CLOUD_ENABLED) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.warn('Failed to create Supabase client:', e);
  }
}



 

// ===============================
// AI Config
// ===============================

const USER_TITLE = 'Saravana';

const OBSIDIA_SYSTEM_PROMPT = `You are Obsidia, a helpful and knowledgeable study guide AI companion. You assist with study questions, explain concepts, provide tips, and motivate the user. Always respond concisely and helpfully. Address the user as ${USER_TITLE}.`;

let guideContext = [];
let activePdfDoc = null;
let activePdfPage = 1;
let activePdfFileName = '';

// Syllabus hints for AI planning
const JAVA_SYLLABUS_HINT = `
JAVA EXAM FOCUS:
- Basics: syntax, data types, variables, operators, input/output
- Control flow: if/else, switch, loops
- OOP: class, object, constructor, this, static, encapsulation, inheritance, polymorphism, abstraction, interfaces
- Packages, access modifiers, wrapper classes, strings, arrays
- Exception handling, try-catch-finally, throws/throw, custom exceptions
- Collections: List, Set, Map, iterators, generics
- File handling basics, I/O streams, serialization
- Multithreading basics: Thread, Runnable, lifecycle, sync
- JDBC overview and simple DB connectivity
`;

const SQL_SYLLABUS_HINT = `
SQL / DBMS EXAM FOCUS:
- Relational model: tables, rows, columns, keys (primary, foreign)
- Basic SQL: SELECT, INSERT, UPDATE, DELETE
- WHERE, ORDER BY, GROUP BY, HAVING
- Functions: aggregate (COUNT, SUM, MAX, MIN, AVG) and scalar
- Joins: INNER, LEFT, RIGHT, FULL, self-join
- Subqueries and nested queries
- DDL: CREATE, ALTER, DROP; constraints: NOT NULL, UNIQUE, CHECK
- Normalization basics: 1NF, 2NF, 3NF
- Simple views, indexes
`;

// ===============================
// Theme System
// ===============================
const THEMES = ['olive', 'sky', 'crimson'];

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}

function cycleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'olive';
  const index = THEMES.indexOf(current);
  const nextTheme = THEMES[(index + 1) % THEMES.length];
  setTheme(nextTheme);
}

const savedTheme = localStorage.getItem('theme');
setTheme(savedTheme || 'olive');

// ===============================
// Hybrid Storage Provider
// ===============================
class HybridStorage {
  constructor() {
    this.localKey = 'app_state_v25';
  }

  async load() {
    const localRaw = localStorage.getItem(this.localKey);
    let localState = null;
    if (localRaw) {
      try {
        localState = JSON.parse(localRaw);
      } catch (e) {
        console.warn('Local state parse failed, ignoring local state:', e);
      }
    }

    if (!supabase) {
      return localState;
    }

    let cloudState = null;
    let cloudUpdatedAt = null;

    try {
      const { data, error } = await supabase
        .from('app_state')
        .select('state, updated_at')
        .eq('user_id', 'single_user')
        .maybeSingle();

      if (!error && data?.state) {
        cloudState = data.state;
        cloudUpdatedAt = data.updated_at;
      }
    } catch (e) {
      console.warn('Supabase load failed:', e);
    }

    if (!cloudState) return localState;

    const cloudHasContent = (Array.isArray(cloudState.subjects) && cloudState.subjects.length > 0)
      || (Array.isArray(cloudState.tasks) && cloudState.tasks.length > 0)
      || (Array.isArray(cloudState.exams) && cloudState.exams.length > 0);

    const localUpdatedAt = localState?.updated_at || null;

    if (localState && !cloudHasContent) {
      supabase.from('app_state').upsert({
        user_id: 'single_user',
        state: localState,
        updated_at: new Date().toISOString()
      }).catch((e) => console.warn('Supabase upsert failed (load sync):', e?.message || e));

      return localState;
    }

    if (!localUpdatedAt) {
      localStorage.setItem(this.localKey, JSON.stringify(cloudState));
      return cloudState;
    }

    if (new Date(localUpdatedAt) > new Date(cloudUpdatedAt)) {
      await supabase.from('app_state').upsert({
        user_id: 'single_user',
        state: localState,
        updated_at: new Date().toISOString()
      });
      return localState;
    }

    localStorage.setItem(this.localKey, JSON.stringify(cloudState));
    return cloudState;
  }

  async save(state) {
    const timestamp = new Date().toISOString();
    const stateWithTimestamp = { ...state, updated_at: timestamp };

    try {
      localStorage.setItem(this.localKey, JSON.stringify(stateWithTimestamp));
      console.log('Local storage saved:', { subjects: state.subjects?.length, tasks: state.tasks?.length, exams: state.exams?.length });
    } catch (e) {
      console.error('LocalStorage save failed:', e);
    }

    if (!supabase) {
      return;
    }

    console.log('Attempting Supabase sync...');
    setCloudSyncing(true);
    supabase
      .from('app_state')
      .upsert(
        {
          user_id: 'single_user',
          state: stateWithTimestamp,
          updated_at: timestamp
        },
        {
          onConflict: 'user_id',
          ignoreDuplicates: false
        }
      )
      .then(({ error }) => {
        if (error) {
          console.error('Supabase save error:', error.message);
        } else {
          console.log('Data synced to Supabase successfully!', { subjects: state.subjects?.length, tasks: state.tasks?.length });
        }
        setCloudSyncing(false);
      })
      .catch((e) => {
        console.error('Supabase save failed:', e.message || e);
        setCloudSyncing(false);
      });
  }
}
let storageProvider = new HybridStorage();
let appCore;

// ===============================
// Utility Functions
// ===============================
function generateId(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return 'No deadline';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString();
}

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getFallbackStudyRecommendation(state) {
  const nextTask = [...(state.tasks || [])]
    .filter((task) => !task.completed)
    .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0))[0];

  if (nextTask) {
    return `Start with "${nextTask.title}" for ${nextTask.estimate || 25} minutes, then take a short recall break.`;
  }

  const upcomingExam = [...(state.exams || [])].sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  if (upcomingExam) {
    return `Review the subject for "${upcomingExam.title}" first and turn one weak topic into a 25 minute focus block.`;
  }

  return 'Pick one subject, study for 25 minutes, and finish with a 5 minute recap from memory.';
}

function buildLocalQuiz(topicName) {
  return `Quick quiz for ${topicName}:\n1. What is the core idea behind ${topicName}?\n2. List two important subtopics.\n3. Where is ${topicName} commonly used?\n4. What mistake do students often make here?\n5. Explain ${topicName} in simple words to a beginner.`;
}

function buildLocalWeeklySummary(state) {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const weekSessions = (state.sessions || []).filter((session) => session.createdAt > weekAgo);
  const totalMinutes = weekSessions.reduce((sum, session) => sum + (session.duration || 0), 0);
  const totalSessions = weekSessions.length;
  const streak = state.stats?.streak || 0;
  return `You logged ${totalMinutes} study minutes across ${totalSessions} sessions this week and your streak is ${streak} day(s). Keep the momentum by protecting one fixed study block every day next week.`;
}

function buildPlanTasksFromHint(subjectId, subjectName, examDate) {
  const examDay = new Date(examDate);
  const today = new Date();
  const daysUntilExam = Math.max(1, Math.ceil((examDay.getTime() - today.getTime()) / 86400000));
  const hint = subjectName.toLowerCase().includes('java')
    ? JAVA_SYLLABUS_HINT
    : subjectName.toLowerCase().includes('sql') || subjectName.toLowerCase().includes('dbms')
      ? SQL_SYLLABUS_HINT
      : 'Basics, core concepts, worked examples, and one revision test';

  return hint
    .split('\n')
    .map((line) => line.replace(/^- /, '').trim())
    .filter(Boolean)
    .slice(0, Math.min(6, daysUntilExam))
    .map((title, index) => {
      const deadlineDate = new Date(today.getTime() + index * 86400000);
      return {
        title: `${subjectName}: ${title}`,
        estimate: index === 0 ? 50 : 40,
        difficulty: Math.min(5, 3 + Math.floor(index / 2)),
        priority: index < 2 ? 4 : 3,
        deadline: deadlineDate.toISOString().slice(0, 10),
        subjectId
      };
    });
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3000);
}
// Global loader control
function showLoader(message) {
  const loader = document.getElementById('globalLoader');
  if (!loader) return;
  const text = document.getElementById('globalLoaderText');
  if (text) text.textContent = message || 'Loading...';
  loader.classList.remove('hidden');
  loader.setAttribute('aria-hidden', 'false');
}

function hideLoader() {
  const loader = document.getElementById('globalLoader');
  if (!loader) return;
  loader.classList.add('hidden');
  loader.setAttribute('aria-hidden', 'true');
}
function updateStreak(state) {
  const today = new Date().toISOString().split("T")[0];
  const lastDate = state.stats?.lastStudyDate;
  const streak = state.stats?.streak || 0;

  let newStreak = streak;

  if (lastDate === today) {
    // already counted today
  } else {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    newStreak = (lastDate === yesterday) ? streak + 1 : 1;

    state.stats.lastStudyDate = today;
    state.stats.streak = newStreak;
    appCore.persist();
  }

  document.getElementById("streakCount").innerText = newStreak;
}


// ===============================
// State Management
// ===============================
function createEmptyState() {
  return {
    subjects: [],
    tasks: [],
    exams: [],
    sessions: [],
    reminders: [],
    stats: {
      totalMinutes: 0,
      xpPerSubject: {},
      lastStudyDate: null,
      streak: 0,
      lastTopicPerSubject: {}
    },
    ui: {
      selectedSubjectId: null,
      selectedTopicId: null
    },
    music: {
      playlistUrl: '',
      isPlaying: false
    }
  };
}

function mergeState(loadedState) {
  const empty = createEmptyState();
  return {
    ...empty,
    ...loadedState,
    subjects: loadedState?.subjects || [],
    tasks: loadedState?.tasks || [],
    exams: loadedState?.exams || [],
    sessions: loadedState?.sessions || [],
    stats: {
      ...empty.stats,
      ...(loadedState?.stats || {})
    },
    ui: {
      ...empty.ui,
      ...(loadedState?.ui || {})
    },
    reminders: loadedState?.reminders || []
  };
}

// ===============================
// Core App Class
// ===============================
class StudyAppCore {
  constructor(storage) {
    this.storage = storage;
    this.state = createEmptyState();
    this.onStateChange = null;
  }

  async init() {
    const loaded = await this.storage.load();
    if (loaded) {
      this.state = mergeState(loaded);
      // Ensure all subjects have topics array and topics have files array
      if (this.state.subjects) {
        this.state.subjects.forEach(subject => {
          if (!subject.topics) subject.topics = [];
          subject.topics.forEach(topic => {
            if (!topic.files) topic.files = [];
          });
        });
      }
    }
  }

  setOnStateChange(callback) {
    this.onStateChange = callback;
  }

  async persist() {
    await this.storage.save(this.state);
    if (this.onStateChange) this.onStateChange();
  }

  // Subjects
  addSubject(name) {
    const id = generateId('subject');
    this.state.subjects.push({ id, name, topics: [] });
    return id;
  }

  deleteSubject(id) {
    this.state.subjects = this.state.subjects.filter(s => s.id !== id);
    this.state.tasks = this.state.tasks.filter(t => t.subjectId !== id);
    delete this.state.stats.xpPerSubject[id];
    
    if (this.state.ui.selectedSubjectId === id) {
      this.state.ui.selectedSubjectId = null;
      this.state.ui.selectedTopicId = null;
    }
  }

  // Topics
  addTopic(subjectId, name) {
    const subject = this.state.subjects.find(s => s.id === subjectId);
    if (!subject) return null;
    if (!subject.topics) subject.topics = [];
    const id = generateId('topic');
    subject.topics.push({ id, name, files: [] });
    return id;
  }

  editTopic(subjectId, topicId, newName) {
    const subject = this.state.subjects.find(s => s.id === subjectId);
    if (!subject) return;
    const topic = subject.topics.find(t => t.id === topicId);
    if (topic) topic.name = newName;
  }

  editSubject(subjectId, newName) {
    const subject = this.state.subjects.find(s => s.id === subjectId);
    if (subject) subject.name = newName;
  }

  editFile(subjectId, topicId, fileId, newName) {
    const subject = this.state.subjects.find(s => s.id === subjectId);
    const topic = subject?.topics.find(t => t.id === topicId);
    const file = topic?.files.find(f => f.id === fileId);
    if (file) file.name = newName;
  }

  async deleteTopic(subjectId, topicId) {
    const subject = this.state.subjects.find(s => s.id === subjectId);
    if (!subject) return;

    subject.topics = subject.topics.filter(t => t.id !== topicId);
    this.state.tasks = this.state.tasks.filter(t => t.topicId !== topicId);

    if (this.state.ui.selectedTopicId === topicId) {
      this.state.ui.selectedTopicId = null;
    }

    if (supabase) {
      try {
        await supabase
          .from('pdf_summaries')
          .delete()
          .eq('topic_id', topicId);
      } catch (e) {
        console.warn('Failed to delete summaries:', e);
      }
    }
  }

  // Files
  addFile(subjectId, topicId, name, url, type) {
    const subject = this.state.subjects.find(s => s.id === subjectId);
    const topic = subject?.topics.find(t => t.id === topicId);
    if (!topic) return;
    if (!topic.files) topic.files = [];

    topic.files.push({
      id: generateId('file'),
      name,
      url,
      type
    });
  }

  async deleteFile(subjectId, topicId, fileId) {
    const subject = this.state.subjects.find(s => s.id === subjectId);
    const topic = subject?.topics.find(t => t.id === topicId);
    if (!topic) return;

    const file = topic.files.find(f => f.id === fileId);
    topic.files = topic.files.filter(f => f.id !== fileId);

    if (file?.name && supabase) {
      try {
        await supabase
          .from('pdf_summaries')
          .delete()
          .eq('doc_title', file.name)
          .eq('topic_id', topicId);
      } catch (e) {
        console.warn('Failed to delete file summary:', e);
      }
    }
  }

  // Tasks
  addTask(task) {
    const id = generateId('task');
    this.state.tasks.push({ id, completed: false, ...task });
    return id;
  }

  completeTask(taskId) {
    const task = this.state.tasks.find(t => t.id === taskId);
    if (!task || task.completed) return;
    task.completed = true;
    task.completedAt = new Date().toISOString();
  }

  deleteTask(taskId) {
    this.state.tasks = this.state.tasks.filter(t => t.id !== taskId);
  }

  // Exams
  addExam(exam) {
    const id = generateId('exam');
    this.state.exams.push({ id, ...exam });
    return id;
  }

  // Sessions
  addSession(session) {
    this.state.sessions.push({
      id: generateId('session'),
      ...session,
      createdAt: new Date().toISOString()
    });
    this.updateStatsFromSession(session);
  }

  updateStatsFromSession(session) {
    const todayKey = dateKey();
    const yesterdayKey = dateKey(new Date(Date.now() - 86400000));

    // Update total minutes
    this.state.stats.totalMinutes += session.duration;

    // Calculate and add XP
    const xp = Math.round(
      (session.duration / 10) * session.focus * session.difficulty
    );
    if (session.subjectId) {
      this.state.stats.xpPerSubject[session.subjectId] =
        (this.state.stats.xpPerSubject[session.subjectId] || 0) + xp;
    }

    // Update streak
    const lastDate = this.state.stats.lastStudyDate;
    if (lastDate === todayKey) {
      // Already studied today
    } else if (lastDate === yesterdayKey) {
      this.state.stats.streak += 1;
    } else {
      this.state.stats.streak = 1;
    }
    this.state.stats.lastStudyDate = todayKey;

    // Track last topic per subject
    if (session.topicId && session.subjectId) {
      this.state.stats.lastTopicPerSubject[session.subjectId] = session.topicId;
    }
  }

  // Reminders
  addReminder({ text, remindAt, repeat = 'none' }) {
    this.state.reminders.push({
      id: generateId('rem'),
      text,
      remindAt,
      repeat,
      triggeredAt: null
    });
  }

  deleteReminder(id) {
    this.state.reminders = this.state.reminders.filter(r => r.id !== id);
  }
}

// ===============================
// Reminder System
// ===============================
function checkReminders() {
  if (!appCore?.state?.reminders) return;

  const now = Date.now();

  appCore.state.reminders.forEach(rem => {
    if (!rem || rem.triggeredAt) return;

    const time = new Date(rem.remindAt).getTime();
    if (now < time) return;

    rem.triggeredAt = new Date().toISOString();
    showToast(`⏰ ${rem.text}`);
    guideSpeak(`Reminder: ${rem.text}`);

    if (rem.repeat && rem.repeat !== 'none') {
      rescheduleReminder(rem);
    }

    appCore.persist();
  });
}

function rescheduleReminder(rem) {
  const base = new Date(rem.remindAt);
  if (rem.repeat === 'daily') {
    base.setDate(base.getDate() + 1);
  } else if (rem.repeat === 'exam') {
    base.setDate(base.getDate() + 7);
  }
  rem.remindAt = base.toISOString().slice(0, 16);
  rem.triggeredAt = null;
}

// ===============================
// Render Functions
// ===============================
function renderAll() {
  if (!appCore?.state) return;
  renderHome();
  renderSubjects();
  renderTopics();
  renderFiles();
  renderTasks();
  renderDashboard();
  loadSavedGoals();
}

function renderHome() {
  const state = appCore.state;
  if (!state) return;

  const today = dateKey();
  const todaySessions = (state.sessions || []).filter((session) => dateKey(new Date(session.createdAt)) === today);
  const todayMinutes = todaySessions.reduce((sum, session) => sum + (session.duration || 0), 0);
  const todayTasks = (state.tasks || []).filter((task) => task.completed && task.completedAt && dateKey(new Date(task.completedAt)) === today).length;
  const todayXP = todaySessions.reduce((sum, session) => {
    const xp = Math.round(((session.duration || 0) / 10) * (session.focus || 1) * (session.difficulty || 1));
    return sum + xp;
  }, 0);

  const minutesEl = document.getElementById('todayMinutes');
  const tasksEl = document.getElementById('todayTasks');
  const xpEl = document.getElementById('todayXP');
  const streakEl = document.getElementById('streakCount');

  if (minutesEl) minutesEl.textContent = todayMinutes || 0;
  if (tasksEl) tasksEl.textContent = todayTasks || 0;
  if (xpEl) xpEl.textContent = todayXP || 0;
  if (streakEl) streakEl.textContent = state.stats.streak || 0;

  const nextTaskCard = document.getElementById('nextTaskCard');
  const nextTaskPill = document.getElementById('nextTaskPill');
  const nextTaskContent = nextTaskCard?.querySelector('.next-task-content');

  const nextTask = [...(state.tasks || [])]
    .filter((task) => !task.completed)
    .sort((a, b) => {
      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      if (aDeadline !== bDeadline) return aDeadline - bDeadline;
      return (Number(b.priority) || 0) - (Number(a.priority) || 0);
    })[0];

  if (!nextTaskContent || !nextTaskPill) return;

  if (nextTask) {
    const subject = state.subjects.find((item) => item.id === nextTask.subjectId);
    const topic = subject?.topics.find((item) => item.id === nextTask.topicId);
    const isOverdue = nextTask.deadline && new Date(nextTask.deadline) < new Date();

    nextTaskPill.textContent = isOverdue ? 'Overdue' : 'Up next';
    nextTaskContent.innerHTML = `
      <h3 class="next-task-title">${nextTask.title}</h3>
      <div class="next-task-meta">
        ${subject?.name ? `<span>${subject.name}</span>` : ''}
        ${topic?.name ? `<span>${topic.name}</span>` : ''}
        <span>${nextTask.estimate || 0} min</span>
        <span>Priority ${nextTask.priority || 0}/5</span>
        <span>Difficulty ${nextTask.difficulty || 0}/5</span>
        <span>${nextTask.deadline ? formatDate(nextTask.deadline) : 'No deadline'}</span>
      </div>
      <div class="next-task-actions">
        <button type="button" class="primary-inline-btn" onclick="completeTaskFN('${nextTask.id}')">Mark Complete</button>
        <button type="button" class="secondary-inline-btn" onclick="goToScreen('tasks')">Open Task Board</button>
      </div>
    `;
  } else {
    nextTaskPill.textContent = 'Queue empty';
    nextTaskContent.innerHTML = '<p class="subtle">No active tasks. Add one from the task board to build your next focus block.</p>';
  }
}
function renderSubjects() {
  const state = appCore.state;
  if (!state) return;

  const subjectList = document.getElementById('subjectList');
  if (!subjectList) return;

  const selectedId = state.ui.selectedSubjectId;

  if (state.subjects.length === 0) {
    subjectList.innerHTML = '<li class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);"><strong>No subjects yet</strong><br>Add a subject to get started!</li>';
  } else {
    subjectList.innerHTML = state.subjects.map(subject => {
      const topicCount = subject.topics ? subject.topics.length : 0;
      const fileCount = subject.topics ? subject.topics.reduce((sum, topic) => sum + (topic.files ? topic.files.length : 0), 0) : 0;
      
      return `
    <li class="subject-item ${selectedId === subject.id ? 'selected' : ''}">
      <span onclick="selectSubject('${subject.id}')">${subject.name}</span>
          <div style="font-size: 0.9rem; color: var(--text-muted); margin-top: 8px; width: 100%;">
            📚 ${topicCount} topics • 📄 ${fileCount} files
          </div>
      <div class="topic-actions">
            <button onclick="event.stopPropagation(); openSubjectFlow('${subject.id}')">📊 Flow</button>
            <button onclick="event.stopPropagation(); editSubjectFN('${subject.id}')">✏️ Edit</button>
            <button onclick="event.stopPropagation(); deleteSubjectFN('${subject.id}')" style="background: rgba(220, 38, 38, 0.1); color: #dc2626; border-color: #dc2626;">🗑️ Delete</button>
      </div>
    </li>
      `;
    }).join('');
  }

  // Populate selects
  const taskSubjectSelect = document.getElementById('taskSubjectSelect');
  if (taskSubjectSelect) {
    taskSubjectSelect.innerHTML = '<option value="">Select Subject</option>' + 
      state.subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  }

  const examSubjectSelect = document.getElementById('examSubjectSelect');
  if (examSubjectSelect) {
    examSubjectSelect.innerHTML = '<option value="">Select Subject</option>' + 
      state.subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  }
}

function renderTopics() {
  const state = appCore.state;
  const subjectId = state?.ui?.selectedSubjectId;
  if (!state || !subjectId) return;

  const subject = state.subjects.find(s => s.id === subjectId);
  if (!subject) return;

  const selectedTitleEl = document.getElementById('selectedSubjectTitle');
  if (selectedTitleEl) selectedTitleEl.textContent = subject.name;

  const topicList = document.getElementById('topicList');
  if (!topicList) return;

  const selectedTopicId = state.ui.selectedTopicId;

  topicList.innerHTML = subject.topics.map(topic => `
    <li class="topic-item ${selectedTopicId === topic.id ? 'selected' : ''}" onclick="selectTopic('${subjectId}', '${topic.id}')">
      ${topic.name} (${topic.files ? topic.files.length : 0} files)
      <div class="topic-actions">
        <button onclick="event.stopPropagation(); event.preventDefault(); deleteTopicFN('${subjectId}', '${topic.id}')">Delete</button>
        <button onclick="event.stopPropagation(); event.preventDefault(); editTopicFN('${subjectId}', '${topic.id}')">Edit</button>
      </div>
    </li>
  `).join('');

  // Populate task topic select
  const taskTopicSelect = document.getElementById('taskTopicSelect');
  if (taskTopicSelect) {
    taskTopicSelect.innerHTML = '<option value="">Select Topic</option>' + 
      subject.topics.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  }
}

function renderFiles() {
  const state = appCore.state;
  const subjectId = state?.ui?.selectedSubjectId;
  const topicId = state?.ui?.selectedTopicId;
  if (!state || !subjectId || !topicId) return;

  const subject = state.subjects.find(s => s.id === subjectId);
  const topic = subject?.topics.find(t => t.id === topicId);
  if (!topic) return;

  const fileList = document.getElementById('fileList');
  if (!fileList) return;

  fileList.innerHTML = (topic.files && topic.files.length > 0 ? topic.files.map(file => `
    <li class="file-item">
      📄 ${file.name} (${file.type || 'unknown'})
      <div class="file-actions">
        <button onclick="safeOpenFile('${subjectId}', '${topicId}', '${file.id}')">Open</button>
        <button onclick="deleteFileFN('${subjectId}', '${topicId}', '${file.id}')">Delete</button>
        <button onclick="editFileFN('${subjectId}', '${topicId}', '${file.id}')">Edit</button>
      </div>
    </li>
  `).join('') : '<li class="subtle">No files</li>');

  const uploadBox = document.getElementById('fileUploadBox');
  if (uploadBox) uploadBox.classList.toggle('hidden', !topicId);
}

function renderTasks() {
  const state = appCore.state;
  if (!state) return;

  const filter = document.getElementById('taskFilterSelect')?.value || 'all';
  let tasks = [...(state.tasks || [])];

  if (filter === 'overdue') {
    tasks = tasks.filter((task) => !task.completed && task.deadline && new Date(task.deadline) < new Date());
  }

  tasks.sort((a, b) => {
    if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
    const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
    const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
    if (aDeadline !== bDeadline) return aDeadline - bDeadline;
    return (Number(b.priority) || 0) - (Number(a.priority) || 0);
  });

  const taskList = document.getElementById('taskList');
  if (!taskList) return;

  if (tasks.length === 0) {
    taskList.innerHTML = '<li class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);"><strong>No tasks yet</strong><br>Add a new task to get started.</li>';
    return;
  }

  taskList.innerHTML = tasks.map((task) => {
    const subject = state.subjects.find((item) => item.id === task.subjectId);
    const topic = subject?.topics.find((item) => item.id === task.topicId);
    const deadlineText = task.deadline ? formatDate(task.deadline) : 'No deadline';
    const isOverdue = task.deadline && !task.completed && new Date(task.deadline) < new Date();

    return `
      <li class="task-item ${task.completed ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}">
        <h4>${task.title}</h4>
        <div class="meta">
          ${subject?.name ? `<span>${subject.name}</span>` : ''}
          ${topic?.name ? `<span>${topic.name}</span>` : ''}
          <span>${task.estimate || 0} min</span>
          <span>Priority ${task.priority || 0}/5</span>
          <span>Difficulty ${task.difficulty || 0}/5</span>
          <span>${deadlineText}</span>
          ${isOverdue ? '<span style="color: #dc2626; font-weight: 700;">Overdue</span>' : ''}
        </div>
        <div class="task-actions">
          ${!task.completed ? `<button onclick="completeTaskFN('${task.id}')" class="done-btn">Complete</button>` : `<span class="badge completed">Completed</span>`}
          <button onclick="deleteTaskFN('${task.id}')" class="ghost-btn">Delete</button>
        </div>
      </li>
    `;
  }).join('');
}
function renderDashboard() {
  const state = appCore.state;
  if (!state) return;

  // Subject stats
  const subjectStatsList = document.getElementById('subjectStatsList');
  if (subjectStatsList) {
    subjectStatsList.innerHTML = state.subjects.map(subject => {
      const xp = state.stats.xpPerSubject[subject.id] || 0;
      const progress = Math.min((xp / 1000) * 100, 100);
      return `
        <li class="subject-stat">
          ${subject.name}: ${xp} XP
          <div class="progress-bar">
            <span style="width: ${progress}%"></span>
          </div>
        </li>
      `;
    }).join('');
  }

  // Exams
  const examList = document.getElementById('examList');
  if (examList) {
    examList.innerHTML = state.exams.map(exam => `
      <li class="exam-item">
        ${exam.title} - ${formatDate(exam.date)}
        <button onclick="aiPlanFromSyllabus('${exam.subjectId}', '${exam.title}', new Date('${exam.date}'))">Plan</button>
      </li>
    `).join('');
  }
}

// ===============================
// STUDY TIMELINE CHART ENGINE
// ===============================
let timelineChart = null;
let homeTimelineChart = null;
let subjectCharts = {};

const DAILY_GOAL_MINUTES = 120;
function renderTimelineChart() {
  const state = appCore.state;
  const today = new Date();

  const labels = [];
  const values = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today.getTime() - i * 86400000);
    const key = date.toISOString().slice(0, 10);

    const total = state.sessions
      .filter(s => s.createdAt.slice(0, 10) === key)
      .reduce((sum, s) => sum + (s.duration || 0), 0);

    labels.push(key.slice(5));
    values.push(total);
  }

  const goalArray = new Array(7).fill(DAILY_GOAL_MINUTES);

  const ctx = document.getElementById("timelineChart");
  if (!ctx) return;

  if (timelineChart) timelineChart.destroy();

  timelineChart = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: "Minutes", data: values, borderWidth: 2, borderColor: 'rgba(75, 192, 192, 1)', fill: false },
        { label: "Goal", data: goalArray, borderDash: [6, 3], borderWidth: 1, borderColor: 'rgba(255, 99, 132, 1)', fill: false }
      ]
    },
    options: { responsive: true }
  });

  const todayMins = values[6];
  const txt = document.getElementById("goalStatusText");
  if (txt) {
    if (todayMins >= DAILY_GOAL_MINUTES) txt.textContent = "🔥 Goal achieved! Take small revision only.";
    else txt.textContent = `⚠ You are ${DAILY_GOAL_MINUTES - todayMins} mins behind. Do 1 short task.`;
  }

  // Analyze pattern and show recommendation
  analyzeTimelinePattern();
}

function renderSubjectMiniTimelines() {
  const container = document.getElementById("subjectTimelineContainer");
  const state = appCore.state;
  if (!container || !state) return;
  
  container.innerHTML = "";

  state.subjects.forEach(sub => {
    const div = document.createElement("div");
    div.className = "subject-timeline-mini";
    div.innerHTML = `<h4>${sub.name}</h4><canvas id="chart_${sub.id}" height="90"></canvas>`;
    container.appendChild(div);

    const labels = [];
    const values = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today.getTime() - i * 86400000);
      const key = date.toISOString().slice(0, 10);

      const total = state.sessions
        .filter(s => s.subjectId === sub.id && s.createdAt.slice(0, 10) === key)
        .reduce((sum, s) => sum + (s.duration || 0), 0);

      labels.push(key.slice(5));
      values.push(total);
    }

    const ctx = document.getElementById(`chart_${sub.id}`);
    if (subjectCharts[sub.id]) subjectCharts[sub.id].destroy();
    subjectCharts[sub.id] = new Chart(ctx.getContext('2d'), {
      type: "bar",
      data: { labels, datasets: [{ label: "Minutes", data: values, backgroundColor: 'rgba(54, 162, 235, 0.6)' }] },
      options: { plugins: { legend: { display: false } }, responsive: true }
    });
  });
}

function flashTimeline() {
  const el = document.getElementById("timelineChart");
  if (!el) return;
  el.style.filter = "brightness(2)";
  setTimeout(() => el.style.filter = "brightness(1)", 250);
}

function renderHomeTimelineChart() {
  const state = appCore.state;
  const today = new Date();

  const labels = [];
  const values = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today.getTime() - i * 86400000);
    const key = date.toISOString().slice(0, 10);

    const total = state.sessions
      .filter(s => s.createdAt.slice(0, 10) === key)
      .reduce((sum, s) => sum + (s.duration || 0), 0);

    labels.push(key.slice(5));
    values.push(total);
  }

  const ctx = document.getElementById("homeTimelineChart");
  if (!ctx) return;

  if (homeTimelineChart) homeTimelineChart.destroy();

  homeTimelineChart = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: "Minutes",
        data: values,
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, max: DAILY_GOAL_MINUTES * 1.5 } }
    }
  });
}

// ===============================
// TIMELINE PATTERN ANALYZER
// ===============================
function analyzeTimelinePattern() {
  const state = appCore.state;
  const today = new Date();

  // Collect last 7 days
  const dailyData = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today.getTime() - i * 86400000);
    const key = date.toISOString().slice(0, 10);
    const total = state.sessions
      .filter(s => s.createdAt.slice(0, 10) === key)
      .reduce((sum, s) => sum + (s.duration || 0), 0);
    dailyData.push({ date: key, minutes: total });
  }

  let pattern = null;
  let recommendation = "";
  let emoji = "📊";

  // Pattern 1: 📉 Drop in minutes
  const avg3days = (dailyData[4]?.minutes + dailyData[5]?.minutes + dailyData[6]?.minutes) / 3;
  const prev3days = (dailyData[1]?.minutes + dailyData[2]?.minutes + dailyData[3]?.minutes) / 3;
  if (avg3days < prev3days * 0.8 && prev3days > 0) {
    pattern = "drop";
    emoji = "📉";
    recommendation = "📉 Motivation dropping? Break into 10–15 min micro-sessions or run a quick Pomodoro.";
  }

  // Pattern 2: 📈 Spike days
  const maxDay = Math.max(...dailyData.map(d => d.minutes));
  if (maxDay >= DAILY_GOAL_MINUTES * 1.5) {
    pattern = "spike";
    emoji = "📈";
    const spikeDate = dailyData.find(d => d.minutes === maxDay);
    recommendation = `📈 You had a spike day (${maxDay} mins) recently! Schedule your hardest topics (DBMS transactions, DSA graphs) on high-energy days like these.`;
  }

  // Pattern 3: 🟰 Flat (no growth)
  const variance = Math.max(...dailyData.map(d => d.minutes)) - Math.min(...dailyData.map(d => d.minutes));
  const avgMinutes = dailyData.reduce((sum, d) => sum + d.minutes, 0) / 7;
  if (variance < 30 && avgMinutes < DAILY_GOAL_MINUTES) {
    pattern = "flat";
    emoji = "🟰";
    recommendation = `🟰 Flat progress detected (avg ${Math.round(avgMinutes)} mins). Push yourself: +20 mins daily, add 2 mock tests this week.`;
  }

  // Pattern 4: 🕳 Gaps (0 minutes)
  const gapDays = dailyData.filter(d => d.minutes === 0).length;
  if (gapDays > 0) {
    pattern = "gap";
    emoji = "🕳";
    recommendation = `🕳 You skipped ${gapDays} day(s) this week. Add a 30-min buffer revision session tomorrow to catch up.`;
  }

  // Display recommendation
  displayTimelineRecommendation(emoji, recommendation, pattern);
}

function displayTimelineRecommendation(emoji, text, pattern) {
  let container = document.getElementById("timelineAdviceBox");
  
  if (!container) {
    // Create container if it doesn't exist
    const dashboardSection = document.getElementById("dashboard");
    if (!dashboardSection) return;
    
    container = document.createElement("div");
    container.id = "timelineAdviceBox";
    container.className = "card timeline-advice";
    
    const goalStatusEl = document.getElementById("goalStatusText");
    if (goalStatusEl && goalStatusEl.parentElement) {
      goalStatusEl.parentElement.insertAdjacentElement("afterend", container);
    }
  }

  container.innerHTML = `<h3>${emoji} Pattern Insight</h3><p>${text}</p>`;
  container.className = `card timeline-advice advice-${pattern}`;
}
async function uploadFilesLocally(files, subjectId, topicId) {
  for (const file of files) {
    const fileUrl = URL.createObjectURL(file);
    appCore.addFile(subjectId, topicId, file.name, fileUrl, file.type || 'local');
  }

  await appCore.persist();
  renderFiles();
  showToast('Files added locally');
}


// ===============================
// ANALYTICS DASHBOARD ENGINE
// ===============================
let heatmapChart = null;
let radarAnalyticsChart = null;
let progressChart = null;

function renderAnalyticsDashboard() {
  const state = appCore.state;
  if (!state) return;

  // Update stat cards
  const totalMinutes = state.sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
  const totalSessions = state.sessions.length;
  const totalXP = Object.values(state.stats.xpPerSubject || {}).reduce((a, b) => a + b, 0);
  const streak = state.stats.streak || 0;

  const minutesEl = document.getElementById("totalMinutesAnal");
  const sessionsEl = document.getElementById("totalSessionsAnal");
  const xpEl = document.getElementById("totalXPAnal");
  const streakEl = document.getElementById("currentStreakAnal");
  
  if (minutesEl) minutesEl.textContent = totalMinutes || 0;
  if (sessionsEl) sessionsEl.textContent = totalSessions || 0;
  if (xpEl) xpEl.textContent = totalXP || 0;
  if (streakEl) streakEl.textContent = streak || 0;

  // Render charts with a small delay to ensure DOM is ready
  setTimeout(() => {
    // Render heatmap (last 30 days)
    renderHeatmapChart();

    // Render subject distribution (bar chart)
    renderRadarAnalyticsChart();

    // Render progress graph
    renderProgressChart();

    // Render subject performance
    renderSubjectPerformance();
  }, 100);
}

function renderHeatmapChart() {
  const state = appCore.state;
  const ctx = document.getElementById("heatmapAnalytics");
  if (!ctx) {
    console.warn('Heatmap chart canvas not found');
    return;
  }

  // Destroy existing chart
  if (heatmapChart) {
    heatmapChart.destroy();
    heatmapChart = null;
  }

  const today = new Date();
  const labels = [];
  const values = [];

  for (let i = 29; i >= 0; i--) {
    const date = new Date(today.getTime() - i * 86400000);
    const key = date.toISOString().slice(0, 10);

    const total = state.sessions
      .filter(s => s.createdAt && s.createdAt.slice(0, 10) === key)
      .reduce((sum, s) => sum + (s.duration || 0), 0);

    labels.push(key.slice(5));
    values.push(total);
  }

  // Color intensity based on minutes - using theme colors
  const colors = values.map(v => {
    if (v === 0) return 'rgba(0, 0, 0, 0.08)';
    if (v < 60) return 'rgba(0, 0, 0, 0.4)';
    if (v < 120) return 'rgba(0, 0, 0, 0.6)';
    return 'rgba(0, 0, 0, 0.85)';
  });

  heatmapChart = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: "Study Minutes",
        data: values,
        backgroundColor: colors,
        borderColor: 'rgba(0, 0, 0, 0.2)',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          titleColor: '#ffffff',
          bodyColor: '#ffffff',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: function(context) {
              const minutes = context.parsed.y;
              const hours = Math.floor(minutes / 60);
              const mins = minutes % 60;
              if (hours > 0) {
                return `${hours}h ${mins}m`;
              }
              return `${mins} minutes`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: 'rgba(0, 0, 0, 0.7)',
            font: {
              size: 10
            },
            maxRotation: 45,
            minRotation: 45
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.05)',
            display: false
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: 'rgba(0, 0, 0, 0.7)',
            font: {
              size: 11,
              weight: '500'
            },
            callback: function(value) {
              return value + 'm';
            }
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.08)',
            lineWidth: 1
          }
        }
      },
      animation: {
        duration: 1000,
        easing: 'easeOutQuart'
      }
    }
  });
}

function renderRadarAnalyticsChart() {
  const state = appCore.state;
  const ctx = document.getElementById("radarAnalytics");
  if (!ctx) {
    console.warn('Radar chart canvas not found');
    return;
  }

  // Destroy existing chart
  if (radarAnalyticsChart) {
    radarAnalyticsChart.destroy();
    radarAnalyticsChart = null;
  }

  // Handle empty state
  const emptyState = document.getElementById('radarEmptyState');
  
  if (!state.subjects || state.subjects.length === 0) {
    ctx.style.display = 'none';
    if (emptyState) {
      emptyState.classList.remove('hidden');
      emptyState.innerHTML = '<p>No subjects available</p><small>Add subjects to see distribution</small>';
    }
    return;
  }

  // Get subject data
  const labels = state.subjects.map(s => s.name);
  const data = state.subjects.map(s => {
    const minutes = state.sessions
      .filter(sess => sess.subjectId === s.id)
      .reduce((sum, sess) => sum + (sess.duration || 0), 0);
    return minutes;
  });

  // Check if all data is zero
  const totalMinutes = data.reduce((sum, val) => sum + val, 0);
  if (totalMinutes === 0) {
    ctx.style.display = 'none';
    if (emptyState) {
      emptyState.classList.remove('hidden');
      emptyState.innerHTML = '<p>No study sessions recorded yet</p><small>Start studying to see your distribution</small>';
    }
    return;
  }

  // Show canvas and hide empty state
  ctx.style.display = 'block';
  if (emptyState) {
    emptyState.classList.add('hidden');
  }

  // Calculate percentages for better visualization
  const percentages = data.map(val => totalMinutes > 0 ? Math.round((val / totalMinutes) * 100) : 0);

  // Color palette matching the app theme
  const colors = [
    'rgba(0, 0, 0, 0.8)',      // Black
    'rgba(0, 0, 0, 0.65)',     // Dark gray
    'rgba(0, 0, 0, 0.5)',      // Medium gray
    'rgba(0, 0, 0, 0.35)',     // Light gray
    'rgba(0, 0, 0, 0.25)',     // Very light gray
  ];

  // Create horizontal bar chart with improved styling
  radarAnalyticsChart = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: "Study Minutes",
        data,
        backgroundColor: labels.map((_, i) => colors[i % colors.length]),
        borderColor: labels.map((_, i) => colors[i % colors.length]),
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y', // Horizontal bars
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          titleColor: '#ffffff',
          bodyColor: '#ffffff',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          callbacks: {
            label: function(context) {
              const minutes = context.parsed.x;
              const percentage = percentages[context.dataIndex];
              const hours = Math.floor(minutes / 60);
              const mins = minutes % 60;
              let timeStr = '';
              if (hours > 0) {
                timeStr = `${hours}h ${mins}m`;
              } else {
                timeStr = `${mins}m`;
              }
              return [
                `Time: ${timeStr}`,
                `Percentage: ${percentage}%`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            color: 'rgba(0, 0, 0, 0.7)',
            font: {
              size: 11,
              weight: '500'
            },
            callback: function(value) {
              const hours = Math.floor(value / 60);
              const mins = value % 60;
              if (hours > 0) {
                return `${hours}h ${mins}m`;
              }
              return `${mins}m`;
            }
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.08)',
            lineWidth: 1
          }
        },
        y: {
          ticks: {
            color: 'rgba(0, 0, 0, 0.8)',
            font: {
              size: 13,
              weight: '600'
            },
            padding: 12
          },
          grid: {
            display: false
          }
        }
      },
      animation: {
        duration: 1000,
        easing: 'easeOutQuart'
      }
    }
  });
}

function renderProgressChart() {
  const state = appCore.state;
  const ctx = document.getElementById("progressAnalytics");
  if (!ctx) {
    console.warn('Progress chart canvas not found');
    return;
  }

  // Destroy existing chart
  if (progressChart) {
    progressChart.destroy();
    progressChart = null;
  }

  const today = new Date();
  const labels = [];
  const cumulativeXP = [];
  let totalXP = 0;

  for (let i = 29; i >= 0; i--) {
    const date = new Date(today.getTime() - i * 86400000);
    const key = date.toISOString().slice(0, 10);

    const dayXP = state.sessions
      .filter(s => s.createdAt && s.createdAt.slice(0, 10) === key)
      .reduce((sum, s) => {
        const xp = Math.round((s.duration / 10) * (s.focus || 1) * (s.difficulty || 1));
        return sum + xp;
      }, 0);

    totalXP += dayXP;
    labels.push(key.slice(5));
    cumulativeXP.push(totalXP);
  }

  progressChart = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: "Cumulative XP",
        data: cumulativeXP,
        borderColor: 'rgba(0, 0, 0, 0.9)',
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: 'rgba(0, 0, 0, 0.9)',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointHoverBackgroundColor: '#ffffff',
        pointHoverBorderColor: 'rgba(0, 0, 0, 0.9)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: 'rgba(0, 0, 0, 0.8)',
            font: {
              size: 12,
              weight: '500'
            },
            padding: 15,
            usePointStyle: true
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          titleColor: '#ffffff',
          bodyColor: '#ffffff',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: function(context) {
              return 'XP: ' + context.parsed.y.toLocaleString();
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: 'rgba(0, 0, 0, 0.7)',
            font: {
              size: 10
            },
            maxRotation: 45,
            minRotation: 45
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.05)',
            display: false
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: 'rgba(0, 0, 0, 0.7)',
            font: {
              size: 11,
              weight: '500'
            },
            callback: function(value) {
              return value.toLocaleString();
            }
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.08)',
            lineWidth: 1
          }
        }
      },
      animation: {
        duration: 1000,
        easing: 'easeOutQuart'
      }
    }
  });
}

function renderSubjectPerformance() {
  const state = appCore.state;
  const container = document.getElementById("subjectPerfList");
  if (!container) {
    console.warn('Subject performance container not found');
    return;
  }

  if (!state.subjects || state.subjects.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 40px; color: rgba(0, 0, 0, 0.5);"><p style="font-size: 16px; margin: 0 0 8px 0;">No subjects available</p><small style="font-size: 14px;">Add subjects to see performance</small></div>';
    return;
  }

  const perfData = state.subjects.map(subject => {
    const minutes = state.sessions
      .filter(s => s.subjectId === subject.id)
      .reduce((sum, s) => sum + (s.duration || 0), 0);
    const xp = (state.stats && state.stats.xpPerSubject && state.stats.xpPerSubject[subject.id]) || 0;
    const sessionCount = state.sessions.filter(s => s.subjectId === subject.id).length;
    return { name: subject.id, label: subject.name, minutes, xp, sessions: sessionCount };
  }).sort((a, b) => b.minutes - a.minutes);

  // Calculate max minutes for percentage
  const maxMinutes = Math.max(...perfData.map(p => p.minutes), 1);

  container.innerHTML = perfData.map(perf => {
    const hours = Math.floor(perf.minutes / 60);
    const mins = perf.minutes % 60;
    const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    const percentage = maxMinutes > 0 ? Math.min((perf.minutes / maxMinutes) * 100, 100) : 0;
    
    return `
    <div class="perf-item">
      <div>
        <h4>${perf.label}</h4>
        <div class="perf-stats">
          <span>⏱️ ${timeStr}</span>
          <span>⭐ ${perf.xp.toLocaleString()} XP</span>
          <span>📝 ${perf.sessions} ${perf.sessions === 1 ? 'session' : 'sessions'}</span>
        </div>
        <div class="progress-bar">
          <span style="width: ${percentage}%"></span>
        </div>
      </div>
    </div>
    `;
  }).join('');
}

// ===============================
// Timer Functions
// ===============================
function updateTimerUiState() {
  const status = document.getElementById('timerStatus');
  let label = 'Ready';

  if (TimerState.state === 'running') {
    label = 'Running';
  } else if (TimerState.state === 'paused') {
    label = 'Paused';
  }

  document.body.classList.toggle('timer-running', TimerState.state === 'running');
  if (status) status.textContent = label;
}

function updateTimerDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const display = document.getElementById('timerDisplay');
  if (display) {
    display.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  updateTimerUiState();
}

function startTimer() {
  if (TimerState.isRunning) return;
  TimerState.setState('running');
  updateTimerUiState();
  timerInterval = setInterval(() => {
    if (timeLeft <= 0) {
      stopTimer();
      showToast('Time up! Great session.');
      openSessionModal();
      return;
    }
    timeLeft--;
    updateTimerDisplay();
  }, 1000);
}

function stopTimer() {
  TimerState.setState('paused');
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  updateTimerUiState();
}

function resetTimer() {
  stopTimer();
  TimerState.setState('idle');
  const preset = parseInt(document.getElementById('timerPreset')?.value) || 25;
  timeLeft = preset * 60;
  updateTimerDisplay();
}

// ===============================
// Session Modal
// ===============================
function openSessionModal() {
  const modal = document.getElementById('sessionModal');
  if (!modal) return;

  const summary = document.getElementById('sessionModalSummary');
  if (summary) {
    summary.textContent = `You studied for ${Math.floor((25 * 60 - timeLeft) / 60)} minutes.`;
  }

  const taskSelect = document.getElementById('sessionTaskSelect');
  if (taskSelect) {
    taskSelect.innerHTML = '<option value="">Free study</option>' + 
      appCore.state.tasks.map(t => `<option value="${t.id}">${t.title}</option>`).join('');
  }

  modal.classList.remove('hidden');
}

// ===============================
// Subject Flow Modal
// ===============================
function openSubjectFlow(subjectId) {
  if (!appCore?.state) return;

  const subject = appCore.state.subjects.find(s => s.id === subjectId);
  if (!subject) return;

  const lastTopicId = appCore.state.stats.lastTopicPerSubject?.[subjectId];

  const titleEl = document.getElementById('flowTitle');
  if (titleEl) {
    titleEl.textContent = `${subject.name} – Study Flow`;
  }

  const container = document.getElementById('flowContainer');
  if (!container) return;

  container.innerHTML = '';

  subject.topics.forEach((topic, index) => {
    const isLast = topic.id === lastTopicId;
    const topicBlock = document.createElement('div');
    topicBlock.className = 'flow-topic' + (isLast ? ' active' : '');

    topicBlock.innerHTML = `
      <div class="flow-topic-header">
        ${index + 1}. ${topic.name}
      </div>
      <ul class="flow-files">
        ${topic.files && topic.files.length
          ? topic.files.map(f => `
              <li>
                📄 ${f.name}
                ${f.type === 'application/pdf'
                  ? `<button onclick="openPdfSummary('${subjectId}', '${topic.id}', '${f.id}')">Summary</button>`
                  : `<button onclick="safeOpenFile('${subjectId}', '${topic.id}', '${f.id}')">Open</button>`
                }
              </li>
            `).join('')
          : '<li class="subtle">No files</li>'
        }
      </ul>
    `;

    container.appendChild(topicBlock);

    if (isLast) {
      setTimeout(() => {
        topicBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  });

  const modal = document.getElementById('flowModal');
  if (modal) modal.classList.remove('hidden');
}

// ===============================
// File Viewers
// ===============================
function safeOpenFile(subjectId, topicId, fileId) {
  const subject = appCore.state.subjects.find(s => s.id === subjectId);
  const topic = subject?.topics.find(t => t.id === topicId);
  const file = topic?.files.find(f => f.id === fileId);

  if (!file || !file.url) {
    showToast('File missing. Re-upload it.');
    return;
  }

  if (file.type === 'application/pdf') {
    openPDFViewer(file.url, file.name);
  } else if (file.type?.startsWith('image/')) {
    openImageViewer(file.url, file.name);
  } else {
    window.open(file.url, '_blank');
  }
}

function openPDFViewer(url, title) {
  const modal = document.getElementById('pdfModal');
  if (!modal) return;

  const titleEl = document.getElementById('pdfTitle');
  if (titleEl) titleEl.textContent = title;

  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.getDocument(url).promise.then(pdf => {
      activePdfDoc = pdf;
      activePdfPage = 1;
      activePdfFileName = title;
      const totalPages = pdf.numPages;
      const totalEl = document.getElementById('totalPages');
      if (totalEl) totalEl.textContent = totalPages;

      renderPdfPage(pdf, 1);
    });
  }

  modal.classList.remove('hidden');
}

function renderPdfPage(pdf, pageNum) {
  pdf.getPage(pageNum).then(page => {
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    page.render({ canvasContext: context, viewport }).promise.then(() => {
      const viewer = document.getElementById('pdfViewer');
      const currentPage = document.getElementById('currentPage');
      if (viewer) {
        viewer.innerHTML = '';
        viewer.appendChild(canvas);
      }
      if (currentPage) currentPage.textContent = pageNum;
      activePdfPage = pageNum;
    });
  });
}

async function summarizeActivePdfPage() {
  if (!activePdfDoc) {
    showToast('Open a PDF first.');
    return;
  }

  try {
    const page = await activePdfDoc.getPage(activePdfPage);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join(' ').trim();
    const summaryBox = document.getElementById('pdfSummaryBox');

    if (!summaryBox) return;

    if (!pageText) {
      summaryBox.textContent = 'No readable text found on this page.';
      summaryBox.classList.remove('hidden');
      return;
    }

    const summary = pageText
      .split(/[.?!]\s+/)
      .filter(Boolean)
      .slice(0, 4)
      .map((line) => `- ${line.trim()}`)
      .join('\n');

    summaryBox.textContent = `Summary for ${activePdfFileName || 'PDF'} page ${activePdfPage}:\n${summary}`;
    summaryBox.classList.remove('hidden');
  } catch (error) {
    console.error('Active PDF summary failed:', error);
    showToast('Could not summarize this page.');
  }
}

function openImageViewer(url, title) {
  const modal = document.getElementById('imageModal');
  if (!modal) return;

  const img = document.getElementById('imageViewer');
  const titleEl = document.getElementById('imageTitle');
  
  if (img) img.src = url;
  if (titleEl) titleEl.textContent = title;
  
  modal.classList.remove('hidden');
}

async function openPdfSummary(subjectId, topicId, fileId) {
  const subject = appCore.state.subjects.find(s => s.id === subjectId);
  const topic = subject?.topics.find(t => t.id === topicId);
  const file = topic?.files.find(f => f.id === fileId);

  if (!file) {
    showToast('File not found.');
    return;
  }

  if (!supabase) {
    safeOpenFile(subjectId, topicId, fileId);
    showToast('Cloud summaries are off. Opened the file instead.');
    return;
  }

  try {
    const { data } = await supabase
      .from('pdf_summaries')
      .select('summary')
      .eq('topic_id', topicId)
      .eq('doc_title', file.name)
      .order('page_number');

    if (!data || !data.length) {
      showToast('No summary yet. Summarize the PDF first.');
      return;
    }

    const summary = data.map(d => d.summary).join('\n\n');
    guideSpeak(`Here's the summary, ${USER_TITLE}.`);
    showToast('Summary loaded');
  } catch (e) {
    console.error('openPdfSummary error', e);
    showToast('Summary load failed');
  }
}

// ===============================
// File Upload System
// ===============================
async function uploadFiles({ files, subjectId, topicId }) {
  showLoader('Uploading files...');
  try {
  for (const file of files) {
    try {
      const filePath = `${subjectId}/${topicId}/${Date.now()}_${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from('pdfs')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        console.error(uploadError);
        showToast(`Upload failed: ${file.name}`);
        continue;
      }

      const { data } = supabase.storage
        .from('pdfs')
        .getPublicUrl(filePath);

      if (!data?.publicUrl) {
        showToast(`URL fetch failed: ${file.name}`);
        continue;
      }

      appCore.addFile(subjectId, topicId, file.name, data.publicUrl, file.type);

      if (file.type === 'application/pdf') {
        openPDFViewer(data.publicUrl, file.name);
      }

    } catch (err) {
      console.error('Upload error:', err);
      showToast(`Error uploading ${file.name}`);
    }
  }

  await appCore.persist();
  renderFiles();
  showToast('Files uploaded successfully.');
  } finally {
    hideLoader();
  }
}

// ===============================
// AI Planning from Syllabus
// ===============================
async function aiPlanFromSyllabus(subjectId, examTitle, examDate) {
  const subject = appCore.state.subjects.find(s => s.id === subjectId);
  if (!subject) return;

  const subjectName = subject.name;
  let syllabusText = '';

  if (subjectName.toLowerCase().includes('java')) {
    syllabusText = JAVA_SYLLABUS_HINT;
  } else if (subjectName.toLowerCase().includes('sql') || subjectName.toLowerCase().includes('dbms')) {
    syllabusText = SQL_SYLLABUS_HINT;
  } else {
    syllabusText = 'General syllabus: Cover all key topics evenly.';
  }

  const messages = [
    {
      role: 'system',
      content: 'You are a study planner. Generate tasks from syllabus in format: TITLE | MINUTES | DIFFICULTY (1-5) | DAY_OFFSET (0=today).'
    },
    {
      role: 'user',
      content: `Subject: ${subjectName}\nExam: ${examTitle}\nDate: ${examDate.toISOString().slice(0, 10)}\nSyllabus:\n${syllabusText}`
    }
  ];

  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.4,
        max_tokens: 512
      })
    });

    if (!res.ok) throw new Error('AI planner error');

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

    const today = new Date();
    const tasks = lines
      .map((line) => {
        const parts = line.split('|').map((part) => part.trim());
        if (parts.length < 4) return null;

        const title = parts[0];
        const minutes = Number(parts[1]) || 40;
        const difficulty = Number(parts[2]) || 3;
        const dayOffset = Number(parts[3]) || 0;
        const deadlineDate = new Date(today.getTime() + dayOffset * 86400000);

        return {
          title,
          estimate: minutes,
          difficulty,
          priority: difficulty >= 4 ? 4 : 3,
          deadline: deadlineDate.toISOString().slice(0, 10),
          subjectId
        };
      })
      .filter(Boolean);

    if (!tasks.length) throw new Error('Planner returned no tasks');

    tasks.forEach((task) => appCore.addTask(task));
    await appCore.persist();
    renderTasks();
    showToast(`Created ${tasks.length} tasks from syllabus.`);
  } catch (error) {
    console.error('aiPlanFromSyllabus error', error);
    const fallbackTasks = buildPlanTasksFromHint(subjectId, subjectName, examDate);
    fallbackTasks.forEach((task) => appCore.addTask(task));
    await appCore.persist();
    renderTasks();
    showToast(`Created ${fallbackTasks.length} fallback tasks.`);
  }
}

// ===============================
// STUDY TOOLS FUNCTIONS
// ===============================
function calculateExpression() {
  const input = document.getElementById('calcInput');
  const output = document.getElementById('calcOutput');
  if (!input || !output) return;

  try {
    // Arithmetic-only evaluation guard.
    if (!/^[0-9+\-*/%().\s*]+$/.test(input.value)) {
      throw new Error('Unsafe expression');
    }
    const result = Function(`"use strict"; return (${input.value})`)();
    output.textContent = `= ${result}`;
  } catch (e) {
    output.textContent = 'Invalid expression';
  }
}

const BRAIN_BREAKS = [
  'Take 3 deep breaths (4 sec in, 6 sec out)',
  'Stand up and stretch for 1 minute',
  'Drink a glass of water',
  'Look away from the screen for 20 seconds',
  'Do 10 jumping jacks',
  'Listen to a 1-minute song',
  'Do some light arm circles',
  'Smile and reset your posture',
  'Close your eyes and breathe slowly',
  'Look out the window for 30 seconds'
];

async function searchDictionary() {
  const input = document.getElementById('dictInput');
  const output = document.getElementById('dictOutput');
  if (!input || !output) return;

  const word = input.value.trim();
  if (!word) {
    output.textContent = 'Enter a word to search';
    return;
  }

  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
    if (!response.ok) {
      output.textContent = 'Word not found';
      return;
    }

    const data = await response.json();
    const entry = data[0];
    let result = `<strong>${entry.word}</strong>`;

    if (entry.phonetic) {
      result += `<br><small>/${entry.phonetic}/</small>`;
    }

    if (entry.meanings?.length) {
      result += '<br><br><strong>Definitions:</strong>';
      entry.meanings.forEach((meaning) => {
        result += `<br><strong>${meaning.partOfSpeech}</strong>`;
        if (meaning.definitions?.length) {
          result += `<br>- ${meaning.definitions[0].definition}`;
        }
      });
    }

    output.innerHTML = result;
  } catch (error) {
    console.error('Dictionary error:', error);
    output.textContent = 'Could not fetch definition';
  }
}

function saveQuickNotes() {
  const notesField = document.getElementById('quickNotes');
  if (!notesField) return;

  const notes = notesField.value;
  if (notes.trim()) {
    const timestamp = new Date().toLocaleString();
    const notesArray = JSON.parse(localStorage.getItem('quickNotes') || '[]');
    notesArray.push({ text: notes, timestamp });
    localStorage.setItem('quickNotes', JSON.stringify(notesArray));
    notesField.value = '';
    showToast('Notes saved');
  }
}

function loadQuickNotes() {
  const notesField = document.getElementById('quickNotes');
  if (!notesField) return;

  try {
    const notesArray = JSON.parse(localStorage.getItem('quickNotes') || '[]');
    const latest = notesArray[notesArray.length - 1];
    if (latest?.text) {
      notesField.value = latest.text;
    }
  } catch (error) {
    console.error('Quick notes load failed:', error);
  }
}

let pomodoroActive = false;
let pomodoroTime = 25 * 60;
let pomodoroInterval = null;
let isBreak = false;

function startPomodoro() {
  if (pomodoroActive) return;
  pomodoroActive = true;

  pomodoroInterval = setInterval(() => {
    pomodoroTime--;
    updatePomodoroDisplay();

    if (pomodoroTime <= 0) {
      if (!isBreak) {
        showToast('Focus session complete. Take a 5 min break.');
        guideSpeak('Focus session complete. Take a break.');
        pomodoroTime = 5 * 60;
        isBreak = true;
      } else {
        showToast('Break over. Ready for another session?');
        guideSpeak('Break over. Ready for another session?');
        resetPomodoro();
      }
    }
  }, 1000);
}

function updatePomodoroDisplay() {
  const mins = Math.floor(pomodoroTime / 60);
  const secs = pomodoroTime % 60;
  const display = document.getElementById('pomodoroDisplay');
  if (display) {
    display.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

function resetPomodoro() {
  pomodoroActive = false;
  isBreak = false;
  pomodoroTime = 25 * 60;
  clearInterval(pomodoroInterval);
  updatePomodoroDisplay();
}

let focusModeActive = false;

function toggleFocusMode() {
  focusModeActive = !focusModeActive;
  document.body.classList.toggle('focus-mode', focusModeActive);

  const status = document.getElementById('focusModeStatus');
  if (status) {
    status.textContent = focusModeActive ? 'Active' : 'Off';
  }

  showToast(focusModeActive ? 'Focus Mode ON' : 'Focus Mode OFF');
}

let studyGoals = [];

function addStudyGoal() {
  const input = document.getElementById('goalInput');
  if (!input) return;

  const goal = input.value.trim();
  if (goal) {
    studyGoals.push({ text: goal, completed: false, id: Date.now() });
    localStorage.setItem('studyGoals', JSON.stringify(studyGoals));
    input.value = '';
    renderGoals();
    showToast('Goal added');
  }
}

function renderGoals() {
  const list = document.getElementById('goalsList');
  if (!list) return;

  list.innerHTML = studyGoals.map(goal => `
    <li>
      <span style="text-decoration: ${goal.completed ? 'line-through' : 'none'}; color: ${goal.completed ? 'var(--text-muted)' : 'var(--text)'};">
        ${goal.text}
      </span>
      <div>
        <button onclick="toggleGoal(${goal.id})">${goal.completed ? 'Undo' : 'Done'}</button>
        <button onclick="deleteGoal(${goal.id})">Delete</button>
      </div>
    </li>
  `).join('');
}

function toggleGoal(id) {
  const goal = studyGoals.find(g => g.id === id);
  if (goal) {
    goal.completed = !goal.completed;
    localStorage.setItem('studyGoals', JSON.stringify(studyGoals));
    renderGoals();
  }
}

function deleteGoal(id) {
  studyGoals = studyGoals.filter(g => g.id !== id);
  localStorage.setItem('studyGoals', JSON.stringify(studyGoals));
  renderGoals();
  showToast('Goal removed');
}

function suggestBrainBreak() {
  const suggestion = BRAIN_BREAKS[Math.floor(Math.random() * BRAIN_BREAKS.length)];
  const output = document.getElementById('brainBreakSuggestion');
  if (output) {
    output.textContent = suggestion;
  }
  showToast('Brain break suggested');
}

function loadSavedGoals() {
  const saved = localStorage.getItem('studyGoals');
  if (saved) {
    try {
      studyGoals = JSON.parse(saved);
      renderGoals();
    } catch (e) {
      console.error('Error loading goals:', e);
    }
  }
}

function switchTool(event, toolId) {
  document.querySelectorAll('.tool-panel').forEach(panel => panel.classList.remove('show'));
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));

  const panel = document.getElementById(`tool-${toolId}`);
  if (panel) {
    panel.classList.add('show');
  }

  if (event?.target) {
    event.target.classList.add('active');
  }
}

function initMusicPlayer() {
  try {
    const loadBtn = document.getElementById('loadPlaylistBtn');
    const playlistInput = document.getElementById('spotifyPlaylistInput');

    if (!loadBtn || !playlistInput) {
      return;
    }

    const savedPlaylist = localStorage.getItem('spotifyPlaylist');
    if (savedPlaylist) {
      playlistInput.value = savedPlaylist;
      loadSpotifyPlaylist(savedPlaylist);
    }

    if (!loadBtn._bound) {
      loadBtn._bound = true;
      loadBtn.addEventListener('click', () => {
        const url = playlistInput.value.trim();
        if (url) {
          loadSpotifyPlaylist(url);
          localStorage.setItem('spotifyPlaylist', url);
          showToast('Playlist loaded');
        } else {
          showToast('Please enter a playlist URL');
        }
      });
    }

    if (!playlistInput._bound) {
      playlistInput._bound = true;
      playlistInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          loadBtn.click();
        }
      });
    }
  } catch (error) {
    console.error('Music player error:', error);
  }
}

function loadSpotifyPlaylist(urlOrId) {
  try {
    let playlistId = urlOrId;
    const match = urlOrId.match(/playlist\/([a-zA-Z0-9]+)/);
    if (match) {
      playlistId = match[1];
    }

    const embedContainer = document.getElementById('spotifyEmbed');
    if (embedContainer) {
      const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
      embedContainer.innerHTML = `<iframe id="spotifyPlayer" src="${embedUrl}" width="100%" height="352" frameborder="0" allowtransparency="true" allow="encrypted-media"></iframe>`;
    } else {
      const normalUrl = `https://open.spotify.com/playlist/${playlistId}`;
      window.open(normalUrl, '_blank');
    }
  } catch (error) {
    console.warn('Error loading Spotify playlist:', error);
    showToast('Error opening playlist');
  }
}

// ===============================
// OBSIDIA AI ENHANCEMENTS
// ===============================
async function getObsidiaRecommendation() {
  if (!appCore?.state) return;

  const state = appCore.state;
  const upcomingExams = state.exams?.filter(e => new Date(e.date) > new Date()) || [];
  const weakSubjects = Object.entries(state.stats?.xpPerSubject || {})
    .sort((a, b) => a[1] - b[1])
    .slice(0, 2)
    .map(([id]) => state.subjects.find(s => s.id === id)?.name)
    .filter(Boolean);

  let context = `User's streak: ${state.stats?.streak || 0} days\n`;
  if (weakSubjects.length > 0) context += `Weak subjects: ${weakSubjects.join(', ')}\n`;
  if (upcomingExams.length > 0) context += `Upcoming exams: ${upcomingExams.map(e => e.title).join(', ')}\n`;

  const recommendationPrompt = `Based on this study data:\n${context}\nGive a specific recommendation for what to study next in 1-2 sentences.`;

  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: recommendationPrompt }],
        temperature: 0.6,
        max_tokens: 150
      })
    });

    if (!res.ok) throw new Error('AI API error');
    const data = await res.json();
    const response = data.choices?.[0]?.message?.content;
    const message = response || 'Keep up the great work.';
    renderGuideBubble(`Next Study: ${message}`);
    guideSpeak(message);
  } catch (error) {
    console.error('Error getting recommendation:', error);
    renderGuideBubble(`Study recommendation: ${getFallbackStudyRecommendation(state)}`);
  }
}

async function generateTopicQuestions(topic = '') {
  let topicName = topic;

  if (!topicName) {
    const subjectId = document.getElementById('qgenSubject')?.value;
    const topicId = document.getElementById('qgenTopic')?.value;

    if (!subjectId || !topicId) {
      renderGuideBubble('Please select both subject and topic first');
      return;
    }

    const subject = appCore.state.subjects.find(s => s.id === subjectId);
    topicName = subject?.topics.find(t => t.id === topicId)?.name;
  }

  const questionPrompt = `Create a short quiz for the topic: ${topicName}`;

  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: questionPrompt }],
        temperature: 0.7,
        max_tokens: 800
      })
    });

    if (!res.ok) throw new Error('AI API error');
    const data = await res.json();
    const response = data.choices?.[0]?.message?.content;
    renderGuideBubble(response || 'Could not generate questions');
    showToast('Questions generated');
  } catch (error) {
    console.error('Error generating questions:', error);
    renderGuideBubble(buildLocalQuiz(topicName));
  }
}

async function generateWeeklySummary() {
  if (!appCore?.state) return;

  const state = appCore.state;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const weekSessions = state.sessions?.filter(s => s.createdAt > weekAgo) || [];
  const totalMinutes = weekSessions.reduce((sum, s) => sum + (s.duration || 0), 0);
  const totalSessions = weekSessions.length;
  const avgFocus = weekSessions.length > 0
    ? Math.round(weekSessions.reduce((sum, s) => sum + (s.focus || 0), 0) / weekSessions.length)
    : 0;

  const summaryPrompt = `Create a weekly study summary. Total minutes: ${totalMinutes}. Sessions: ${totalSessions}. Average focus: ${avgFocus}/5.`;

  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: summaryPrompt }],
        temperature: 0.6,
        max_tokens: 200
      })
    });

    if (!res.ok) throw new Error('AI API error');
    const data = await res.json();
    const response = data.choices?.[0]?.message?.content;
    renderGuideBubble(`Weekly Summary\n\n${response || 'Great week of studying.'}`);
    guideSpeak(response || 'Great week of studying.');
  } catch (error) {
    console.error('Error generating summary:', error);
    renderGuideBubble(buildLocalWeeklySummary(state));
  }
}

async function summarizePDF(file) {
  if (!file) {
    renderGuideBubble('Please select a PDF file');
    return;
  }

  try {
    renderGuideBubble('Processing PDF. This may take a moment.');
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const pdf = await pdfjsLib.getDocument({ data: e.target.result }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ');
          fullText += pageText + '\n';
        }

        const summaryPrompt = `Summarize this study material into key bullet points:\n\n${fullText.slice(0, 2000)}`;

        try {
          const res = await fetch('/api/ai', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              messages: [{ role: 'user', content: summaryPrompt }],
              temperature: 0.5,
              max_tokens: 800
            })
          });

          if (!res.ok) throw new Error('AI API error');
          const data = await res.json();
          const response = data.choices?.[0]?.message?.content;
          renderGuideBubble(`PDF Summary\n\n${response || 'Summary generated'}`);
        } catch (aiError) {
          const quickSummary = fullText
            .split(/[.?!]\s+/)
            .filter(Boolean)
            .slice(0, 6)
            .map((line) => `- ${line.trim()}`)
            .join('\n');
          renderGuideBubble(`PDF summary:\n${quickSummary}`);
        }

        showToast('PDF summarized');
      } catch (err) {
        console.error('PDF processing error:', err);
        renderGuideBubble('Could not process PDF. Try a simpler file.');
      }
    };
    reader.readAsArrayBuffer(file);
  } catch (error) {
    console.error('Error summarizing PDF:', error);
    renderGuideBubble('Error processing PDF');
  }
}

// Website URLs mapping
const WEBSITE_URLS = {
  'youtube': 'https://www.youtube.com',
  'youtube.com': 'https://www.youtube.com',
  'insta': 'https://www.instagram.com',
  'instagram': 'https://www.instagram.com',
  'instagram.com': 'https://www.instagram.com',
  'chatgpt': 'https://chat.openai.com',
  'chat gpt': 'https://chat.openai.com',
  'openai': 'https://chat.openai.com',
  'gmail': 'https://mail.google.com',
  'google mail': 'https://mail.google.com',
  'mail': 'https://mail.google.com'
};

function handleWebsiteCommand(command) {
  const lowerCommand = command.toLowerCase().trim();
  
  // Check for "open [website]" pattern
  const openMatch = lowerCommand.match(/^open\s+(.+)$/);
  if (openMatch) {
    const site = openMatch[1].trim();
    const url = WEBSITE_URLS[site];
    
    if (url) {
      window.open(url, '_blank');
      showToast(`Opening ${site}...`);
      guideSpeak(`Opening ${site} for you, ${USER_TITLE}.`);
      return true;
    }
  }
  
  // Also check direct website names
  for (const [key, url] of Object.entries(WEBSITE_URLS)) {
    if (lowerCommand.includes(key)) {
      window.open(url, '_blank');
      showToast(`Opening ${key}...`);
      guideSpeak(`Opening ${key} for you, ${USER_TITLE}.`);
      return true;
    }
  }
  
  return false;
}

async function handleGuideCommand(command) {
  if (!command.trim()) return;

  // Check if it's a website command first
  if (handleWebsiteCommand(command)) {
    return;
  }

  guideContext.push({ role: 'user', content: command });

  const lowerCommand = command.toLowerCase();

  // Handle PDF summarization request
  if (lowerCommand.includes('summariz') && (lowerCommand.includes('pdf') || lowerCommand.includes('file'))) {
    renderGuideBubble('Which PDF would you like me to summarize? Please upload it.');
    guideSpeak('Which PDF would you like me to summarize? Please upload it.');
    // Show file upload
    if (!guideContext.waitingForPDF) {
      guideContext.waitingForPDF = true;
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.pdf';
      fileInput.onchange = async (e) => {
        if (e.target.files[0]) {
          renderGuideBubble('Processing your PDF...');
          guideSpeak('Processing your PDF');
          await summarizePDF(e.target.files[0]);
          guideContext.waitingForPDF = false;
        }
      };
      fileInput.click();
    }
    return;
  }

  // Handle quiz/question generation request
  if (lowerCommand.includes('quiz') || lowerCommand.includes('question') || lowerCommand.includes('test me')) {
    const topicMatch = command.match(/(?:quiz|questions?|test me on|about)\s+(.+?)(?:\s*$|\.)/i);
    const topic = topicMatch ? topicMatch[1].trim() : 'current topic';
    renderGuideBubble(`Generating quiz questions on "${topic}"...`);
    guideSpeak(`Generating quiz questions on ${topic}`);
    await generateTopicQuestions(topic);
    return;
  }

  // Handle weekly summary request
  if (lowerCommand.includes('weekly') || lowerCommand.includes('summary') || lowerCommand.includes('week progress')) {
    renderGuideBubble('Generating your weekly summary...');
    guideSpeak('Generating your weekly summary');
    await generateWeeklySummary();
    return;
  }

  // Handle next topic/recommendation request
  if (lowerCommand.includes('what should i study') || lowerCommand.includes('next topic') || 
      lowerCommand.includes('recommend') || lowerCommand.includes('suggest')) {
    renderGuideBubble('Let me check what you should study next...');
    guideSpeak('Let me check what you should study next');
    await getObsidiaRecommendation();
    return;
  }

  // Default AI conversation
  const recentContext = guideContext.slice(-6);
  let contextPrompt = '';
  recentContext.forEach(msg => {
    if (msg.role === 'system') {
      contextPrompt += `System: ${msg.content}\n`;
    } else if (msg.role === 'user') {
      contextPrompt += `User: ${msg.content}\n`;
    } else if (msg.role === 'assistant') {
      contextPrompt += `Obsidia: ${msg.content}\n`;
    }
  });

  const fullPrompt = `${OBSIDIA_SYSTEM_PROMPT}\n\nRecent conversation:\n${contextPrompt}User: ${command}\nObsidia:`;

  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: fullPrompt }],
        temperature: 0.7,
        max_tokens: 300
      })
    });

    if (!res.ok) throw new Error('AI API error');
    const data = await res.json();
    const response = data.choices?.[0]?.message?.content;

    const responseText = response || 'Sorry, I couldn\'t process that.';
    guideContext.push({ role: 'assistant', content: responseText });

    renderGuideBubble(responseText);
    guideSpeak(responseText);

  } catch (error) {
    console.error('Guide AI error:', error);
    const fallbackText = 'Sorry, I had trouble responding. Try again!';
    renderGuideBubble(fallbackText);
    guideSpeak(fallbackText);
  }
}

function renderGuideBubble(message) {
  const bubble = document.getElementById('guideBubble');
  const messageEl = document.getElementById('guideMessage');
  if (bubble && messageEl) {
    messageEl.textContent = `Obsidia: ${message}`;
    bubble.classList.remove('hidden');
    setTimeout(() => bubble.classList.add('hidden'), 10000);
  }
}

// ===============================
// Navigation
// ===============================
function goToScreen(screenId) {
  window.currentScreen = screenId;
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.remove('hidden');
    
    // Trigger specific renders when switching screens
    if (screenId === 'analytics') {
      renderAnalyticsDashboard();
    } else if (screenId === 'home') {
      renderHome();
    } else if (screenId === 'subjects') {
      renderSubjects();
    } else if (screenId === 'tasks') {
      renderTasks();
    } else if (screenId === 'dashboard') {
      renderDashboard();
    } else if (screenId === 'studyplan') {
      renderStudyPlan();
    }
  }
  
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const navItem = document.querySelector(`[data-screen="${screenId}"]`);
  if (navItem) navItem.classList.add('active');
}

// =============================
// STUDY PLAN RENDER FUNCTION
// =============================
function renderStudyPlan() {
  const output = document.getElementById('generatedPlanOutput');
  if (output && !output.innerHTML.trim()) {
    output.innerHTML = '<div class="plan-empty">Upload a timetable and generate a plan to see your revision schedule here.</div>';
  }
}
// Render analytics charts using Chart.js (unused legacy function - charts are rendered by renderAnalyticsDashboard)
function renderCharts() {
  if (typeof Chart === 'undefined') return;
  // This function is no longer used - analytics charts are rendered by 
  // renderHeatmapChart, renderRadarAnalyticsChart, and renderProgressChart
}

// ===============================
// UI Event Bindings
// ===============================
function bindNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    if (!btn._bound) {
      btn._bound = true;
      btn.addEventListener('click', () => {
        goToScreen(btn.dataset.screen);
        if (btn.dataset.screen === 'studyplan') renderStudyPlan();
        if (btn.dataset.screen === 'analytics') renderAnalyticsDashboard();
      });
    }
  });
}

function bindTimer() {
  const startBtn = document.getElementById('startSessionBtn');
  const stopBtn = document.getElementById('stopSessionBtn');
  const resetBtn = document.getElementById('resetTimerBtn');
  const presetSelect = document.getElementById('timerPreset');

  if (startBtn && !startBtn._bound) {
    startBtn._bound = true;
    startBtn.addEventListener('click', startTimer);
  }

  if (stopBtn && !stopBtn._bound) {
    stopBtn._bound = true;
    stopBtn.addEventListener('click', stopTimer);
  }

  if (resetBtn && !resetBtn._bound) {
    resetBtn._bound = true;
    resetBtn.addEventListener('click', resetTimer);
  }

  if (presetSelect && !presetSelect._bound) {
    presetSelect._bound = true;
    presetSelect.addEventListener('change', resetTimer);
  }
}

function bindSessionModal() {
  const form = document.getElementById('sessionModalForm');
  if (form && !form._bound) {
    form._bound = true;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const session = {
        duration: parseInt(document.getElementById('sessionDurationInput').value) || 25,
        taskId: document.getElementById('sessionTaskSelect').value,
        focus: parseInt(document.getElementById('sessionFocusInput').value),
        difficulty: parseInt(document.getElementById('sessionDifficultyInput').value),
        notes: document.getElementById('sessionNoteInput').value,
        subjectId: null,
        topicId: null
      };
      
      if (session.taskId) {
        const task = appCore.state.tasks.find(t => t.id === session.taskId);
        if (task) {
          session.subjectId = task.subjectId;
          session.topicId = task.topicId;
        }
      }
      
      appCore.addSession(session);
      appCore.persist();
      renderAll();
      renderHomeTimelineChart();
      renderTimelineChart();
      renderSubjectMiniTimelines();
      flashTimeline();
      
      const modal = document.getElementById('sessionModal');
      if (modal) modal.classList.add('hidden');
      form.reset();
    });

    // Slider updates
    const focusInput = document.getElementById('sessionFocusInput');
    const focusValue = document.getElementById('focusValue');
    if (focusInput && focusValue) {
      focusInput.addEventListener('input', () => focusValue.textContent = focusInput.value);
    }

    const diffInput = document.getElementById('sessionDifficultyInput');
    const diffValue = document.getElementById('difficultyValue');
    if (diffInput && diffValue) {
      diffInput.addEventListener('input', () => diffValue.textContent = diffInput.value);
    }

    // Skip button
    const skipBtn = document.getElementById('sessionSkipBtn');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        const modal = document.getElementById('sessionModal');
        if (modal) modal.classList.add('hidden');
      });
    }
  }
}

function bindAddButtons() {
  // Add subject
  const addSubjectBtn = document.getElementById('addSubjectBtn');
  if (addSubjectBtn && !addSubjectBtn._bound) {
    addSubjectBtn._bound = true;
    addSubjectBtn.addEventListener('click', async () => {
      const input = document.getElementById('newSubjectInput');
      const name = input?.value.trim();
      if (name) {
        const id = appCore.addSubject(name);
        await appCore.persist();
        input.value = '';
        selectSubject(id);
        renderAll();
      }
    });
  }

  // Add topic
  const addTopicBtn = document.getElementById('addTopicBtn');
  if (addTopicBtn && !addTopicBtn._bound) {
    addTopicBtn._bound = true;
    addTopicBtn.addEventListener('click', async () => {
      const subjectId = appCore.state.ui.selectedSubjectId;
      const input = document.getElementById('newTopicInput');
      const name = input?.value.trim();
      if (name && subjectId) {
        const id = appCore.addTopic(subjectId, name);
        await appCore.persist();
        input.value = '';
        selectTopic(subjectId, id);
        renderAll();
      } else if (!subjectId) {
        showToast('Please select a subject first');
      }
    });
  }

  // Add task
  const addTaskBtn = document.getElementById('addTaskBtn');
  if (addTaskBtn && !addTaskBtn._bound) {
    addTaskBtn._bound = true;
    addTaskBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const titleInput = document.getElementById('taskTitleInput');
      const estimateInput = document.getElementById('taskEstimateInput');
      const subjectSelect = document.getElementById('taskSubjectSelect');
      const topicSelect = document.getElementById('taskTopicSelect');
      const deadlineInput = document.getElementById('taskDeadlineInput');
      const prioritySelect = document.getElementById('taskPrioritySelect');
      const difficultySelect = document.getElementById('taskDifficultySelect');
      
      if (!titleInput) {
        showToast('Task input field not found');
        return;
      }
      
      const title = titleInput.value ? titleInput.value.trim() : '';
      
      if (!title || title.length === 0) {
        showToast('Please enter a task title');
        titleInput.focus();
        return;
      }
      
      const task = {
        title: title,
        estimate: estimateInput ? (parseInt(estimateInput.value) || 30) : 30,
        subjectId: subjectSelect ? (subjectSelect.value || null) : null,
        topicId: topicSelect ? (topicSelect.value || null) : null,
        deadline: deadlineInput ? (deadlineInput.value || null) : null,
        priority: prioritySelect ? (parseInt(prioritySelect.value) || 3) : 3,
        difficulty: difficultySelect ? (parseInt(difficultySelect.value) || 3) : 3
      };
      
      try {
        appCore.addTask(task);
        await appCore.persist();
        
        // Clear form
        if (titleInput) titleInput.value = '';
        if (estimateInput) estimateInput.value = '30';
        if (deadlineInput) deadlineInput.value = '';
        if (subjectSelect) subjectSelect.value = '';
        if (topicSelect) topicSelect.value = '';
        
        renderTasks();
        showToast('Task added successfully');
      } catch (error) {
        console.error('Error adding task:', error);
        showToast('Failed to add task. Please try again.');
      }
    });
    
    // Allow Enter key to submit task form
    const taskTitleInput = document.getElementById('taskTitleInput');
    if (taskTitleInput && !taskTitleInput._bound) {
      taskTitleInput._bound = true;
      taskTitleInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addTaskBtn.click();
        }
      });
    }
  }

  // Add exam
  const addExamBtn = document.getElementById('addExamBtn');
  if (addExamBtn && !addExamBtn._bound) {
    addExamBtn._bound = true;
    addExamBtn.addEventListener('click', async () => {
      const exam = {
        title: document.getElementById('examTitleInput').value.trim(),
        date: document.getElementById('examDateInput').value,
        subjectId: document.getElementById('examSubjectSelect').value
      };
      
      if (exam.title && exam.subjectId && exam.date) {
        appCore.addExam(exam);
        await appCore.persist();
        document.getElementById('examTitleInput').value = '';
        document.getElementById('examDateInput').value = '';
        document.getElementById('examSubjectSelect').value = '';
        renderDashboard();
        showToast('Exam added successfully');
      } else {
        showToast('Please fill in all exam fields');
      }
    });
  }

  // Task filter
  const taskFilter = document.getElementById('taskFilterSelect');
  if (taskFilter && !taskFilter._bound) {
    taskFilter._bound = true;
    taskFilter.addEventListener('change', renderTasks);
  }
}

function bindTaskSubjectTopicSync() {
  const taskSubjectSelect = document.getElementById('taskSubjectSelect');
  const taskTopicSelect = document.getElementById('taskTopicSelect');
  
  if (taskSubjectSelect && !taskSubjectSelect._syncBound) {
    taskSubjectSelect._syncBound = true;
    taskSubjectSelect.addEventListener('change', () => {
      const subjectId = taskSubjectSelect.value;
      if (!taskTopicSelect) return;
      
      if (!subjectId) {
        taskTopicSelect.innerHTML = '<option value="">Select Topic</option>';
        return;
      }
      
      const subject = appCore.state.subjects.find(s => s.id === subjectId);
      if (subject && subject.topics) {
        taskTopicSelect.innerHTML = '<option value="">Select Topic</option>' + 
          subject.topics.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
      } else {
        taskTopicSelect.innerHTML = '<option value="">Select Topic</option>';
      }
    });
  }
}

function bindUploadSystem() {
  const addFilesBtn = document.getElementById('addFilesBtn');
  const fileInput = document.getElementById('fileInput');

  if (!addFilesBtn || !fileInput || addFilesBtn._bound) return;

  addFilesBtn._bound = true;
  addFilesBtn.addEventListener('click', async () => {
    const files = fileInput.files;
    const subjectId = appCore.state.ui.selectedSubjectId;
    const topicId = appCore.state.ui.selectedTopicId;

    if (!subjectId || !topicId || !files?.length) {
      showToast('Select subject, topic, and files first.');
      return;
    }

    if (supabase) {
      await uploadFiles({ files, subjectId, topicId });
    } else {
      await uploadFilesLocally(files, subjectId, topicId);
    }
    fileInput.value = '';
  });
}

function bindModals() {
  document.querySelectorAll('.modal .close').forEach(closeBtn => {
    if (!closeBtn._bound) {
      closeBtn._bound = true;
      closeBtn.addEventListener('click', () => {
        closeBtn.closest('.modal').classList.add('hidden');
      });
    }
  });

  // Click outside to close
  document.querySelectorAll('.modal').forEach(modal => {
    if (!modal._bound) {
      modal._bound = true;
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
      });
    }
  });

  const prevBtn = document.getElementById('pdfPrevBtn');
  if (prevBtn && !prevBtn._bound) {
    prevBtn._bound = true;
    prevBtn.addEventListener('click', () => {
      if (activePdfDoc && activePdfPage > 1) {
        renderPdfPage(activePdfDoc, activePdfPage - 1);
      }
    });
  }

  const nextBtn = document.getElementById('pdfNextBtn');
  if (nextBtn && !nextBtn._bound) {
    nextBtn._bound = true;
    nextBtn.addEventListener('click', () => {
      if (activePdfDoc && activePdfPage < activePdfDoc.numPages) {
        renderPdfPage(activePdfDoc, activePdfPage + 1);
      }
    });
  }

  const summarizeBtn = document.getElementById('pdfSummarizeBtn');
  if (summarizeBtn && !summarizeBtn._bound) {
    summarizeBtn._bound = true;
    summarizeBtn.addEventListener('click', summarizeActivePdfPage);
  }
}

function bindGuide() {
  // Form submission binding
  const guideForm = document.getElementById('guideForm');
  const guideInput = document.getElementById('guideCommandInput');
  
  if (guideForm && !guideForm._bound) {
    guideForm._bound = true;
    guideForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (guideInput?.value.trim()) {
        handleGuideCommand(guideInput.value.trim());
        guideInput.value = '';
        guideInput.focus();
      }
    });
  }

  // Upload button binding
  const uploadBtn = document.getElementById('guideUploadBtn');
  const guidePdfInput = document.getElementById('guidePdfInput');
  
  if (uploadBtn && !uploadBtn._bound) {
    uploadBtn._bound = true;
    uploadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      guidePdfInput?.click();
    });
  }

  // PDF upload file input binding
  if (guidePdfInput && !guidePdfInput._bound) {
    guidePdfInput._bound = true;
    guidePdfInput.addEventListener('change', async (e) => {
      if (e.target.files[0]) {
        renderGuideBubble('Processing your PDF...');
        guideSpeak('Processing your PDF');
        await summarizePDF(e.target.files[0]);
        e.target.value = ''; // Reset for next upload
      }
    });
  }

  const avatar = document.querySelector('.guide-avatar');
  if (avatar && !avatar._bound) {
    avatar._bound = true;
    avatar.addEventListener('click', () => {
      const bubble = document.getElementById('guideBubble');
      if (bubble) bubble.classList.toggle('hidden');
    });
  }

  // Guide action buttons
  const suggestBtn = document.getElementById('suggestNextStudy');
  if (suggestBtn && !suggestBtn._bound) {
    suggestBtn._bound = true;
    suggestBtn.addEventListener('click', getObsidiaRecommendation);
  }

  const questionsBtn = document.getElementById('generateQuestionsBtn');
  if (questionsBtn && !questionsBtn._bound) {
    questionsBtn._bound = true;
    questionsBtn.addEventListener('click', generateTopicQuestions);
  }

  const summaryBtn = document.getElementById('weeklySummaryBtn');
  if (summaryBtn && !summaryBtn._bound) {
    summaryBtn._bound = true;
    summaryBtn.addEventListener('click', generateWeeklySummary);
  }

  const pdfBtn = document.getElementById('uploadPdfBtn');
  const pdfInput = document.getElementById('pdfForSummarizer');
  if (pdfBtn && !pdfBtn._bound) {
    pdfBtn._bound = true;
    pdfBtn.addEventListener('click', () => pdfInput?.click());
  }

  if (pdfInput && !pdfInput._bound) {
    pdfInput._bound = true;
    pdfInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        summarizePDF(file);
        pdfInput.value = '';
      }
    });
  }

  // Keyboard shortcuts
  if (!document._globalShortcuts) {
    document._globalShortcuts = true;
    document.addEventListener('keydown', (e) => {
      // Ctrl+Space or Cmd+Space for voice input
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
        e.preventDefault();
        const micBtn = document.getElementById('guideMicBtn');
        if (micBtn) micBtn.click();
        showToast('🎤 Voice input activated');
      }
      
      // Ctrl+K or Cmd+K to focus guide input
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const input = document.getElementById('guideCommandInput');
        if (input) {
          input.focus();
          showToast('💬 Ready to chat with Obsidia');
        }
      }
      
      // Alt+O to ask recommendation
      if ((e.altKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        getObsidiaRecommendation();
        showToast('📚 Getting next study recommendation...');
      }
      
      // Alt+Q to generate quiz
      if ((e.altKey || e.metaKey) && e.key === 'q') {
        e.preventDefault();
        const input = document.getElementById('guideCommandInput');
        input.value = 'Generate quiz questions for current topic';
        input.focus();
        showToast('📝 Quiz mode activated');
      }
    });
  }
}


// ===============================
// Text-to-Speech Function
// ===============================
function guideSpeak(text) {
  if (!('speechSynthesis' in window)) {
    console.warn('Speech synthesis not supported');
    return;
  }

  // Cancel any ongoing speech
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1;
  utterance.volume = 1;

  speechSynthesis.speak(utterance);
}

function setupVoiceInput() {
  const micBtn = document.getElementById('guideMicBtn');
  if (micBtn && !micBtn._bound && 'webkitSpeechRecognition' in window) {
    micBtn._bound = true;
    micBtn.addEventListener('click', () => {
      try {
      const recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        
      recognition.onresult = (e) => {
        const command = e.results[0][0].transcript;
          showToast(`Heard: ${command}`);
        handleGuideCommand(command);
      };
        
        recognition.onerror = (e) => {
          console.warn('Speech recognition error:', e.error);
          if (e.error !== 'no-speech') {
            showToast('Speech recognition error. Please try again.');
          }
        };
        
        recognition.onend = () => {
          // Recognition ended
        };
        
      recognition.start();
        showToast('Listening...');
      } catch (error) {
        console.error('Error setting up voice input:', error);
        showToast('Voice input not available');
      }
    });
  } else if (micBtn && !micBtn._bound) {
    micBtn._bound = true;
    micBtn.addEventListener('click', () => {
      showToast('Voice input not supported in this browser');
    });
  }
}

// ===============================
// Global Functions (for HTML onclick)
// ===============================
async function selectSubject(id) {
  appCore.state.ui.selectedSubjectId = id;
  appCore.state.ui.selectedTopicId = null;
  await appCore.persist();   // ⭐ CRITICAL
  renderAll();
}


async function selectTopic(subjectId, topicId) {
  appCore.state.ui.selectedSubjectId = subjectId;
  appCore.state.ui.selectedTopicId = topicId;
  await appCore.persist();   // ⭐ CRITICAL
  renderFiles();
  renderTopics();
}


async function deleteSubjectFN(id) {
  appCore.deleteSubject(id);
  await appCore.persist();
  renderAll();
}

async function deleteTopicFN(subjectId, topicId) {
  await appCore.deleteTopic(subjectId, topicId);
  await appCore.persist();
  renderAll();
}

async function deleteTaskFN(id) {
  appCore.deleteTask(id);
  await appCore.persist();
  renderTasks();
}

async function completeTaskFN(id) {
  const task = appCore.state.tasks.find(t => t.id === id);
  if (!task || task.completed) return;

  // Mark task completed
  appCore.completeTask(id);

  // Automatically log a study session using task's estimate and difficulty
  try {
    const duration = Number(task.estimate) || 25;
    const difficulty = Number(task.difficulty) || 3;

    const session = {
      duration,
      taskId: id,
      focus: 4,
      difficulty,
      notes: `Completed task: ${task.title}`,
      subjectId: task.subjectId || null,
      topicId: task.topicId || null
    };

    appCore.addSession(session);
  } catch (e) {
    console.warn('Failed to auto-create session for completed task', e);
  }

  await appCore.persist();
  renderAll();
  updateHomeStatsUI();
  renderHomeTimelineChart();
  renderTimelineChart();
  renderSubjectMiniTimelines();
  flashTimeline();
  launchConfetti();
  showToast('🎉 Task completed! Great job!');
}

async function deleteFileFN(subjectId, topicId, fileId) {
  await appCore.deleteFile(subjectId, topicId, fileId);
  await appCore.persist();
  renderFiles();
}

async function editSubjectFN(id) {
  const subject = appCore.state.subjects.find(s => s.id === id);
  if (!subject) return;
  const newName = prompt('Enter new subject name:', subject.name);
  if (newName && newName.trim()) {
    appCore.editSubject(id, newName.trim());
    await appCore.persist();
    renderAll();
  }
}

async function editTopicFN(subjectId, topicId) {
  const subject = appCore.state.subjects.find(s => s.id === subjectId);
  const topic = subject?.topics.find(t => t.id === topicId);
  if (!topic) return;
  const newName = prompt('Enter new topic name:', topic.name);
  if (newName && newName.trim()) {
    appCore.editTopic(subjectId, topicId, newName.trim());
    await appCore.persist();
    renderAll();
  }
}

async function editFileFN(subjectId, topicId, fileId) {
  const subject = appCore.state.subjects.find(s => s.id === subjectId);
  const topic = subject?.topics.find(t => t.id === topicId);
  const file = topic?.files.find(f => f.id === fileId);
  if (!file) return;
  const newName = prompt('Enter new file name:', file.name);
  if (newName && newName.trim()) {
    appCore.editFile(subjectId, topicId, fileId, newName.trim());
    await appCore.persist();
    renderFiles();
  }
}

// Expose to window
window.selectSubject = selectSubject;
window.selectTopic = selectTopic;
window.deleteSubjectFN = deleteSubjectFN;
window.deleteTopicFN = deleteTopicFN;
window.deleteTaskFN = deleteTaskFN;
window.completeTaskFN = completeTaskFN;
window.deleteFileFN = deleteFileFN;
window.editSubjectFN = editSubjectFN;
window.editTopicFN = editTopicFN;
window.editFileFN = editFileFN;
window.safeOpenFile = safeOpenFile;
window.openSubjectFlow = openSubjectFlow;
window.openPdfSummary = openPdfSummary;
window.aiPlanFromSyllabus = aiPlanFromSyllabus;
window.cycleTheme = cycleTheme;
window.goToScreen = goToScreen;
// Study tools functions
window.calculateExpression = calculateExpression;
window.searchDictionary = searchDictionary;
window.saveQuickNotes = saveQuickNotes;
window.addStudyGoal = addStudyGoal;
window.toggleGoal = toggleGoal;
window.deleteGoal = deleteGoal;
window.suggestBrainBreak = suggestBrainBreak;
window.toggleFocusMode = toggleFocusMode;
window.switchTool = switchTool;
window.launchConfetti = launchConfetti;
// AI functions
window.getObsidiaRecommendation = getObsidiaRecommendation;
window.generateTopicQuestions = generateTopicQuestions;
window.generateWeeklySummary = generateWeeklySummary;
window.summarizePDF = summarizePDF;
// ===============================
// Home Page Stats System
// ===============================
function updateHomeStatsUI() {
  const state = appCore?.state;
  if (!state) return;
  const today = dateKey();
  
  const todaySessions = (state.sessions || []).filter(s => s.createdAt && dateKey(new Date(s.createdAt)) === today);
  const minutes = todaySessions.reduce((sum, s) => sum + (s.duration || 0), 0);
  const tasksDone = (state.tasks || []).filter(t => t.completed && t.completedAt && dateKey(new Date(t.completedAt)) === today).length;
  const xp = todaySessions.reduce((sum, s) => {
    return sum + Math.round(((s.duration || 0) / 10) * (s.focus || 1) * (s.difficulty || 1));
  }, 0);

  const minutesEl = document.getElementById('todayMinutes');
  const tasksEl = document.getElementById('todayTasks');
  const xpEl = document.getElementById('todayXP');
  
  if (minutesEl) animateCounter(minutesEl, minutes);
  if (tasksEl) animateCounter(tasksEl, tasksDone);
  if (xpEl) animateCounter(xpEl, xp);

  // Update streak display
  const streakEl = document.getElementById('streakCount');
  if (streakEl) streakEl.textContent = state.stats?.streak || 0;
}

// ===============================
// Confetti Animation
// ===============================
function launchConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '99999';

  const particles = [];
  const colors = ['#f0c27f', '#4b6043', '#d4a373', '#e76f51', '#264653', '#2a9d8f', '#e9c46a'];

  for (let i = 0; i < 80; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.3 - canvas.height * 0.1,
      w: Math.random() * 8 + 4,
      h: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 6,
      vy: Math.random() * 4 + 2,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
      opacity: 1
    });
  }

  let frame = 0;
  const maxFrames = 120;

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frame++;

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.rotation += p.rotationSpeed;
      p.opacity = Math.max(0, 1 - frame / maxFrames);

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });

    if (frame < maxFrames) {
      requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  animate();
}

function animateCounter(element, target, duration = 600) {
  if (!element) return;
  const start = parseInt(element.innerText) || 0;
  if (start === target) {
    element.innerText = target;
    return;
  }
  const startTime = performance.now();

  function update(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const value = Math.floor(start + (target - start) * progress);
    element.innerText = value;

    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

// ===============================
// Initialization
// ===============================
async function initApp() {
  appCore = new StudyAppCore(storageProvider);
  window.appCore = appCore;

  // When state changes, re-render everything INCLUDING tasks
  appCore.setOnStateChange(() => {
    renderAll();
    renderTasks();
  });

  // Set initial cloud status based on CLOUD_ENABLED
  if (!CLOUD_ENABLED) {
    updateCloudStatus('offline');
  } else {
    setCloudSyncing(true);
  }
  
  await appCore.init();
  
  if (CLOUD_ENABLED) {
    setCloudSyncing(false);
  }

  // After loading saved state, FORCE re-render tasks
  renderAll();
  renderTasks();
  updateTimerDisplay();
  updateHomeStatsUI();
  renderHomeTimelineChart();
  renderTimelineChart();
  renderSubjectMiniTimelines();

  // Bind all UI systems
  bindNavigation();
  bindTimer();
  bindSessionModal();
  bindAddButtons();
  bindUploadSystem();
  bindModals();
  bindGuide();
  setupVoiceInput();
  initMusicPlayer();
  loadQuickNotes();
  bindTaskSubjectTopicSync();

  // Start on home screen
  goToScreen('home');

  // Check reminders every minute
  setInterval(checkReminders, 60000);

  // Save guide context periodically
  setInterval(() => {
    localStorage.setItem('guideContext', JSON.stringify(guideContext));
  }, 5000);

  // Load guide context
  const savedContext = localStorage.getItem('guideContext');
  if (savedContext) {
    try {
      guideContext = JSON.parse(savedContext);
    } catch (e) {
      console.warn('Failed to parse saved guide context');
    }
  }

  console.log('Study App v25 initialized successfully');
  
  // --- Supabase connectivity test (auto-run on init) ---
  if (CLOUD_ENABLED && supabase) {
    try {
      console.log('🔍 Starting Supabase connectivity check...');
      supabase
        .from('app_state')
        .select('user_id')
        .limit(1)
        .then((res) => {
          console.log('✅ Supabase test passed:', res);
          updateCloudStatus('active');
        })
        .catch((err) => {
          console.error('❌ Supabase test failed:', err.message || err);
          updateCloudStatus('failing');
        });
    } catch (e) {
      console.error('💥 Error running Supabase connectivity test', e);
      updateCloudStatus('offline');
    }
    
    // Monitor sync activity in real-time
    startCloudStatusMonitor();
  } else {
    updateCloudStatus('offline');
  }
}

// ===============================
// Cloud Status Indicator Logic
// ===============================
let cloudSyncInProgress = false;
let cloudStatusTimeout = null;

function updateCloudStatus(status) {
  const indicator = document.getElementById('cloudStatusIndicator');
  if (!indicator) return;
  
  const dot = indicator.querySelector('.cloud-dot');
  const label = indicator.querySelector('.cloud-label');
  
  dot.className = 'cloud-dot ' + status;
  
  if (status === 'active') {
    label.textContent = 'Syncing';
    indicator.title = 'Supabase: Connected & Syncing';
    console.log('Cloud status updated to: ACTIVE ✅');
  } else if (status === 'offline') {
    label.textContent = 'Offline';
    indicator.title = 'Supabase: Offline (using local)';
    console.log('Cloud status updated to: OFFLINE ⚫');
  } else if (status === 'failing') {
    label.textContent = 'Error';
    indicator.title = 'Supabase: Connection Failed';
    console.log('Cloud status updated to: FAILING 🔴');
  }
}

function setCloudSyncing(isSyncing) {
  cloudSyncInProgress = isSyncing;
  if (isSyncing) {
    clearTimeout(cloudStatusTimeout);
    updateCloudStatus('active');
  } else {
    // Auto-revert to previous status after sync completes
    cloudStatusTimeout = setTimeout(() => {
      const indicator = document.getElementById('cloudStatusIndicator');
      if (indicator) {
        const dot = indicator.querySelector('.cloud-dot');
        if (!dot.classList.contains('failing')) {
          updateCloudStatus('active');
        }
      }
    }, 1500);
  }
}

function startCloudStatusMonitor() {
  // Periodically check cloud connectivity
  setInterval(() => {
    if (!cloudSyncInProgress && supabase) {
      supabase
        .from('app_state')
        .select('user_id', { count: 'exact', head: true })
        .limit(1)
        .then(() => {
          const dot = document.querySelector('.cloud-dot');
          if (dot && dot.classList.contains('failing')) {
            updateCloudStatus('active');
          }
        })
        .catch(() => {
          // Only set to failing if not already syncing
          if (!cloudSyncInProgress) {
            updateCloudStatus('offline');
          }
        });
    }
  }, 30000); // Check every 30 seconds
}

// Start the app
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp, { once: true });
} else {
  initApp();
}







