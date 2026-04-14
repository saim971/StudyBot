from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
import requests
import joblib
import numpy as np
import os
from typing import Optional
import json
import urllib.parse
import pandas as pd
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="Study Chatbot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── CONFIG ────────────────────────────────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "your-groq-api-key")
GOOGLE_API_KEY    = os.getenv("GOOGLE_API_KEY", "your-google-api-key")
GOOGLE_CSE_ID     = os.getenv("GOOGLE_CSE_ID", "your-cse-id")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_NAME = os.getenv("MODEL_PATH", "grade_model.pkl")
MODEL_PATH = os.path.join(BASE_DIR, MODEL_NAME)


groq_client = Groq(api_key=GROQ_API_KEY)

# ─── LOAD MODEL ────────────────────────────────────────────────────────────────
# Try to load your trained ML model; fall back to a simple rule-based predictor
print(f"DEBUG: Attempting to load model from: {MODEL_PATH}")
try:
    if not os.path.exists(MODEL_PATH):
        print(f"ERROR: Model file NOT FOUND at {MODEL_PATH}")
        grade_model = None
    else:
        grade_model = joblib.load(MODEL_PATH)
        print(f"INFO: ML model loaded successfully from {MODEL_PATH}")
except Exception as e:
    print(f"WARNING: Could not load ML model ({e}). Path: {MODEL_PATH}")
    grade_model = None


# ─── SCHEMAS ───────────────────────────────────────────────────────────────────
class StudentMetrics(BaseModel):
    weekly_study_hours: float      # e.g. 15
    attendance_percentage: float   # e.g. 85.0
    class_participation: float     # e.g. 7.0  (scale 0–10)
    total_score: float             # e.g. 72.0 (out of 100)

class ChatRequest(BaseModel):
    message: str
    metrics: Optional[StudentMetrics] = None
    conversation_history: list = []



def predict_grade(metrics: StudentMetrics) -> dict:
    """Run the ML model exclusively to predict the grade."""
    if grade_model is None:
        raise HTTPException(status_code=500, detail="The ML Model has not been trained or failed to load. Please run train_model.py.")

    # Wrap features in a DataFrame with the same names used during training to avoid warnings
    features_df = pd.DataFrame([[
        metrics.weekly_study_hours,
        metrics.attendance_percentage,
        metrics.class_participation,
        metrics.total_score,
    ]], columns=["weekly_self_study_hours", "attendance_percentage", "class_participation", "total_score"])

    try:
        grade = str(grade_model.predict(features_df)[0])
        proba = None
        if hasattr(grade_model, "predict_proba"):
            proba = grade_model.predict_proba(features_df)[0].tolist()
        return {"grade": grade, "confidence": proba, "method": "ml_model"}
    except Exception as e:
        print(f"ML predict error: {e}")
        raise HTTPException(status_code=500, detail=f"Error executing ML model prediction: {e}")

def extract_subject(text: str) -> Optional[str]:
    """Simple keyword extractor for weak subjects."""
    keywords = [
        "weak in", "struggling with", "bad at", "poor in",
        "need help with", "don't understand", "confused about",
        "failing in", "help me with", "study"
    ]
    text_lower = text.lower()
    for kw in keywords:
        if kw in text_lower:
            idx = text_lower.find(kw) + len(kw)
            rest = text[idx:].strip()
            subject = rest.split()[0].rstrip(".,!?") if rest.split() else None
            if subject:
                return subject.capitalize()
    return None

def google_search(query: str, num_results: int = 4) -> list[dict]:
    """Call Google Custom Search API."""
    if not GOOGLE_API_KEY or GOOGLE_API_KEY == "your-google-api-key":
        # Without a Google Search key, just return empty!
        # This forces Gemini to generate notes natively from its own vast knowledge.
        return []
    try:
        resp = requests.get(
            "https://www.googleapis.com/customsearch/v1",
            params={"key": GOOGLE_API_KEY, "cx": GOOGLE_CSE_ID, "q": query, "num": num_results},
            timeout=8,
        )
        resp.raise_for_status()
        items = resp.json().get("items", [])
        return [{"title": i.get("title"), "snippet": i.get("snippet"), "link": i.get("link")} for i in items]
    except Exception as e:
        print(f"Search error: {e}")
        return []

def fetch_wiki_image(topic: str) -> str:
    """Fetch the main educational diagram or thumbnail for a specific subject from Wikipedia reliably."""
    try:
        topic_encoded = urllib.parse.quote(topic)
        url = f"https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&piprop=original&redirects=1&titles={topic_encoded}"
        headers = {"User-Agent": "StudyBot/1.0 (studybot@example.com)"}
        resp = requests.get(url, headers=headers, timeout=5)
        pages = resp.json().get('query', {}).get('pages', {})
        for page_id, page_data in pages.items():
            if 'original' in page_data:
                return page_data['original']['source']
    except Exception as e:
        print(f"Wiki image fetch error: {e}")
    return ""

def build_system_prompt(grade_info: Optional[dict], subject: Optional[str], search_results: list, wiki_image_url: str = "") -> str:
    parts = [
        "CRITICAL INSTRUCTION: You are strictly an Educational Study Assistant. You MUST outright decline to answer ANY question that is not directly related to academics, studying, school, grading, math, science, history, literature, or education.",
        "If a student asks an off-topic question (e.g., recipes, sports, casual chat), you MUST deflect by saying exactly: 'I'm your StudyBot, so I can only help you with academic subjects or study techniques! Let me know what you'd like to learn today.'",
        "CREATOR IDENTITY EXCEPTION: If the user explicitly asks who created you, who made you, or who programmed you, you MUST answer that you were created by the brilliant team of: Aayan Shahid, Taalib Rahman, and Saim Barkat.",
        "You are an empathetic, knowledgeable study assistant for students. Your role is strictly to help students understand their academic performance and improve in weak subjects.",
        "Always be encouraging, specific, and actionable around school performance.",
        "",
    ]

    if grade_info:
        g = grade_info["grade"]
        method = grade_info["method"]
        parts.append(f"STUDENT PERFORMANCE DATA (predicted by {method}):")
        parts.append(f"  Predicted Grade: {g}")
        grade_advice = {
            "A": "This student is performing excellently. Encourage them to maintain this and explore advanced topics.",
            "B": "This student is doing well but has room to reach the top. Focus on filling knowledge gaps.",
            "C": "This student is average. Help them identify specific weak areas and study more consistently.",
            "D": "This student needs significant improvement. Focus on fundamentals and rebuilding confidence.",
            "F": "This student is at risk. Prioritize urgent intervention, study habits, and core concepts.",
        }
        parts.append(f"  Context: {grade_advice.get(g, '')}")
        parts.append("")

    if subject:
        parts.append(f"STUDENT'S FOCUS SUBJECT: '{subject}'")
        if search_results:
            parts.append("STUDY RESOURCES FETCHED:")
            for i, r in enumerate(search_results, 1):
                parts.append(f"  [{i}] {r['title']}")
                parts.append(f"      {r['snippet']}")
                if r.get("link"):
                    parts.append(f"      URL: {r['link']}")
        parts.append(f"CRITICAL INSTRUCTION: You MUST provide a structured section containing rich study notes, key concepts, and 3-5 study techniques specifically for {subject}.")
        
        if wiki_image_url:
            parts.append(f"VISUAL CONTEXT REQUIREMENT: I have retrieved the canonical educational diagram link for '{subject}': {wiki_image_url}")
            parts.append("If the user explicitly asks for an image, diagram, or visual, you MUST give them the above link as a clickable text link (e.g., `[View {subject} Diagram](URL)`). Do NOT output it as an embedded markdown image (`![img]`).")
        
        parts.append("")

    parts += [
        "RESPONSE FORMAT:",
        "1. Acknowledge the student's situation warmly",
        "2. Explain their predicted grade and what it means (if applicable)",
        "3. If a subject weakness is mentioned, provide: concise notes on key concepts, 3–5 proven study techniques, and recommended resources",
        "4. GRAPHING RULE: ONLY output a graph if the user's question directly involves mathematical functions, algebraic equations, or kinematics curves (e.g., y=mx+b, parabolas, sine waves). DO NOT output a graph for general questions, terminology, biology, theory, or study tips! If a graph is strictly necessary, output exactly: `[GRAPH: equation]` (e.g., `[GRAPH: y=x^2]`).",
        "5. End with one motivational sentence",
        "6. IMPORTANT: Make absolutely sure the topic is educational before you output anything else.",
        "",
        "Keep responses concise, structured, and friendly. Use bullet points where helpful.",
    ]

    return "\n".join(parts)


# ─── ROUTES ────────────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "Study Chatbot API running"}

@app.post("/predict-grade")
def predict_grade_endpoint(metrics: StudentMetrics):
    result = predict_grade(metrics)
    return result

@app.post("/chat")
def chat(req: ChatRequest):
    grade_info = None
    subject    = None
    search_results = []
    wiki_image = ""

    # 1. Predict grade if metrics provided
    if req.metrics:
        grade_info = predict_grade(req.metrics)

    # 2. Detect weak subject from message
    subject = extract_subject(req.message)

    # 3. Fetch study resources if subject found
    if subject:
        query = f"{subject} study notes techniques explained"
        search_results = google_search(query)
        wiki_image = fetch_wiki_image(subject)

    # 4. Build system prompt with all context (now passing wiki image explicitly)
    system_prompt = build_system_prompt(grade_info, subject, search_results, wiki_image)

    # 5. Build messages list (include conversation history)
    messages = [{"role": "system", "content": system_prompt}]
    for turn in req.conversation_history[-6:]:  # last 6 turns to stay within context
        role = "assistant" if turn["role"] == "assistant" else "user"
        messages.append({"role": role, "content": turn["content"]})
    messages.append({"role": "user", "content": req.message})

    # 6. Call Groq
    try:
        response = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=messages,
            temperature=0.7,
            max_tokens=1500,
        )
        reply = response.choices[0].message.content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Groq API error: {e}")

    return {
        "reply": reply,
        "grade_info": grade_info,
        "subject_detected": subject,
        "search_results": search_results,
    }

@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": grade_model is not None}
