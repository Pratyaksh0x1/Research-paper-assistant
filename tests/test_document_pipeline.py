from backend.src.document_pipeline import (
    _table_to_markdown,
    _sections_from_pages,
    _extract_tables_from_markdown,
    _extract_formulas_from_markdown,
)


def test_table_to_markdown_preserves_cells():
    md = _table_to_markdown([["Model", "Accuracy"], ["A", "91.2%"], ["B", "94.6%"]])
    assert "Model" in md and "Accuracy" in md and "94.6%" in md


def test_sections_fall_back_to_full_paper():
    sections = _sections_from_pages("Some paper text without known headings.")
    assert "Full Paper" in sections


def test_sections_detect_common_headings():
    text = "Abstract\nThis is a sufficiently long abstract with details.\n\nIntroduction\nThis is a sufficiently long introduction with detail."
    sections = _sections_from_pages(text)
    assert any("Abstract" in key for key in sections)


def test_extract_tables_from_markdown():
    sample_md = """
Some text before.

Table 1: Benchmark Results
| Architecture | Accuracy | Latency (ms) |
| --- | --- | --- |
| ResNet-50 | 76.1% | 12.4 |
| ViT-B/16 | 79.8% | 18.2 |

Some text after.
"""
    tables = _extract_tables_from_markdown(sample_md, page_num=1)
    assert len(tables) == 1
    t = tables[0]
    assert t["columns"] == ["Architecture", "Accuracy", "Latency (ms)"]
    assert len(t["rows"]) == 2
    assert t["rows"][0] == ["ResNet-50", "76.1%", "12.4"]
    assert "Benchmark Results" in t["caption"]


def test_extract_formulas_from_markdown():
    sample_md = """
Here is an equation:
$$E = mc^2$$

And another equation:
\\[\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}\\]
"""
    formulas = _extract_formulas_from_markdown(sample_md, page_num=2)
    assert len(formulas) == 2
    assert formulas[0]["latex"] == "E = mc^2"
    assert "\\int_{0}^{\\infty}" in formulas[1]["latex"]
    assert formulas[0]["verified"] is True
