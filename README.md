# ResearchLab — AI-Powered Research Paper Assistant

ResearchLab is a research-focused, Retrieval-Augmented Generation (RAG) application for reading, exploring, and comparing academic PDF papers. It combines **page-aware document extraction**, **structured table viewing**, **CSV export**, **source-grounded question answering**, **streaming section summaries**, and **multi-paper comparison** in a single workspace.

**Built with:** Python, Flask, HTML/CSS/JavaScript, PyMuPDF, pdfplumber, Sentence Transformers, Qdrant, and Groq.

**[Explore the ResearchLab Showcase](https://kartiktomar03.github.io/ResearchLab-Showcase/)** · **[Source Code](https://github.com/kartiktomar03/Research-Paper-Assistant)**

> **Running the application:** ResearchLab is designed to run locally. Docker/Render configuration is included for optional deployment, but hosted availability and performance are not guaranteed. The showcase is a project website, not a live interactive instance of the backend.

## Overview

Reading research papers is time-consuming when findings, methods, tables, and figures are spread across long documents. ResearchLab helps organize those materials and answer questions using retrieved evidence rather than repeatedly sending entire PDFs to an LLM.

ResearchLab is **not a replacement for ChatGPT**. Its distinguishing focus is a dedicated academic-paper workflow with configurable extraction, local/cloud vector storage, page/source metadata, structured table inspection, and cross-paper comparison.

## Implemented Features

### 1. PDF upload and document processing

- Upload up to **five PDFs per batch** through the interface.
- Extract page-aware text and available PDF metadata, including title/author/abstract heuristics.
- Identify document sections/topics for exploration.
- Extract figures and associate available page and caption information.
- Maintain a library of indexed papers; open or delete papers and their indexed records.

### 2. Structured table extraction and CSV export

- Detect tables using multiple PDF extraction strategies, including attempts at borderless tables.
- Preserve detected **column headers and rows** where extraction succeeds.
- Display tables in a **readable HTML grid**, not only as plain text or Markdown.
- Download individual extracted tables using **Export CSV**.
- Inspect an **original PDF table crop** when a source preview is available, to verify numeric values and layout.
- Associate extracted tables with their source page and available captions.

> **Accuracy note:** Table detection is not perfect. Borderless, merged-cell, scanned, or unusually formatted tables may be missed or misread; CSV exports should be checked against the source crop.

### 3. Streaming summaries

- Explore detected sections/topics and generate section-wise summaries.
- Stream model output to the UI using **Server-Sent Events (SSE)**.
- Help users review methods, results, findings, and limitations without manually scanning every section.

### 4. Paper-specific Q&A with citations

- Ask natural-language questions about the currently selected paper.
- Split extracted text into page-aware chunks (approximately **1,100 characters with 180-character overlap** in the current configuration).
- Generate embeddings using **`sentence-transformers/all-MiniLM-L6-v2`** (384 dimensions) with a configurable embedding backend.
- Retrieve relevant chunks using **Qdrant**, then send retrieved context to the **Groq LLM**.
- Display source/page references returned by the retrieval pipeline.
- Stream answers to the chat interface.

> A cited answer is **not a guarantee of correctness**. Always confirm important claims, equations, and numerical results in the original paper.

### 5. Multi-paper comparison

- Select **two to five papers** for side-by-side research analysis.
- Ask comparative questions about methodologies, reported results, conclusions, and limitations.
- Retrieve evidence from selected papers and display paper-wise sources.

### 6. Dedicated research interface

- Separate sections for **section summaries**, **extracted tables**, **figures**, and **paper Q&A**.
- A separate **Formula Gallery layout** exists in the frontend, but automatic formula recognition is **not enabled in the current stable setup**.
- Responsive neo-brutalist interface with a separate comparison workspace.

## Formula Extraction — Current Status

**Not part of the currently enabled stable workflow.**

The project has experimental/optional Docling integration for formula recognition, but it is intentionally disabled in the stable configuration:

```env
ENABLE_DOCLING_FORMULAS=0
```

The frontend supports a separate formula display area that is hidden when no formulas have been recognized. **Do not interpret this as verified, working formula OCR.** A future enhancement may use selective equation-region detection plus a CPU-friendly formula-to-LaTeX recognizer, displaying both the rendered equation and its original PDF crop for verification.

## Technology Stack

| Layer                          | Technologies                                      |
| ------------------------------ | ------------------------------------------------- |
| Frontend                       | HTML, CSS, JavaScript                             |
| Backend                        | Python, Flask                                     |
| PDF extraction                 | PyMuPDF, pdfplumber                               |
| Embeddings                     | Sentence Transformers; optional FastEmbed backend |
| Vector storage                 | Qdrant (local or cloud)                           |
| LLM                            | Groq API                                          |
| Output streaming               | Server-Sent Events (SSE)                          |
| Optional scientific processing | Docling (formula enrichment disabled by default)  |
| Deployment configuration       | Docker, Render                                    |
| Version control                | Git, GitHub                                       |

## How It Works

```text
                 Research PDF(s)
                       |
                       v
               Flask PDF Upload
                       |
                       v
             PyMuPDF / pdfplumber
                 /      |      \
             Text    Tables   Figures
               |        |        |
          Page-aware   HTML     Preview
           chunking    tables   /crops
               |        |
            Embeddings  CSV export
               |
               v
          Qdrant index <---------------- Question
               |                            |
               +------ Similarity search ---+
                       |
                 Relevant chunks
                       |
                       v
                    Groq LLM
                       |
                       v
              Streaming answer + sources
```

For multi-paper comparison, the application retrieves evidence from the selected papers and uses that context to generate comparative answers.

**Why RAG?** Instead of including a full long PDF in every question prompt, the system indexes it once and retrieves relevant portions for subsequent questions. This gives explicit control over retrieval and prompt context; it does not guarantee better results than a general-purpose AI assistant.

## Project Structure

```text
Research-Paper-Assistant/
├── app.py
├── backend/
│   ├── app.py
│   └── src/
│       ├── document_pipeline.py
│       ├── rag.py
│       └── llm.py
├── frontend/
│   ├── templates/
│   │   ├── index.html
│   │   └── compare.html
│   └── static/
│       ├── css/
│       └── js/
├── tests/
├── SCIENTIFIC_EXTRACTION.md
├── requirements.txt
├── requirements.scientific.txt
├── requirements.render.txt
├── Dockerfile
├── docker-compose.yml
├── render.yaml
├── .env.example
└── README.md
```

Local `data/`, `uploads/`, `.env`, and `.venv/` files/directories may exist at runtime and should **not** be committed.

## Local Setup (Windows / PowerShell)

### Prerequisites

- A working Python installation (the current local ResearchLab setup has been used with **Python 3.14**).
- Git and a Groq API key.
- Internet access for installing dependencies and the initial embedding-model download.

> Some optional scientific-processing packages may not support every Python release. Install optional dependencies only if needed and compatible with your environment. The stable workflow does not require enabling Docling formula enrichment.

### 1. Clone the repository

```powershell
git clone https://github.com/kartiktomar03/Research-Paper-Assistant.git
cd Research-Paper-Assistant
```

### 2. Create and activate a virtual environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 3. Install core dependencies

```powershell
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

If a specific dependency fails on your Python version, check the package's supported versions rather than changing a functioning existing environment unnecessarily.

### 4. Configure `.env`

Copy `.env.example` to `.env` and add your own credentials. Example values:

```env
GROQ_API_KEY=your_groq_api_key
LLM_MODEL=openai/gpt-oss-120b

EMBEDDING_BACKEND=sentence-transformers
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSION=384

QDRANT_URL=
QDRANT_API_KEY=
QDRANT_COLLECTION=research_paper_chunks
QDRANT_LOCAL_PATH=./data/qdrant

ENABLE_DOCLING_FORMULAS=0
```

With `QDRANT_URL` empty, the project is configured for local embedded Qdrant (subject to your installed Qdrant client and project settings).

**Never commit `.env`, API keys, virtual environments, uploaded PDFs, or local vector data.**

### 5. Run

```powershell
python app.py
```

Open **http://127.0.0.1:5000** for the main workspace, or **http://127.0.0.1:5000/compare** for paper comparison.

## API Overview

| Endpoint                       | Purpose                                       |
| ------------------------------ | --------------------------------------------- |
| `GET /api/health`              | Application health                            |
| `GET /api/papers`              | List indexed papers                           |
| `POST /api/upload`             | Upload and index PDF                          |
| `GET /api/paper/<paper_id>`    | Retrieve paper content and extraction results |
| `POST /api/summary/stream`     | Stream section summary                        |
| `POST /api/chat/stream`        | Stream question-answering response            |
| `POST /api/compare/stream`     | Stream multi-paper analysis                   |
| `DELETE /api/paper/<paper_id>` | Delete a paper and indexed records            |

## Optional Deployment

Docker and Render configuration files are retained in the repository. Hosting on limited free-tier compute may cause slow model initialization, indexing timeouts, or temporary unavailability. Local uploaded files and metadata are not inherently persistent on ephemeral hosting. For production use, plan appropriate persistent storage, authentication, access control, and resource limits.

The **[ResearchLab Showcase](https://kartiktomar03.github.io/ResearchLab-Showcase/)** contains project screenshots and documentation; it should not be confused with a continuously available live Flask deployment.

## Known Limitations

- Borderless and merged-cell table extraction can be incomplete or misaligned.
- Figure crops may include surrounding content.
- Scanned PDFs may need dedicated OCR.
- Formula-to-LaTeX recognition is **not enabled** in the current stable setup.
- Source-grounded LLM responses can still contain errors or unsupported interpretations.
- A public deployment needs proper user authentication, storage isolation, and rate limiting.
- Performance depends on PDF complexity, local CPU/RAM, embedding configuration, and external API limits.

## Future Improvements

- [ ] Evaluate lightweight, on-demand equation detection and LaTeX OCR on CPU
- [ ] Improve borderless and complex table reconstruction
- [ ] OCR for scanned papers
- [ ] Background processing and per-paper progress indicators
- [ ] Stronger retrieval evaluation, reranking, and grounding checks
- [ ] Session-based paper isolation and cleanup
- [ ] Persistent deployment storage and authentication

## Tests

The repository includes tests for document extraction, scientific preservation, layouts, and streaming behavior:

```powershell
python -m pytest
```

Passing local tests is not the same as benchmarking extraction accuracy or verifying every external API scenario.

## Attribution

ResearchLab was developed further from the supplied Research-Paper-Analysis-Project codebase. Review and preserve any applicable upstream licensing and attribution terms.

## Disclaimer

ResearchLab is an academic research assistance project. Verify summaries, extracted tables, numerical values, citations, and conclusions against original source papers before relying on them for research or publication.

## Project Showcase

**[Visit ResearchLab Showcase](https://kartiktomar03.github.io/ResearchLab-Showcase/)** — screenshots, architecture, and local setup guidance.
