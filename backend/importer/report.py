"""
Import report — the deliverable the app produces when it ingests the CSV:
every anomaly detected, the policy applied, the user's decision, and what
happened to every row. Rendered as JSON (API/UI), Markdown (repo deliverable)
and PDF (the human-facing download).
"""

from collections import Counter

from django.utils import timezone


def build_report(batch, outcomes: dict) -> dict:
    anomalies = [
        {
            "id": a.id,
            "type": a.anomaly_type,
            "severity": a.severity,
            "rows": a.source_row_numbers,
            "description": a.description,
            "policy": a.policy,
            "decision": a.status,
            "resolution": a.resolution_json,
        }
        for a in batch.anomalies.all()
    ]
    outcome_counts = Counter(o["outcome"] for o in outcomes.values())
    return {
        "generated_at": timezone.now().isoformat(),
        "group": batch.group.name,
        "filename": batch.filename,
        "total_rows": batch.total_rows,
        "summary": {
            "anomalies_detected": len(anomalies),
            "anomaly_types": len({a["type"] for a in anomalies}),
            "auto_applied": sum(1 for a in anomalies if a["decision"] == "auto_applied"),
            "approved": sum(1 for a in anomalies if a["decision"] == "approved"),
            "rejected": sum(1 for a in anomalies if a["decision"] == "rejected"),
            "row_outcomes": dict(outcome_counts),
        },
        "anomalies": anomalies,
        "row_outcomes": {str(k): v for k, v in sorted(outcomes.items())},
    }


def render_markdown(report: dict) -> str:
    lines = [
        f"# Import Report — {report['filename']}",
        "",
        f"- **Group:** {report['group']}",
        f"- **Generated:** {report['generated_at']}",
        f"- **Rows processed:** {report['total_rows']}",
        "",
        "## Summary",
        "",
        f"- Anomalies detected: **{report['summary']['anomalies_detected']}** "
        f"({report['summary']['anomaly_types']} distinct types)",
        f"- Auto-applied (non-destructive): {report['summary']['auto_applied']}",
        f"- Approved by user: {report['summary']['approved']}",
        f"- Rejected by user: {report['summary']['rejected']}",
        "",
        "| Row outcome | Count |",
        "|---|---|",
    ]
    for outcome, count in sorted(report["summary"]["row_outcomes"].items()):
        lines.append(f"| {outcome} | {count} |")

    lines += ["", "## Anomalies — detected, surfaced, handled", ""]
    for a in report["anomalies"]:
        rows = ", ".join(map(str, a["rows"]))
        lines += [
            f"### {a['type']} (rows {rows}) — {a['severity']}, {a['decision']}",
            "",
            a["description"],
            "",
            f"**Policy:** {a['policy']}",
        ]
        if a["resolution"]:
            lines.append(f"**User resolution:** `{a['resolution']}`")
        lines.append("")

    lines += ["## Per-row outcomes", "", "| Row | Outcome | Detail |", "|---|---|---|"]
    for row, o in report["row_outcomes"].items():
        detail = o.get("reason") or (f"record #{o['id']}" if "id" in o else "")
        lines.append(f"| {row} | {o['outcome']} | {detail} |")

    return "\n".join(lines) + "\n"


# --- PDF ---------------------------------------------------------------------

# Human titles for the PDF (mirrors the frontend's presentation layer).
TYPE_TITLES = {
    "EXACT_DUPLICATE": "Same expense logged twice",
    "CONFLICTING_DUPLICATE": "Two versions of one expense",
    "THOUSANDS_SEPARATOR": "Amount formatting",
    "SUB_UNIT_PRECISION": "Sub-paisa precision",
    "NAME_NORMALIZATION": "Name cleanup",
    "NAME_ALIAS_AMBIGUOUS": "Possible name alias",
    "MISSING_PAYER": "Nobody knows who paid",
    "SETTLEMENT_AS_EXPENSE": "Payment logged as an expense",
    "PERCENTAGE_SUM_INVALID": "Percentages don't add up to 100",
    "FOREIGN_CURRENCY": "Foreign-currency amounts",
    "NEGATIVE_AMOUNT_REFUND": "Refund (negative amount)",
    "NON_MEMBER_PARTICIPANT": "Person not in the group",
    "MISSING_CURRENCY": "Currency missing",
    "AMBIGUOUS_DATE": "Ambiguous date",
    "ZERO_AMOUNT": "Zero-amount row",
    "DEPARTED_MEMBER_IN_SPLIT": "Includes someone who had left",
    "SPLITTYPE_DETAIL_MISMATCH": "Split type contradicts details",
    "OUT_OF_ORDER_ROW": "Rows out of date order",
}

# The PDF uses core (latin-1) fonts, so unicode from descriptions/policies is
# mapped to plain equivalents instead of shipping a font file.
_LATIN_FALLBACKS = str.maketrans({
    "→": "->", "—": "-", "–": "-", "…": "...", "·": "-",
    "‘": "'", "’": "'", "“": '"', "”": '"', "₹": "Rs ", "≠": "!=",
    "✓": "[ok]", "✗": "[x]", "×": "x",
})


def _latin(text: str) -> str:
    return str(text).translate(_LATIN_FALLBACKS).encode("latin-1", "replace").decode("latin-1")


INK = (35, 33, 43)
MUTED = (124, 121, 135)
TEAL = (15, 118, 110)
ZEBRA = (247, 247, 244)
GREEN = (5, 150, 105)
RED = (190, 18, 60)


def render_pdf(report: dict) -> bytes:
    from fpdf import FPDF  # imported lazily: only the download path needs it

    class ReportPDF(FPDF):
        def footer(self):
            self.set_y(-14)
            self.set_font("helvetica", "", 8)
            self.set_text_color(*MUTED)
            self.cell(0, 6, f"SettleUp import report  -  page {self.page_no()}/{{nb}}", align="C")

    pdf = ReportPDF(format="A4")
    pdf.set_margins(18, 16, 18)
    pdf.set_auto_page_break(True, margin=18)
    pdf.add_page()
    width = pdf.w - 36  # printable width

    # --- header ---
    pdf.set_font("helvetica", "B", 20)
    pdf.set_text_color(*INK)
    pdf.cell(0, 9, "Import Report", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 10)
    pdf.set_text_color(*MUTED)
    generated = report["generated_at"][:16].replace("T", " ")
    pdf.cell(
        0, 6,
        _latin(f"{report['filename']}  -  group {report['group']}  -  generated {generated}"),
        new_x="LMARGIN", new_y="NEXT",
    )
    pdf.ln(3)

    # --- summary strip ---
    s = report["summary"]
    pdf.set_fill_color(*ZEBRA)
    pdf.set_text_color(*INK)
    pdf.set_font("helvetica", "B", 10)
    pdf.cell(0, 8, "Summary", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 9.5)
    summary_lines = [
        f"{report['total_rows']} rows processed",
        f"{s['anomalies_detected']} anomalies detected across {s['anomaly_types']} types",
        f"{s['auto_applied']} auto-applied (non-destructive)  -  "
        f"{s['approved']} approved  -  {s['rejected']} rejected by the user",
        "Row outcomes: "
        + ",  ".join(f"{k.replace('_', ' ')}: {v}" for k, v in sorted(s["row_outcomes"].items())),
    ]
    for line in summary_lines:
        pdf.cell(0, 5.5, _latin(line), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # --- anomalies ---
    pdf.set_font("helvetica", "B", 12)
    pdf.cell(0, 8, "Anomalies - detected, surfaced, handled", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    for a in report["anomalies"]:
        # Long row lists (a person on 40 rows) would overflow the meta line.
        if len(a["rows"]) > 8:
            rows = f"{len(a['rows'])} rows ({a['rows'][0]}–{a['rows'][-1]})"
        else:
            rows = "rows " + ", ".join(map(str, a["rows"]))
        decision = a["decision"].replace("_", " ")
        color = GREEN if a["decision"] in ("approved", "auto_applied") else RED

        pdf.set_font("helvetica", "B", 10)
        pdf.set_text_color(*INK)
        title = TYPE_TITLES.get(a["type"], a["type"])
        pdf.multi_cell(width, 5.5, _latin(title), new_x="LMARGIN", new_y="NEXT")

        pdf.set_font("helvetica", "", 8)
        pdf.set_text_color(*color)
        pdf.cell(pdf.get_string_width(decision) + 2, 4.5, decision)
        pdf.set_text_color(*MUTED)
        pdf.cell(0, 4.5, _latin(f"-  {a['type']}  -  {rows}"), new_x="LMARGIN", new_y="NEXT")

        pdf.set_font("helvetica", "", 9)
        pdf.set_text_color(*INK)
        pdf.multi_cell(width, 4.6, _latin(a["description"]), new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*MUTED)
        pdf.multi_cell(width, 4.4, _latin(f"Action: {a['policy']}"), new_x="LMARGIN", new_y="NEXT")
        if a["resolution"]:
            pdf.multi_cell(
                width, 4.4, _latin(f"User input: {a['resolution']}"),
                new_x="LMARGIN", new_y="NEXT",
            )
        pdf.ln(2.5)

    # --- per-row outcomes table ---
    pdf.add_page()
    pdf.set_font("helvetica", "B", 12)
    pdf.set_text_color(*INK)
    pdf.cell(0, 8, "Per-row outcomes", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    col_row, col_outcome = 16, 46
    pdf.set_font("helvetica", "B", 8.5)
    pdf.set_text_color(*MUTED)
    pdf.cell(col_row, 6, "Row")
    pdf.cell(col_outcome, 6, "Outcome")
    pdf.cell(0, 6, "Detail", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("helvetica", "", 8.5)
    for i, (row, o) in enumerate(report["row_outcomes"].items()):
        detail = o.get("reason") or (f"record #{o['id']}" if "id" in o else "")
        if i % 2 == 0:
            pdf.set_fill_color(*ZEBRA)
            pdf.cell(width, 5.4, "", fill=True, new_x="LMARGIN")
        pdf.set_text_color(*INK)
        pdf.cell(col_row, 5.4, str(row))
        pdf.set_text_color(*(GREEN if o["outcome"] in ("expense_active", "settlement") else MUTED))
        pdf.cell(col_outcome, 5.4, _latin(o["outcome"].replace("_", " ")))
        pdf.set_text_color(*MUTED)
        pdf.cell(0, 5.4, _latin(detail), new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())
