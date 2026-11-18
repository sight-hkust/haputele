import { appToday, appLocalToUtcIso } from "@/lib/format";
import type {
  AccountRosterEntry,
  Appointment,
  AppointmentDetail,
  AttachmentMeta,
  Availability,
  CalendarAppointment,
  Consent,
  Consultation,
  Doctor,
  Patient,
  PatientHistory,
  Preconsult,
  Profile,
  QueueEntry,
  SystemConfig,
} from "@/types/api";

// Entirely synthetic. Relative dates keep the real calendar and booking UI usable.
export const today = appToday();
export const scheduledAt = appLocalToUtcIso(`${today}T10:00`);
export const timestamp = "2026-09-01T04:30:00Z";
export const patient: Patient = {
  id: 1,
  given: "Nimal",
  family: "Perera",
  gender: "male",
  dob: "1974-05-18",
  language: "si",
  contact: "0700000001",
  address: "Demo village, Haputale",
  nationalId: null,
  screeningRef: "DEMO-001",
  masterConsentId: 1,
  createdAt: timestamp,
};
export const doctor: Doctor = {
  id: 1,
  username: "demo.doctor",
  givenName: "Anjali",
  familyName: "Silva",
  contact: "0700000002",
  email: "doctor@example.test",
  slmcRegistrationNumber: "DEMO-1001",
  qualifications: "MBBS",
  practitionerAddress: "Demo clinic, Haputale",
  instituteName: "HapuTele Demo Clinic",
  instituteContact: "0700000000",
  active: true,
  hasDefaultSignature: true,
  onboardingStatus: "active",
  submittedAt: timestamp,
  approvedAt: timestamp,
  approvedBy: "demo.admin",
  rejectedAt: null,
  rejectedReason: null,
};
export const profile: Profile = {
  patientId: 1,
  diseaseHistory: [{ code: "hypertension", text: "Diagnosed in 2022" }],
  surgicalHistory: [],
  allergies: [{ type: "medication", name: "Penicillin" }],
  medications: [{ drug: "Amlodipine", dosage: "5 mg", frequency: "Once daily" }],
  lifestyle: {
    smoking: "never",
    alcohol: "none",
    betelAreca: "never",
    occupation: "Farmer",
    physicalActivity: "Walks daily",
  },
  updatedAt: timestamp,
};
export const preconsult: Preconsult = {
  appointmentId: 1,
  height: 168,
  weight: 70,
  sysBp: 138,
  diaBp: 86,
  pulse: 76,
  temperature: 36.7,
  primaryComplaint: "Blood pressure review",
  submittedAt: timestamp,
};
export const appointment: Appointment = {
  id: 1,
  patientId: 1,
  doctorId: 1,
  scheduledAt,
  status: "data_collection",
  createdAt: timestamp,
};
export const consultation: Consultation = {
  id: 1,
  appointmentId: 1,
  status: "draft",
  notes: {
    complaint: "Blood pressure review",
    onset: "Routine follow-up",
    symptoms: "No new symptoms",
    observations: "Patient comfortable at rest",
  },
  diagnoses: [{ code: "hypertension" }],
  medications: [
    {
      genericName: "Amlodipine",
      dose: "5 mg",
      frequency: "Once daily",
      duration: "28 days",
      instructions: "Take at the same time each day",
    },
  ],
  labs: [{ testName: "Renal function", instructions: "Before the next review" }],
  referrals: [],
  signedAt: null,
  followUpWeeks: null,
  followUpDate: null,
  followUpAppointmentId: null,
};
export const consent: Consent = {
  id: 1,
  patientId: 1,
  scope: "session",
  appointmentId: 1,
  version: "demo-v1",
  agreed: true,
  capturedAt: timestamp,
  revokedAt: null,
  reason: null,
  hasSignature: true,
  signatureMethod: "drawn",
};
export const attachment: AttachmentMeta = {
  id: 1,
  appointmentId: 1,
  filename: "demo-report.svg",
  mimeType: "image/svg+xml",
  byteSize: 380,
  caption: "Synthetic report — not a medical record",
  uploadedBy: "demo.healthworker",
  uploadedAt: timestamp,
};
export const appointmentDetail: AppointmentDetail = {
  appointment,
  patient,
  profile,
  preconsult,
  consultation,
  masterConsentStatus: "ok",
  attachments: [attachment],
};
export const calendarAppointment: CalendarAppointment = {
  ...appointment,
  patientName: "Nimal Perera",
  doctorName: "Anjali Silva",
};
export const availability: Availability = {
  id: 1,
  doctorId: 1,
  startAt: appLocalToUtcIso(`${today}T08:00`),
  endAt: appLocalToUtcIso(`${today}T12:00`),
  note: "Demo morning clinic",
  createdBy: "demo.doctor",
  createdAt: timestamp,
};
export const queueEntry: QueueEntry = {
  id: 1,
  patientId: 1,
  source: "screening",
  status: "pending",
  priority: "routine",
  preferredDoctorId: 1,
  targetDate: today,
  notes: "Blood pressure review",
  sourceMeta: {},
  appointmentId: null,
  createdBy: "demo.healthworker",
  createdAt: timestamp,
};
export const history: PatientHistory = {
  appointments: [{ ...appointment, id: 10, status: "completed", scheduledAt: timestamp }],
  consultations: [
    {
      consultationId: 10,
      appointmentId: 10,
      date: timestamp,
      diagnoses: consultation.diagnoses,
      prescription: consultation.medications,
      notes: consultation.notes,
    },
  ],
};
export const systemConfig: SystemConfig = {
  initializedAt: timestamp,
  instituteName: "HapuTele Demo Clinic",
  instituteAddressLines: ["Demo clinic", "Haputale, Sri Lanka"],
  instituteContactPhone: "0700000000",
  instituteContactEmail: "clinic@example.test",
  appTimezone: "Asia/Colombo",
  exportTimezone: "Asia/Colombo",
  masterConsentVersion: "demo-v1",
};
export const accounts: AccountRosterEntry[] = [
  {
    username: "demo.admin",
    role: "admin",
    fullName: "Demo Administrator",
    contact: "0700000003",
    disabledAt: null,
    manageable: true,
    doctorActive: null,
    doctorId: null,
  },
  {
    username: "demo.healthworker",
    role: "healthworker",
    fullName: "Demo Health Worker",
    contact: "0700000004",
    disabledAt: null,
    manageable: true,
    doctorActive: null,
    doctorId: null,
  },
  {
    username: "demo.doctor",
    role: "doctor",
    fullName: "Anjali Silva",
    contact: "0700000002",
    disabledAt: null,
    manageable: false,
    doctorActive: true,
    doctorId: 1,
  },
];
export const demoImage = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#f1f5f9"/><text x="32" y="64" font-family="sans-serif" font-size="24" fill="#0f172a">HapuTele synthetic report</text><text x="32" y="112" font-family="sans-serif" font-size="18" fill="#475569">Storybook illustration only. No patient data.</text></svg>`;
export const demoSignature = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="100"><path d="M20 70 Q50 10 70 60 T120 45 Q135 90 170 30 L160 70 Q220 30 260 60" fill="none" stroke="#0f172a" stroke-width="3"/></svg>`;
