import type { ConsultationFormShape } from "@/components/doctor/consultation-editors";
import { consultation } from "../fixtures";

// Match the production form's null-to-empty normalization without changing domain fixtures.
export const consultationValues: ConsultationFormShape = {
  notes: {
    complaint: consultation.notes.complaint ?? "",
    onset: consultation.notes.onset ?? "",
    symptoms: consultation.notes.symptoms ?? "",
    observations: consultation.notes.observations ?? "",
  },
  diagnoses: consultation.diagnoses.map((entry) => ({ code: entry.code, text: entry.text ?? "" })),
  medications: consultation.medications.map((entry) => ({
    genericName: entry.genericName,
    tradeName: entry.tradeName ?? "",
    dose: entry.dose ?? "",
    frequency: entry.frequency ?? "",
    duration: entry.duration ?? "",
    instructions: entry.instructions ?? "",
  })),
  labs: consultation.labs.map((entry) => ({
    testName: entry.testName ?? "",
    instructions: entry.instructions ?? "",
  })),
  referrals: consultation.referrals.map((entry) => ({
    specialistOrDepartment: entry.specialistOrDepartment ?? "",
    instructions: entry.instructions ?? "",
  })),
};
