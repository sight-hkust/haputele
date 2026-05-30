import io

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .tz import app_tz
from .services.storage import get_bytes
from .services.system_config import get_system_config


def _img_or_blank(data: bytes | None, width: float, height: float):
    """Return a reportlab Image fitted into a `width × height` bounding box
    while preserving the source aspect ratio (contain, not stretch). Pillow
    re-encodes to PNG so reportlab gets a fully-decoded buffer instead of a
    lazy stream reference.
    """
    if not data:
        return Spacer(1, height)
    try:
        pil = PILImage.open(io.BytesIO(data))
        pil.load()
        if pil.mode not in ("RGB", "RGBA"):
            pil = pil.convert("RGBA")
        nat_w, nat_h = pil.size
        if nat_w <= 0 or nat_h <= 0:
            return Spacer(1, height)
        buf = io.BytesIO()
        pil.save(buf, format="PNG")
        buf.seek(0)
        scale = min(width / nat_w, height / nat_h)
        return Image(buf, width=nat_w * scale, height=nat_h * scale)
    except Exception:
        return Spacer(1, height)


def render_prescription_pdf(*, patient, doctor, appointment, consultation) -> bytes:
    """Render a prescription summary per Sri Lanka §1.7.

    Mandatory items: patient name, age, date, generic names, doctor name, SLMC reg,
    qualifications, signature, rubber stamp, practitioner address, institute contact.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=1.5 * cm, bottomMargin=1.5 * cm,
        title="Prescription",
    )
    styles = getSampleStyleSheet()
    h = ParagraphStyle("h", parent=styles["Heading2"], spaceAfter=6)
    body = ParagraphStyle("body", parent=styles["BodyText"], spaceAfter=2)
    small = ParagraphStyle("small", parent=styles["BodyText"], fontSize=8, textColor=colors.grey)

    story = []

    # ── Patient block ──
    # (Provider details moved to the signature row at the bottom — keeps the
    # §1.7 prescriber attribution adjacent to the signature/stamp where a
    # reader expects to verify the prescription.)
    # Appointment date is the SL-day, not the UTC-day — appointments scheduled
    # late evening SL time (early morning UTC the next day) would otherwise
    # show the wrong date on the prescription.
    appt_date = appointment.scheduled_at.astimezone(app_tz()).date().isoformat()
    dob = patient.dob.isoformat() if patient.dob else "—"
    patient_block = [
        ["Patient", f"{patient.given_name} {patient.family_name}", "Date", appt_date],
        ["Date of birth", dob, "National ID", patient.n_id or "—"],
    ]
    t = Table(patient_block, colWidths=[3 * cm, 6 * cm, 3 * cm, 5 * cm])
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 10),
        ("BACKGROUND", (0, 0), (0, -1), colors.lightgrey),
        ("BACKGROUND", (2, 0), (2, -1), colors.lightgrey),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.4 * cm))

    # ── Diagnoses ──
    story.append(Paragraph("Diagnosis", h))
    dx = consultation.diagnoses or []
    if dx:
        items = []
        for d in dx:
            label = d.get("text") or d.get("code") or ""
            items.append(f"• {label}")
        story.append(Paragraph("<br/>".join(items), body))
    else:
        story.append(Paragraph("—", body))
    story.append(Spacer(1, 0.3 * cm))

    # ── Prescription ──
    story.append(Paragraph("Prescription (medications)", h))
    meds = consultation.medications or []
    if meds:
        rows = [["Generic name (Trade)", "Dose", "Frequency", "Duration", "Instructions"]]
        for m in meds:
            gn = m.get("genericName") or ""
            tn = m.get("tradeName")
            name = f"{gn} ({tn})" if tn else gn
            rows.append([
                name,
                m.get("dose") or "",
                m.get("frequency") or "",
                m.get("duration") or "",
                m.get("instructions") or "",
            ])
        med_table = Table(rows, colWidths=[5 * cm, 2.2 * cm, 2.6 * cm, 2.4 * cm, 4.8 * cm])
        med_table.setStyle(TableStyle([
            ("FONT", (0, 0), (-1, -1), "Helvetica", 9),
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(med_table)
    else:
        story.append(Paragraph("—", body))
    story.append(Spacer(1, 0.3 * cm))

    # ── Labs ──
    story.append(Paragraph("Laboratory tests", h))
    labs = consultation.labs or []
    if labs:
        rows = [["Test", "Instructions"]]
        for l in labs:
            rows.append([l.get("testName") or "", l.get("instructions") or ""])
        lt = Table(rows, colWidths=[6 * cm, 11 * cm])
        lt.setStyle(TableStyle([
            ("FONT", (0, 0), (-1, -1), "Helvetica", 9),
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ]))
        story.append(lt)
    else:
        story.append(Paragraph("—", body))
    story.append(Spacer(1, 0.3 * cm))

    # ── Referrals ──
    story.append(Paragraph("Referrals", h))
    refs = consultation.referrals or []
    if refs:
        rows = [["Specialist / Department", "Instructions"]]
        for r in refs:
            rows.append([
                r.get("specialistOrDepartment") or "",
                r.get("instructions") or "",
            ])
        rt = Table(rows, colWidths=[6 * cm, 11 * cm])
        rt.setStyle(TableStyle([
            ("FONT", (0, 0), (-1, -1), "Helvetica", 9),
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ]))
        story.append(rt)
    else:
        story.append(Paragraph("—", body))
    story.append(Spacer(1, 0.3 * cm))

    # ── Notes ──
    story.append(Paragraph("Consultation notes", h))
    note_lines = []
    for label, val in (
        ("Primary complaint", consultation.notes_complaint),
        ("Onset & duration", consultation.notes_onset),
        ("Associated symptoms", consultation.notes_symptoms),
        ("Observations", consultation.notes_observations),
    ):
        if val:
            note_lines.append(f"<b>{label}:</b> {val}")
    story.append(Paragraph("<br/>".join(note_lines) if note_lines else "—", body))
    story.append(Spacer(1, 0.3 * cm))

    # ── Follow-up ──
    if consultation.follow_up_date:
        story.append(Paragraph(f"<b>Follow-up:</b> {consultation.follow_up_date.isoformat()}", body))
        story.append(Spacer(1, 0.3 * cm))

    # ── Provider + signature + stamp row (bottom) ──
    # Three columns in one row: prescriber details on the left, signature in
    # the middle, rubber stamp on the right. Captions on the second row only
    # under signature/stamp; provider cell spans both rows.
    story.append(Spacer(1, 0.5 * cm))
    # Pull the signature/stamp bytes back from S3. The signature key may be
    # absent on a not-yet-signed consultation; the stamp is always present.
    sig_bytes = get_bytes(consultation.signature_key) if consultation.signature_key else None
    stamp_bytes = get_bytes(doctor.rubber_stamp_key) if doctor.rubber_stamp_key else None
    sig_img = _img_or_blank(sig_bytes, width=5 * cm, height=2 * cm)
    stamp_img = _img_or_blank(stamp_bytes, width=3.5 * cm, height=3.5 * cm)
    provider_lines = [
        f"<b>Dr. {doctor.given_name} {doctor.family_name}</b>",
        f"SLMC Reg. No.: <b>{doctor.slmc_registration_number}</b>",
        f"Qualifications: {doctor.qualifications}",
        f"{doctor.institute_name}",
        f"{doctor.practitioner_address}",
        f"Contact: {doctor.institute_contact}",
    ]
    provider_para = Paragraph("<br/>".join(provider_lines), body)
    sig_row = Table(
        [
            [provider_para, sig_img, stamp_img],
            ["", "Doctor's signature", "Rubber stamp"],
        ],
        colWidths=[8 * cm, 5 * cm, 4 * cm],
    )
    sig_row.setStyle(TableStyle([
        ("SPAN", (0, 0), (0, 1)),
        ("FONT", (1, 1), (-1, 1), "Helvetica", 8),
        ("VALIGN", (0, 0), (0, -1), "TOP"),
        ("VALIGN", (1, 0), (-1, 0), "BOTTOM"),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("LINEABOVE", (1, 1), (1, 1), 0.25, colors.grey),
        ("LINEABOVE", (2, 1), (2, 1), 0.25, colors.grey),
    ]))
    story.append(sig_row)
    if consultation.signed_at:
        cfg = get_system_config()
        signed_local = consultation.signed_at.astimezone(cfg.app_tz)
        story.append(Paragraph(
            # e.g. "Signed at: 2026-04-29 15:22:20 (Asia/Colombo)"
            f"Signed at: {signed_local.strftime('%Y-%m-%d %H:%M:%S')} ({cfg.app_timezone})",
            small,
        ))

    doc.build(story)
    return buf.getvalue()
