// Patient-facing consent statement. Healthworker reads this aloud to the
// patient and only proceeds if the patient agrees.
//
// Master consent is captured once at registration and is the authoritative
// "this patient permits us to handle their data" record. It can be revoked.
// Session consent (separate, per-appointment) gates each preconsult/vitals
// session and rests on top of an active master consent.
export const MASTER_CONSENT_BODY = `By giving consent, the patient agrees that HapuTele may collect and store their personal and health information for the purpose of providing telemedicine consultations. Information will only be shared with the assigned doctor and authorised healthworkers. Patients may withdraw consent at any time, after which no new data will be collected. The patient understands that consultations are conducted via secure video link, and that their consultation summary and prescription may be made available for clinical follow-up.`;

export const SESSION_CONSENT_BODY = `For this appointment, the patient agrees that HapuTele may record and store the vitals collected today (height, weight, blood pressure, pulse, temperature) and use them as part of the consultation. The patient may decline at any time before the meeting begins.`;
