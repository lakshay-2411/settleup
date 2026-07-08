"""
Import report — the deliverable the app produces when it ingests the CSV:
every anomaly detected, the policy applied, the user's decision, and what
happened to every row. Rendered as JSON (API/UI) and Markdown (download).
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
