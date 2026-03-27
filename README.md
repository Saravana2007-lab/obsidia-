# 🐉 Obsidia – AI Study Guide App

> Your intelligent study companion for focused learning, smart planning, and consistent progress.

---

## 📌 Overview

**Obsidia** is an all-in-one study management application designed to help students stay organized, productive, and exam-ready. It combines task tracking, study sessions, and AI-powered assistance into a single seamless experience.

Instead of juggling multiple apps, Obsidia brings everything together — from planning your subjects to tracking your daily progress and generating smart revision plans.

---

## ✨ Features

### 📚 Study Management

* Create and organize **subjects and topics**
* Attach **PDFs and images** for learning materials
* Structured content hierarchy for better clarity

### ✅ Task System

* Add tasks with:

  * Priority levels
  * Deadlines
  * Difficulty rating
* Track completion and stay on schedule

### ⏱️ Focus Timer

* Built-in **Pomodoro-style timer**
* Presets (15 / 25 / 50 minutes)
* Helps improve concentration and consistency

### 🧠 AI Study Assistant

* Powered by AI for:

  * Concept explanations
  * Study guidance
  * Quick learning support
* Personalized interaction

### 📅 Smart Exam Planner

* Add exams manually or via **PDF/Image upload**
* Uses **OCR (Tesseract.js)** to extract exam data
* Automatically generates a **study plan**

### 📊 Progress Tracking

* Daily stats:

  * Study time
  * Tasks completed
  * XP earned
* Study streak tracking system

### ☁️ Hybrid Storage

* Works offline with **LocalStorage**
* Optional cloud sync via **Supabase**

---

## 🛠️ Tech Stack

* **Frontend:** HTML, CSS, JavaScript
* **Storage:** LocalStorage + Supabase (optional)
* **AI Integration:** Groq API (LLM)
* **PDF Processing:** PDF.js
* **OCR:** Tesseract.js

---

## 📂 Project Structure

```
/project-root
│── index.html
│── style.css
│── planner.css
│── app.js
│── planner.js
│── assets/
```

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-username/obsidia-app.git
cd obsidia-app
```

### 2. Run the app

Just open `index.html` in your browser.

---

## ⚠️ Important Notes

* API keys are currently in the frontend (not secure for production)
* For deployment:

  * Move keys to environment variables or backend
* Cloud sync is disabled by default

---

## 📈 Future Improvements

* 🔐 Secure backend for API keys
* 📱 Full mobile optimization
* 🤖 Smarter AI with memory/context
* 📊 Advanced analytics dashboard
* 🌐 Full cloud sync support

---

## 💡 Inspiration

Built to solve a simple problem:

> Students don’t need more apps — they need one app that actually works.

---

## 👤 Author

**Saravana G**
BCA Student | Developer | Building real-world projects

---

## ⭐ Support

If you like this project:

* ⭐ Star the repo
* 🍴 Fork it
* 🧠 Improve it

---

> “Consistency beats intensity. Obsidia helps you stay consistent.”

