"use client";

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import * as ApiClients from "@/gen/clients";
import * as ApiQueries from "@/gen/query";

import { API_URL, ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { generatedApiClient } from "@/lib/generated-api-client";

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
  ConsultationDraftResponse,
  AccountRosterEntry,
  AccountUpdateRequest,
  CreateOperatingAccountRequest,
  CreateOperatingAccountResponse,
  ResetAccountPasswordRequest,
  DiagnosisEntry,
  Doctor,
  DoctorInvite,
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
  Health,
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
  SystemConfigUpdateRequest,
  VerifySetupTokenRequest,
  VerifySetupTokenResponse,
} from "@/types/api";

// Kubb owns each query function; application keys stay stable because domain
// mutations invalidate groups spanning several OpenAPI operations. The shared
// client normalizes Kubb ResponseError values to ApiError at runtime, so this is
// the single type boundary between generated factories and application hooks.
function useGeneratedQuery<TData>(generated: unknown, overrides: UseQueryOptions<TData, ApiError>) {
  const generatedOptions = generated as UseQueryOptions<TData, ApiError>;
  return useQuery<TData, ApiError>({ ...generatedOptions, ...overrides });
}

// ── Meta ─────────────────────────────────────────────────────────────
// Version footer data. The plain liveness probe only — never ?full=true —
// so the footer can't be talked into hammering Postgres/S3. Version is
// immutable for the life of the container, so one fetch per browser
// session is enough; a dead backend just means no footer (retry: false,
// callers render null on error).
export function useHealth() {
  const generated = ApiQueries.healthHealthGetQueryOptions({}, { client: generatedApiClient });
  return useGeneratedQuery<Health>(generated, {
    queryKey: ["health"],
    staleTime: Infinity,
    retry: false,
  });
}

// ── Patients ─────────────────────────────────────────────────────────
export function usePatientList(params: { search?: string; page?: number }) {
  const search = params.search?.trim() || "";
  const page = params.page ?? 1;
  const generated = ApiQueries.listPatientsPatientsGetQueryOptions(
    { query: { search: search || undefined, page } },
    { client: generatedApiClient },
  );
  return useGeneratedQuery<PatientListResponse>(generated, {
    queryKey: ["patients", "list", { search, page }],
  });
}

// `GET /patients/{id}` returns both the demographics and the profile JSONB —
// we expose both so the patient detail page can render the intake form summary
// without a second round trip.
export function usePatient(id: number | null, opts?: { enabled?: boolean }) {
  const generated = ApiQueries.getPatientPatientsPatientIdGetQueryOptions(
    { path: { patient_id: id ?? 0 } },
    { client: generatedApiClient },
  );
  return useGeneratedQuery<{ patient: Patient; profile: Profile | null }>(generated, {
    queryKey: ["patients", id],
    enabled: !!id && (opts?.enabled ?? true),
  });
}

export function useUpsertProfile(patientId: number) {
  const qc = useQueryClient();
  return useMutation<Profile, ApiError, ProfileRequest>({
    mutationFn: async (body) => {
      const { data } = await ApiClients.upsertProfilePatientsPatientIdProfilePut({
        client: generatedApiClient,
        path: { patient_id: patientId },
        body,
      });
      return data as Profile;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients", patientId] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

export function usePatientHistory(id: number | null) {
  const generated = ApiQueries.patientHistoryPatientsPatientIdHistoryGetQueryOptions(
    { path: { patient_id: id ?? 0 } },
    { client: generatedApiClient },
  );
  return useGeneratedQuery<PatientHistory>(generated, {
    queryKey: ["patients", id, "history"],
    enabled: !!id,
  });
}

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation<PatientCreateResponse, ApiError, PatientCreateRequest>({
    mutationFn: async (body) => {
      const { data } = await ApiClients.createPatientPatientsPost({
        client: generatedApiClient,
        body,
      });
      return data as PatientCreateResponse;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patients", "list"] }),
  });
}

export function useUpdatePatient(id: number) {
  const qc = useQueryClient();
  return useMutation<Patient, ApiError, PatientUpdateRequest>({
    mutationFn: async (body) => {
      const { data } = await ApiClients.updatePatientPatientsPatientIdPatch({
        client: generatedApiClient,
        path: { patient_id: id },
        body,
      });
      return data as Patient;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients", id] });
      qc.invalidateQueries({ queryKey: ["patients", "list"] });
    },
  });
}

export function useDeletePatient() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: async (id) => {
      await ApiClients.deletePatientPatientsPatientIdDelete({
        client: generatedApiClient,
        path: { patient_id: id },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patients"] }),
  });
}

export function useReConsent(patientId: number) {
  const qc = useQueryClient();
  return useMutation<ReConsentResponse, ApiError, ReConsentRequest>({
    mutationFn: async (body) => {
      const { data } = await ApiClients.reConsentPatientsPatientIdConsentsPost({
        client: generatedApiClient,
        path: { patient_id: patientId },
        body: { ...body, scope: "master" },
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients", patientId] });
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
  const generated = ApiQueries.listDoctorsDoctorsGetQueryOptions(
    { query: { active: opts?.active, status: opts?.status } },
    { client: generatedApiClient },
  );
  return useGeneratedQuery<Doctor[]>(generated, {
    queryKey: ["doctors", "list", opts ?? {}],
  });
}

// Per-status counts for the approval-queue tab badges (admin only).
export function useDoctorSummary() {
  const generated = ApiQueries.doctorSummaryDoctorsSummaryGetQueryOptions(
    {},
    { client: generatedApiClient },
  );
  return useGeneratedQuery<DoctorSummary>(generated, {
    queryKey: ["doctors", "summary"],
  });
}

export function useDoctor(id: number | null) {
  const generated = ApiQueries.getDoctorDoctorsDoctorIdGetQueryOptions(
    { path: { doctor_id: id ?? 0 } },
    { client: generatedApiClient },
  );
  return useGeneratedQuery<Doctor>(generated, {
    queryKey: ["doctors", id],
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
  // Institute phone is optional.
  instituteContact?: string;
  rubberStampImage: string; // base64 (data: URL prefix accepted by backend)
  // Optional saved e-signature, base64 data URL. Lets the doctor skip
  // drawing a signature on every consultation.
  defaultSignatureImage?: string;
};

export function useCreateDoctor() {
  const qc = useQueryClient();
  return useMutation<Doctor, ApiError, DoctorCreateRequest>({
    mutationFn: async (body) => {
      const { data } = await ApiClients.createDoctorDoctorsPost({
        client: generatedApiClient,
        body,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

export type DoctorUpdateRequest = Partial<DoctorCreateRequest> & {
  active?: boolean;
  clearDefaultSignature?: boolean;
};

export function useUpdateDoctor(id: number) {
  const qc = useQueryClient();
  return useMutation<Doctor, ApiError, DoctorUpdateRequest>({
    mutationFn: async (body) => {
      const { data } = await ApiClients.updateDoctorDoctorsDoctorIdPatch({
        client: generatedApiClient,
        path: { doctor_id: id },
        body,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

// Fires the doctor invite email again. Any prior live invite for the same
// doctor is revoked inside the backend `services.doctor_invites.issue()`,
// so the old link stops working as soon as this resolves.
export function useReissueDoctorInvite() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: async (id) => {
      await ApiClients.reissueInviteDoctorsDoctorIdInvitesPost({
        client: generatedApiClient,
        path: { doctor_id: id },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

// Invite-by-email: admin types just the email and (optionally) a name
// hint. No Doctor row is created server-side until the doctor consumes
// the invite via the public onboarding form.
export type DoctorInviteRequest = { email: string; familyName?: string };
export type DoctorInviteResponse = { inviteId: number; email: string };

export function useInviteDoctor() {
  const qc = useQueryClient();
  return useMutation<DoctorInviteResponse, ApiError, DoctorInviteRequest>({
    mutationFn: async (body) => {
      const { data } = await ApiClients.inviteNewDoctorDoctorsInvitesPost({
        client: generatedApiClient,
        body,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doctor-invites"] });
      qc.invalidateQueries({ queryKey: ["doctors"] });
    },
  });
}

// Open email-only invites for the admin queue's "Invited" tab. These live in
// doctor_invites (no Doctor row yet), so they get their own query key —
// resend/revoke invalidate both it and ["doctors"] so the tab badges stay in
// sync with the per-status counts.
export function useDoctorInvites() {
  const generated = ApiQueries.listOpenInvitesDoctorsInvitesGetQueryOptions(
    {},
    { client: generatedApiClient },
  );
  return useGeneratedQuery<DoctorInvite[]>(generated, {
    queryKey: ["doctor-invites"],
  });
}

// Re-issue + re-send an open invite. The previous link dies; a 409
// `email_already_used` means the doctor has since onboarded (refresh to see
// them under "Awaiting approval").
export function useResendDoctorInvite() {
  const qc = useQueryClient();
  return useMutation<DoctorInvite, ApiError, number>({
    mutationFn: async (inviteId) => {
      const { data } = await ApiClients.resendOpenInviteDoctorsInvitesInviteIdResendPost({
        client: generatedApiClient,
        path: { invite_id: inviteId },
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doctor-invites"] });
      qc.invalidateQueries({ queryKey: ["doctors"] });
    },
  });
}

// Revoke an open invite (kills the link, drops it from the list).
export function useRevokeDoctorInvite() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: async (inviteId) => {
      await ApiClients.revokeOpenInviteDoctorsInvitesInviteIdDelete({
        client: generatedApiClient,
        path: { invite_id: inviteId },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doctor-invites"] });
      qc.invalidateQueries({ queryKey: ["doctors"] });
    },
  });
}

// Approve / reject a self-onboarded doctor. Approve flips status →
// "active". Reject stamps rejected_at + sets active=false; supply a
// reason that's surfaced on the rejected doctor's login screen.
export function useApproveDoctor() {
  const qc = useQueryClient();
  return useMutation<Doctor, ApiError, number>({
    mutationFn: async (id) => {
      const { data } = await ApiClients.approveDoctorDoctorsDoctorIdApprovePost({
        client: generatedApiClient,
        path: { doctor_id: id },
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

export function useRejectDoctor() {
  const qc = useQueryClient();
  return useMutation<Doctor, ApiError, { id: number; reason?: string }>({
    mutationFn: async ({ id, reason }) => {
      const { data } = await ApiClients.rejectDoctorDoctorsDoctorIdRejectPost({
        client: generatedApiClient,
        path: { doctor_id: id },
        body: { reason },
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

// Invite a rejected doctor to reapply with the same email. Issues a fresh
// full-profile (new-doctor) invite; the rejected row is preserved as
// history and the new submission links back to it via previousDoctorId.
export function useReinviteReapply() {
  const qc = useQueryClient();
  return useMutation<{ inviteId: number; email: string }, ApiError, number>({
    mutationFn: async (id) => {
      const { data } = await ApiClients.reinviteReapplyDoctorsDoctorIdReinviteReapplyPost({
        client: generatedApiClient,
        path: { doctor_id: id },
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

// Hard-delete a rejected doctor record (right-to-erasure). Backend
// refuses anything that isn't in the rejected state.
export function usePurgeDoctor() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: async (id) => {
      await ApiClients.purgeDoctorDoctorsDoctorIdPurgeDelete({
        client: generatedApiClient,
        path: { doctor_id: id },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

// Soft-delete — backend sets active=false, preserves FK references on past
// appointments / consultations.
export function useDeactivateDoctor() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: async (id) => {
      await ApiClients.deleteDoctorDoctorsDoctorIdDelete({
        client: generatedApiClient,
        path: { doctor_id: id },
      });
    },
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
  const generated = ApiQueries.listAppointmentsAppointmentsGetQueryOptions(
    { query: params },
    { client: generatedApiClient },
  );
  return useGeneratedQuery<CalendarAppointment[]>(generated, {
    queryKey: ["appointments", "list", params],
  });
}

export function useAppointment(id: number | null) {
  const generated = ApiQueries.getAppointmentAppointmentsApptIdGetQueryOptions(
    { path: { appt_id: id ?? 0 } },
    { client: generatedApiClient },
  );
  return useGeneratedQuery<AppointmentDetail>(generated, {
    queryKey: ["appointments", id],
    enabled: !!id,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation<
    Appointment,
    ApiError,
    { patientId: number; doctorId: number; scheduledAt: string }
  >({
    mutationFn: async (body) => {
      const { data } = await ApiClients.createAppointmentAppointmentsPost({
        client: generatedApiClient,
        body,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments", "list"] }),
  });
}

export function useUpdateAppointment(id: number) {
  const qc = useQueryClient();
  return useMutation<Appointment, ApiError, { doctorId?: number; scheduledAt?: string }>({
    mutationFn: async (body) => {
      const { data } = await ApiClients.updateAppointmentAppointmentsApptIdPatch({
        client: generatedApiClient,
        path: { appt_id: id },
        body,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments", id] });
      qc.invalidateQueries({ queryKey: ["appointments", "list"] });
    },
  });
}

export function useCancelAppointment(id: number) {
  const qc = useQueryClient();
  return useMutation<AppointmentCancelResponse, ApiError, AppointmentCancelRequest>({
    mutationFn: async (body) => {
      const { data } = await ApiClients.cancelAppointmentAppointmentsApptIdCancelPost({
        client: generatedApiClient,
        path: { appt_id: id },
        body,
      });
      return data as AppointmentCancelResponse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments", id] });
      qc.invalidateQueries({ queryKey: ["appointments", "list"] });
      qc.invalidateQueries({ queryKey: ["queue"] });
    },
  });
}

// ── Consent + preconsult + meeting transitions ───────────────────────
export function useRecordSessionConsent(appointmentId: number) {
  const qc = useQueryClient();
  return useMutation<SessionConsentResponse, ApiError, SessionConsentRequest>({
    mutationFn: async (body) => {
      const { data } = await ApiClients.recordSessionConsentAppointmentsApptIdConsentPost({
        client: generatedApiClient,
        path: { appt_id: appointmentId },
        body: { ...body, scope: "session" },
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments", appointmentId] }),
  });
}

export function useGetSessionConsent(appointmentId: number | null) {
  const generated = ApiQueries.getSessionConsentAppointmentsApptIdConsentGetQueryOptions(
    { path: { appt_id: appointmentId ?? 0 } },
    { client: generatedApiClient },
  );
  return useGeneratedQuery<Consent | null>(generated, {
    queryKey: ["appointments", appointmentId, "consent"],
    enabled: !!appointmentId,
  });
}

export function useUpsertPreconsult(appointmentId: number) {
  const qc = useQueryClient();
  return useMutation<
    { preconsult: Preconsult; appointment: Appointment },
    ApiError,
    PreconsultRequest
  >({
    mutationFn: async (body) => {
      const { data } = await ApiClients.upsertPreconsultAppointmentsApptIdPreconsultPut({
        client: generatedApiClient,
        path: { appt_id: appointmentId },
        body,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments", appointmentId] }),
  });
}

export function useStartMeeting(appointmentId: number) {
  const qc = useQueryClient();
  return useMutation<StartMeetingResponse, ApiError, void>({
    mutationFn: async () => {
      const { data } = await ApiClients.startMeetingAppointmentsApptIdStartMeetingPost({
        client: generatedApiClient,
        path: { appt_id: appointmentId },
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments", appointmentId] }),
  });
}

export function useEndMeeting(appointmentId: number) {
  const qc = useQueryClient();
  return useMutation<Appointment, ApiError, void>({
    mutationFn: async () => {
      const { data } = await ApiClients.endMeetingAppointmentsApptIdEndMeetingPost({
        client: generatedApiClient,
        path: { appt_id: appointmentId },
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments", appointmentId] }),
  });
}

// Mints a fresh LiveKit JWT for the current user — used by the doctor join
// button and by the healthworker re-open path after a page reload, where
// `useStartMeeting`'s response is no longer in memory. No state change.
export function useMeetingToken(appointmentId: number) {
  return useMutation<MeetingTokenResponse, ApiError, void>({
    mutationFn: async () => {
      const { data } = await ApiClients.meetingTokenAppointmentsApptIdMeetingTokenPost({
        client: generatedApiClient,
        path: { appt_id: appointmentId },
      });
      return data;
    },
  });
}

// ── Consultation (doctor flow) ───────────────────────────────────────
export function useCreateOrGetDraft() {
  const qc = useQueryClient();
  return useMutation<ConsultationDraftResponse, ApiError, number>({
    mutationFn: async (appointmentId) => {
      const { data } = await ApiClients.createOrGetDraftAppointmentsApptIdConsultationDraftPost({
        client: generatedApiClient,
        path: { appt_id: appointmentId },
      });
      return data as ConsultationDraftResponse;
    },
    onSuccess: (_data, appointmentId) =>
      qc.invalidateQueries({ queryKey: ["appointments", appointmentId] }),
  });
}

export function useConsultation(consultationId: number | null) {
  const generated = ApiQueries.getConsultationConsultationsCidGetQueryOptions(
    { path: { cid: consultationId ?? 0 } },
    { client: generatedApiClient },
  );
  return useGeneratedQuery<Consultation>(generated, {
    queryKey: ["consultations", consultationId],
    enabled: !!consultationId,
    staleTime: 0,
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
  const qc = useQueryClient();
  return useMutation<Consultation, ApiError, ConsultationPatch>({
    mutationFn: async (body) => {
      const { data } = await ApiClients.patchConsultationConsultationsCidPatch({
        client: generatedApiClient,
        path: { cid: consultationId },
        body,
      });
      return data as Consultation;
    },
    onSuccess: (data) => {
      qc.setQueryData(["consultations", consultationId], data);
      qc.invalidateQueries({ queryKey: ["appointments", data.appointmentId] });
    },
  });
}

// Re-export under the historical name so existing callers keep compiling.
export type SubmitConsultationResponse = TSubmitConsultationResponse;

export function useSubmitConsultation(consultationId: number) {
  const qc = useQueryClient();
  return useMutation<SubmitConsultationResponse, ApiError, SubmitConsultationRequest>({
    mutationFn: async (body) => {
      const { data } = await ApiClients.submitConsultationConsultationsCidSubmitPost({
        client: generatedApiClient,
        path: { cid: consultationId },
        body,
      });
      return data as SubmitConsultationResponse;
    },
    onSuccess: (res) => {
      qc.setQueryData(["consultations", consultationId], res.consultation);
      qc.invalidateQueries({ queryKey: ["appointments", res.appointment.id] });
      qc.invalidateQueries({ queryKey: ["appointments", "list"] });
      if (res.followUpQueueEntry) qc.invalidateQueries({ queryKey: ["queue"] });
      if (res.followUpAppointment) {
        qc.invalidateQueries({ queryKey: ["appointments", res.followUpAppointment.id] });
      }
    },
  });
}

// The calling doctor's own profile, straight from GET /doctors/me. Backend
// availability endpoints take a doctor_id in the path, and the consultation
// flow needs hasDefaultSignature, so the doctor's own pages lean on this.
// Only enabled for doctor sessions (the endpoint is doctor-only).
export function useCurrentDoctor() {
  const { session } = useAuth();
  const generated = ApiQueries.getMeDoctorsMeGetQueryOptions({}, { client: generatedApiClient });
  const query = useGeneratedQuery<Doctor>(generated, {
    queryKey: ["doctors", "me"],
    enabled: session?.role === "doctor",
  });
  return {
    doctor: query.data ?? null,
    hasDefaultSignature: query.data?.hasDefaultSignature ?? false,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// Absolute URL streaming the calling doctor's saved e-signature PNG. Used as
// an <img src>; the cookie is sent automatically (same-origin / credentials).
// A cache-busting param is the caller's job after a replace.
export const MY_SIGNATURE_URL = `${API_URL}/doctors/me/signature`;

// Same, for the calling doctor's rubber stamp image. Streamed rather than
// inlined into /doctors/me so the doctor's every-page profile fetch stays lean.
export const MY_STAMP_URL = `${API_URL}/doctors/me/stamp`;

export type DoctorSelfUpdateRequest = {
  contact?: string;
  qualifications?: string;
  practitionerAddress?: string;
  instituteName?: string;
  instituteContact?: string;
  rubberStampImage?: string;
  defaultSignatureImage?: string;
  clearDefaultSignature?: boolean;
};

// Doctor self-service profile edit (PATCH /doctors/me). Invalidates the
// cached "me" profile (and the doctor list, which the admin views share).
export function useUpdateMyProfile() {
  const qc = useQueryClient();
  return useMutation<Doctor, ApiError, DoctorSelfUpdateRequest>({
    mutationFn: async (body) => {
      const { data } = await ApiClients.updateMeDoctorsMePatch({
        client: generatedApiClient,
        body,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

// ── Doctor availability ──────────────────────────────────────────────
export function useDoctorAvailability(
  doctorId: number | null,
  range: { from?: string; to?: string },
  opts?: { enabled?: boolean },
) {
  const generated = ApiQueries.listDoctorAvailabilityDoctorsDoctorIdAvailabilityGetQueryOptions(
    { path: { doctor_id: doctorId ?? 0 }, query: range },
    { client: generatedApiClient },
  );
  return useGeneratedQuery<Availability[]>(generated, {
    queryKey: ["availability", "doctor", doctorId, range],
    enabled: !!doctorId && (opts?.enabled ?? true),
  });
}

// Cross-doctor list — for HW booking calendars / multi-doctor planners.
// Doctors get scoped to their own id server-side; admin/HW see everyone.
export function useAvailabilityList(params: { from?: string; to?: string; doctorId?: number }) {
  const generated = ApiQueries.listAvailabilityAvailabilityGetQueryOptions(
    { query: params },
    { client: generatedApiClient },
  );
  return useGeneratedQuery<Availability[]>(generated, {
    queryKey: ["availability", "list", params],
  });
}

export function useCreateAvailability(doctorId: number) {
  const qc = useQueryClient();
  return useMutation<Availability, ApiError, AvailabilityCreateRequest>({
    mutationFn: async (body) => {
      const { data } = await ApiClients.createAvailabilityDoctorsDoctorIdAvailabilityPost({
        client: generatedApiClient,
        path: { doctor_id: doctorId },
        body,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["availability"] }),
  });
}

export function useBulkCreateAvailability(doctorId: number) {
  const qc = useQueryClient();
  return useMutation<Availability[], ApiError, AvailabilityBulkCreateRequest>({
    mutationFn: async (body) => {
      const { data } = await ApiClients.createAvailabilityBulkDoctorsDoctorIdAvailabilityBulkPost({
        client: generatedApiClient,
        path: { doctor_id: doctorId },
        body,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["availability"] }),
  });
}

export function useUpdateAvailability() {
  const qc = useQueryClient();
  return useMutation<Availability, ApiError, { id: number; body: AvailabilityUpdateRequest }>({
    mutationFn: async ({ id, body }) => {
      const { data } = await ApiClients.updateAvailabilityAvailabilityAidPatch({
        client: generatedApiClient,
        path: { aid: id },
        body,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["availability"] }),
  });
}

export function useDeleteAvailability() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: async (id) => {
      await ApiClients.deleteAvailabilityAvailabilityAidDelete({
        client: generatedApiClient,
        path: { aid: id },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["availability"] }),
  });
}

// Atomic "wipe a doctor's windows in a date range" — used by the week-grid
// save flow to replace a whole week's windows in one call.
export function useDeleteAvailabilityRange(doctorId: number) {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { from: string; to: string }>({
    mutationFn: async (query) => {
      await ApiClients.deleteDoctorAvailabilityRangeDoctorsDoctorIdAvailabilityDelete({
        client: generatedApiClient,
        path: { doctor_id: doctorId },
        query,
      });
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
  const generated = ApiQueries.listQueueQueueGetQueryOptions(
    { query: params },
    { client: generatedApiClient },
  );
  return useGeneratedQuery<QueueEntry[]>(generated, {
    queryKey: ["queue", "list", params],
  });
}

export function useQueueEntry(id: number | null) {
  const generated = ApiQueries.getQueueEntryQueueQidGetQueryOptions(
    { path: { qid: id ?? 0 } },
    { client: generatedApiClient },
  );
  return useGeneratedQuery<QueueEntry>(generated, {
    queryKey: ["queue", id],
    enabled: !!id,
  });
}

export function useCreateQueueEntry() {
  const qc = useQueryClient();
  return useMutation<QueueEntry, ApiError, QueueEntryCreateRequest>({
    mutationFn: async (body) => {
      const { data } = await ApiClients.createQueueEntryQueuePost({
        client: generatedApiClient,
        body,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["queue"] }),
  });
}

export function useUpdateQueueEntry(id: number) {
  const qc = useQueryClient();
  return useMutation<QueueEntry, ApiError, QueueEntryUpdateRequest>({
    mutationFn: async (body) => {
      const { data } = await ApiClients.updateQueueEntryQueueQidPatch({
        client: generatedApiClient,
        path: { qid: id },
        body,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["queue"] }),
  });
}

export function useBookQueueEntry(id: number) {
  const qc = useQueryClient();
  return useMutation<QueueBookResponse, ApiError, QueueBookRequest>({
    mutationFn: async (body) => {
      const { data } = await ApiClients.bookQueueEntryQueueQidBookPost({
        client: generatedApiClient,
        path: { qid: id },
        body,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["queue"] });
      qc.invalidateQueries({ queryKey: ["appointments", "list"] });
    },
  });
}

export function useCancelQueueEntry(id: number) {
  const qc = useQueryClient();
  return useMutation<QueueEntry, ApiError, QueueCancelRequest>({
    mutationFn: async (body) => {
      const { data } = await ApiClients.cancelQueueEntryQueueQidCancelPost({
        client: generatedApiClient,
        path: { qid: id },
        body,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["queue"] }),
  });
}

// ── Prescription PDF ─────────────────────────────────────────────────
// Returns a typed Blob; callers hand it to URL.createObjectURL().
export function usePrescriptionPdf(
  appointmentId: number | null,
  opts?: UseQueryOptions<Blob, ApiError>,
) {
  const generated = ApiQueries.getSummaryPdfAppointmentsApptIdSummaryPdfGetQueryOptions(
    { path: { appt_id: appointmentId ?? 0 } },
    { client: generatedApiClient },
  );
  return useGeneratedQuery<Blob>(generated, {
    queryKey: ["appointments", appointmentId, "summary.pdf"],
    enabled: !!appointmentId,
    staleTime: Infinity,
    ...opts,
  });
}

// ── Attachments (HW photos for an appointment) ───────────────────────

export function useAttachments(appointmentId: number | null) {
  const generated = ApiQueries.listAttachmentsAppointmentsApptIdAttachmentsGetQueryOptions(
    { path: { appt_id: appointmentId ?? 0 } },
    { client: generatedApiClient },
  );
  return useGeneratedQuery<AttachmentMeta[]>(generated, {
    queryKey: ["appointments", appointmentId, "attachments"],
    enabled: !!appointmentId,
    staleTime: 30_000,
  });
}

export function useUploadAttachment(appointmentId: number) {
  const qc = useQueryClient();
  return useMutation<AttachmentMeta, ApiError, { file: File; caption?: string }>({
    mutationFn: async ({ file, caption }) => {
      const { data } = await ApiClients.uploadAttachmentAppointmentsApptIdAttachmentsPost({
        client: generatedApiClient,
        path: { appt_id: appointmentId },
        body: { file, caption },
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments", appointmentId, "attachments"] });
      qc.invalidateQueries({ queryKey: ["appointments", appointmentId] });
    },
  });
}

export function useDeleteAttachment(appointmentId: number) {
  const qc = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: async (attachmentId) => {
      await ApiClients.deleteAttachmentAppointmentsApptIdAttachmentsAttachmentIdDelete({
        client: generatedApiClient,
        path: { appt_id: appointmentId, attachment_id: attachmentId },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments", appointmentId, "attachments"] });
      qc.invalidateQueries({ queryKey: ["appointments", appointmentId] });
    },
  });
}

export function useUpdateAttachment(appointmentId: number) {
  const qc = useQueryClient();
  return useMutation<AttachmentMeta, ApiError, { id: number; caption: string | null }>({
    mutationFn: async ({ id, caption }) => {
      const { data } =
        await ApiClients.updateAttachmentAppointmentsApptIdAttachmentsAttachmentIdPatch({
          client: generatedApiClient,
          path: { appt_id: appointmentId, attachment_id: id },
          body: { caption },
        });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments", appointmentId, "attachments"] });
      qc.invalidateQueries({ queryKey: ["appointments", appointmentId] });
    },
  });
}

// Fetches the raw bytes for an attachment with the auth header attached
// and returns a blob: URL that an <img> can render. Cleans up on unmount.
// Mirrors the trick used by PrescriptionViewer for the PDF.
//
// Errors come back as catalog-real codes (the body's code when present, a
// status fallback otherwise) so thumbnails can render explainError() copy —
// not a hardcoded "Load failed" — and `retry` re-runs the fetch without
// remounting the surrounding panel.
export function useAttachmentImage(
  appointmentId: number,
  attachmentId: number,
): {
  url: string | null;
  error: ApiError | null;
  retry: () => void;
} {
  const { session } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is a retry trigger and `session` re-fetches on login/logout; neither is read in the body.
  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    void (async () => {
      try {
        const { data } =
          await ApiClients.streamAttachmentAppointmentsApptIdAttachmentsAttachmentIdGet({
            client: generatedApiClient,
            path: { appt_id: appointmentId, attachment_id: attachmentId },
          });
        if (cancelled) return;
        created = URL.createObjectURL(data);
        setUrl(created);
        setError(null);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught : new ApiError(0, "network_error"));
        }
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [appointmentId, attachmentId, session, attempt]);

  return { url, error, retry: () => setAttempt((value) => value + 1) };
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
  const generated = ApiQueries.systemConfigSysadminSystemConfigGetQueryOptions(
    {},
    { client: generatedApiClient },
  );
  return useGeneratedQuery<SystemConfig>(generated, {
    queryKey: ["sysadmin", "system-config"],
  });
}

export function useUpdateSystemConfig() {
  const qc = useQueryClient();
  return useMutation<SystemConfig, ApiError, SystemConfigUpdateRequest>({
    mutationFn: async (body) => {
      const { data } = await ApiClients.updateSystemConfigSysadminSystemConfigPatch({
        client: generatedApiClient,
        body,
      });
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(["sysadmin", "system-config"], data);
    },
  });
}

// The signed-in ops account + its editable profile. Powers the System
// page's self-account section (the sys-admin isn't on the roster below).
export function useSysadminMe() {
  const generated = ApiQueries.meSysadminMeGetQueryOptions({}, { client: generatedApiClient });
  return useGeneratedQuery<SysadminMe>(generated, {
    queryKey: ["sysadmin", "me"],
  });
}

// Roster of every account EXCEPT the ops account. Manageable rows (admin /
// healthworker) get full controls; doctors are read-only (managed via the
// shared doctor tools).
export function useAccountRoster() {
  const generated = ApiQueries.listAccountsAccountsGetQueryOptions(
    {},
    { client: generatedApiClient },
  );
  return useGeneratedQuery<AccountRosterEntry[]>(generated, {
    queryKey: ["sysadmin", "accounts"],
  });
}

export function useCreateOperatingAccount() {
  const qc = useQueryClient();
  return useMutation<CreateOperatingAccountResponse, ApiError, CreateOperatingAccountRequest>({
    mutationFn: async (body) => {
      const { data } = await ApiClients.createAccountAccountsPost({
        client: generatedApiClient,
        body,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sysadmin", "accounts"] }),
  });
}

// Edit an operating account's ops-managed profile (display name, contact).
export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation<
    AccountRosterEntry,
    ApiError,
    { username: string; body: AccountUpdateRequest }
  >({
    mutationFn: async ({ username, body }) => {
      const { data } = await ApiClients.updateAccountAccountsUsernamePatch({
        client: generatedApiClient,
        path: { username },
        body,
      });
      return data as AccountRosterEntry;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sysadmin", "accounts"] }),
  });
}

// Sys-admin sets a new password for an operating account. The account
// owner is told the new secret out-of-band (operating accounts carry no
// email). Returns void (204).
export function useResetAccountPassword() {
  return useMutation<void, ApiError, { username: string; password: string }>({
    mutationFn: async ({ username, password }) => {
      await ApiClients.resetPasswordAccountsUsernameResetPasswordPost({
        client: generatedApiClient,
        path: { username },
        body: { password } satisfies ResetAccountPasswordRequest,
      });
    },
  });
}

// Soft-disable / re-enable. Disable blocks login while preserving every
// record the account created; both are idempotent server-side.
export function useDisableAccount() {
  const qc = useQueryClient();
  return useMutation<AccountRosterEntry, ApiError, string>({
    mutationFn: async (username) => {
      const { data } = await ApiClients.disableAccountAccountsUsernameDisablePost({
        client: generatedApiClient,
        path: { username },
      });
      return data as AccountRosterEntry;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sysadmin", "accounts"] }),
  });
}

export function useEnableAccount() {
  const qc = useQueryClient();
  return useMutation<AccountRosterEntry, ApiError, string>({
    mutationFn: async (username) => {
      const { data } = await ApiClients.enableAccountAccountsUsernameEnablePost({
        client: generatedApiClient,
        path: { username },
      });
      return data as AccountRosterEntry;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sysadmin", "accounts"] }),
  });
}

// Hard-delete an operating account. Fails with `account_in_use` (409) if
// the account is FK-referenced by data it created — disable it instead.
export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: async (username) => {
      await ApiClients.deleteAccountAccountsUsernameDelete({
        client: generatedApiClient,
        path: { username },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sysadmin", "accounts"] }),
  });
}

// ── Capture sessions (phone-as-camera via QR) ────────────────────────

// Mint a capture session. The response carries the raw token (shown once,
// inside the QR) so the desktop can build the scannable link.
export function useCreateCaptureSession() {
  return useMutation<CaptureSession, ApiError, { purpose: CapturePurpose; appointmentId?: number }>(
    {
      mutationFn: async (body) => {
        const { data } = await ApiClients.createCaptureSessionCaptureSessionsPost({
          client: generatedApiClient,
          body,
        });
        return data;
      },
    },
  );
}

// Poll a capture session's status while the QR modal is open. `intervalMs`
// drives the refetch cadence; pass enabled=false to stop polling (e.g. once
// the modal closes or the session lapses).
export function useCaptureSessionStatus(
  sessionId: number | null,
  { enabled = true, intervalMs = 2500 }: { enabled?: boolean; intervalMs?: number } = {},
) {
  const generated = ApiQueries.captureSessionStatusCaptureSessionsSessionIdGetQueryOptions(
    { path: { session_id: sessionId ?? 0 } },
    { client: generatedApiClient },
  );
  return useGeneratedQuery<CaptureSessionStatus>(generated, {
    queryKey: ["capture", "session", sessionId],
    enabled: enabled && sessionId != null,
    refetchInterval: enabled ? intervalMs : false,
    staleTime: 0,
    gcTime: 0,
  });
}
