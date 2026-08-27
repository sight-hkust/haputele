// Patient-facing consent statement. Healthworker reads this aloud to the
// patient and only proceeds if the patient agrees.
//
// Master consent is captured once at registration and is the authoritative
// "this patient permits us to handle their data" record. It can be revoked.
// Session consent (separate, per-appointment) gates each preconsult/vitals
// session and rests on top of an active master consent.
//
// English legal wording lives in `en.consent.*`. The UI renders `t("consent.*")`
// so Sinhala (and later locales) can show a translation; these exports stay
// the English canonical text for any caller that needs the source wording.
import { en } from "@/lib/i18n/en";

export const MASTER_CONSENT_BODY = en.consent.masterBody;
export const SESSION_CONSENT_BODY = en.consent.sessionBody;
