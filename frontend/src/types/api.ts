// Stable application-facing names over the Kubb-generated OpenAPI contract.
//
// Kubb owns request/response models, operation clients, and TanStack Query
// factories under src/gen. This module keeps historical names and only
// strengthens response fields that are always present on the wire.

import type * as Generated from "@/gen/types";

// ── Generated domain unions ──────────────────────────────────────────
export type Role = Generated.MeOut["role"];
export type Lang = NonNullable<Generated.PatientCreate["language"]>;

// ── Appointment status (the §11 state machine) ───────────────────────
export type AppointmentStatus = Generated.AppointmentOut["status"];

export const LIVE_STATES: AppointmentStatus[] = [
  "scheduled",
  "consent_pending",
  "data_collection",
  "in_progress",
  "awaiting_notes",
];

export type CapturePurpose = Generated.CaptureSessionCreateIn["purpose"];
export type OperatingAccountRole = Generated.AccountCreateIn["role"];
export type AccountRole = Generated.AccountRow["role"];
export type QueueSource = Generated.QueueEntryOut["source"];
export type QueueStatus = Generated.QueueEntryOut["status"];
export type QueuePriority = Generated.QueueEntryOut["priority"];

// ── Profile / consultation enums ─────────────────────────────────────
export type DiseaseCode = Generated.DiseaseEntry["code"];

export type DiagnosisCode = Generated.DiagnosisEntry["code"];

// ── Entities ─────────────────────────────────────────────────────────
export type Patient = Omit<Generated.PatientOut, "language"> & {
  language: Lang | null;
};
export type Doctor = Generated.DoctorOut & { rubberStampImage?: string | null };
export type DoctorSummary = Generated.DoctorSummaryOut & {
  awaitingApproval: number;
  awaitingSetup: number;
  invited: number;
  active: number;
  rejected: number;
  total: number;
};
export type DoctorInvite = Generated.DoctorInviteOut;
export type Consent = Generated.ConsentOut;
export type Appointment = Generated.AppointmentOut;
export type CalendarAppointment = Generated.CalendarAppointmentOut;
export type Preconsult = Generated.PreconsultOut;
export type Profile = Generated.ProfileOut & {
  diseaseHistory: Generated.DiseaseEntry[];
  surgicalHistory: Generated.SurgeryEntry[];
  allergies: Generated.AllergyEntry[];
  medications: Generated.ExistingMedicationEntry[];
  lifestyle: Generated.Lifestyle;
};
export type Consultation = Generated.ConsultationOut & {
  diagnoses: Generated.DiagnosisEntry[];
  medications: Generated.MedicationEntry[];
  labs: Generated.LabEntry[];
  referrals: Generated.ReferralEntry[];
  signedAt: string | null;
};
export type Notes = Generated.NotesPatch;
export type AttachmentMeta = Generated.AttachmentMetaOut;
export type AppointmentDetail = Omit<
  Generated.AppointmentDetailOut,
  "appointment" | "patient" | "preconsult" | "profile" | "consultation"
> & {
  appointment: Appointment;
  patient: Patient | null;
  preconsult: Preconsult | null;
  profile: Profile | null;
  consultation: Consultation | null;
};
export type HistoryConsultationItem = Generated.HistoryConsultationItem & {
  diagnoses: Generated.DiagnosisEntry[];
  prescription: Generated.MedicationEntry[];
};
export type PatientHistory = Omit<Generated.PatientHistoryOut, "consultations"> & {
  consultations: HistoryConsultationItem[];
};
export type Availability = Generated.AvailabilityOut;
export type QueueEntry = Generated.QueueEntryOut;
export type CaptureSession = Generated.CaptureSessionOut;
export type CaptureSessionStatus = Generated.CaptureSessionStatusOut;
export type AccountRosterEntry = Generated.AccountRow & {
  role: AccountRole;
  fullName: string | null;
  contact: string | null;
  doctorActive: boolean | null;
  doctorId: number | null;
};
export type SysadminMe = Generated.SysadminMeOut & {
  fullName: string | null;
  contact: string | null;
};
export type SystemConfig = Generated.SystemConfigOut;
export type SetupStatusResponse = Generated.SetupStatusOut;
export type VerifySetupTokenResponse = Generated.VerifyTokenOut;
export type InitializeSystemResponse = Generated.InitializeOut;

// JSONB entry shapes — backend names match 1:1.
export type DiseaseEntry = Generated.DiseaseEntry;
export type SurgeryEntry = Generated.SurgeryEntry;
export type AllergyEntry = Generated.AllergyEntry;
export type ExistingMedicationEntry = Generated.ExistingMedicationEntry;
export type Lifestyle = Generated.Lifestyle;
export type DiagnosisEntry = Generated.DiagnosisEntry;
export type MedicationEntry = Generated.MedicationEntry;
export type LabEntry = Generated.LabEntry;
export type ReferralEntry = Generated.ReferralEntry;

// ── Requests ─────────────────────────────────────────────────────────
export type PatientCreateRequest = Omit<Generated.PatientCreate, "language"> & {
  language?: Lang | null;
};
export type PatientUpdateRequest = Omit<Generated.PatientUpdate, "language"> & {
  language?: Lang | null;
};
export type ProfileRequest = Generated.ProfileIn;
export type PreconsultRequest = Generated.PreconsultIn;
export type SessionConsentRequest = Omit<Generated.SessionConsentIn, "scope">;
export type ReConsentRequest = Omit<Generated.ReConsentIn, "scope">;
export type SubmitConsultationRequest = Generated.ConsultationSubmitIn;
export type FollowUpInput = Generated.FollowUpAppointment | Generated.FollowUpWeeks;
export type QueueEntryCreateRequest = Generated.QueueEntryCreate;
export type QueueEntryUpdateRequest = Generated.QueueEntryUpdate;
export type QueueBookRequest = Generated.QueueBookIn;
export type QueueCancelRequest = Generated.QueueCancelIn;
export type AppointmentCancelRequest = Generated.AppointmentCancelIn;
export type RequeueOnCancelInput = Generated.RequeueOnCancel;
export type ResetAccountPasswordRequest = Generated.PasswordResetIn;
export type CreateOperatingAccountRequest = Generated.AccountCreateIn;
export type CreateOperatingAccountResponse = Generated.AccountOut;
export type AccountUpdateRequest = Generated.AccountUpdateIn;
export type SystemConfigUpdateRequest = Generated.SystemConfigUpdateIn;
export type VerifySetupTokenRequest = Generated.VerifyTokenIn;
export type InitializeSystemRequest = Generated.InitializeIn;
export type AvailabilityCreateRequest = Generated.AvailabilityCreate;
export type AvailabilityUpdateRequest = Generated.AvailabilityUpdate;
export type AvailabilityBulkCreateRequest = Generated.AvailabilityBulkCreate;

// ── Composite responses ──────────────────────────────────────────────
export type PatientListResponse = Omit<Generated.PatientListResponse, "patients"> & {
  patients: Patient[];
};
export type PatientCreateResponse = Omit<Generated.PatientCreateResponse, "patient"> & {
  patient: Patient;
};
export type PatientDetailResponse = Omit<Generated.PatientDetailResponse, "patient" | "profile"> & {
  patient: Patient;
  profile: Profile | null;
};
export type MasterConsentResponse = Generated.MasterConsentResponse;
export type SessionConsentResponse = Generated.SessionConsentResponse;
export type ReConsentResponse = Generated.MasterConsentResponse;
export type MeetingTokenResponse = Generated.MeetingTokenResponse;
export type StartMeetingResponse = Generated.StartMeetingResponse;
export type QueueBookResponse = Generated.QueueBookResponse;
export type AppointmentCancelResponse =
  | (Omit<Generated.AppointmentCancelResponse, "appointment"> & {
      appointment: Appointment;
      queueEntry?: never;
    })
  | (Omit<Generated.AppointmentCancelRequeueResponse, "appointment" | "queueEntry"> & {
      appointment: Appointment;
      queueEntry: QueueEntry;
    });
export type SubmitConsultationResponse =
  | (Omit<Generated.SubmitConsultationResponse, "consultation" | "appointment"> & {
      consultation: Consultation;
      appointment: Appointment;
      followUpAppointment?: never;
      followUpQueueEntry?: never;
    })
  | (Omit<
      Generated.SubmitConsultationWithAppointmentResponse,
      "consultation" | "appointment" | "followUpAppointment"
    > & {
      consultation: Consultation;
      appointment: Appointment;
      followUpAppointment: Appointment;
      followUpQueueEntry?: never;
    })
  | (Omit<
      Generated.SubmitConsultationWithQueueResponse,
      "consultation" | "appointment" | "followUpQueueEntry"
    > & {
      consultation: Consultation;
      appointment: Appointment;
      followUpAppointment?: never;
      followUpQueueEntry: QueueEntry;
    });
export type ConsultationDraftResponse = Omit<Generated.ConsultationDraftResponse, "draft"> & {
  draft: Consultation;
};
