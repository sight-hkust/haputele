import { delay, http, HttpResponse, type RequestHandler } from "msw";
import type { Role } from "@/lib/auth";
import type {
  AppointmentStatus,
  Doctor,
  DoctorInvite,
  ConsultationDraftResponse,
  Patient,
  QueueEntry,
  Availability,
  AttachmentMeta,
  AccountRosterEntry,
} from "@/types/api";
import * as fixtures from "./fixtures";
import { demoMedicationsXlsx, demoPdf, demoPrescriptionZip } from "./downloads";

export type ScenarioOptions = {
  role?: Role | null;
  path?: string;
  signedOut?: boolean;
  empty?: boolean;
  error?: boolean;
  loading?: boolean;
  appointmentStatus?: AppointmentStatus;
  needsReconsent?: boolean;
  doctorStatus?: NonNullable<Doctor["onboardingStatus"]>;
  inviteMode?: "new" | "rotation" | "expired";
  initialized?: boolean;
  sessionConsent?: boolean;
  livekitUnavailable?: boolean;
  loginError?: string;
  captureExpired?: boolean;
};

const errorResponse = (code: string, status = 422) =>
  HttpResponse.json(
    { detail: { error: code, requestId: "storybook-synthetic-reference" } },
    { status, headers: { "X-Request-ID": "storybook-synthetic-reference" } },
  );
const imageResponse = (image: string) =>
  new HttpResponse(image, { headers: { "Content-Type": "image/svg+xml" } });
const binaryResponse = (bytes: Uint8Array, type: string, filename: string) =>
  new HttpResponse(new Blob([bytes as Uint8Array<ArrayBuffer>], { type }), {
    headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${filename}"` },
  });

// UI simulation only: the production backend remains the authority for ACLs,
// database constraints, signatures, conflict handling and all clinical rules.
export function createHandlers(options: ScenarioOptions = {}) {
  let role: Role | null = options.signedOut
    ? null
    : options.role === undefined
      ? "healthworker"
      : options.role;
  let initialized = options.initialized ?? true;
  const state = structuredClone({
    patients: options.empty ? ([] as Patient[]) : [fixtures.patient],
    profile: fixtures.profile,
    appointments: options.empty
      ? []
      : [
          {
            ...fixtures.appointment,
            status: options.appointmentStatus ?? fixtures.appointment.status,
          },
        ],
    consultation: {
      ...fixtures.consultation,
      status:
        options.appointmentStatus === "completed" ? ("completed" as const) : ("draft" as const),
      signedAt: options.appointmentStatus === "completed" ? fixtures.timestamp : null,
    },
    preconsult: options.appointmentStatus === "scheduled" ? null : fixtures.preconsult,
    sessionConsent:
      options.sessionConsent === false || options.appointmentStatus === "scheduled"
        ? null
        : fixtures.consent,
    masterConsentStatus: options.needsReconsent ? ("needs_reconsent" as const) : ("ok" as const),
    queue: options.empty
      ? ([] as QueueEntry[])
      : [
          fixtures.queueEntry,
          {
            ...fixtures.queueEntry,
            id: 2,
            source: "walk_in" as const,
            priority: "urgent" as const,
            notes: "Synthetic urgent walk-in",
          },
        ],
    doctors: options.empty
      ? ([] as Doctor[])
      : [
          {
            ...fixtures.doctor,
            onboardingStatus: options.doctorStatus ?? "active",
            active: !options.doctorStatus || options.doctorStatus === "active",
          },
          {
            ...fixtures.doctor,
            id: 2,
            username: "demo.applicant",
            givenName: "Kamala",
            familyName: "Fernando",
            email: "applicant@example.test",
            active: false,
            onboardingStatus: "awaiting_approval" as const,
            approvedAt: null,
          },
          {
            ...fixtures.doctor,
            id: 3,
            username: "demo.invited",
            givenName: "Sunil",
            familyName: "Jayasinghe",
            email: "invited@example.test",
            active: false,
            onboardingStatus: "awaiting_setup" as const,
          },
          {
            ...fixtures.doctor,
            id: 4,
            username: "demo.rejected",
            givenName: "Ruwan",
            familyName: "De Silva",
            email: "rejected@example.test",
            active: false,
            onboardingStatus: "rejected" as const,
            rejectedReason: "Synthetic application requires updated credentials",
          },
        ],
    availability: options.empty ? ([] as Availability[]) : [fixtures.availability],
    attachments: options.empty ? ([] as AttachmentMeta[]) : [fixtures.attachment],
    accounts: options.empty ? ([] as AccountRosterEntry[]) : fixtures.accounts,
    config: fixtures.systemConfig,
    invites: options.empty
      ? ([] as DoctorInvite[])
      : [
          {
            inviteId: 1,
            email: "new.doctor@example.test",
            familyName: "Fernando",
            createdAt: fixtures.timestamp,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            status: "invited" as const,
          },
        ],
  });
  let capturePurpose = "appointment_attachment";
  let captureClosed = false;
  let uploadCount = 0;
  const attachmentBytes = new Map<number, Blob>();
  const appointmentDetail = (id: number) => {
    const appointment = state.appointments.find((item) => item.id === id);
    if (!appointment) return null;
    return {
      appointment,
      patient: state.patients.find((p) => p.id === appointment.patientId) ?? fixtures.patient,
      profile: state.profile,
      preconsult: state.preconsult?.appointmentId === id ? state.preconsult : null,
      consultation:
        state.consultation.appointmentId === id &&
        ["awaiting_notes", "completed", "in_progress"].includes(appointment.status)
          ? state.consultation
          : null,
      masterConsentStatus: state.masterConsentStatus,
      attachments: state.attachments.filter((attachment) => attachment.appointmentId === id),
    };
  };

  return [
    http.all("/api/*", async ({ request }) => {
      const url = new URL(request.url);
      const path = url.pathname.slice(4);
      const method = request.method;
      const json = HttpResponse.json;
      const body = async () => (await request.json()) as Record<string, unknown>;
      const isBootstrap =
        path.startsWith("/auth/") || path.startsWith("/setup/") || path === "/health";
      if (!isBootstrap && options.loading) await delay("infinite");
      if (!isBootstrap && options.error) return errorResponse("request_failed", 503);

      if (path === "/health" && method === "GET")
        return json({
          status: "ok",
          uptime: 3600,
          version: "storybook",
          build_date: fixtures.timestamp,
          hostname: "isolated-preview",
          commit: "synthetic",
        });
      if (path === "/setup/status" && method === "GET") return json({ initialized });
      if (path === "/setup/verify-token" && method === "POST") {
        const input = await body();
        if (input.token !== "storybook-setup-token")
          return errorResponse("setup_token_invalid", 401);
        return json({
          setupSessionToken: "storybook-session",
          expiresAt: new Date(Date.now() + 900000).toISOString(),
        });
      }
      if (path === "/setup/initialize" && method === "POST") {
        const input = await body();
        initialized = true;
        role = "sys-admin";
        const admin = input.sysAdmin as { username?: string } | undefined;
        const institute = input.instituteIdentity as {
          name: string;
          addressLines: string[];
          contactPhone: string;
          contactEmail: string;
        };
        Object.assign(state.config, {
          instituteName: institute.name,
          instituteAddressLines: institute.addressLines,
          instituteContactPhone: institute.contactPhone,
          instituteContactEmail: institute.contactEmail,
          appTimezone: input.appTimezone,
          exportTimezone: input.exportTimezone,
          masterConsentVersion: input.masterConsentVersion,
        });
        return json({
          ok: true,
          username: admin?.username ?? "demo.sysadmin",
          role,
          expiresAt: new Date(Date.now() + 28800000).toISOString(),
        });
      }
      if (path === "/auth/me" && method === "GET")
        return role
          ? json({ username: `demo.${role.replace("-", "")}`, role })
          : errorResponse("unauthorized", 401);
      if (path === "/auth/login" && method === "POST") {
        if (options.loginError)
          return errorResponse(
            options.loginError,
            options.loginError === "invalid_credentials" ? 401 : 403,
          );
        const input = await body();
        role = options.role ?? "healthworker";
        return json({
          username: input.username,
          role,
          expiresAt: new Date(Date.now() + 28800000).toISOString(),
        });
      }
      if (path === "/auth/logout" && method === "POST") {
        role = null;
        return new HttpResponse(null, { status: 204 });
      }

      if (path === "/patients" && method === "GET") {
        const search = (url.searchParams.get("search") ?? "").toLowerCase();
        const patients = state.patients.filter((p) =>
          `${p.given} ${p.family} ${p.contact ?? ""} ${p.screeningRef ?? ""}`
            .toLowerCase()
            .includes(search),
        );
        return json({
          patients: url.searchParams.get("page") === "2" ? [] : patients,
          page: Number(url.searchParams.get("page") ?? 1),
        });
      }
      if (path === "/patients" && method === "POST") {
        const input = await body();
        const patient = { ...fixtures.patient, ...input, id: state.patients.length + 2 } as Patient;
        state.patients.push(patient);
        return json({
          patient,
          masterConsent: {
            ...fixtures.consent,
            scope: "master",
            patientId: patient.id,
            appointmentId: null,
          },
        });
      }
      const patientMatch = path.match(
        /^\/patients\/(\d+)(?:\/(profile|history|consultations|consents)(?:\/(revoke))?)?$/,
      );
      if (patientMatch) {
        const id = Number(patientMatch[1]);
        const patient = state.patients.find((p) => p.id === id);
        if (!patient) return errorResponse("patient_not_found", 404);
        const section = patientMatch[2];
        if (!section && method === "GET") return json({ patient, profile: state.profile });
        if (!section && method === "PATCH") {
          Object.assign(patient, await body());
          return json(patient);
        }
        if (!section && method === "DELETE") {
          state.patients = state.patients.filter((p) => p.id !== id);
          return new HttpResponse(null, { status: 204 });
        }
        if (section === "profile" && method === "PUT") {
          Object.assign(state.profile, await body());
          return json(state.profile);
        }
        if (section === "history" && method === "GET")
          return json(options.empty ? { appointments: [], consultations: [] } : fixtures.history);
        if (section === "consultations" && method === "GET") return json([state.consultation]);
        if (section === "consents" && method === "POST") {
          state.masterConsentStatus = patientMatch[3] ? "needs_reconsent" : "ok";
          return json({
            patient,
            consent: {
              ...fixtures.consent,
              scope: "master",
              appointmentId: null,
              ...(await body()),
            },
          });
        }
      }

      if (path === "/doctors/summary" && method === "GET")
        return json({
          awaitingApproval: state.doctors.filter((d) => d.onboardingStatus === "awaiting_approval")
            .length,
          awaitingSetup: state.doctors.filter((d) => d.onboardingStatus === "awaiting_setup")
            .length,
          active: state.doctors.filter((d) => d.active).length,
          rejected: state.doctors.filter((d) => d.onboardingStatus === "rejected").length,
          invited: state.invites.length,
          total: state.doctors.length,
        });
      if (path === "/doctors/invites" && method === "GET") return json(state.invites);
      if (path === "/doctors/invites" && method === "POST") {
        const input = await body();
        const invite: DoctorInvite = {
          inviteId: state.invites.length + 1,
          email: String(input.email),
          familyName: typeof input.familyName === "string" ? input.familyName : null,
          createdAt: fixtures.timestamp,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          status: "invited",
        };
        state.invites.push(invite);
        return json({ inviteId: invite.inviteId, email: invite.email });
      }
      const openInvite = path.match(/^\/doctors\/invites\/(\d+)(\/resend)?$/);
      if (openInvite && method === "DELETE") {
        state.invites = state.invites.filter((i) => i.inviteId !== Number(openInvite[1]));
        return new HttpResponse(null, { status: 204 });
      }
      if (openInvite && method === "POST")
        return json(state.invites.find((i) => i.inviteId === Number(openInvite[1])));
      if (path === "/doctors" && method === "GET")
        return json(
          state.doctors.filter(
            (d) =>
              (!url.searchParams.has("active") ||
                d.active === (url.searchParams.get("active") === "true")) &&
              (!url.searchParams.has("status") ||
                d.onboardingStatus === url.searchParams.get("status")),
          ),
        );
      if (path === "/doctors" && method === "POST") {
        const created = {
          ...fixtures.doctor,
          ...(await body()),
          id: state.doctors.length + 1,
        } as Doctor;
        state.doctors.push(created);
        return json(created);
      }
      if ((path === "/doctors/me/signature" || path === "/doctors/me/stamp") && method === "GET")
        return imageResponse(fixtures.demoSignature);
      const doctorMatch = path.match(
        /^\/doctors\/(\d+|me)(?:\/(approve|reject|invites|reinvite-reapply|purge))?$/,
      );
      if (doctorMatch) {
        const id = doctorMatch[1] === "me" ? 1 : Number(doctorMatch[1]);
        const doctor =
          state.doctors.find((d) => d.id === id) ??
          (doctorMatch[1] === "me" ? fixtures.doctor : null);
        if (!doctor) return errorResponse("doctor_not_found", 404);
        const action = doctorMatch[2];
        if (!action && method === "GET")
          return json({
            ...doctor,
            rubberStampImage: `data:image/svg+xml;base64,${btoa(fixtures.demoSignature)}`,
          });
        if (!action && method === "PATCH") {
          const input = await body();
          Object.assign(doctor, input);
          if (input.defaultSignatureImage) doctor.hasDefaultSignature = true;
          if (input.clearDefaultSignature) doctor.hasDefaultSignature = false;
          return json(doctor);
        }
        if (action === "approve" && method === "POST") {
          Object.assign(doctor, {
            active: true,
            onboardingStatus: "active",
            approvedAt: new Date().toISOString(),
          });
          return json(doctor);
        }
        if (action === "reject" && method === "POST") {
          Object.assign(doctor, {
            active: false,
            onboardingStatus: "rejected",
            rejectedReason: (await body()).reason,
          });
          return json(doctor);
        }
        if (["invites", "reinvite-reapply"].includes(action ?? "") && method === "POST")
          return new HttpResponse(null, { status: 204 });
        if (method === "DELETE") {
          state.doctors = state.doctors.filter((d) => d.id !== id);
          return new HttpResponse(null, { status: 204 });
        }
      }
      if (path.startsWith("/doctor-onboarding/")) {
        if (options.inviteMode === "expired") return errorResponse("invite_not_found", 404);
        if (method === "GET")
          return json({
            mode: options.inviteMode ?? "new",
            email: fixtures.doctor.email,
            givenName: fixtures.doctor.givenName,
            familyName: fixtures.doctor.familyName,
          });
        if (method === "POST") return new HttpResponse(null, { status: 204 });
      }

      const doctorAvailability = path.match(/^\/doctors\/(\d+)\/availability(\/bulk)?$/);
      if (
        (path === "/availability" && method === "GET") ||
        (doctorAvailability && method === "GET")
      )
        return json(
          state.availability.filter(
            (a) => !doctorAvailability || a.doctorId === Number(doctorAvailability[1]),
          ),
        );
      if (doctorAvailability && method === "DELETE") {
        state.availability = [];
        return new HttpResponse(null, { status: 204 });
      }
      if (doctorAvailability && method === "POST") {
        const input = await body();
        const windows = doctorAvailability[2]
          ? (input.windows as Record<string, unknown>[])
          : [input];
        const created = windows.map(
          (w, i) =>
            ({
              ...fixtures.availability,
              ...w,
              id: state.availability.length + i + 1,
              doctorId: Number(doctorAvailability[1]),
            }) as Availability,
        );
        state.availability.push(...created);
        return json(doctorAvailability[2] ? created : created[0]);
      }
      const availabilityMatch = path.match(/^\/availability\/(\d+)$/);
      if (availabilityMatch && method === "PATCH") {
        const entry = state.availability.find((a) => a.id === Number(availabilityMatch[1]));
        if (!entry) return errorResponse("availability_not_found", 404);
        Object.assign(entry, await body());
        return json(entry);
      }
      if (availabilityMatch && method === "DELETE") {
        state.availability = state.availability.filter(
          (a) => a.id !== Number(availabilityMatch[1]),
        );
        return new HttpResponse(null, { status: 204 });
      }

      if (path === "/appointments" && method === "GET")
        return json(
          state.appointments
            .filter(
              (a) =>
                !url.searchParams.has("doctorId") ||
                a.doctorId === Number(url.searchParams.get("doctorId")),
            )
            .map((a) => ({
              ...a,
              patientName: `${state.patients.find((p) => p.id === a.patientId)?.given ?? "Nimal"} Perera`,
              doctorName: "Anjali Silva",
            })),
        );
      if (path === "/appointments" && method === "POST") {
        const created = {
          ...fixtures.appointment,
          ...(await body()),
          id: state.appointments.length + 2,
          status: "scheduled" as const,
        };
        state.appointments.push(created);
        return json(created);
      }
      const appointmentMatch = path.match(
        /^\/appointments\/(\d+)(?:\/(consent|preconsult|start-meeting|end-meeting|meeting-token|cancel|summary\.pdf|consultation\/draft))?$/,
      );
      if (appointmentMatch) {
        const id = Number(appointmentMatch[1]);
        const appointment = state.appointments.find((a) => a.id === id);
        if (!appointment) return errorResponse("appointment_not_found", 404);
        const action = appointmentMatch[2];
        if (!action && method === "GET") return json(appointmentDetail(id));
        if (!action && method === "PATCH") {
          Object.assign(appointment, await body());
          return json(appointment);
        }
        if (action === "consent" && method === "GET")
          return json(state.sessionConsent?.appointmentId === id ? state.sessionConsent : null);
        if (action === "consent" && method === "POST") {
          const input = await body();
          state.sessionConsent = { ...fixtures.consent, ...input, appointmentId: id };
          appointment.status = input.agreed ? "consent_pending" : "cancelled";
          return json({ consent: state.sessionConsent, appointment });
        }
        if (action === "preconsult" && method === "GET") return json(state.preconsult);
        if (action === "preconsult" && method === "PUT") {
          state.preconsult = { ...fixtures.preconsult, ...(await body()), appointmentId: id };
          appointment.status = "data_collection";
          return json({ preconsult: state.preconsult, appointment });
        }
        // Never issue a fabricated LiveKit token or connect to a real clinical room.
        if (action === "meeting-token" || action === "start-meeting")
          return errorResponse("livekit_not_configured");
        if (action === "end-meeting" && method === "POST") {
          appointment.status = "awaiting_notes";
          return json(appointment);
        }
        if (action === "cancel" && method === "POST") {
          const input = await body();
          appointment.status = "cancelled";
          appointment.cancellationReason = String(input.reason ?? "");
          if (input.requeue) {
            const queueEntry = {
              ...fixtures.queueEntry,
              id: state.queue.length + 1,
              patientId: appointment.patientId,
            };
            state.queue.push(queueEntry);
            return json({ appointment, queueEntry });
          }
          return json({ appointment });
        }
        if (action === "summary.pdf" && method === "GET")
          return binaryResponse(demoPdf(), "application/pdf", "synthetic-prescription.pdf");
        if (action === "consultation/draft" && method === "POST")
          return json({
            consultationId: state.consultation.id,
            draft: state.consultation,
          } satisfies ConsultationDraftResponse);
      }
      const attachmentsMatch = path.match(/^\/appointments\/(\d+)\/attachments(?:\/(\d+))?$/);
      if (attachmentsMatch) {
        const id = Number(attachmentsMatch[2]);
        if (!attachmentsMatch[2] && method === "GET") return json(state.attachments);
        if (!attachmentsMatch[2] && method === "POST") {
          const data = await request.formData();
          const file = data.get("file");
          if (!(file instanceof File)) return errorResponse("validation_failed");
          const attachment = {
            ...fixtures.attachment,
            id: state.attachments.length + 1,
            filename: file.name,
            mimeType: file.type,
            byteSize: file.size,
            caption: String(data.get("caption") ?? ""),
          };
          state.attachments.push(attachment);
          attachmentBytes.set(attachment.id, file);
          return json(attachment);
        }
        if (method === "GET")
          return attachmentBytes.has(id)
            ? new HttpResponse(attachmentBytes.get(id), {
                headers: { "Content-Type": attachmentBytes.get(id)?.type ?? "image/png" },
              })
            : imageResponse(fixtures.demoImage);
        if (method === "PATCH") {
          const attachment = state.attachments.find((a) => a.id === id);
          if (!attachment) return errorResponse("attachment_not_found", 404);
          Object.assign(attachment, await body());
          return json(attachment);
        }
        if (method === "DELETE") {
          state.attachments = state.attachments.filter((a) => a.id !== id);
          return new HttpResponse(null, { status: 204 });
        }
      }
      const consultationMatch = path.match(/^\/consultations\/(\d+)(\/submit)?$/);
      if (consultationMatch) {
        if (method === "GET") return json(state.consultation);
        if (method === "PATCH") {
          Object.assign(state.consultation, await body());
          return json(state.consultation);
        }
        if (method === "POST" && consultationMatch[2]) {
          const input = await body();
          state.consultation.status = "completed";
          state.consultation.signedAt = new Date().toISOString();
          const appointment = state.appointments.find(
            (a) => a.id === state.consultation.appointmentId,
          );
          if (appointment) appointment.status = "completed";
          const followUp = input.followUp as
            | { kind?: string; scheduledAt?: string; weeks?: number }
            | undefined;
          if (followUp?.kind === "appointment") {
            const followUpAppointment = {
              ...fixtures.appointment,
              id: state.appointments.length + 2,
              status: "scheduled" as const,
              scheduledAt: followUp.scheduledAt ?? fixtures.scheduledAt,
            };
            state.appointments.push(followUpAppointment);
            return json({ consultation: state.consultation, appointment, followUpAppointment });
          }
          if (followUp?.kind === "weeks") {
            const followUpQueueEntry = {
              ...fixtures.queueEntry,
              id: state.queue.length + 1,
              source: "follow_up" as const,
            };
            state.queue.push(followUpQueueEntry);
            return json({ consultation: state.consultation, appointment, followUpQueueEntry });
          }
          return json({ consultation: state.consultation, appointment });
        }
      }

      if (path === "/queue" && method === "GET")
        return json(
          state.queue.filter((q) =>
            ["status", "source", "priority", "patientId", "preferredDoctorId"].every(
              (key) =>
                !url.searchParams.has(key) ||
                String(q[key as keyof QueueEntry]) === url.searchParams.get(key),
            ),
          ),
        );
      if (path === "/queue" && method === "POST") {
        const entry = {
          ...fixtures.queueEntry,
          ...(await body()),
          id: state.queue.length + 1,
        } as QueueEntry;
        state.queue.push(entry);
        return json(entry);
      }
      const queueMatch = path.match(/^\/queue\/(\d+)(?:\/(book|cancel))?$/);
      if (queueMatch) {
        const entry = state.queue.find((q) => q.id === Number(queueMatch[1]));
        if (!entry) return errorResponse("queue_entry_not_found", 404);
        if (method === "GET") return json(entry);
        if (method === "PATCH") {
          Object.assign(entry, await body());
          return json(entry);
        }
        if (method === "POST" && queueMatch[2] === "book") {
          const appointment = {
            ...fixtures.appointment,
            ...(await body()),
            id: state.appointments.length + 2,
            patientId: entry.patientId,
            status: "scheduled" as const,
          };
          state.appointments.push(appointment);
          Object.assign(entry, { status: "booked", appointmentId: appointment.id });
          return json({ appointment, queueEntry: entry });
        }
        if (method === "POST" && queueMatch[2] === "cancel") {
          Object.assign(entry, { status: "cancelled", cancellationReason: (await body()).reason });
          return json(entry);
        }
      }

      if (path === "/sysadmin/system-config" && method === "GET") return json(state.config);
      if (path === "/sysadmin/system-config" && method === "PATCH") {
        Object.assign(state.config, await body());
        return json(state.config);
      }
      if (path === "/sysadmin/me" && method === "GET")
        return json({
          username: "demo.sysadmin",
          role: "sys-admin",
          fullName: "Demo Operator",
          contact: "0700000000",
        });
      if (path === "/sysadmin/me" && method === "PATCH")
        return json({ username: "demo.sysadmin", role: "sys-admin", ...(await body()) });
      if (path === "/accounts" && method === "GET")
        return json(
          state.accounts
            .filter((a) => role !== "admin" || a.role === "healthworker" || a.role === "doctor")
            .map((a) => ({
              ...a,
              manageable:
                role === "sys-admin"
                  ? ["admin", "healthworker"].includes(a.role)
                  : a.role === "healthworker",
            })),
        );
      if (path === "/accounts" && method === "POST") {
        const entry = {
          ...state.accounts[0],
          ...(await body()),
          disabledAt: null,
          manageable: true,
          doctorId: null,
          doctorActive: null,
        } as AccountRosterEntry;
        state.accounts.push(entry);
        return json(entry);
      }
      const accountMatch = path.match(
        /^\/accounts\/([^/]+)(?:\/(disable|enable|reset-password))?$/,
      );
      if (accountMatch) {
        const entry = state.accounts.find(
          (a) => a.username === decodeURIComponent(accountMatch[1]),
        );
        if (!entry) return errorResponse("account_not_found", 404);
        if (method === "PATCH") {
          Object.assign(entry, await body());
          return json(entry);
        }
        if (method === "DELETE") {
          state.accounts = state.accounts.filter((a) => a !== entry);
          return new HttpResponse(null, { status: 204 });
        }
        if (method === "POST" && accountMatch[2] === "reset-password")
          return new HttpResponse(null, { status: 204 });
        if (method === "POST") {
          entry.disabledAt = accountMatch[2] === "disable" ? new Date().toISOString() : null;
          return json(entry);
        }
      }
      if (path === "/exports/medications.xlsx" && method === "GET")
        return binaryResponse(
          demoMedicationsXlsx(),
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "synthetic-medications.xlsx",
        );
      if (path === "/exports/prescriptions.zip" && method === "GET")
        return binaryResponse(
          demoPrescriptionZip(),
          "application/zip",
          "synthetic-prescriptions.zip",
        );
      if (path === "/capture/sessions" && method === "POST") {
        capturePurpose = String((await body()).purpose);
        captureClosed = false;
        return json({
          id: 1,
          token: "storybook-capture",
          purpose: capturePurpose,
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        });
      }
      const captureSessionMatch = path.match(/^\/capture\/sessions\/(\d+)(\/relay)?$/);
      if (captureSessionMatch && method === "DELETE") {
        captureClosed = true;
        return new HttpResponse(null, { status: 204 });
      }
      if (captureSessionMatch && method === "GET") {
        if (captureSessionMatch[2]) return errorResponse("capture_relay_not_ready", 404);
        return json({
          id: 1,
          purpose: capturePurpose,
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          closed: captureClosed,
          uploadCount,
          relayReady: false,
        });
      }
      if (path.startsWith("/capture/") && !captureSessionMatch) {
        if (options.captureExpired) return errorResponse("capture_session_expired", 410);
        if (method === "GET")
          return json({
            purpose: capturePurpose,
            expiresAt: new Date(Date.now() + 600000).toISOString(),
          });
        if (method === "POST") {
          uploadCount += 1;
          return json({ ok: true, uploadCount, attachment: fixtures.attachment });
        }
      }
      console.error(`[Storybook] Unimplemented API scenario: ${method} ${path}`);
      return errorResponse("storybook_unimplemented_endpoint", 501);
    }),
  ];
}

export function scenario(options: ScenarioOptions = {}) {
  const path = options.path ?? "/healthworker/appointments";
  const segments = path
    .split("/")
    .filter(Boolean)
    .map((segment) =>
      /^\d+$/.test(segment)
        ? ["id", segment]
        : segment === "storybook-capture" || segment === "storybook-invite"
          ? ["token", segment]
          : segment,
    );
  return {
    nextjs: { appDirectory: true, navigation: { pathname: path, segments } },
    haputele: options,
    msw: { handlers: [] as RequestHandler[] },
    docs: {
      description: {
        story:
          "Real HapuTele UI with synthetic, isolated API responses. Backend security and external services are not exercised by this story.",
      },
    },
  };
}
