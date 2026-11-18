# Scientific table and formula preservation

## What was added

- Existing pdfplumber table detection and RAG markdown are preserved.
- Tables additionally retain `columns`, `rows`, page number, bounding box, and an original PDF crop (`image_url`). The UI renders a scrollable HTML table, exports CSV, and can show the source image. HTML content is constructed with `textContent` (not interpreted as HTML).
- Formula recognition is optional and **off by default**; when enabled, Docling attempts to return formula text/LaTeX with page provenance, and the app adds formula chunks to Qdrant and renders recognized formulas with KaTeX. The viewer marks formula extraction as **unverified**, with a source crop when available.
- Existing uploads and stored paper records continue working: old records without `columns` or `formulas` show the old markdown fallback or empty formula state. Re-upload PDFs to populate new fields.

## Running locally with formula recognition

```bash
pip install -r requirements.txt
pip install -r requirements.scientific.txt
```

Set `ENABLE_DOCLING_FORMULAS=1` in `.env`, then restart the Flask app. You may need to download Docling's model weights on first use. Run a few controlled PDFs locally and validate math against the original crop before deploying. Recognition can be slow and imperfect; formula-to-LaTeX quality depends on Docling version, PDF type, model and page coordinates.

**Render free:** Keep `ENABLE_DOCLING_FORMULAS=0` and keep using `requirements.render.txt`. This protects the existing low-memory deployment; structured tables and original table crops still work. Formula recognition requires a more capable instance or a separate processing service.

## Data and UI

Upload and paper-details APIs now include `formulas` and enhanced table properties. Formula previews rely on KaTeX from jsDelivr (if offline, raw recognized text is displayed). Extracted source images use the existing `/api/figure/<paper_id>/<filename>` route.

## Limitations and recommended follow-up

- Merged and multi-page tables still require specialized structural reconstruction.
- Docling formula extraction is best-effort and not guaranteed to return LaTeX for every PDF/equation. The original PDF crop is the authoritative visual fallback.
- PDF bbox source coordinate origins vary; verify crops on representative documents.
- No scanned-PDF OCR is enabled by default in this change.
- Indexed original page text may also contain text from tables. This pre-existing behavior is preserved intentionally, to avoid changing working retrieval semantics.

## Additional borderless-table and layout fixes

- The *Section summary* reading area now expands to the full height of the adjacent tables/formulas panel on desktop. On narrower screens, it returns to a bounded scrolling region.
- A conservative caption-aware fallback detects borderless tables whose columns contain aligned text rather than repeated numerical values. It supplements the existing `pdfplumber` strategies and numeric-column fallback.
- For performance and false-positive protection, the new fallback applies only around explicit **Table** captions, requires at least three populated, aligned rows, and keeps the existing extraction/embedding endpoints unchanged. Some irregular, rotated, uncaptioned and multi-page tables may still be missed.
- Files changed: `frontend/static/css/style.css`, `backend/src/document_pipeline.py`, `tests/test_layout_extraction.py`.
