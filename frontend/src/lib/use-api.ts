"use client";

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { API_URL, api, readCookie, type ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const CSRF_HEADER_NAME = "X-CSRF-Token";
import type {
  Appointment,
  AppointmentCancelRequest,
  AppointmentCancelResponse,
  AppointmentDetail,
  AttachmentMeta,
  Availability,
  AvailabilityBulkCreateRequest,
  AvailabilityCreateRequest,
  AvailabilityUpdateRequest,
  CalendarAppointment,
  CapturePurpose,
  CaptureSession,
  CaptureSessionStatus,
  Consent,
  Consultation,
  AccountRosterEntry,
  AccountUpdateRequest,
  CreateOperatingAccountRequest,
  CreateOperatingAccountResponse,
  ResetAccountPasswordRequest,
  DiagnosisEntry,
  Doctor,
  DoctorSummary,
  InitializeSystemRequest,
  InitializeSystemResponse,
  LabEntry,
  MedicationEntry,
  Notes,
  Patient,
  PatientCreateRequest,
  PatientCreateResponse,
  PatientHistory,
  PatientListResponse,
  PatientUpdateRequest,
  Preconsult,
  PreconsultRequest,
  Profile,
  ProfileRequest,
  QueueBookRequest,
  QueueBookResponse,
  QueueCancelRequest,
  QueueEntry,
  QueueEntryCreateRequest,
  QueueEntryUpdateRequest,
  ReConsentRequest,
  ReConsentResponse,
  ReferralEntry,
  SessionConsentRequest,
  SessionConsentResponse,
  SetupStatusResponse,
  MeetingTokenResponse,
  StartMeetingResponse,
  SubmitConsultationRequest,
  SubmitConsultationResponse as TSubmitConsultationResponse,
  SysadminMe,
  SystemConfig,
  VerifySetupTokenRequest,
  VerifySetupTokenResponse,
} from "@/types/api";

// ── Authed api caller ────────────────────────────────────────────────
// Auth is cookie-based now — `api()` already attaches credentials and the
// CSRF echo on its own. We keep this hook as the call-site convention so
// the change diff stays small, but the body is just a thin pass-through.
// The dep on `session` ensures consumers re-render after login/logout.
export function useAuthedApi() {
  const { session } = useAuth();
  return useCallback(
    <T,>(path: string, options: Parameters<typeof api>[1] = {}) => api<T>(path, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session],
  );
}

// ── Patients ─────────────────────────────────────────────────────────
export function usePatientList(params: { search?: string; page?: number }) {
  const fetcher = useAuthedApi();
  const search = params.search?.trim() || "";
  const page = params.page ?? 1;
  const qs = new URLSearchParams();
  if (search) qs.set("search", search);
  qs.set("page", String(page));
  return useQuery({
    queryKey: ["patients", "list", { search, page }],
    queryFn: () => fetcher<PatientListResponse>(`/patients?${qs.toString()}`),
  });
}

// `GET /patients/{id}` returns both the demographics and the profile JSONB —
// we expose both so the patient detail page can render the intake form summary
// without a second round trip.
export function usePatient(id: number | null, opts?: { enabled?: boolean }) {
  const fetcher = useAuthedApi();
  return useQuery({
    queryKey: ["patients", id],
    queryFn: () =>
      fetcher<{ patient: Patient; profile: Profile | null }>(`/patients/${id}`),
    enabled: !!id && (opts?.enabled ?? true),
  });
}

export function useUpsertProfile(patientId: number) {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<Profile, ApiError, ProfileRequest>({
    mutationFn: (body) =>
      fetcher(`/patients/${patientId}/profile`, { method: "PUT", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients", patientId] });
      qc.invalidateQueries({ queryKey: ["appointments"] }); // any open cockpit
    },
  });
}

export function usePatientHistory(id: number | null) {
  const fetcher = useAuthedApi();
  return useQuery({
    queryKey: ["patients", id, "history"],
    queryFn: () => fetcher<PatientHistory>(`/patients/${id}/history`),
    enabled: !!id,
  });
}

export function useCreatePatient() {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<PatientCreateResponse, ApiError, PatientCreateRequest>({
    mutationFn: (body) => fetcher("/patients", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patients", "list"] }),
  });
}

export function useUpdatePatient(id: number) {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<Patient, ApiError, PatientUpdateRequest>({
    mutationFn: (body) => fetcher(`/patients/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients", id] });
      qc.invalidateQueries({ queryKey: ["patients", "list"] });
    },
  });
}

export function useDeletePatient() {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: (id) => fetcher(`/patients/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patients"] }),
  });
}

export function useReConsent(patientId: number) {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  // ReConsentRequest now carries a signatureImage — callers MUST pass it
  // when agreed=true or the server returns 422 signature_required.
  return useMutation<ReConsentResponse, ApiError, ReConsentRequest>({
    mutationFn: (body) =>
      fetcher(`/patients/${patientId}/consents`, {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients", patientId] });
      // Master consent gate lives on every appointment detail for this
      // patient — bust the cache so the page reflects the fresh status.
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

// ── Doctors ──────────────────────────────────────────────────────────
export type DoctorListFilter = {
  active?: boolean;
  // Computed onboarding status — drives the admin approval-queue tabs.
  status?: "awaiting_approval" | "awaiting_setup" | "active" | "rejected";
};

export function useDoctorList(opts?: DoctorListFilter) {
  const fetcher = useAuthedApi();
  const qs = new URLSearchParams();
  if (opts?.active !== undefined) qs.set("active", String(opts.active));
  if (opts?.status) qs.set("status", opts.status);
  const q = qs.toString();
  return useQuery({
    queryKey: ["doctors", "list", opts ?? {}],
    queryFn: () => fetcher<Doctor[]>(`/doctors${q ? `?${q}` : ""}`),
  });
}

// Per-status counts for the approval-queue tab badges (admin only).
export function useDoctorSummary() {
  const fetcher = useAuthedApi();
  return useQuery({
    queryKey: ["doctors", "summary"],
    queryFn: () => fetcher<DoctorSummary>("/doctors/summary"),
  });
}

export function useDoctor(id: number | null) {
  const fetcher = useAuthedApi();
  return useQuery({
    queryKey: ["doctors", id],
    queryFn: () => fetcher<Doctor>(`/doctors/${id}`),
    enabled: !!id,
  });
}

export type DoctorCreateRequest = {
  username: string;
  // Optional: when omitted the backend mints an invite token and emails the
  // doctor a link to set their own password. Requires the email service to
  // be configured server-side; otherwise the request 422s `email_not_configured`.
  password?: string;
  givenName: string;
  familyName: string;
  contact: string;
  email: string;
  slmcRegistrationNumber: string;
  qualifications: string;
  practitionerAddress: string;
  instituteName: string;
  instituteContact: string;
  rubberStampImage: string; // base64 (data: URL prefix accepted by backend)
};

export function useCreateDoctor() {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<Doctor, ApiError, DoctorCreateRequest>({
    mutationFn: (body) => fetcher("/doctors", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

export type DoctorUpdateRequest = Partial<DoctorCreateRequest> & { active?: boolean };

export function useUpdateDoctor(id: number) {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<Doctor, ApiError, DoctorUpdateRequest>({
    mutationFn: (body) => fetcher(`/doctors/${id}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

// Fires the doctor invite email again. Any prior live invite for the same
// doctor is revoked inside the backend `services.doctor_invites.issue()`,
// so the old link stops working as soon as this resolves.
export function useReissueDoctorInvite() {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: (id) => fetcher(`/doctors/${id}/invites`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

// Invite-by-email: admin types just the email and (optionally) a name
// hint. No Doctor row is created server-side until the doctor consumes
// the invite via the public onboarding form.
export type DoctorInviteRequest = { email: string; familyName?: string };
export type DoctorInviteResponse = { inviteId: number; email: string };

export function useInviteDoctor() {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<DoctorInviteResponse, ApiError, DoctorInviteRequest>({
    mutationFn: (body) => fetcher("/doctors/invites", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

// Approve / reject a self-onboarded doctor. Approve flips status →
// "active". Reject stamps rejected_at + sets active=false; supply a
// reason that's surfaced on the rejected doctor's login screen.
export function useApproveDoctor() {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<Doctor, ApiError, number>({
    mutationFn: (id) => fetcher(`/doctors/${id}/approve`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

export function useRejectDoctor() {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<Doctor, ApiError, { id: number; reason?: string }>({
    mutationFn: ({ id, reason }) =>
      fetcher(`/doctors/${id}/reject`, { method: "POST", body: { reason } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

// Invite a rejected doctor to reapply with the same email. Issues a fresh
// full-profile (new-doctor) invite; the rejected row is preserved as
// history and the new submission links back to it via previousDoctorId.
export function useReinviteReapply() {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<{ inviteId: number; email: string }, ApiError, number>({
    mutationFn: (id) => fetcher(`/doctors/${id}/reinvite-reapply`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

// Hard-delete a rejected doctor record (right-to-erasure). Backend
// refuses anything that isn't in the rejected state.
export function usePurgeDoctor() {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: (id) => fetcher(`/doctors/${id}/purge`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}


// Soft-delete — backend sets active=false, preserves FK references on past
// appointments / consultations.
export function useDeactivateDoctor() {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: (id) => fetcher(`/doctors/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

// ── Appointments ─────────────────────────────────────────────────────
export function useAppointmentList(params: {
  from?: string;
  to?: string;
  status?: string;
  patientId?: number;
  doctorId?: number;
}) {
  const fetcher = useAuthedApi();
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.status) qs.set("status", params.status);
  if (params.patientId) qs.set("patientId", String(params.patientId));
  if (params.doctorId) qs.set("doctorId", String(params.doctorId));
  return useQuery({
    queryKey: ["appointments", "list", params],
    queryFn: () => fetcher<CalendarAppointment[]>(`/appointments?${qs.toString()}`),
  });
}

export function useAppointment(id: number | null) {
  const fetcher = useAuthedApi();
  return useQuery({
    queryKey: ["appointments", id],
    queryFn: () => fetcher<AppointmentDetail>(`/appointments/${id}`),
    enabled: !!id,
    // The cockpit drives the state machine — re-poll on focus so cross-actor
    // transitions (doctor finishing notes, e.g.) don't leave the UI stale.
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
}

export function useCreateAppointment() {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<Appointment, ApiError, { patientId: number; doctorId: number; scheduledAt: string }>({
    mutationFn: (body) => fetcher("/appointments", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments", "list"] }),
  });
}

export function useUpdateAppointment(id: number) {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<Appointment, ApiError, { doctorId?: number; scheduledAt?: string }>({
    mutationFn: (body) => fetcher(`/appointments/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments", id] });
      qc.invalidateQueries({ queryKey: ["appointments", "list"] });
    },
  });
}

export function useCancelAppointment(id: number) {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<AppointmentCancelResponse, ApiError, AppointmentCancelRequest>({
    mutationFn: (body) => fetcher(`/appointments/${id}/cancel`, { method: "POST", body }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["appointments", id] });
      qc.invalidateQueries({ queryKey: ["appointments", "list"] });
      // If a fresh queue entry was created, refresh queue lists too.
      if (res.queueEntry) qc.invalidateQueries({ queryKey: ["queue"] });
    },
  });
}

// ── Consent + preconsult + meeting transitions ───────────────────────
export function useRecordSessionConsent(appointmentId: number) {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  // SessionConsentRequest carries an optional signatureImage. Server enforces
  // it when agreed=true; declines stay signature-less.
  return useMutation<SessionConsentResponse, ApiError, SessionConsentRequest>({
    mutationFn: (body) =>
      fetcher(`/appointments/${appointmentId}/consent`, { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments", appointmentId] }),
  });
}

export function useGetSessionConsent(appointmentId: number | null) {
  const fetcher = useAuthedApi();
  return useQuery({
    queryKey: ["appointments", appointmentId, "consent"],
    queryFn: () => fetcher<Consent | null>(`/appointments/${appointmentId}/consent`),
    enabled: !!appointmentId,
  });
}

export function useUpsertPreconsult(appointmentId: number) {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<{ preconsult: Preconsult; appointment: Appointment }, ApiError, PreconsultRequest>({
    mutationFn: (body) =>
      fetcher(`/appointments/${appointmentId}/preconsult`, { method: "PUT", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments", appointmentId] }),
  });
}

export function useStartMeeting(appointmentId: number) {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<StartMeetingResponse, ApiError, void>({
    mutationFn: () => fetcher(`/appointments/${appointmentId}/start-meeting`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments", appointmentId] }),
  });
}

export function useEndMeeting(appointmentId: number) {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<Appointment, ApiError, void>({
    mutationFn: () => fetcher(`/appointments/${appointmentId}/end-meeting`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments", appointmentId] }),
  });
}

// Mints a fresh LiveKit JWT for the current user — used by the doctor join
// button and by the healthworker re-open path after a page reload, where
// `useStartMeeting`'s response is no longer in memory. No state change.
export function useMeetingToken(appointmentId: number) {
  const fetcher = useAuthedApi();
  return useMutation<MeetingTokenResponse, ApiError, void>({
    mutationFn: () => fetcher(`/appointments/${appointmentId}/meeting-token`, { method: "POST" }),
  });
}

// ── Consultation (doctor flow) ───────────────────────────────────────
export type ConsultationDraftResponse = { consultationId: number; draft: Consultation };

export function useCreateOrGetDraft() {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<ConsultationDraftResponse, ApiError, number>({
    mutationFn: (appointmentId) =>
      fetcher(`/appointments/${appointmentId}/consultation/draft`, { method: "POST" }),
    onSuccess: (_data, appointmentId) =>
      qc.invalidateQueries({ queryKey: ["appointments", appointmentId] }),
  });
}

export function useConsultation(consultationId: number | null) {
  const fetcher = useAuthedApi();
  return useQuery({
    queryKey: ["consultations", consultationId],
    queryFn: () => fetcher<Consultation>(`/consultations/${consultationId}`),
    enabled: !!consultationId,
    staleTime: 0, // we mutate this often during the flow
  });
}

export type ConsultationPatch = {
  notes?: Notes;
  diagnoses?: DiagnosisEntry[];
  medications?: MedicationEntry[];
  labs?: LabEntry[];
  referrals?: ReferralEntry[];
};

export function useUpdateConsultation(consultationId: number) {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<Consultation, ApiError, ConsultationPatch>({
    mutationFn: (body) =>
      fetcher(`/consultations/${consultationId}`, { method: "PATCH", body }),
    onSuccess: (data) => {
      qc.setQueryData(["consultations", consultationId], data);
      qc.invalidateQueries({ queryKey: ["appointments", data.appointmentId] });
    },
  });
}

// Re-export under the historical name so existing callers keep compiling.
export type SubmitConsultationResponse = TSubmitConsultationResponse;

export function useSubmitConsultation(consultationId: number) {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<SubmitConsultationResponse, ApiError, SubmitConsultationRequest>({
    mutationFn: (body) =>
      fetcher(`/consultations/${consultationId}/submit`, { method: "POST", body }),
    onSuccess: (res) => {
      qc.setQueryData(["consultations", consultationId], res.consultation);
      qc.invalidateQueries({ queryKey: ["appointments", res.appointment.id] });
      qc.invalidateQueries({ queryKey: ["appointments", "list"] });
      // weeks branch creates a queue entry; appointment branch creates one too.
      if (res.followUpQueueEntry) qc.invalidateQueries({ queryKey: ["queue"] });
      if (res.followUpAppointment) {
        qc.invalidateQueries({ queryKey: ["appointments", res.followUpAppointment.id] });
      }
    },
  });
}

// Resolve the current doctor's row by matching JWT username — backend
// availability endpoints take a doctor_id in the path, so the doctor's own
// pages need this lookup. Reuses the standard /doctors list (cached).
export function useCurrentDoctor() {
  const { session } = useAuth();
  const list = useDoctorList();
  const doctor = list.data?.find((d) => d.username === session?.username) ?? null;
  return { doctor, isLoading: list.isLoading, error: list.error };
}

// ── Doctor availability ──────────────────────────────────────────────
export function useDoctorAvailability(
  doctorId: number | null,
  range: { from?: string; to?: string },
  opts?: { enabled?: boolean },
) {
  const fetcher = useAuthedApi();
  const qs = new URLSearchParams();
  if (range.from) qs.set("from", range.from);
  if (range.to) qs.set("to", range.to);
  const q = qs.toString();
  return useQuery({
    queryKey: ["availability", "doctor", doctorId, range],
    queryFn: () =>
      fetcher<Availability[]>(`/doctors/${doctorId}/availability${q ? `?${q}` : ""}`),
    enabled: !!doctorId && (opts?.enabled ?? true),
  });
}

// Cross-doctor list — for HW booking calendars / multi-doctor planners.
// Doctors get scoped to their own id server-side; admin/HW see everyone.
export function useAvailabilityList(params: {
  from?: string;
  to?: string;
  doctorId?: number;
}) {
  const fetcher = useAuthedApi();
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.doctorId) qs.set("doctorId", String(params.doctorId));
  return useQuery({
    queryKey: ["availability", "list", params],
    queryFn: () => fetcher<Availability[]>(`/availability?${qs.toString()}`),
  });
}

export function useCreateAvailability(doctorId: number) {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<Availability, ApiError, AvailabilityCreateRequest>({
    mutationFn: (body) =>
      fetcher(`/doctors/${doctorId}/availability`, { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["availability"] }),
  });
}

export function useBulkCreateAvailability(doctorId: number) {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<Availability[], ApiError, AvailabilityBulkCreateRequest>({
    mutationFn: (body) =>
      fetcher(`/doctors/${doctorId}/availability/bulk`, { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["availability"] }),
  });
}

export function useUpdateAvailability() {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<Availability, ApiError, { id: number; body: AvailabilityUpdateRequest }>({
    mutationFn: ({ id, body }) =>
      fetcher(`/availability/${id}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["availability"] }),
  });
}

export function useDeleteAvailability() {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: (id) => fetcher(`/availability/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["availability"] }),
  });
}

// Atomic "wipe a doctor's windows in a date range" — used by the week-grid
// save flow to replace a whole week's windows in one call.
export function useDeleteAvailabilityRange(doctorId: number) {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<void, ApiError, { from: string; to: string }>({
    mutationFn: ({ from, to }) => {
      const qs = new URLSearchParams({ from, to }).toString();
      return fetcher(`/doctors/${doctorId}/availability?${qs}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["availability"] }),
  });
}

// ── Queue ────────────────────────────────────────────────────────────
export function useQueueList(params: {
  status?: string;
  source?: string;
  priority?: string;
  preferredDoctorId?: number;
  patientId?: number;
  from?: string;
  to?: string;
}) {
  const fetcher = useAuthedApi();
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.source) qs.set("source", params.source);
  if (params.priority) qs.set("priority", params.priority);
  if (params.preferredDoctorId) qs.set("preferredDoctorId", String(params.preferredDoctorId));
  if (params.patientId) qs.set("patientId", String(params.patientId));
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const q = qs.toString();
  return useQuery({
    queryKey: ["queue", "list", params],
    queryFn: () => fetcher<QueueEntry[]>(`/queue${q ? `?${q}` : ""}`),
  });
}

export function useQueueEntry(id: number | null) {
  const fetcher = useAuthedApi();
  return useQuery({
    queryKey: ["queue", id],
    queryFn: () => fetcher<QueueEntry>(`/queue/${id}`),
    enabled: !!id,
  });
}

export function useCreateQueueEntry() {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<QueueEntry, ApiError, QueueEntryCreateRequest>({
    mutationFn: (body) => fetcher("/queue", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["queue"] }),
  });
}

export function useUpdateQueueEntry(id: number) {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<QueueEntry, ApiError, QueueEntryUpdateRequest>({
    mutationFn: (body) => fetcher(`/queue/${id}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["queue"] }),
  });
}

export function useBookQueueEntry(id: number) {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<QueueBookResponse, ApiError, QueueBookRequest>({
    mutationFn: (body) => fetcher(`/queue/${id}/book`, { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["queue"] });
      qc.invalidateQueries({ queryKey: ["appointments", "list"] });
    },
  });
}

export function useCancelQueueEntry(id: number) {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<QueueEntry, ApiError, QueueCancelRequest>({
    mutationFn: (body) => fetcher(`/queue/${id}/cancel`, { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["queue"] }),
  });
}

// ── Prescription PDF ─────────────────────────────────────────────────
// Returns a typed Blob; callers hand it to URL.createObjectURL().
export function usePrescriptionPdf(appointmentId: number | null, opts?: UseQueryOptions<Blob, ApiError>) {
  const fetcher = useAuthedApi();
  return useQuery<Blob, ApiError>({
    queryKey: ["appointments", appointmentId, "summary.pdf"],
    queryFn: () => fetcher<Blob>(`/appointments/${appointmentId}/summary.pdf`),
    enabled: !!appointmentId,
    staleTime: Infinity, // PDF won't change after completion
    ...opts,
  });
}

// ── Attachments (HW photos for an appointment) ───────────────────────

export function useAttachments(appointmentId: number | null) {
  const fetcher = useAuthedApi();
  return useQuery<AttachmentMeta[], ApiError>({
    queryKey: ["appointments", appointmentId, "attachments"],
    queryFn: () => fetcher<AttachmentMeta[]>(`/appointments/${appointmentId}/attachments`),
    enabled: !!appointmentId,
    staleTime: 30_000,
  });
}

export function useUploadAttachment(appointmentId: number) {
  const qc = useQueryClient();
  // Multipart can't go through the standard `api()` JSON wrapper — we hand-
  // roll the fetch so the browser sets the multipart boundary header.
  // Cookies ride along automatically via credentials: "include"; the CSRF
  // echo is added manually because we bypass api().
  return useMutation<AttachmentMeta, ApiError, { file: File; caption?: string }>({
    mutationFn: async ({ file, caption }) => {
      const form = new FormData();
      form.append("file", file);
      if (caption) form.append("caption", caption);
      const csrf = readCookie("csrf_token");
      const headers: Record<string, string> = {};
      if (csrf) headers[CSRF_HEADER_NAME] = csrf;
      const res = await fetch(`${API_URL}/appointments/${appointmentId}/attachments`, {
        method: "POST",
        credentials: "include",
        headers,
        body: form,
      });
      if (!res.ok) {
        let code = "request_failed";
        let extra: Record<string, unknown> | undefined;
        let requestId = res.headers.get("X-Request-ID") ?? undefined;
        try {
          const body = await res.json();
          const inner = body?.detail ?? body;
          if (inner && typeof inner === "object" && "error" in inner) {
            code = String((inner as { error: string }).error);
            const { error: _omit, requestId: bodyRid, ...rest } = inner as Record<string, unknown>;
            extra = rest;
            if (!requestId && typeof bodyRid === "string") requestId = bodyRid;
          }
        } catch {
          /* leave defaults */
        }
        const { ApiError } = await import("@/lib/api");
        throw new ApiError(res.status, code, extra, requestId);
      }
      return (await res.json()) as AttachmentMeta;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments", appointmentId, "attachments"] });
      qc.invalidateQueries({ queryKey: ["appointments", appointmentId] });
    },
  });
}

export function useDeleteAttachment(appointmentId: number) {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: (attachmentId) =>
      fetcher(`/appointments/${appointmentId}/attachments/${attachmentId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments", appointmentId, "attachments"] });
      qc.invalidateQueries({ queryKey: ["appointments", appointmentId] });
    },
  });
}

export function useUpdateAttachment(appointmentId: number) {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<AttachmentMeta, ApiError, { id: number; caption: string | null }>({
    mutationFn: ({ id, caption }) =>
      fetcher(`/appointments/${appointmentId}/attachments/${id}`, {
        method: "PATCH",
        body: { caption },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments", appointmentId, "attachments"] });
      qc.invalidateQueries({ queryKey: ["appointments", appointmentId] });
    },
  });
}

// Fetches the raw bytes for an attachment with the auth header attached
// and returns a blob: URL that an <img> can render. Cleans up on unmount.
// Mirrors the trick used by PrescriptionViewer for the PDF.
export function useAttachmentImage(appointmentId: number, attachmentId: number): {
  url: string | null;
  error: ApiError | null;
} {
  const { session } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    (async () => {
      try {
        // GET, so no CSRF echo needed; cookies ride along.
        const res = await fetch(
          `${API_URL}/appointments/${appointmentId}/attachments/${attachmentId}`,
          { credentials: "include" },
        );
        if (!res.ok) {
          const { ApiError } = await import("@/lib/api");
          const rid = res.headers.get("X-Request-ID") ?? undefined;
          throw new ApiError(res.status, `attachment_${res.status}`, undefined, rid);
        }
        const blob = await res.blob();
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setUrl(created);
      } catch (e) {
        if (!cancelled) setError(e as ApiError);
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
    // Refetch when the user changes (login/logout).
  }, [appointmentId, attachmentId, session]);

  return { url, error };
}

// ── First-run setup wizard (public; gated by SetupRequiredMiddleware) ─

// /setup/status is callable in any state — pre-init returns {initialized:false}
// and the wizard renders; post-init returns {initialized:true} and the wizard
// bounces to /login. Stable for ~10 s so a refresh in the middle of the wizard
// does not re-hit the backend.
export function useSetupStatus() {
  return useQuery({
    queryKey: ["setup", "status"],
    queryFn: () => api<SetupStatusResponse>("/setup/status"),
    staleTime: 10_000,
  });
}

export function useVerifySetupToken() {
  return useMutation({
    // skipAuthRedirect: a bad / consumed token returns 401 setup_token_invalid;
    // the wizard wants to display that inline, not bounce to /login.
    mutationFn: (body: VerifySetupTokenRequest) =>
      api<VerifySetupTokenResponse>("/setup/verify-token", {
        method: "POST",
        body,
        skipAuthRedirect: true,
      }),
  });
}

// /setup/initialize authenticates via Authorization: Bearer <jwt>, using
// the setup-session token the wizard captured from verify-token's
// response body. No cookies are involved — the JWT lives in React state
// for the lifetime of stage 2. skipAuthRedirect lets an expired bearer
// surface as a catchable error instead of a /login bounce.
export function useInitializeSystem() {
  return useMutation({
    mutationFn: ({
      body,
      setupSessionToken,
    }: {
      body: InitializeSystemRequest;
      setupSessionToken: string;
    }) =>
      api<InitializeSystemResponse>("/setup/initialize", {
        method: "POST",
        body,
        auth: setupSessionToken,
        skipAuthRedirect: true,
      }),
  });
}

// ── Sys-admin ─────────────────────────────────────────────────────────

export function useSystemConfig() {
  const fetcher = useAuthedApi();
  return useQuery({
    queryKey: ["sysadmin", "system-config"],
    queryFn: () => fetcher<SystemConfig>("/sysadmin/system-config"),
  });
}

// The signed-in ops account + its editable profile. Powers the System
// page's self-account section (the sys-admin isn't on the roster below).
export function useSysadminMe() {
  const fetcher = useAuthedApi();
  return useQuery({
    queryKey: ["sysadmin", "me"],
    queryFn: () => fetcher<SysadminMe>("/sysadmin/me"),
  });
}

// Roster of every account EXCEPT the ops account. Manageable rows (admin /
// healthworker) get full controls; doctors are read-only (managed via the
// shared doctor tools).
export function useAccountRoster() {
  const fetcher = useAuthedApi();
  return useQuery({
    queryKey: ["sysadmin", "accounts"],
    queryFn: () => fetcher<AccountRosterEntry[]>("/sysadmin/accounts"),
  });
}

export function useCreateOperatingAccount() {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateOperatingAccountRequest) =>
      fetcher<CreateOperatingAccountResponse>("/sysadmin/accounts", {
        method: "POST",
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sysadmin", "accounts"] }),
  });
}

// Edit an operating account's ops-managed profile (display name, contact).
export function useUpdateAccount() {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<AccountRosterEntry, ApiError, { username: string; body: AccountUpdateRequest }>({
    mutationFn: ({ username, body }) =>
      fetcher(`/sysadmin/accounts/${encodeURIComponent(username)}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sysadmin", "accounts"] }),
  });
}

// Sys-admin sets a new password for an operating account. The account
// owner is told the new secret out-of-band (operating accounts carry no
// email). Returns void (204).
export function useResetAccountPassword() {
  const fetcher = useAuthedApi();
  return useMutation<void, ApiError, { username: string; password: string }>({
    mutationFn: ({ username, password }) =>
      fetcher(`/sysadmin/accounts/${encodeURIComponent(username)}/reset-password`, {
        method: "POST",
        body: { password } satisfies ResetAccountPasswordRequest,
      }),
  });
}

// Soft-disable / re-enable. Disable blocks login while preserving every
// record the account created; both are idempotent server-side.
export function useDisableAccount() {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<AccountRosterEntry, ApiError, string>({
    mutationFn: (username) =>
      fetcher(`/sysadmin/accounts/${encodeURIComponent(username)}/disable`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sysadmin", "accounts"] }),
  });
}

export function useEnableAccount() {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<AccountRosterEntry, ApiError, string>({
    mutationFn: (username) =>
      fetcher(`/sysadmin/accounts/${encodeURIComponent(username)}/enable`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sysadmin", "accounts"] }),
  });
}

// Hard-delete an operating account. Fails with `account_in_use` (409) if
// the account is FK-referenced by data it created — disable it instead.
export function useDeleteAccount() {
  const fetcher = useAuthedApi();
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (username) =>
      fetcher(`/sysadmin/accounts/${encodeURIComponent(username)}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sysadmin", "accounts"] }),
  });
}

// ── Capture sessions (phone-as-camera via QR) ────────────────────────

// Mint a capture session. The response carries the raw token (shown once,
// inside the QR) so the desktop can build the scannable link.
export function useCreateCaptureSession() {
  const fetcher = useAuthedApi();
  return useMutation<
    CaptureSession,
    ApiError,
    { purpose: CapturePurpose; appointmentId?: number }
  >({
    mutationFn: (body) =>
      fetcher<CaptureSession>("/capture/sessions", { method: "POST", body }),
  });
}

// Poll a capture session's status while the QR modal is open. `intervalMs`
// drives the refetch cadence; pass enabled=false to stop polling (e.g. once
// the modal closes or the session lapses).
export function useCaptureSessionStatus(
  sessionId: number | null,
  { enabled = true, intervalMs = 2500 }: { enabled?: boolean; intervalMs?: number } = {},
) {
  const fetcher = useAuthedApi();
  return useQuery<CaptureSessionStatus, ApiError>({
    queryKey: ["capture", "session", sessionId],
    queryFn: () => fetcher<CaptureSessionStatus>(`/capture/sessions/${sessionId}`),
    enabled: enabled && sessionId != null,
    refetchInterval: enabled ? intervalMs : false,
    // Status is inherently live — never serve a stale cached value.
    staleTime: 0,
    gcTime: 0,
  });
}

