from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import db_dep, require_role
from ..errors import conflict, not_found
from ..models import Appointment, Consultation, Doctor, Patient
from ..pdf import render_prescription_pdf


router = APIRouter(prefix="/appointments", tags=["summary"])


@router.get("/{appt_id}/summary.pdf",
            dependencies=[Depends(require_role("healthworker", "doctor"))])
def get_summary_pdf(appt_id: int, db: Session = Depends(db_dep)) -> Response:
    appt = db.get(Appointment, appt_id)
    if not appt:
        raise not_found("appointment_not_found")
    if appt.status != "completed":
        raise conflict("consultation_not_ready")

    patient = db.get(Patient, appt.patient_id)
    doctor = db.get(Doctor, appt.doctor_id)
    consultation = db.scalar(
        select(Consultation).where(Consultation.appointment_id == appt_id)
    )
    if not patient or not doctor or not consultation:
        raise not_found("appointment_not_found")

    pdf_bytes = render_prescription_pdf(
        patient=patient, doctor=doctor, appointment=appt, consultation=consultation,
    )
    headers = {
        "Content-Disposition": f'inline; filename="prescription-{appt_id}.pdf"',
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)
