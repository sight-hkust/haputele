// Maps backend error codes (apiSequenceFlows.md "Error Codes") to UX-grade
// English. Per §12, the API responds in English codes and the client translates.
// Tamil/Sinhala come in Phase 5.
const MESSAGES: Record<string, string> = {
  invalid_credentials: "Incorrect username or password. Try again.",
  master_consent_required: "This patient has no active master consent — capture a fresh consent before continuing.",
  master_consent_not_agreed: "Master consent must be agreed before continuing.",
  session_consent_required: "Patient session consent is required first.",
  doctor_slot_taken: "That doctor already has another appointment at this time. Pick a different slot.",
  invalid_state: "This action isn't valid for the current appointment status.",
  consultation_locked: "This consultation has been signed and locked — no further edits.",
  preconsult_locked: "Preconsult is locked — the meeting has already started.",
  consultation_not_ready: "The consultation isn't complete yet — the prescription PDF isn't available.",
  missing_prescription_fields: "Some §1.7 mandatory prescription fields are missing.",
  national_id_taken: "A patient with that National ID already exists.",
  signature_required: "A signature is required before continuing.",
  invalid_signature_format: "The signature image couldn't be decoded. Try signing again.",
  signature_too_large: "The signature image is too large. Try a smaller drawing.",
  attachment_too_large: "That file is too large — keep attachments under 10 MB.",
  attachment_empty: "That file appeared to be empty.",
  attachment_unsupported_type: "Only JPEG, PNG, and WebP images can be attached.",
  attachment_not_found: "That attachment couldn't be found.",
  patient_not_found: "Patient not found.",
  doctor_not_found: "Doctor not found.",
  appointment_not_found: "Appointment not found.",
  consultation_not_found: "Consultation not found.",
  not_your_appointment: "This appointment isn't assigned to you.",
  not_your_consultation: "This consultation isn't yours.",
  doctor_profile_missing: "Your doctor profile is incomplete — contact an admin.",
  username_taken: "That username is already in use.",
  rubber_stamp_required: "Upload a rubber-stamp image for the doctor.",
  invalid_rubber_stamp_image: "The rubber-stamp image couldn't be decoded.",
  rubber_stamp_too_large: "That stamp image is too large — keep it under 1 MB.",
  no_active_master_consent: "No active master consent on this patient.",
  // Availability
  invalid_time_range: "End time must be after start time.",
  range_too_wide: "That date range is too wide — please pick at most 92 days.",
  not_your_availability: "That availability window doesn't belong to you.",
  availability_not_found: "Availability window not found.",
  // Queue
  duplicate_pending: "This patient already has a pending entry from this source.",
  queue_not_pending: "This queue entry is no longer pending and can't be modified.",
  follow_up_source_reserved: "Follow-up entries are created automatically by the system.",
  queue_entry_not_found: "Queue entry not found.",
  // First-run setup wizard (backend 0006_system_init feature).
  setup_required: "The system hasn't been set up yet. Continue to setup.",
  setup_already_completed: "Setup has already been completed. Sign in instead.",
  setup_token_invalid: "That setup token isn't valid. Check the api container logs for the current banner.",
  setup_session_invalid: "Your setup session expired. Restart the wizard with a fresh token.",
  csrf_failed: "Your setup session got out of sync. Restart the wizard with a fresh token. If it keeps happening, clear localhost cookies in your browser.",
  setup_token_missing: "No setup token is active. Restart the api container to mint a new one.",
  setup_password_too_short: "Choose a password at least 10 characters long.",
  setup_password_weak: "That password is on the common-weak list. Pick something less obvious.",
  setup_username_taken: "That username is already in use.",
  setup_address_required: "Provide at least one institute address line.",
  setup_institute_name_required: "Institute name is required.",
  setup_institute_phone_required: "Institute contact phone is required.",
  request_failed: "Something went wrong. Try again.",
};

export function explainError(code: string, fallback?: string): string {
  return MESSAGES[code] ?? fallback ?? "Something went wrong. Try again.";
}
