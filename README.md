# 🎓 StudyBot — AI-Powered Study Assistant

StudyBot is a comprehensive, full-stack educational tool designed to help students track their performance, predict grades using Machine Learning, and receive personalized AI tutoring combined with real-time study resources.

---

## 🚀 Features

- **🧠 Grade Prediction**: Uses a Random Forest ML model to predict student grades (A-F) based on study hours, attendance, and scores.
- **🤖 AI Tutoring**: Powered by **Groq (Llama 3.1)** to provide intelligent, academic-focused responses and study tips.
- **🔍 Resource Search**: Integrates with **Google Custom Search** to fetch real-time study notes and educational links.
- **📊 Interactive Graphing**: Built-in **Desmos** integration for visualizing mathematical functions and kinematics.
- **🖼️ Visual Context**: Automatically fetches educational diagrams and images from **Wikipedia**.
- **🐳 Dockerized**: Easy deployment and development using Docker and Docker Compose.

---

## 📁 Project Structure

```text
StudyBot/
├── backend/
│   ├── main.py            # FastAPI server (ML + AI + Search logic)
│   ├── train_model.py     # Script to train the grade prediction model
│   ├── Dockerfile         # Container configuration for the backend
│   ├── requirements.txt   # Python backend dependencies
│   └── grade_model.pkl    # Serialized ML model
├── index.html             # Frontend UI (Root level for Vercel hosting)
├── style.css              # Modern UI styling
├── script.js              # Frontend interaction logic
├── docker-compose.yml     # Orchestrates backend and frontend services
├── vercel.json            # Deployment configuration for Vercel
└── render.yaml            # Blueprint for Render deployment
```

---

## ⚙️ Setup & Installation

### 1. Prerequisites
- Python 3.10+
- [Groq API Key](https://console.groq.com/)
- [Google Custom Search API Key & CX ID](https://developers.google.com/custom-search/v1/overview)

### 2. Configure Environment Variables
Create a `.env` file in the `backend/` directory (refer to `env.example` in the root):

```env
GROQ_API_KEY=your_groq_api_key
GOOGLE_API_KEY=your_google_api_key
GOOGLE_CSE_ID=your_cse_id
```

### 3. Local Development (Manual)

#### Backend:
```bash
cd backend
pip install -r requirements.txt
python train_model.py  # Only if you need to retrain the model
uvicorn main:app --reload --port 8000
```

#### Frontend:
Simply open `index.html` in your browser or use a local server:
```bash
# Using Python to serve
python -m http.server 5500
```

### 4. Local Development (Docker)
Ensure Docker is installed, then run:
```bash
docker-compose up --build
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Health check / API Status |
| `GET` | `/health` | Verify if ML model is loaded correctly |
| `POST` | `/predict-grade` | Predict grade from student metrics |
| `POST` | `/chat` | Full AI Chat context (Search + Grade + Subject Detection) |

---

## 🧠 Technical Overview

### Machine Learning
The grading model is a `RandomForestClassifier` trained on student performance metrics. It takes 4 inputs:
- Weekly Study Hours
- Attendance Percentage
- Class Participation (0-10)
- Total Score (0-100)

### AI Safety & Scope
StudyBot is strictly educational. It uses system prompting to ensure it only answers academic questions. If asked about off-topic subjects, it politely redirects the student to academic topics.

### Authors
Created with ❤️ by:
- **Aayan Shahid**
- **Taalib Rahman**
- **Saim Barkat**

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
