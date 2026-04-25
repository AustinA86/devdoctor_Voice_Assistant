# Automaton Voice AI: Multilingual Order Confirmation Bot

A production-grade, highly scalable outbound AI calling system designed for businesses to automate order confirmations. Built with FastAPI, PostgreSQL, Redis, Celery, Faster-Whisper, and Edge-TTS.

## 🌟 Overview

Businesses manually calling customers for order confirmation causes delays and operational costs. **Automaton Voice AI** is a startup-grade solution that:
1.  **Simulates Real Calls**: Uses an iPhone Simulator bridge for zero-cost hackathon demos.
2.  **Speaks Natively**: Supports English, Hindi, Kannada, and Marathi with high-fidelity neural voices (Edge-TTS).
3.  **Listens Intelligently**: Uses Faster-Whisper to detect intent (Confirmation/Cancellation) across multiple languages and scripts (e.g., ದೃಢೀಕರಿಸಿ, पुष्टि, Yes).
4.  **Admin Command Center**: A Next.js dashboard for batch CSV uploads and real-time monitoring.

---

## 🏗 Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Backend** | **FastAPI (Python)**: High-performance async API. |
| **Frontend** | **Next.js 14 + Tailwind CSS**: Modern SaaS dashboard. |
| **Mobile** | **React Native (Expo)**: iPhone Simulator integration. |
| **Database** | **PostgreSQL 15**: ACID-compliant transactional storage. |
| **Queue** | **Redis 7 + Celery**: Decoupled task processing. |
| **AI STT** | **Faster-Whisper**: Local multilingual Speech-to-Text. |
| **AI TTS** | **Edge-TTS**: Premium Neural Text-to-Speech. |

---

## 🚀 Local Setup (MacBook Demo)

### 1. Backend & Dashboard
Ensure **Docker Desktop** is running, then execute:
```bash
cp .env.example .env
docker-compose up --build -d
```
*   **Dashboard**: `http://localhost:3000`
*   **API Docs**: `http://localhost:8001/docs`

### 2. iPhone Simulator
1.  Open **Xcode** and boot an iOS Simulator.
2.  Navigate to the mobile directory and start Expo:
```bash
cd mobile_bot
npm install
npx expo start --ios
```

---

## 🎤 Hackathon Demo Flow

1.  **Dashboard**: Upload `test_orders.csv` or click **"+ Add Customer"**.
2.  **Unlock Sound**: On the iPhone screen, tap **"🔊 Sound Check"** to initialize the audio driver.
3.  **Trigger**: Click **"Start Call Campaign"** on the dashboard.
4.  **Accept Call**: The phone rings; tap Accept.
5.  **IVR Interaction**: 
    - Bot asks for language. Tap **Keypad** -> Press **2** for Kannada.
    - Bot speaks order details in natural Kannada.
6.  **Voice Confirmation**:
    - Wait for the **🔴 Listening** indicator.
    - Say *"Yes"* or *"Howdu"* clearly.
    - The AI transcribes the text and confirms the order instantly on the dashboard.

---

## 🏢 Production Deployment (Twilio/VPS)

### 1. VPS Setup (Ubuntu)
Follow the guide in `docs/deployment.md` to deploy using Docker and Nginx on a cloud server.

### 2. Twilio Migration
To move from Simulator to real phone lines:
1.  Open `backend/app/tasks/call_tasks.py`.
2.  Switch the `customer.call_status = CallStatus.RINGING` logic to the pre-built `twilio_service.make_call(customer)` function.
3.  Update `.env` with your `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.

---

## 📂 Project Structure

```text
.
├── backend/            # FastAPI, Celery, AI Logic
├── frontend/           # Next.js Dashboard
├── mobile_bot/         # React Native Expo App
├── docs/               # Architecture & Deployment Guides
├── docker-compose.yml  # Orchestration
└── .env.example        # Environment Template
```

---

## 🛡 Security & Hardening
- **JWT Auth**: Admin dashboard is protected by JWT tokens.
- **Webhook Verification**: Production endpoints validate signatures (Twilio/Exotel).
- **Encrypted Storage**: Credentials and recordings are stored securely.

---

## 📈 Future Roadmap
- [ ] Multi-tenant SaaS support.
- [ ] WhatsApp fallback integration.
- [ ] Real-time sentiment analysis for fraud detection.
- [ ] Direct integration with Shopify/WooCommerce.

**Built for the next generation of automated e-commerce.**
