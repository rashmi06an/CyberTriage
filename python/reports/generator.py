"""PDF and structured report generator."""
import json
import csv
import io
import os
from datetime import datetime
from typing import Dict, List

# reportlab is imported lazily (see _load_reportlab) so importing this module —
# and therefore starting the engine — does not pay the reportlab import cost.
# It is only needed when a PDF report is actually generated.
REPORTLAB_OK = None


def _load_reportlab() -> bool:
    """Import reportlab on first use, binding its symbols as module globals."""
    global REPORTLAB_OK
    global A4, colors, getSampleStyleSheet, ParagraphStyle, cm
    global SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    if REPORTLAB_OK is not None:
        return REPORTLAB_OK
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        )
        REPORTLAB_OK = True
    except ImportError:
        REPORTLAB_OK = False
    return REPORTLAB_OK


def generate_pdf(case: Dict, evidence: List, artifacts: List, iocs: List,
                 risk: Dict, recommendations: List, timeline: List,
                 output_path: str) -> str:
    """Generate a PDF investigation report."""
    if not _load_reportlab():
        return generate_text_report(case, evidence, artifacts, iocs, risk, recommendations, output_path.replace('.pdf', '.txt'))

    doc = SimpleDocTemplate(output_path, pagesize=A4, topMargin=2*cm, bottomMargin=2*cm)
    styles = getSampleStyleSheet()
    story = []

    # Title
    title_style = ParagraphStyle('Title', parent=styles['Title'], fontSize=20, textColor=colors.HexColor('#1a2744'))
    story.append(Paragraph('🔍 CyberTriage Investigation Report', title_style))
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph('<i>Digital Forensics & Incident Response — Student Prototype</i>', styles['Normal']))
    story.append(HRFlowable(width='100%', thickness=2, color=colors.HexColor('#1a2744')))
    story.append(Spacer(1, 0.5*cm))

    # Case info
    story.append(Paragraph('Case Information', styles['Heading2']))
    case_data = [
        ['Case ID', case.get('id', 'N/A')],
        ['Case Name', case.get('name', 'N/A')],
        ['Investigator', case.get('investigator', 'N/A')],
        ['Status', case.get('status', 'N/A')],
        ['Created', case.get('created_at', 'N/A')],
        ['Report Generated', datetime.now().strftime('%Y-%m-%d %H:%M:%S')],
    ]
    t = Table(case_data, colWidths=[5*cm, 12*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e8ecf8')),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.white, colors.HexColor('#f5f7ff')]),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.5*cm))

    # Risk summary
    story.append(Paragraph('Risk Assessment', styles['Heading2']))
    risk_score = risk.get('risk_score', 0)
    sev = risk.get('severity', 'LOW')
    sev_colors = {'CRITICAL': '#dc2626', 'HIGH': '#ea580c', 'MEDIUM': '#d97706', 'LOW': '#16a34a'}
    sev_color = sev_colors.get(sev, '#6b7280')
    story.append(Paragraph(
        f'<font color="{sev_color}"><b>Risk Score: {risk_score}/100 — {sev}</b></font>',
        styles['Normal']
    ))
    if risk.get('reasons'):
        story.append(Spacer(1, 0.2*cm))
        story.append(Paragraph('Contributing factors:', styles['Normal']))
        for r in risk.get('reasons', []):
            story.append(Paragraph(f'• {r}', styles['Normal']))
    story.append(Spacer(1, 0.5*cm))

    # Evidence summary
    story.append(Paragraph(f'Evidence Summary ({len(evidence)} items)', styles['Heading2']))
    if evidence:
        ev_data = [['Filename', 'Type', 'Size', 'SHA-256', 'Status']]
        for e in evidence[:20]:
            sha = str(e.get('sha256', 'N/A'))
            ev_data.append([
                str(e.get('filename', ''))[:30],
                str(e.get('type', ''))[:15],
                f"{(e.get('size', 0) or 0) // 1024} KB",
                sha[:16] + '...' if len(sha) > 16 else sha,
                str(e.get('analysis_status', '')),
            ])
        t2 = Table(ev_data, colWidths=[5*cm, 3*cm, 2.5*cm, 4.5*cm, 3*cm])
        t2.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a2744')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (1, 0), (-1, -1), [colors.white, colors.HexColor('#f5f7ff')]),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
        ]))
        story.append(t2)
    story.append(Spacer(1, 0.5*cm))

    # IOC Findings
    story.append(Paragraph(f'IOC Findings ({len(iocs)} detected)', styles['Heading2']))
    if iocs:
        ioc_data = [['Type', 'Value', 'Risk', 'Status']]
        for ioc in iocs[:30]:
            ioc_data.append([
                str(ioc.get('ioc_type', ''))[:15],
                str(ioc.get('value', ''))[:40],
                str(ioc.get('risk', '')),
                str(ioc.get('status', '')),
            ])
        t3 = Table(ioc_data, colWidths=[4*cm, 8*cm, 3*cm, 3*cm])
        t3.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a2744')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (1, 0), (-1, -1), [colors.white, colors.HexColor('#f5f7ff')]),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
        ]))
        story.append(t3)
    story.append(Spacer(1, 0.5*cm))

    # Recommendations
    story.append(Paragraph('Recommendations', styles['Heading2']))
    for i, rec in enumerate(recommendations[:10], 1):
        story.append(Paragraph(f'<b>{i}. [{rec.get("priority", "")}] {rec.get("trigger", "Finding")}</b>', styles['Normal']))
        story.append(Paragraph(rec.get('recommendation', ''), styles['Normal']))
        story.append(Spacer(1, 0.2*cm))

    # Timeline (first 20 events)
    story.append(Paragraph(f'Timeline (showing first 20 of {len(timeline)} events)', styles['Heading2']))
    if timeline:
        tl_data = [['Timestamp', 'Event Type', 'Severity', 'Description']]
        for evt in timeline[:20]:
            tl_data.append([
                str(evt.get('timestamp', ''))[:19],
                str(evt.get('event_type', ''))[:25],
                str(evt.get('severity', '')),
                str(evt.get('description', ''))[:50],
            ])
        t4 = Table(tl_data, colWidths=[4.5*cm, 4.5*cm, 2.5*cm, 6.5*cm])
        t4.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a2744')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (1, 0), (-1, -1), [colors.white, colors.HexColor('#f5f7ff')]),
            ('FONTSIZE', (0, 0), (-1, -1), 7),
        ]))
        story.append(t4)
    story.append(Spacer(1, 0.5*cm))

    # Limitations
    story.append(HRFlowable(width='100%', thickness=1, color=colors.grey))
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph('Limitations & Disclaimer', styles['Heading3']))
    story.append(Paragraph(
        'This report was generated by CyberTriage, a student prototype. '
        'It is not suitable for court-admissible evidence handling. '
        'ML-assisted findings indicate statistical unusualness, not confirmed malicious activity. '
        'CyberTriage is not an official NIA product.',
        styles['Normal']
    ))

    doc.build(story)
    return output_path


def generate_json_export(case: Dict, evidence: List, artifacts: List,
                         iocs: List, risk: Dict, recommendations: List,
                         timeline: List, output_path: str) -> str:
    data = {
        'generated_at': datetime.now().isoformat(),
        'tool': 'CyberTriage v1.0 (Student Prototype)',
        'case': case,
        'evidence_summary': evidence,
        'artifacts': artifacts[:200],
        'ioc_findings': iocs,
        'risk_assessment': risk,
        'recommendations': recommendations,
        'timeline': timeline[:500],
    }
    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2, default=str)
    return output_path


def generate_csv_exports(artifacts: List, iocs: List, timeline: List,
                         output_dir: str) -> List[str]:
    """Generate multiple CSV exports."""
    os.makedirs(output_dir, exist_ok=True)
    files = []

    # Artifacts CSV
    if artifacts:
        path = os.path.join(output_dir, 'artifacts.csv')
        with open(path, 'w', newline='') as f:
            keys = ['name', 'path', 'extension', 'size', 'severity', 'mime_type', 'modified', 'sha256', 'md5']
            writer = csv.DictWriter(f, fieldnames=keys, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(artifacts[:500])
        files.append(path)

    # IOCs CSV
    if iocs:
        path = os.path.join(output_dir, 'iocs.csv')
        with open(path, 'w', newline='') as f:
            keys = ['ioc_type', 'value', 'source', 'risk', 'status', 'explanation']
            writer = csv.DictWriter(f, fieldnames=keys, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(iocs[:500])
        files.append(path)

    # Timeline CSV
    if timeline:
        path = os.path.join(output_dir, 'timeline.csv')
        with open(path, 'w', newline='') as f:
            keys = ['timestamp', 'event_type', 'source', 'severity', 'description', 'ioc_related']
            writer = csv.DictWriter(f, fieldnames=keys, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(timeline[:1000])
        files.append(path)

    return files


def generate_text_report(case: Dict, evidence: List, artifacts: List,
                          iocs: List, risk: Dict, recommendations: List,
                          output_path: str) -> str:
    """Fallback plain-text report."""
    lines = [
        'CyberTriage Investigation Report',
        '=' * 50,
        f"Case: {case.get('name')} ({case.get('id')})",
        f"Investigator: {case.get('investigator')}",
        f"Generated: {datetime.now().isoformat()}",
        '',
        f"Risk Score: {risk.get('risk_score')}/100 — {risk.get('severity')}",
        '',
        'Recommendations:',
    ]
    for rec in recommendations:
        lines.append(f"  [{rec.get('priority')}] {rec.get('trigger')}: {rec.get('recommendation')[:100]}")
    with open(output_path, 'w') as f:
        f.write('\n'.join(lines))
    return output_path
