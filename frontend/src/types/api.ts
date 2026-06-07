// Mirror of backend/app/schemas.py output shapes. Critical detail: PatientOut,
// DoctorOut, and AppointmentOut all expose `id` (mapped from patient_id /
// doctor_id / appointment_id server-side). Don't reference *_id on these.

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

// ── Patient ──────────────────────────────────────────────────────────
export type Patient = {
  id: number;
  given: string;
  family: string;
  gender: string;
  dob: string | null;
  language: Lang | null;
  screeningRef: string | null;
  nationalId: string | null;
  contact: string | null;
  address: string | null;
  masterConsentId: number | null;
  createdAt: string;
};

export type PatientCreateRequest = {
  masterConsent: {
    agreed: boolean;
    version?: string;
    capturedAt?: string;
    // Base64-encoded PNG from the on-screen signature pad. Required when
    // `agreed=true` (server rejects with `signature_required` otherwise).
    signatureImage?: string;
  };
  given: string;
  family: string;
  gender: string;
  dob?: string;
  language?: Lang;
  screeningRef?: string;
  nationalId?: string;
  contact?: string;
  address?: string;
};

export type PatientUpdateRequest = Partial<Omit<PatientCreateRequest, "masterConsent">>;

// ── Doctor ───────────────────────────────────────────────────────────
export type Doctor = {
  id: number;
  username: string;
  givenName: string;
  familyName: string;
  contact: string;
  email: string;
  slmcRegistrationNumber: string;
  qualifications: string;
  practitionerAddress: string;
  instituteName: string;
  instituteContact: string;
  active: boolean;
  // Four-state lifecycle (server-computed):
  //   awaiting_setup    → live unconsumed invite, no form submission yet
  //   awaiting_approval → doctor self-onboarded; admin needs to act
  //   rejected          → admin reviewed + rejected
  //   active            → approved + usable
  // Optional for backward compatibility with older response shapes.
  onboardingStatus?: "awaiting_setup" | "awaiting_approval" | "rejected" | "active";
  // Only the singular GET /doctors/{id} populates this (as a base64 data URL);
  // the list endpoint omits it to keep payloads lean.
  rubberStampImage?: string | null;
};

// ── Consent ──────────────────────────────────────────────────────────
export type Consent = {
  id: number;
  patientId: number;
  scope: "master" | "session";
  version: string | null;
  agreed: boolean;
  appointmentId: number | null;
  capturedAt: string;
  revokedAt: string | null;
  reason: string | null;
  // hasSignature is derived server-side from signature_image NOT NULL —
  // bytes themselves stay on the server. signatureMethod distinguishes
  // 'signature' from future channels (e.g. 'voice').
  hasSignature: boolean;
  signatureMethod: string | null;
};

// ── Appointment ──────────────────────────────────────────────────────
export type Appointment = {
  id: number;
  patientId: number;
  doctorId: number;
  scheduledAt: string;
  status: AppointmentStatus;
  cancellationReason: string | null;
  createdAt: string;
};

export type CalendarAppointment = Appointment & {
  patientName: string;
  doctorName: string;
};

// ── Preconsult ───────────────────────────────────────────────────────
export type Preconsult = {
  appointmentId: number;
  height: number | null;
  weight: number | null;
  sysBp: number | null;
  diaBp: number | null;
  pulse: number | null;
  temperature: number | null;
  primaryComplaint: string | null;
  submittedAt: string;
};

export type PreconsultRequest = {
  height?: number | null;
  weight?: number | null;
  sysBp?: number | null;
  diaBp?: number | null;
  pulse?: number | null;
  temperature?: number | null;
  primaryComplaint?: string | null;
};

// ── Profile JSONB shapes ─────────────────────────────────────────────
export type DiseaseCode =
  | "diabetes" | "hypertension" | "ihd" | "asthma_copd" | "kidney"
  | "thyroid" | "cancer" | "mental_health" | "other";

export type DiseaseEntry = { code: DiseaseCode; text?: string };
export type SurgeryEntry = { description: string };
export type AllergyEntry = {
  type: "food" | "medication" | "other";
  name: string;
  medication?: string;
  treatedWhere?: string;
};
export type ExistingMedicationEntry = {
  drug: string;
  dosage?: string;
  frequency?: string;
  notes?: string;
};
export type Lifestyle = {
  smoking: "never" | "current" | "prior" | null;
  alcohol: "none" | "occasional" | "regular" | null;
  occupation: string | null;
  physicalActivity: string | null;
};

export type Profile = {
  patientId: number;
  diseaseHistory: DiseaseEntry[];
  surgicalHistory: SurgeryEntry[];
  allergies: AllergyEntry[];
  medications: ExistingMedicationEntry[];
  lifestyle: Lifestyle;
  updatedAt: string;
};

export type ProfileRequest = {
  diseaseHistory: DiseaseEntry[];
  surgicalHistory: SurgeryEntry[];
  allergies: AllergyEntry[];
  medications: ExistingMedicationEntry[];
  lifestyle: Partial<Lifestyle>;
};

// ── Consultation JSONB shapes ────────────────────────────────────────
export type DiagnosisCode =
  | "allergy" | "alzheimers" | "arthritis" | "asthma" | "autoimmune" | "cancer"
  | "ckd" | "chronic_liver" | "chronic_pain" | "common_cold" | "copd" | "covid19"
  | "diabetes" | "heart_disease" | "hiv_aids" | "hypertension" | "influenza"
  | "mental_health" | "obesity" | "osteoporosis" | "stroke" | "thyroid" | "others";

export type DiagnosisEntry = { code: DiagnosisCode; text?: string };
export type MedicationEntry = {
  genericName: string;
  tradeName?: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
};
export type LabEntry = { testName?: string; instructions?: string };
export type ReferralEntry = { specialistOrDepartment?: string; instructions?: string };

export type Notes = {
  complaint?: string | null;
  onset?: string | null;
  symptoms?: string | null;
  observations?: string | null;
};

export type Consultation = {
  id: number;
  appointmentId: number;
  status: "draft" | "completed";
  notes: Notes;
  diagnoses: DiagnosisEntry[];
  medications: MedicationEntry[];
  labs: LabEntry[];
  referrals: ReferralEntry[];
  followUpDate: string | null;
  followUpWeeks: number | null;
  followUpAppointmentId: number | null;
  signedAt: string | null;
};

// Discriminated follow-up block for `POST /consultations/{id}/submit`.
// Doctor either books an exact follow-up appointment for themselves
// (server uses parent appointment's doctor_id), or recommends N weeks
// (server creates a follow-up queue entry). Omit for no follow-up.
export type FollowUpInput =
  | { kind: "appointment"; scheduledAt: string }
  | { kind: "weeks"; weeks: number };

// ── Attachments (HW-uploaded photos) ─────────────────────────────────
export type AttachmentMeta = {
  id: number;
  appointmentId: number;
  filename: string;
  mimeType: string;
  byteSize: number;
  caption: string | null;
  uploadedBy: string;
  uploadedAt: string;
};

export type AppointmentDetail = {
  appointment: Appointment;
  patient: Patient | null;
  profile: Profile | null;
  preconsult: Preconsult | null;
  consultation: Consultation | null;
  masterConsentStatus: "ok" | "needs_reconsent";
  attachments: AttachmentMeta[];
};

// ── History ──────────────────────────────────────────────────────────
export type HistoryConsultationItem = {
  consultationId: number;
  appointmentId: number;
  date: string;
  diagnoses: DiagnosisEntry[];
  prescription: MedicationEntry[];
  notes: Notes;
};

export type PatientHistory = {
  appointments: Appointment[];
  consultations: HistoryConsultationItem[];
};

// ── First-run setup wizard (backend 0006_system_init) ─────────────────

export type SetupStatusResponse = { initialized: boolean };

export type VerifySetupTokenRequest = { token: string };
// The setup-session JWT travels in the body — the wizard holds it in
// React state and sends it back as `Authorization: Bearer …` on
// /setup/initialize. No cookies are set during the setup flow.
export type VerifySetupTokenResponse = {
  expiresAt: string;
  setupSessionToken: string;
};

export type InitializeSystemRequest = {
  sysAdmin: { username: string; password: string };
  instituteIdentity: {
    name: string;
    addressLines: string[];
    contactPhone: string;
    contactEmail: string;
  };
  appTimezone: string;
  exportTimezone: string;
  masterConsentVersion: string;
};

export type InitializeSystemResponse = {
  ok: boolean;
  username: string;
  role: "sys-admin";
  expiresAt: string;
};

// POST /sysadmin/accounts — sys-admin only. Doctors use POST /doctors.
export type OperatingAccountRole = "admin" | "healthworker";

export type CreateOperatingAccountRequest = {
  username: string;
  password: string;
  role: OperatingAccountRole;
  fullName?: string;
  contact?: string;
};

export type CreateOperatingAccountResponse = {
  username: string;
  role: OperatingAccountRole;
};

// GET /sysadmin/accounts — full platform roster. Admins and healthworkers
// are manageable; doctors and the sys-admin are read-only rows. Roles
// beyond the operating two appear here, so this is the broad role union.
export type AccountRole = "sys-admin" | "admin" | "healthworker" | "doctor";

export type AccountRosterEntry = {
  username: string;
  role: AccountRole;
  // Ops-managed profile (operating accounts only); null for doctors and
  // the sys-admin.
  fullName: string | null;
  contact: string | null;
  // Account-level soft-disable stamp; null = active. Always null for
  // doctors (see `doctorActive`) and the sys-admin.
  disabledAt: string | null;
  // Whether this surface can mutate the row (admin / healthworker only).
  manageable: boolean;
  // Only populated for doctor rows, mirroring the doctor.active flag.
  doctorActive: boolean | null;
  // Only populated for doctor rows — opens the doctor's full editor.
  doctorId: number | null;
};

// POST /sysadmin/accounts/{username}/reset-password
export type ResetAccountPasswordRequest = {
  password: string;
};

// PATCH /sysadmin/accounts/{username} — edit ops-managed profile.
export type AccountUpdateRequest = {
  fullName?: string;
  contact?: string;
};

// ── Sys-admin read-only views ─────────────────────────────────────────

export type SystemConfig = {
  initializedAt: string | null;
  instituteName: string | null;
  instituteAddressLines: string[] | null;
  instituteContactPhone: string | null;
  instituteContactEmail: string | null;
  appTimezone: string | null;
  exportTimezone: string | null;
  masterConsentVersion: string | null;
};

// ── Wrappers used by certain endpoints ───────────────────────────────
export type PatientListResponse = { patients: Patient[]; page: number };
export type PatientCreateResponse = { patient: Patient; masterConsent: Consent };
export type SessionConsentRequest = {
  agreed: boolean;
  // Required server-side when `agreed=true` — declines stay signature-less.
  signatureImage?: string;
  capturedAt?: string;
};
export type SessionConsentResponse = { consent: Consent; appointment: Appointment };
export type ReConsentRequest = {
  agreed: boolean;
  version?: string;
  capturedAt?: string;
  signatureImage?: string;
};
export type MeetingTokenResponse = { room: string; token: string; serverUrl: string };
export type StartMeetingResponse = MeetingTokenResponse & { appointment: Appointment };
export type ReConsentResponse = { masterConsent: Consent };

// ── Doctor availability ──────────────────────────────────────────────
// Advisory time windows declaring when a doctor is reachable. Booking is
// not gated on these — they overlay on the HW time picker as reference.
export type Availability = {
  id: number;
  doctorId: number;
  startAt: string;
  endAt: string;
  note: string | null;
  createdBy: string;
  createdAt: string;
};

export type AvailabilityCreateRequest = {
  startAt: string;
  endAt: string;
  note?: string;
};

export type AvailabilityBulkCreateRequest = {
  windows: AvailabilityCreateRequest[];
};

export type AvailabilityUpdateRequest = Partial<AvailabilityCreateRequest>;

// ── Queue ────────────────────────────────────────────────────────────
export type QueueSource = "screening" | "walk_in" | "follow_up";
export type QueueStatus = "pending" | "booked" | "cancelled";
export type QueuePriority = "urgent" | "routine";

export type QueueEntry = {
  id: number;
  patientId: number;
  source: QueueSource;
  status: QueueStatus;
  priority: QueuePriority;
  preferredDoctorId: number | null;
  targetDate: string | null;
  notes: string | null;
  sourceMeta: Record<string, unknown>;
  appointmentId: number | null;
  createdBy: string;
  createdAt: string;
  bookedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
};

// `POST /queue` — manual create rejects source='follow_up'.
export type QueueEntryCreateRequest = {
  patientId: number;
  source: Exclude<QueueSource, "follow_up">;
  priority?: QueuePriority;
  preferredDoctorId?: number | null;
  targetDate?: string | null;
  notes?: string | null;
  sourceMeta?: Record<string, unknown>;
  force?: boolean;
};

export type QueueEntryUpdateRequest = {
  priority?: QueuePriority;
  preferredDoctorId?: number | null;
  targetDate?: string | null;
  notes?: string | null;
  sourceMeta?: Record<string, unknown>;
};

export type QueueBookRequest = { doctorId: number; scheduledAt: string };
export type QueueCancelRequest = { reason?: string };

export type QueueBookResponse = { queueEntry: QueueEntry; appointment: Appointment };

// ── Appointment cancel — opt-in requeue ──────────────────────────────
export type RequeueOnCancelInput = {
  source: Exclude<QueueSource, "follow_up">;
  priority?: QueuePriority;
  preferredDoctorId?: number | null;
  targetDate?: string | null;
  notes?: string | null;
  sourceMeta?: Record<string, unknown>;
};

export type AppointmentCancelRequest = {
  reason?: string;
  requeue?: RequeueOnCancelInput;
};

export type AppointmentCancelResponse = {
  appointment: Appointment;
  queueEntry?: QueueEntry;
};

// ── Submit consultation ──────────────────────────────────────────────
export type SubmitConsultationRequest = {
  signature: string;
  followUp?: FollowUpInput;
};

export type SubmitConsultationResponse = {
  consultation: Consultation;
  appointment: Appointment;
  followUpAppointment?: Appointment;
  followUpQueueEntry?: QueueEntry;
};
