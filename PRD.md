Product Requirements Document: Pneuma
=====================================

**Document Version:** 2.0

**Target Release:** Q3 2026

1\. Product Overview
--------------------

**Pneuma** (derived from the ancient Greek word for *breath* or *spirit*)  is an AI-driven, live-transcription presentation software designed specifically for church media environments. It automates the display of scripture, sermon points, and media by listening to the speaker in real-time. This document outlines the core architecture, user interface, interaction paradigms, and business constraints required for the V1 launch.

2\. System Architecture & Infrastructure
----------------------------------------

Pneuma utilizes a hybrid processing model to balance universal accessibility, API cost management, and high-performance offline capabilities.

### 2.1 Cloud-Default Engine (Deepgram)

-   **Primary Engine:** Deepgram (Nova-3 model).

-   **Target:** Windows, Intel-based Macs, and users with stable internet.

-   **Requirements:** Requires ~1 Mbps of bandwidth.

-   **Benefits:** Superior handling of room echoes, reverb, and multiple speakers without taxing the local machine's GPU/CPU.

### 2.2 Offline-First Local Mode (Faster-Whisper / CTranslate2)

-   **Primary Engine:** Faster-Whisper with CTranslate2 inference backend, bundled as a compiled Python sidecar.

-   **Target:** All platforms (macOS Apple Silicon + Intel, Windows). Cross-platform CPU/GPU inference via CTranslate2.

-   **Requirements:** Minimum 8GB RAM (16GB recommended). Model tier selection (Tiny int8 <400MB, Base/Small int8 ~800MB–1.5GB).

-   **Benefits:** Zero-latency transcription without internet dependency. Silero VAD integration ensures audio buffers are only sent to the inference engine when speech is active, preventing noise artifacts. Works universally across all supported hardware — no Apple Silicon restriction.

### 2.3 System Guardrails & API Protection

-   **10-Minute Idle Timeout:** If the system detects uniform ambient noise or complete silence for 10 continuous minutes, the cloud streaming connection is automatically paused to protect API operating margins.

-   **Telemetry Warnings:** If the audio visualizer registers input but no server text tokens are received within 45 seconds, the UI must flag a "Connection Drop" warning to the operator.

3\. User Interface: The 6-Panel Dashboard
-----------------------------------------

The Operator View is designed for high-stress, fast-paced media booth environments. It is strictly divided into a rigid 6-panel grid to eliminate window management.

1.  **Live Transcript:** A continuous, scrolling feed of the speaker's transcribed words.

2.  **Preview Canvas (Staging):** A WYSIWYG editor showing exactly what the *next* slide will look like before it is pushed live.

3.  **Live Output Monitor:** A real-time mirror of what the congregation is currently seeing on the main screens.

4.  **Playlist Queue:** The pre-planned linear run-of-show (worship lyrics, scheduled sermon slides, videos).

5.  **Scripture Search:** A dual-mode search engine (Exact Book/Verse Reference vs. Semantic Context search).

6.  **AI Detections Pool:** An automated staging area where Pneuma's AI parks detected scriptures or quoted phrases that the speaker mentions, waiting for the operator's approval to push live.

4\. Interaction Design & Hotkeys
--------------------------------

Speed is critical. Operators must be able to drive the entire presentation engine without relying on mouse clicks.

-   **`L` (Live Sync Toggle):** Instantly locks the Staging Preview to the Live Output. Whatever hits preview is immediately fired to the screens.

-   **`Tab` (Search Mode Switch):** Flips the active Scripture Search panel between traditional "Book/Chapter" mode and AI "Semantic Context" mode.

-   **`Enter` (Stage):** Moves a selected verse or AI detection into the Preview Canvas.

-   **`Double-Enter` (Instant Live):** Bypasses the Preview Canvas entirely and fires the selected item directly to the Live Output Monitor.

-   **`0--9` (Rapid Select):** When a chapter is loaded in the search panel, pressing a number key instantly selects the corresponding verse.

5\. Software Features & Algorithmic Optimizations
-------------------------------------------------

### 5.1 Presentation Logic

-   **Anti-Flicker Cooldown:** In Auto-Presentation mode, a hard minimum display duration (e.g., 2.5 seconds) is enforced. If a pastor rapid-reads through a passage, the screen will hold the current slide long enough to be read rather than flashing rapidly.

### 5.2 Content & Bible Licensing

-   **In-App Translation Marketplace:** Instead of forcing manual file uploads or shipping with heavily copyrighted texts, Pneuma features a native module store. Users can download authorized global language packs (KJV, NKJV, NIV, NLT, ESV, NASB, etc.) to manage digital rights and updates natively.

### 5.3 Search Optimization

-   **Multi-Stage Re-ranking:** Semantic searches do not rely solely on vector cosine similarity. A secondary re-ranking pass applies weights based on word overlap, distinctive biblical keywords, and exact phrase structures to ensure accuracy.

-   **Semantic Caching:** Vector representations for common theological topics or conversational queries are cached locally to drop repeat-search latency to near 0ms.

6\. Business Model & User Acquisition
-------------------------------------

To drive rapid adoption while managing API overhead, Pneuma will utilize a hybrid Freemium/SaaS model.

-   **Standard Tier:** $20/month for unlimited cloud transcription and full feature access.

-   **The 40-Minute Free Tier:** Free accounts receive a rolling **40 minutes of live cloud transcription per week**, resetting automatically every Sunday at 12:00 AM local time.

-   **Strategic Purpose:** 40 minutes perfectly covers a standard Sunday sermon for a small church plant. This allows them to rely on the software entirely for free, creating a frictionless organic growth funnel. As the church grows or adds multiple services, they will naturally cross the 40-minute threshold and convert to the paid tier.