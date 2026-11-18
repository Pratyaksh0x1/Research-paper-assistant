"""Keep the new structured representations compatible with old markdown."""
from pathlib import Path
import fitz
from backend.src.document_pipeline import _table_structure, _save_source_crop, _extract_formulas_optional


def test_table_cells_preserved_without_markdown_reparsing():
    head, rows = _table_structure([["Method", "Acc | score"], ["CNN", "95%"], ["SVM", None]])
    assert head == ["Method", "Acc | score"]
    assert rows == [["CNN", "95%"], ["SVM", ""]]


def test_source_crop_stores_an_image(tmp_path):
    doc = fitz.open()
    page = doc.new_page(width=300, height=200)
    page.insert_text((40, 60), "A  B  C")
    filename = _save_source_crop(page, [10, 10, 250, 100], tmp_path, "table.png")
    assert filename == "table.png"
    assert (tmp_path / filename).stat().st_size > 100
    doc.close()


def test_docling_disabled_without_external_models(tmp_path, monkeypatch):
    monkeypatch.delenv("ENABLE_DOCLING_FORMULAS", raising=False)
    assert _extract_formulas_optional(tmp_path / "missing.pdf", None, "test", tmp_path) == []
