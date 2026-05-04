import type { DiagnosisCode, DiseaseCode } from "@/types/api";

// 23 doctor-facing diagnosis codes from apiSequenceFlows §"JSONB schemas".
// `others` requires a free-text fallback (the API enforces this).
export const DIAGNOSIS_OPTIONS: { code: DiagnosisCode; label: string }[] = [
  { code: "allergy", label: "Allergy" },
  { code: "alzheimers", label: "Alzheimer's Disease" },
  { code: "arthritis", label: "Arthritis" },
  { code: "asthma", label: "Asthma" },
  { code: "autoimmune", label: "Autoimmune Disease" },
  { code: "cancer", label: "Cancer" },
  { code: "ckd", label: "Chronic Kidney Disease" },
  { code: "chronic_liver", label: "Chronic Liver Disease" },
  { code: "chronic_pain", label: "Chronic Pain" },
  { code: "common_cold", label: "Common Cold" },
  { code: "copd", label: "COPD" },
  { code: "covid19", label: "COVID-19" },
  { code: "diabetes", label: "Diabetes" },
  { code: "heart_disease", label: "Heart Disease" },
  { code: "hiv_aids", label: "HIV/AIDS" },
  { code: "hypertension", label: "Hypertension" },
  { code: "influenza", label: "Influenza" },
  { code: "mental_health", label: "Mental Health Disorders" },
  { code: "obesity", label: "Obesity" },
  { code: "osteoporosis", label: "Osteoporosis" },
  { code: "stroke", label: "Stroke" },
  { code: "thyroid", label: "Thyroid Disorders" },
  { code: "others", label: "Other (specify)" },
];

export const diagnosisLabel = (code: DiagnosisCode): string =>
  DIAGNOSIS_OPTIONS.find((d) => d.code === code)?.label ?? code;

// 9 patient-facing disease codes from userStories §"Patient profile".
export const DISEASE_OPTIONS: { code: DiseaseCode; label: string }[] = [
  { code: "diabetes", label: "Diabetes" },
  { code: "hypertension", label: "Hypertension" },
  { code: "ihd", label: "Ischaemic heart disease" },
  { code: "asthma_copd", label: "Asthma / COPD" },
  { code: "kidney", label: "Kidney disease" },
  { code: "thyroid", label: "Thyroid disorder" },
  { code: "cancer", label: "Cancer" },
  { code: "mental_health", label: "Mental health condition" },
  { code: "other", label: "Other" },
];

export const diseaseLabel = (code: DiseaseCode): string =>
  DISEASE_OPTIONS.find((d) => d.code === code)?.label ?? code;

// Physical activity is stored as a free-text string by the backend (Lifestyle
// schema), but the UI offers a fixed dropdown so entries are comparable across
// patients. Existing free-text values that don't match an option are still
// shown verbatim in the summary (we just can't reverse-look-up the label).
export const PHYSICAL_ACTIVITY_OPTIONS: { value: string; label: string }[] = [
  { value: "sedentary", label: "Sedentary — little or no exercise" },
  { value: "light", label: "Light — 1–2 days a week" },
  { value: "moderate", label: "Moderate — 3–4 days a week" },
  { value: "active", label: "Active — 5+ days a week" },
  { value: "very_active", label: "Very active — daily intense exercise" },
];

export const physicalActivityLabel = (value: string | null | undefined): string | null => {
  if (!value) return null;
  return PHYSICAL_ACTIVITY_OPTIONS.find((o) => o.value === value)?.label ?? value;
};
