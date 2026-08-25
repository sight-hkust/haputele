// Wire-contract types for the FastAPI backend.
//
// Everything here is either:
//   1. an alias onto OpenAPI-generated types (src/types/generated.ts,
//      regenerated via `npm run generate:api`; CI fails when it drifts), or
//   2. a hand-written overlay the spec can't express: several enums are
//      declared as plain `str` on the backend, so the UI unions live here.
//
// Backend class names are the source of truth; the aliases preserve the
// historical frontend names so call sites stay stable. If a backend model
// is renamed, update only the alias below.

import type { components } from "./generated";

type Schemas = components["schemas"];

// ── Overlays: backend declares these as plain `str` ──────────────────
export type Role = "admin" | "doctor" | "healthworker" | "sys-admin";
export type Lang = "en" | "ta" | "si";

// ── Appointment status (the §11 state machine) ───────────────────────
export type AppointmentStatus =
  | "scheduled"
  | "consent_pending"
  | "data_collection"
  | "in_progress"
  | "awaiting_notes"
  | "completed"
  | "cancelled";

export const LIVE_STATES: AppointmentStatus[] = [
  "scheduled",
  "consent_pending",
  "data_collection",
  "in_progress",
  "awaiting_notes",
];

export type CapturePurpose = "appointment_attachment" | "rubber_stamp";
export type OperatingAccountRole = "admin" | "healthworker";
export type AccountRole = "sys-admin" | "admin" | "healthworker" | "doctor";
export type QueueSource = "screening" | "walk_in" | "follow_up";
export type QueueStatus = "pending" | "booked" | "cancelled";
export type QueuePriority = "urgent" | "routine";

// ── Profile / consultation enum overlays ─────────────────────────────
export type DiseaseCode =
  | "diabetes"
  | "hypertension"
  | "ihd"
  | "asthma_copd"
  | "kidney"
  | "thyroid"
  | "cancer"
  | "mental_health"
  | "other";

export type DiagnosisCode =
  | "allergy"
  | "alzheimers"
  | "arthritis"
  | "asthma"
  | "autoimmune"
  | "cancer"
  | "ckd"
  | "chronic_liver"
  | "chronic_pain"
  | "common_cold"
  | "copd"
  | "covid19"
  | "diabetes"
  | "heart_disease"
  | "hiv_aids"
  | "hypertension"
  | "influenza"
  | "mental_health"
  | "obesity"
  | "osteoporosis"
  | "stroke"
  | "thyroid"
  | "others";

// ── Entities ─────────────────────────────────────────────────────────
export type Patient = Schemas["PatientOut"];
export type Doctor = Schemas["DoctorOut"] & { rubberStampImage?: string | null };
export type DoctorSummary = Schemas["DoctorSummaryOut"];
export type DoctorInvite = Schemas["DoctorInviteOut"];
export type Consent = Schemas["ConsentOut"];
export type Appointment = Schemas["AppointmentOut"] & { status: AppointmentStatus };
export type CalendarAppointment = Schemas["CalendarAppointmentOut"] & {
  status: AppointmentStatus;
};
export type Preconsult = Schemas["PreconsultOut"];
export type Profile = Schemas["ProfileOut"] & {
  diseaseHistory: Schemas["DiseaseEntry"][];
  surgicalHistory: Schemas["SurgeryEntry"][];
  allergies: Schemas["AllergyEntry"][];
  medications: Schemas["ExistingMedicationEntry"][];
  lifestyle: Schemas["Lifestyle"];
};
export type Consultation = Schemas["ConsultationOut"] & {
  diagnoses: Schemas["DiagnosisEntry"][];
  medications: Schemas["MedicationEntry"][];
  labs: Schemas["LabEntry"][];
  referrals: Schemas["ReferralEntry"][];
  signedAt: string | null;
};
export type Notes = Schemas["NotesPatch"];
export type AttachmentMeta = Schemas["AttachmentMetaOut"];
export type AppointmentDetail = Omit<
  Schemas["AppointmentDetailOut"],
  "appointment" | "preconsult" | "profile" | "consultation"
> & {
  appointment: Appointment;
  preconsult: Preconsult | null;
  profile: Profile | null;
  consultation: Consultation | null;
};
export type HistoryConsultationItem = Schemas["HistoryConsultationItem"] & {
  diagnoses: Schemas["DiagnosisEntry"][];
  prescription: Schemas["MedicationEntry"][];
};
export type PatientHistory = Omit<Schemas["PatientHistoryOut"], "consultations"> & {
  consultations: HistoryConsultationItem[];
};
export type Availability = Schemas["AvailabilityOut"];
export type QueueEntry = Schemas["QueueEntryOut"] & {
  source: QueueSource;
  status: QueueStatus;
  priority: QueuePriority;
};
export type CaptureSession = Schemas["CaptureSessionOut"];
export type CaptureSessionStatus = Schemas["CaptureSessionStatusOut"];
export type AccountRosterEntry = Schemas["AccountRow"] & {
  role: AccountRole;
  fullName: string | null;
  contact: string | null;
  doctorActive: boolean | null;
  doctorId: number | null;
};
export type SysadminMe = Schemas["SysadminMeOut"] & {
  role: "sys-admin";
  fullName: string | null;
  contact: string | null;
};
export type SystemConfig = Schemas["SystemConfigOut"];
export type SetupStatusResponse = Schemas["SetupStatusOut"];
export type VerifySetupTokenResponse = Schemas["VerifyTokenOut"];
export type InitializeSystemResponse = Schemas["InitializeOut"] & { role: "sys-admin" };

// JSONB entry shapes — backend names match 1:1.
export type DiseaseEntry = Schemas["DiseaseEntry"];
export type SurgeryEntry = Schemas["SurgeryEntry"];
export type AllergyEntry = Schemas["AllergyEntry"];
export type ExistingMedicationEntry = Schemas["ExistingMedicationEntry"];
export type Lifestyle = Schemas["Lifestyle"];
export type DiagnosisEntry = Schemas["DiagnosisEntry"];
export type MedicationEntry = Schemas["MedicationEntry"];
export type LabEntry = Schemas["LabEntry"];
export type ReferralEntry = Schemas["ReferralEntry"];

// ── Requests ─────────────────────────────────────────────────────────
export type PatientCreateRequest = Schemas["PatientCreate"];
export type PatientUpdateRequest = Schemas["PatientUpdate"];
export type ProfileRequest = Schemas["ProfileIn"];
export type PreconsultRequest = Schemas["PreconsultIn"];
export type SessionConsentRequest = Omit<Schemas["SessionConsentIn"], "scope">;
export type ReConsentRequest = Omit<Schemas["ReConsentIn"], "scope">;
export type SubmitConsultationRequest = Schemas["ConsultationSubmitIn"];
export type FollowUpInput = Schemas["FollowUpAppointment"] | Schemas["FollowUpWeeks"];
export type QueueEntryCreateRequest = Schemas["QueueEntryCreate"];
export type QueueEntryUpdateRequest = Schemas["QueueEntryUpdate"];
export type QueueBookRequest = Schemas["QueueBookIn"];
export type QueueCancelRequest = Schemas["QueueCancelIn"];
export type AppointmentCancelRequest = Schemas["AppointmentCancelIn"];
export type RequeueOnCancelInput = Schemas["RequeueOnCancel"];
export type ResetAccountPasswordRequest = Schemas["PasswordResetIn"];
export type CreateOperatingAccountRequest = Schemas["AccountCreateIn"];
export type CreateOperatingAccountResponse = Schemas["AccountOut"];
export type AccountUpdateRequest = Schemas["AccountUpdateIn"];
export type SystemConfigUpdateRequest = Schemas["SystemConfigUpdateIn"];
export type VerifySetupTokenRequest = Schemas["VerifyTokenIn"];
export type InitializeSystemRequest = Schemas["InitializeIn"];
export type AvailabilityCreateRequest = Schemas["AvailabilityCreate"];
export type AvailabilityUpdateRequest = Schemas["AvailabilityUpdate"];
export type AvailabilityBulkCreateRequest = Schemas["AvailabilityBulkCreate"];

// ── Composite responses (backend models from Phase A) ────────────────
export type PatientListResponse = Schemas["PatientListResponse"];
export type PatientCreateResponse = Schemas["PatientCreateResponse"];
export type PatientDetailResponse = Schemas["PatientDetailResponse"];
export type MasterConsentResponse = Schemas["MasterConsentResponse"];
export type SessionConsentResponse = Schemas["SessionConsentResponse"];
export type ReConsentResponse = Schemas["MasterConsentResponse"];
export type MeetingTokenResponse = Schemas["MeetingTokenResponse"];
export type StartMeetingResponse = Schemas["StartMeetingResponse"];
export type QueueBookResponse = Omit<Schemas["QueueBookResponse"], "appointment"> & {
  appointment: Appointment;
};
export type AppointmentCancelResponse = Schemas["AppointmentCancelResponse"];
export type SubmitConsultationResponse = Schemas["SubmitConsultationResponse"];
export type ConsultationDraftResponse = Omit<Schemas["ConsultationDraftResponse"], "draft"> & {
  draft: Consultation;
};
