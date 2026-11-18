const $ = (id) => document.getElementById(id);
      let currentPaperId = null;
      let topics = [];
      async function requestJson(url, options = {}) {
        const response = await fetch(url, options);
        const data = await response
          .json()
          .catch(() => ({ error: "Unexpected server response" }));
        if (!response.ok)
          throw new Error(data.error || `Request failed (${response.status})`);
        return data;
      }
      // Read POST SSE incrementally. Each event is framed by a blank line; boundaries
      // may occur in the middle of a network chunk or UTF-8 codepoint.
      async function streamJson(url, payload, onDelta, onDone, signal) {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify(payload), signal,
        });
        if (!response.ok) {
          const d = await response.json().catch(() => ({}));
          throw new Error(d.error || `Request failed (${response.status})`);
        }
        if (!response.body) throw new Error("Streaming is not supported by this browser.");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let completed = false;
        function dispatch(frame) {
          let event = "message", data = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trimStart();
          }
          if (!data) return;
          const value = JSON.parse(data);
          if (event === "delta") onDelta(value.text || "");
          else if (event === "done") { completed = true; onDone?.(value); }
          else if (event === "error") throw new Error(value.error || "Generation failed");
        }
        try {
          while (true) {
            const { value, done } = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replace(/\r\n/g, "\n");
            let end;
            while ((end = buffer.indexOf("\n\n")) !== -1) {
              const frame = buffer.slice(0, end);
              buffer = buffer.slice(end + 2);
              dispatch(frame);
            }
            if (done) break;
          }
          if (buffer.trim()) dispatch(buffer);
          if (!completed) throw new Error("Stream disconnected before completion.");
        } finally { reader.releaseLock(); }
      }
      let summaryAbort = null;
      async function checkHealth() {
        try {
          const d = await requestJson("/api/health");
          $("health").textContent = `Connected · ${d.vector_store}`;
        } catch (e) {
          $("health").textContent = "Service status unavailable";
        }
      }
      function showStatus(el, msg, isError = false) {
        el.textContent = msg;
        el.classList.toggle("error", isError);
      }
      function escapeHtml(s) {
        return String(s ?? "").replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            })[c],
        );
      }
      $("uploadForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const files = Array.from($("pdfFile").files);
        if (!files.length) return;
        if (files.length > 5) {
          showStatus($("uploadStatus"), "Choose at most 5 PDFs per batch.", true);
          return;
        }
        const button = $("uploadBtn");
        button.disabled = true;
        let completed = 0;
        let failed = [];
        const uploadedIds = [];
        try {
          for (const [index, file] of files.entries()) {
            button.textContent = `Indexing ${index + 1}/${files.length}…`;
            showStatus($("uploadStatus"), `Processing ${file.name} (${index + 1} of ${files.length})…`);
            const form = new FormData();
            form.append("file", file);
            let data;
            try {
              data = await requestJson("/api/upload", { method: "POST", body: form });
            } catch (err) {
              failed.push(`${file.name}: ${err.message}`);
              continue;
            }
            completed++;
            uploadedIds.push(data.paper_id);
          currentPaperId = data.paper_id;
          topics = data.topics || [];
          $("dashboard").classList.remove("hidden");
          $("paperTitle").textContent = data.title || data.filename;
          $("paperMeta").textContent = `${data.filename} · ${data.paper_id}`;
          $("pageCount").textContent = data.page_count;
          $("tableCount").textContent = data.table_count;
          $("figureCount").textContent = data.figure_count;
          $("chunkCount").textContent = data.chunk_count;
          renderTopics();
          renderTables(data.tables || []);
          renderFormulas(data.formulas || []);
          renderFigures(data.figures || []);
          $("summary").textContent = "Choose a section from the left.";
          $("messages").replaceChildren();
          addBubble(
            "ai",
            "Paper indexed. Ask a question about its content, tables, or figures.",
          );
          }
          await refreshLibrary(uploadedIds.at(-1));
          if (completed) await openPaper(uploadedIds.at(-1));
          showStatus($("uploadStatus"), `${completed} paper(s) indexed.` +
            (failed.length ? ` Errors: ${failed.join("; ")}` : " Choose any paper from Your library."), failed.length > 0);
        } catch (err) {
          showStatus($("uploadStatus"), err.message, true);
        } finally {
          button.disabled = false;
          button.textContent = "Upload & index papers ↗";
        }
      });
      function renderTopics() {
        const root = $("topics");
        root.replaceChildren();
        if (!topics.length) {
          root.innerHTML =
            '<p class="empty">No headings detected. Try Full Paper if available.</p>';
          return;
        }
        topics.forEach((topic, i) => {
          const b = document.createElement("button");
          b.className = "topic";
          b.textContent = topic;
          b.addEventListener("click", () => summarize(topic, b));
          root.appendChild(b);
          if (i === 0) b.click();
        });
      }
      async function summarize(topic, button) {
        if (summaryAbort) summaryAbort.abort();
        const controller = new AbortController();
        summaryAbort = controller;
        document.querySelectorAll(".topic").forEach((b) => b.classList.remove("active"));
        button.classList.add("active");
        const target = $("summary");
        target.textContent = "";
        target.classList.add("streaming");
        try {
          await streamJson("/api/summary/stream", { paper_id: currentPaperId, topic },
            (delta) => { target.textContent += delta; }, null, controller.signal);
        } catch (err) {
          if (err.name !== "AbortError") target.textContent += `\n\nError: ${err.message}`;
        } finally {
          if (summaryAbort === controller) {
            summaryAbort = null;
            target.classList.remove("streaming");
          }
        }
      }
      function renderTables(tables) {
        const root = $("tables");
        root.replaceChildren();
        if (!tables.length) {
          root.innerHTML = '<p class="empty">No tables detected. Complex/scanned PDFs may need layout recognition.</p>';
          return;
        }
        tables.forEach((t) => {
          const card = document.createElement("div");
          card.className = "table-card";
          const title = document.createElement("strong");
          title.textContent = `${t.table_id} · Page ${t.page}`;
          const caption = document.createElement("p");
          caption.className = "muted small";
          caption.textContent = t.caption || "";
          card.append(title, caption);
          if (Array.isArray(t.columns) && t.columns.length) {
            const scroll = document.createElement("div");
            scroll.className = "table-scroll";
            const table = document.createElement("table");
            table.className = "research-data-table";
            const thead = document.createElement("thead");
            const headerRow = document.createElement("tr");
            t.columns.forEach(value => {
              const th = document.createElement("th");
              th.textContent = value;
              headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            const tbody = document.createElement("tbody");
            (t.rows || []).forEach(row => {
              const tr = document.createElement("tr");
              t.columns.forEach((_, i) => {
                const td = document.createElement("td");
                td.textContent = row[i] || "";
                tr.appendChild(td);
              });
              tbody.appendChild(tr);
            });
            table.append(thead, tbody);
            scroll.appendChild(table);
            card.appendChild(scroll);
            const csvBtn = document.createElement("button");
            csvBtn.className = "table-export";
            csvBtn.textContent = "Export CSV ↓";
            csvBtn.addEventListener("click", () => {
              const quote = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
              const csv = [t.columns, ...(t.rows || [])].map(row => row.map(quote).join(",")).join("\r\n");
              const url = URL.createObjectURL(new Blob(["\uFEFF", csv], {type:"text/csv;charset=utf-8"}));
              const link = document.createElement("a");
              link.href = url;
              link.download = `${t.table_id || "table"}.csv`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            });
            card.appendChild(csvBtn);
          } else {
            const pre = document.createElement("pre");
            pre.textContent = t.markdown || "";
            card.appendChild(pre);
          }
          if (t.image_url) {
            const details = document.createElement("details");
            const summary = document.createElement("summary");
            summary.textContent = "See original PDF table";
            const img = document.createElement("img");
            img.src = t.image_url;
            img.alt = `Original table on page ${t.page}`;
            img.className = "table-original";
            details.append(summary, img);
            card.appendChild(details);
          }
          root.appendChild(card);
        });
      }
      function updateFormulaGalleryArrows() {
        const track = $("formulas");
        const prev = $("formulaPrev");
        const next = $("formulaNext");
        if (!track || !prev || !next) return;
        const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
        prev.disabled = track.scrollLeft <= 2;
        next.disabled = track.scrollLeft >= maxScroll - 2;
      }

      async function copyFormulaLatex(text, button) {
        const original = button.textContent;
        try {
          if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
          await navigator.clipboard.writeText(text);
          button.textContent = "Copied ✓";
        } catch (_) {
          // Works on localhost/HTTPS in modern browsers; fallback for blocked clipboard access.
          const temporary = document.createElement("textarea");
          temporary.value = text;
          temporary.style.position = "fixed";
          temporary.style.opacity = "0";
          document.body.appendChild(temporary);
          temporary.select();
          const copied = document.execCommand("copy");
          temporary.remove();
          button.textContent = copied ? "Copied ✓" : "Copy failed";
        }
        setTimeout(() => { button.textContent = original; }, 1600);
      }

      function renderFormulas(formulas) {
        const root = $("formulas");
        const section = $("formulaSection");
        if (!root || !section) return;
        root.replaceChildren();
        if (!Array.isArray(formulas) || !formulas.length) {
          section.classList.add("hidden");
          $("formulaCount").textContent = "";
          return;
        }
        section.classList.remove("hidden");
        $("formulaCount").textContent = `${formulas.length} equation${formulas.length === 1 ? "" : "s"}`;
        formulas.forEach(f => {
          const card = document.createElement("article");
          card.className = "formula-card";
          const title = document.createElement("strong");
          title.className = "formula-card-title";
          title.textContent = `${f.formula_id || "Equation"} · Page ${f.page ?? "?"} · Unverified extraction`;
          const math = document.createElement("div");
          math.className = "formula-math";
          const latex = String(f.latex || "");
          try {
            if (window.katex) window.katex.render(latex, math, { displayMode: true, throwOnError: true, trust: false });
            else math.textContent = latex;
          } catch (_) { math.textContent = latex; }
          const actions = document.createElement("div");
          actions.className = "formula-card-actions";
          const copy = document.createElement("button");
          copy.type = "button";
          copy.className = "formula-copy";
          copy.textContent = "Copy LaTeX";
          copy.addEventListener("click", () => copyFormulaLatex(latex, copy));
          actions.appendChild(copy);
          if (f.image_url) {
            const details = document.createElement("details");
            const summary = document.createElement("summary");
            summary.textContent = "View original PDF crop";
            const img = document.createElement("img");
            img.src = f.image_url;
            img.loading = "lazy";
            img.alt = `Original equation on page ${f.page}`;
            img.className = "table-original";
            details.append(summary, img);
            actions.appendChild(details);
          }
          card.append(title, math, actions);
          root.appendChild(card);
        });
        root.scrollLeft = 0;
        requestAnimationFrame(updateFormulaGalleryArrows);
      }

      $("formulaPrev")?.addEventListener("click", () => {
        const track = $("formulas");
        track.scrollBy({ left: -Math.max(280, track.clientWidth * .75), behavior: "smooth" });
      });
      $("formulaNext")?.addEventListener("click", () => {
        const track = $("formulas");
        track.scrollBy({ left: Math.max(280, track.clientWidth * .75), behavior: "smooth" });
      });
      $("formulas")?.addEventListener("scroll", updateFormulaGalleryArrows, { passive: true });
      window.addEventListener("resize", updateFormulaGalleryArrows);

      function renderFigures(figures) {
        const root = $("figures");
        root.replaceChildren();
        if (!figures.length) {
          root.innerHTML =
            '<p class="empty">No extractable figures detected. Scanned/flattened figures may need OCR or page rendering.</p>';
          return;
        }
        figures.forEach((f) => {
          const card = document.createElement("div");
          card.className = "figure-card";
          const title = document.createElement("strong");
          title.textContent = `${f.figure_id} · Page ${f.page}`;
          const caption = document.createElement("p");
          caption.className = "muted small";
          caption.textContent = f.caption || "";
          card.append(title, caption);
          if (f.image_url) {
            const img = document.createElement("img");
            img.src = f.image_url;
            img.alt = f.caption || "Extracted research figure";
            card.appendChild(img);
          }
          if (f.description) {
            const desc = document.createElement("p");
            desc.className = "small";
            desc.textContent = f.description;
            card.appendChild(desc);
          }
          root.appendChild(card);
        });
      }
      function appendSources(bubble, sources = []) {
        if (!sources.length) return;
        const src = document.createElement("div");
        src.className = "sources";
        sources.forEach((s) => {
          const tag = document.createElement("span");
          tag.className = "source";
          tag.textContent = `${s.label} · page ${s.page} · score ${s.score}`;
          src.appendChild(tag);
        });
        bubble.appendChild(src);
      }
      function addBubble(kind, text, sources = []) {
        const bubble = document.createElement("div");
        bubble.className = `bubble ${kind}`;
        const content = document.createElement("div");
        content.className = "bubble-text";
        content.textContent = text;
        bubble.appendChild(content);
        appendSources(bubble, sources);
        $("messages").appendChild(bubble);
        $("messages").scrollTop = $("messages").scrollHeight;
        return { bubble, content };
      }
      $("chatForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!currentPaperId) return;
        const question = $("question").value.trim();
        if (!question) return;
        addBubble("user", question);
        $("question").value = "";
        $("askBtn").disabled = true;
        $("askBtn").textContent = "Generating…";
        const { bubble, content } = addBubble("ai", "");
        bubble.classList.add("streaming");
        try {
          await streamJson("/api/chat/stream", { paper_id: currentPaperId, message: question },
            (delta) => {
              content.textContent += delta;
              $("messages").scrollTop = $("messages").scrollHeight;
            },
            (done) => appendSources(bubble, done.sources || []));
        } catch (err) {
          content.textContent += `\n\nError: ${err.message}`;
        } finally {
          bubble.classList.remove("streaming");
          $("askBtn").disabled = false;
          $("askBtn").textContent = "Ask ↗";
        }
      });
      $("deleteBtn").addEventListener("click", async () => {
        if (
          !currentPaperId ||
          !confirm("Delete this paper and its indexed vectors?")
        )
          return;
        try {
          await requestJson(`/api/paper/${currentPaperId}`, {
            method: "DELETE",
          });
          currentPaperId = null;
          $("dashboard").classList.add("hidden");
          showStatus($("uploadStatus"), "Paper and vectors deleted.");
          await refreshLibrary();
          if ($("singlePaperSelect").value) await openPaper($("singlePaperSelect").value);
        } catch (err) {
          alert(err.message);
        }
      });
      async function refreshLibrary(preferredId = currentPaperId) {
        const picker = $("singlePaperSelect");
        try {
          const data = await requestJson("/api/papers");
          picker.replaceChildren(new Option("Select an uploaded paper…", ""));
          for (const paper of data.papers) {
            picker.add(new Option(paper.title || paper.filename || "Untitled paper", paper.paper_id));
          }
          if (preferredId && data.papers.some(p => p.paper_id === preferredId)) picker.value = preferredId;
          else if (data.papers.length) picker.value = data.papers[0].paper_id;
          else {
            currentPaperId = null;
            $("dashboard").classList.add("hidden");
          }
          showStatus($("libraryStatus"), `${data.papers.length} paper(s) available in your library.`);
        } catch (err) {
          showStatus($("libraryStatus"), err.message, true);
        }
      }
      async function openPaper(paperId) {
        if (!paperId) { showStatus($("libraryStatus"), "Choose a paper first.", true); return; }
        try {
          if (summaryAbort) summaryAbort.abort();
          const data = await requestJson(`/api/paper/${encodeURIComponent(paperId)}`);
          currentPaperId = data.paper_id;
          topics = data.topics || [];
          $("singlePaperSelect").value = paperId;
          $("dashboard").classList.remove("hidden");
          $("paperTitle").textContent = data.title || data.filename;
          $("paperMeta").textContent = `${data.filename} · ${data.paper_id}`;
          $("pageCount").textContent = data.page_count;
          $("tableCount").textContent = data.table_count;
          $("figureCount").textContent = data.figure_count;
          $("chunkCount").textContent = data.chunk_count;
          $("summary").textContent = "Choose a section from the left.";
          $("messages").replaceChildren();
          addBubble("ai", "Selected paper loaded. Ask questions about this paper.");
          renderTables(data.tables || []);
          renderFormulas(data.formulas || []);
          renderFigures(data.figures || []);
          renderTopics();
          showStatus($("libraryStatus"), "Paper opened for individual analysis.");
          $("dashboard").scrollIntoView({ behavior: "smooth" });
        } catch (err) {
          showStatus($("libraryStatus"), err.message, true);
          await refreshLibrary();
        }
      }
      $("refreshLibrary").addEventListener("click", () => refreshLibrary());
      $("openPaperBtn").addEventListener("click", () => openPaper($("singlePaperSelect").value));
      $("singlePaperSelect").addEventListener("change", (event) => openPaper(event.target.value));
      checkHealth();
      refreshLibrary();
