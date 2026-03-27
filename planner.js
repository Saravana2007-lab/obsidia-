// =============================================
// AI EXAM PLANNER - Complete Rewrite
// Features: Manual entry, PDF extraction, 
// OCR fallback, smart plan generation
// =============================================

(() => {
  let extractedExams = [];

  // Function to initialize planner when screen becomes visible
  function initPlanner() {
    const analyzeBtn = document.getElementById('analyzeExamBtn');
    const generateBtn = document.getElementById('generateSmartPlanBtn');
    const preview = document.getElementById('examSubjectsPreview');
    const strengthContainer = document.getElementById('subjectStrengthContainer');
    const output = document.getElementById('generatedPlanOutput');
    const summaryBadge = document.getElementById('plannerSummaryBadge');

    // ===============================
    // Event Bindings
    // ===============================
    
    // Analyze PDF button
    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', async () => {
        const fileInput = document.getElementById('plannerPdfInput');
        const file = fileInput?.files?.[0];

        if (!file) {
          alert('Please select a file first by clicking "Choose File"');
          fileInput?.focus();
          return;
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          alert('File is too large. Please select a file smaller than 10MB.');
          return;
        }

        await analyzePDF(file);
      });
    }

    // File input change handler
    const fileInput = document.getElementById('plannerPdfInput');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          console.log('File selected:', file.name, 'Size:', (file.size / 1024 / 1024).toFixed(2) + 'MB');
          // Update button text to show file is ready
          const analyzeBtn = document.getElementById('analyzeExamBtn');
          if (analyzeBtn) {
            analyzeBtn.textContent = `Analyze ${file.name.length > 20 ? file.name.substring(0, 17) + '...' : file.name}`;
          }
        } else {
          // Reset button text when no file selected
          const analyzeBtn = document.getElementById('analyzeExamBtn');
          if (analyzeBtn) {
            analyzeBtn.textContent = 'Analyze Timetable';
          }
        }
      });
    }

    // Generate plan button
    if (generateBtn) {
      generateBtn.addEventListener('click', () => {
        buildPlan();
      });
    }

    // Manual add exam button
    const addManualBtn = document.getElementById('addManualExamBtn');
    if (addManualBtn) {
      addManualBtn.addEventListener('click', () => {
        addManualExam();
      });
    }

    // Enter key on manual exam name input
    const manualNameInput = document.getElementById('manualExamName');
    if (manualNameInput) {
      manualNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addManualExam();
        }
      });
    }

    // ===============================
  // Debug/Test Functions (can be called from console)
  // ===============================
  window.testExamParsing = function(sampleText) {
    console.log('Testing exam parsing with sample text:');
    console.log(sampleText);
    const exams = parseExamData(sampleText);
    console.log('Parsed exams:', exams);
    return exams;
  };

  // Test with sample data
  window.testSampleData = function() {
    const sampleText = `
    EXAM TIMETABLE - SEMESTER 2

    Mathematics - 15-05-2024
    Physics 20/05/2024
    25-05-2024 Chemistry
    Biology - 30-05-2024
    Computer Science 05/06/2024

    Final exams schedule:
    English Literature - 10-06-2024
    15-06-2024 History
    Geography 20/06/2024
    `;

    console.log('Testing with sample exam timetable...');
    return window.testExamParsing(sampleText);
  };

  // Expose functions globally for debugging
  window.plannerDebug = {
    analyzePDF,
    parseExamData,
    extractTextFromPDF,
    extractTextFromImage,
    extractedExams: () => extractedExams,
    clearExams: () => { extractedExams = []; updateExamPreview(); savePlannerState(); },
    testSample: window.testSampleData
  };

    // Initial state
    loadPlannerState();

    if (output && !output.innerHTML.trim()) {
      output.innerHTML = '<div class="plan-empty"><p style="margin:0 0 8px 0;font-weight:600;">No plan generated yet</p><small>Add your exams and click "Generate Smart Plan" to create your revision schedule.</small></div>';
    }
  }

  // ===============================
  // PDF Analysis Function
  // ===============================
  async function analyzePDF(file) {
    if (!file) {
      alert('Please select a file first');
      return;
    }

    const analyzeBtn = document.getElementById('analyzeExamBtn');
    const originalText = analyzeBtn.textContent;
    analyzeBtn.textContent = 'Analyzing...';
    analyzeBtn.disabled = true;

    try {
      console.log('Starting file analysis for:', file.name, 'Type:', file.type);

      let extractedText = '';

      if (file.type === 'application/pdf') {
        console.log('Processing as PDF file');
        extractedText = await extractTextFromPDF(file);
      } else if (file.type.startsWith('image/')) {
        console.log('Processing as image file');
        extractedText = await extractTextFromImage(file);
      } else {
        throw new Error('Unsupported file type. Please upload a PDF or image file.');
      }

      console.log('Extracted text length:', extractedText.length);
      console.log('Extracted text preview:', extractedText.substring(0, 200) + '...');

      // Parse the extracted text to find exam information
      const exams = parseExamData(extractedText);

      console.log('Parsed exams:', exams);

      if (exams.length === 0) {
        alert('No exam information found in the file. The file might not contain recognizable exam data, or the format might be different. Please try:\n\n• Ensure dates are in dd-mm-yyyy or dd/mm/yyyy format\n• Make sure subject names are clear\n• Try adding exams manually if automatic detection fails');
        return;
      }

      // Add extracted exams to the list
      exams.forEach(exam => {
        extractedExams.push(exam);
      });

      // Update the preview
      updateExamPreview();
      savePlannerState();

      alert(`Successfully extracted ${exams.length} exam(s) from the file!\n\nFound exams:\n${exams.map(e => `• ${e.name} (${e.date})`).join('\n')}`);

    } catch (error) {
      console.error('Error analyzing file:', error);
      alert('Error analyzing file: ' + error.message + '\n\nPlease check the console for more details.');
    } finally {
      analyzeBtn.textContent = originalText;
      analyzeBtn.disabled = false;
    }
  }

  // Extract text from PDF using PDF.js
  async function extractTextFromPDF(file) {
    // Configure PDF.js worker
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    } else {
      throw new Error('PDF.js library not loaded');
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }

    return fullText;
  }

  // Extract text from image using Tesseract.js
  async function extractTextFromImage(file) {
    if (typeof Tesseract === 'undefined') {
      throw new Error('Tesseract.js library not loaded. Please refresh the page.');
    }

    console.log('Starting OCR processing...');
    const result = await Tesseract.recognize(file, 'eng', {
      logger: m => console.log('OCR Progress:', m)
    });

    console.log('OCR completed, confidence:', result.data.confidence);
    return result.data.text;
  }

  // Parse exam data from extracted text
  function parseExamData(text) {
    const exams = [];
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    // Enhanced pattern matching for exam information
    const examPatterns = [
      // Pattern: Subject Date (e.g., "Mathematics 15-05-2024", "Math 15/05/2024")
      /(\w+(?:\s+\w+)*?)\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/gi,
      // Pattern: Date Subject (e.g., "15-05-2024 Mathematics", "15/05/2024 Math")
      /(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})\s+(\w+(?:\s+\w+)*?)/gi,
      // Pattern: Subject - Date (e.g., "Mathematics - 15-05-2024")
      /(\w+(?:\s+\w+)*?)\s*-\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/gi,
      // Pattern: Date - Subject (e.g., "15-05-2024 - Mathematics")
      /(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})\s*-\s*(\w+(?:\s+\w+)*?)/gi,
    ];

    // Common exam-related keywords to help identify relevant lines
    const examKeywords = ['exam', 'test', 'assessment', 'paper', 'final', 'midterm', 'quiz', 'subject', 'course'];

    lines.forEach(line => {
      // Check if line contains exam-related keywords or is reasonably short (likely a header)
      const hasKeywords = examKeywords.some(keyword => line.toLowerCase().includes(keyword));
      const isReasonableLength = line.length < 100;

      if (hasKeywords || isReasonableLength) {
        examPatterns.forEach(pattern => {
          let match;
          while ((match = pattern.exec(line)) !== null) {
            // Determine which group is the subject and which is the date
            let subject, date;
            if (match[1] && (match[1].includes('-') || match[1].includes('/'))) {
              // First group is date, second is subject
              date = match[1];
              subject = match[2];
            } else {
              // First group is subject, second is date
              subject = match[1];
              date = match[2];
            }

            // Clean up the subject name
            subject = subject.trim();
            date = date.trim();

            // Validate date format
            if (isValidDate(date)) {
              const exam = {
                name: subject,
                date: date,
                strength: 3, // Default strength
                id: Date.now() + Math.random()
              };
              exams.push(exam);
            }
          }
        });
      }
    });

    // Remove duplicates based on subject and date
    const uniqueExams = exams.filter((exam, index, self) =>
      index === self.findIndex(e =>
        e.name.toLowerCase() === exam.name.toLowerCase() &&
        e.date === exam.date
      )
    );

    return uniqueExams;
  }

  // ===============================
  // Manual Exam Addition
  // ===============================
  function addManualExam() {
    const nameInput = document.getElementById('manualExamName');
    const dateInput = document.getElementById('manualExamDate');

    const name = nameInput?.value?.trim();
    const date = dateInput?.value?.trim();

    if (!name || !date) {
      alert('Please enter both exam name and date');
      return;
    }

    // Basic date validation
    if (!isValidDate(date)) {
      alert('Please enter a valid date in dd-mm-yyyy format');
      return;
    }

    const exam = {
      name: name,
      date: date,
      strength: 3, // Default strength
      id: Date.now() + Math.random()
    };

    extractedExams.push(exam);
    updateExamPreview();
    savePlannerState();

    // Clear inputs
    nameInput.value = '';
    dateInput.value = '';

    // Focus back to name input
    nameInput.focus();
  }

  // Validate date format (supports dd-mm-yyyy, dd/mm/yyyy, mm-dd-yyyy, mm/dd/yyyy)
  function isValidDate(dateString) {
    // Support multiple date formats
    const formats = [
      /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/,  // dd-mm-yyyy or dd/mm/yyyy
      /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/,  // yyyy-mm-dd or yyyy/mm/dd
    ];

    for (const regex of formats) {
      const match = dateString.match(regex);
      if (match) {
        let day, month, year;

        if (match[1].length === 4) {
          // yyyy-mm-dd format
          year = parseInt(match[1], 10);
          month = parseInt(match[2], 10);
          day = parseInt(match[3], 10);
        } else {
          // dd-mm-yyyy format (assuming European style)
          day = parseInt(match[1], 10);
          month = parseInt(match[2], 10);
          year = parseInt(match[3], 10);
        }

        // Validate ranges
        if (month < 1 || month > 12) continue;
        if (day < 1 || day > 31) continue;
        if (year < 2024 || year > 2030) continue;

        // Check days in month
        const daysInMonth = new Date(year, month, 0).getDate();
        if (day <= daysInMonth) {
          return true;
        }
      }
    }

    return false;
  }

  // ===============================
  // Exam Preview Management
  // ===============================
  function updateExamPreview() {
    const preview = document.getElementById('examSubjectsPreview');
    const strengthContainer = document.getElementById('subjectStrengthContainer');

    if (!preview || !strengthContainer) return;

    if (extractedExams.length === 0) {
      preview.innerHTML = '<p style="text-align:center;color:var(--text-muted);margin:20px 0;">No exams added yet</p>';
      strengthContainer.innerHTML = '';
      return;
    }

    // Update exam list preview
    preview.innerHTML = extractedExams.map((exam, index) => `
      <div class="exam-item" data-index="${index}">
        <div class="exam-info">
          <strong>${exam.name}</strong>
          <span class="exam-date">${exam.date}</span>
        </div>
        <button class="exam-remove-btn" onclick="window._plannerRemoveExam(${index})">×</button>
      </div>
    `).join('');

    // Update strength assessment section
    strengthContainer.innerHTML = extractedExams.map((exam, index) => `
      <div class="strength-item">
        <label>${exam.name}</label>
        <div class="strength-slider">
          <input type="range" min="1" max="5" value="${exam.strength}" 
                 onchange="updateExamStrength(${index}, this.value)">
          <div class="strength-labels">
            <span>Weak</span>
            <span>Strong</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  function updateExamStrength(index, strength) {
    if (extractedExams[index]) {
      extractedExams[index].strength = parseInt(strength);
      savePlannerState();
    }
  }

  function removeExam(index) {
    if (confirm('Remove this exam?')) {
      extractedExams.splice(index, 1);
      updateExamPreview();
      savePlannerState();
    }
  }

  // ===============================
  // Plan Generation
  // ===============================
  function buildPlan() {
    if (extractedExams.length === 0) {
      alert('Please add at least one exam first');
      return;
    }

    const dailyHours = parseInt(document.getElementById('dailyHoursInput')?.value) || 4;
    const preferredTime = document.getElementById('preferredTimeSelect')?.value || 'morning';
    const output = document.getElementById('generatedPlanOutput');
    const summaryBadge = document.getElementById('plannerSummaryBadge');

    // Sort exams by date
    const sortedExams = [...extractedExams].sort((a, b) => {
      const dateA = parseDate(a.date);
      const dateB = parseDate(b.date);
      return dateA - dateB;
    });

    // Calculate total study time needed
    const totalDays = Math.ceil(sortedExams.length * 7); // Rough estimate: 1 week per subject
    const totalHours = totalDays * dailyHours;

    // Generate daily plan
    const plan = generateDailyPlan(sortedExams, dailyHours, preferredTime);

    // Update UI
    output.innerHTML = `
      <div class="plan-summary">
        <h4>Study Plan Overview</h4>
        <p><strong>Total Exams:</strong> ${sortedExams.length}</p>
        <p><strong>Study Period:</strong> ${totalDays} days</p>
        <p><strong>Daily Hours:</strong> ${dailyHours}</p>
        <p><strong>Preferred Time:</strong> ${preferredTime}</p>
      </div>
      <div class="daily-plan">
        ${plan.map(day => `
          <div class="plan-day">
            <h5>Day ${day.day}: ${day.date}</h5>
            <div class="day-schedule">
              ${day.sessions.map(session => `
                <div class="study-session">
                  <strong>${session.time}</strong>: ${session.subject} 
                  <span class="session-duration">(${session.duration}h)</span>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    summaryBadge.textContent = `${totalDays} days planned`;
    summaryBadge.className = 'section-pill success';
  }

  function parseDate(dateString) {
    const [day, month, year] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function generateDailyPlan(exams, dailyHours, preferredTime) {
    const plan = [];
    const today = new Date();
    let currentDay = 0;

    // Group exams by priority (weaker subjects get more time)
    const prioritizedExams = exams.sort((a, b) => a.strength - b.strength);

    for (let i = 0; i < 14; i++) { // 2 weeks plan
      const planDate = new Date(today);
      planDate.setDate(today.getDate() + i);

      const dayPlan = {
        day: i + 1,
        date: planDate.toLocaleDateString(),
        sessions: []
      };

      // Distribute study time across subjects
      const subjectsForDay = prioritizedExams.slice(currentDay % prioritizedExams.length, (currentDay % prioritizedExams.length) + 2);
      const hoursPerSubject = dailyHours / Math.min(subjectsForDay.length, 2);

      subjectsForDay.forEach((exam, index) => {
        const timeSlot = preferredTime === 'morning' ? 
          (index === 0 ? '9:00 AM' : '2:00 PM') :
          (index === 0 ? '2:00 PM' : '7:00 PM');

        dayPlan.sessions.push({
          time: timeSlot,
          subject: exam.name,
          duration: Math.round(hoursPerSubject)
        });
      });

      plan.push(dayPlan);
      currentDay++;
    }

    return plan;
  }

  // ===============================
  // State Management
  // ===============================
  function savePlannerState() {
    localStorage.setItem('planner_exams', JSON.stringify(extractedExams));
  }

  function loadPlannerState() {
    const saved = localStorage.getItem('planner_exams');
    if (saved) {
      extractedExams = JSON.parse(saved);
      updateExamPreview();
    }
  }

  // Check if studyplan screen is visible, if not, wait for it
  const studyplanSection = document.getElementById('studyplan');
  if (studyplanSection && !studyplanSection.classList.contains('hidden')) {
    initPlanner();
  } else {
    // Use MutationObserver to watch for when the screen becomes visible
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target;
          if (target.id === 'studyplan' && !target.classList.contains('hidden')) {
            observer.disconnect();
            initPlanner();
          }
        }
      });
    });

    if (studyplanSection) {
      observer.observe(studyplanSection, { attributes: true });
    }
  }
})();
