# Architecture & Scaling Strategy

## 1. Full Architecture Diagram Explanation

### Components Overview
1. **Admin Dashboard (Next.js / React)**: Interfaces with the Backend via REST APIs. Handles CSV uploads, analytics viewing, and campaign triggers.
2. **API Gateway & Core API (FastAPI)**: 
   - Exposes REST endpoints.
   - Validates incoming webhooks.
   - Handles the Database operations via SQLAlchemy.
3. **Database (PostgreSQL)**: The single source of truth for all transactional data (Customers, Orders, Call Statuses, Audit Logs).
4. **Message Broker (Redis)**: Acts as the task queue for Celery.
5. **Background Workers (Celery)**: Pulls tasks from Redis to initiate Twilio Outbound API calls. This completely decouples the API from slow 3rd-party network requests.
6. **Telephony Provider (Twilio/Exotel)**: Places the physical SIP/PSTN call and fires HTTP webhooks back to the FastAPI server on call events.
7. **Reverse Proxy (Nginx)**: Handles SSL termination, rate-limiting, and routing to frontend/backend containers.

### Execution Flow
1. **Upload**: Admin uploads CSV -> API validates -> Inserts to Postgres -> Returns success.
2. **Campaign Start**: Admin clicks "Start" -> API queues N tasks into Redis -> Returns success instantly.
3. **Execution**: Celery workers pick up tasks -> Call Twilio REST API to initiate call.
4. **Interaction**: 
   - Call connects.
   - Twilio requests TwiML from our Webhook endpoint.
   - FastAPI generates dynamic, localized TwiML (Text-to-Speech instructions + DTMF Gather).
   - User inputs DTMF digit.
   - Twilio POSTs digit back to FastAPI Gather Webhook.
   - FastAPI updates Postgres with Order Status (Confirmed/Cancelled).
5. **Status Update**: Call ends -> Twilio POSTs final status -> FastAPI updates Postgres.

---

## 2. Phase 2 & 3: Local AI & Voice Confirmations

While Phase 1 relies on highly-reliable DTMF (Press 1), the architecture is prepared for **Voice AI**.

**Voice Implementation Strategy:**
Instead of `Gather` (DTMF), we will use Twilio `<Stream>` (Media Streams) to stream raw audio via WebSockets to our FastAPI backend.
1. The WebSocket endpoint buffers raw PCM audio chunks.
2. Audio is fed into a **Faster-Whisper** local container (via GPU if available, or optimized CPU models).
3. Transcribed text is parsed for intent ("Yes", "Confirm", "Cancel").
4. If ambiguous, the text is routed to a Local LLM (Ollama / Llama 3) for intent classification.
5. Based on intent, we inject dynamic TwiML updates into the live call or hang up.

---

## 3. Migration Guides

### Exotel Migration Guide
To migrate from Twilio to Exotel (popular in India/APAC):
1. **API Changes**: Replace `TwilioService.make_call()` with Exotel's Outbound Call API (`POST /v1/Accounts/{exotel_sid}/Calls/connect.json`).
2. **Webhook Changes**: Exotel uses a different concept called 'Applets' (Passthru). Instead of returning TwiML XML, you configure an Exotel flow via their drag-and-drop builder, and point the "Passthru" URL to our `/gather` equivalent endpoint.
3. **Status Polling**: Exotel pushes end-of-call status to a specified URL, similar to Twilio's `status_callback`.

### Asterisk PBX Migration Guide (Self-Hosted)
For massive scale at zero marginal cost per minute:
1. **SIP Trunks**: Procure SIP trunks from a local telecom (e.g., Tata, Airtel).
2. **ARI (Asterisk REST Interface)**: Instead of Twilio SDK, Python backend will use the `ari-py` library to instruct Asterisk to dial out.
3. **Local TTS/STT**: We would route Asterisk audio directly into our Python stack using local models (Coqui TTS + Whisper) via EAGI/ARI streams, bypassing all cloud provider fees.

---

## 4. Hackathon Demo Strategy & Investor Pitch Angle

**The Pitch (Y-Combinator Style):**
> "We are building the automated conversational infrastructure for e-commerce and logistics. Today, companies spend millions on call centers just to ask, 'Are you available to receive your package today?'. We've built an AI agent that handles outbound phone confirmations automatically in 4 local languages, dropping operational costs by 95% and eliminating human error. It integrates with existing systems via a single CSV upload."

**Demo Execution:**
1. **Show the Dashboard**: Clean, modern, showing $0 cost vs "Human Cost".
2. **The Upload**: Drag a CSV with the judges' phone numbers.
3. **The Call**: Click "Start Campaign".
4. **The "Aha" Moment**: The judges' phones ring simultaneously. They pick up. The bot addresses them by name, in their native language (e.g., Hindi for Judge A, English for Judge B), and asks for confirmation.
5. **Real-time Updates**: As judges press '1', the dashboard visually updates in real-time to "Confirmed".

## 5. Future SaaS Roadmap
- **Multi-tenant architecture**: Add `company_id` to all tables. Implement Row-Level Security (RLS) in PostgreSQL.
- **WhatsApp Fallback**: Integrate Meta Graph API. If `call_status == "no-answer"`, trigger a Celery task to send a WhatsApp interactive template message.
- **Fraud Detection**: Flag orders where the phone number's country code doesn't match the IP address or delivery address.