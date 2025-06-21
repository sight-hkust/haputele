--
-- PostgreSQL database dump
--

-- Dumped from database version 13.21 (Debian 13.21-1.pgdg120+1)
-- Dumped by pg_dump version 13.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: postgres
--



CREATE TABLE public.accounts (
    username character varying(255) NOT NULL,
    password character varying(255) NOT NULL
);


ALTER TABLE public.accounts OWNER TO postgres;

--
-- Name: appointments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.appointments (
    appointment_id integer NOT NULL,
    doctor_id integer,
    appointment_date date NOT NULL,
    appointment_time time without time zone NOT NULL,
    appointment_status character varying(255),
    patient_id integer,
    CONSTRAINT status_check CHECK (((appointment_status)::text = ANY ((ARRAY['Scheduled'::character varying, 'Cancelled'::character varying, 'Completed'::character varying])::text[])))
);


ALTER TABLE public.appointments OWNER TO postgres;

--
-- Name: appointments_appointment_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.appointments_appointment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.appointments_appointment_id_seq OWNER TO postgres;

--
-- Name: appointments_appointment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.appointments_appointment_id_seq OWNED BY public.appointments.appointment_id;


--
-- Name: consultations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.consultations (
    consultation_id integer NOT NULL,
    diagnosis text,
    medication jsonb,
    actions text,
    appointment_id integer,
    notes text
);


ALTER TABLE public.consultations OWNER TO postgres;

--
-- Name: consultations_consultation_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.consultations_consultation_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.consultations_consultation_id_seq OWNER TO postgres;

--
-- Name: consultations_consultation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.consultations_consultation_id_seq OWNED BY public.consultations.consultation_id;


--
-- Name: doctor; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.doctor (
    doctor_id integer NOT NULL,
    dgivenname character varying(255) NOT NULL,
    dfamilyname character varying(255) NOT NULL,
    contact character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    consultlink character varying(255)
);


ALTER TABLE public.doctor OWNER TO postgres;

--
-- Name: doctor_doctor_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.doctor_doctor_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.doctor_doctor_id_seq OWNER TO postgres;

--
-- Name: doctor_doctor_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.doctor_doctor_id_seq OWNED BY public.doctor.doctor_id;


--
-- Name: language; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.language (
    id integer NOT NULL,
    en jsonb,
    ta jsonb
);


ALTER TABLE public.language OWNER TO postgres;

--
-- Name: language_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.language_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.language_id_seq OWNER TO postgres;

--
-- Name: language_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.language_id_seq OWNED BY public.language.id;


--
-- Name: patients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.patients (
    patient_id integer NOT NULL,
    bt_id character varying(9),
    n_id character varying(12),
    dob date,
    givenname character varying,
    familyname character varying,
    contact character varying(255),
    gender character varying(1),
    immunisation jsonb,
    allergy jsonb,
    familyhistory jsonb,
    CONSTRAINT bt_format CHECK (((bt_id)::text ~ '^[A-Z][0-9]{8}$'::text)),
    CONSTRAINT gender_check CHECK (((gender)::text = ANY ((ARRAY['M'::character varying, 'F'::character varying])::text[])))
);


ALTER TABLE public.patients OWNER TO postgres;

--
-- Name: patientdashboard_patient_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.patientdashboard_patient_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.patientdashboard_patient_id_seq OWNER TO postgres;

--
-- Name: patientdashboard_patient_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.patientdashboard_patient_id_seq OWNED BY public.patients.patient_id;


--
-- Name: preconsultation; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.preconsultation (
    pheight integer,
    pweight integer,
    systolic integer,
    diastolic integer,
    pulse integer,
    furthernotes text,
    pr_id integer NOT NULL,
    appointment_id integer,
    oxymeter integer,
    temperature numeric(4,1),
    glucose integer,
    pain integer,
    appearance text,
    prgenancy text
);


ALTER TABLE public.preconsultation OWNER TO postgres;

--
-- Name: preconsultation_pr_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.preconsultation_pr_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.preconsultation_pr_id_seq OWNER TO postgres;

--
-- Name: preconsultation_pr_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.preconsultation_pr_id_seq OWNED BY public.preconsultation.pr_id;


--
-- Name: profile; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profile (
    profile_id integer NOT NULL,
    patient_id integer,
    medication jsonb,
    medhistory jsonb,
    surgicalhistory jsonb,
    injuries jsonb,
    falls jsonb,
    socialhistory jsonb,
    substances jsonb,
    familyhistory jsonb,
    functionalstatus jsonb,
    fallrisk jsonb,
    hearing text,
    cognitivestatus text,
    incontinent text,
    physicalactivity text,
    safety text,
    painlevel text,
    sexualhealth text,
    ph9 jsonb,
    diseaseprevention jsonb,
    nutrition text,
    allergy jsonb
);


ALTER TABLE public.profile OWNER TO postgres;

--
-- Name: profile_profile_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.profile_profile_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.profile_profile_id_seq OWNER TO postgres;

--
-- Name: profile_profile_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.profile_profile_id_seq OWNED BY public.profile.profile_id;


--
-- Name: appointments appointment_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointments ALTER COLUMN appointment_id SET DEFAULT nextval('public.appointments_appointment_id_seq'::regclass);


--
-- Name: consultations consultation_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.consultations ALTER COLUMN consultation_id SET DEFAULT nextval('public.consultations_consultation_id_seq'::regclass);


--
-- Name: doctor doctor_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.doctor ALTER COLUMN doctor_id SET DEFAULT nextval('public.doctor_doctor_id_seq'::regclass);


--
-- Name: language id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.language ALTER COLUMN id SET DEFAULT nextval('public.language_id_seq'::regclass);


--
-- Name: patients patient_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patients ALTER COLUMN patient_id SET DEFAULT nextval('public.patientdashboard_patient_id_seq'::regclass);


--
-- Name: preconsultation pr_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.preconsultation ALTER COLUMN pr_id SET DEFAULT nextval('public.preconsultation_pr_id_seq'::regclass);


--
-- Name: profile profile_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profile ALTER COLUMN profile_id SET DEFAULT nextval('public.profile_profile_id_seq'::regclass);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (username);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (appointment_id);


--
-- Name: consultations consultations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.consultations
    ADD CONSTRAINT consultations_pkey PRIMARY KEY (consultation_id);


--
-- Name: doctor doctor_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.doctor
    ADD CONSTRAINT doctor_pkey PRIMARY KEY (doctor_id);


--
-- Name: language language_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.language
    ADD CONSTRAINT language_pkey PRIMARY KEY (id);


--
-- Name: patients patientdashboard_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patientdashboard_pkey PRIMARY KEY (patient_id);


--
-- Name: preconsultation preconsultation_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.preconsultation
    ADD CONSTRAINT preconsultation_pkey PRIMARY KEY (pr_id);


--
-- Name: profile profile_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profile
    ADD CONSTRAINT profile_pkey PRIMARY KEY (profile_id);


--
-- Name: patients unique_bt_id; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT unique_bt_id UNIQUE (bt_id);


--
-- Name: appointments appointments_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctor(doctor_id) ON UPDATE CASCADE;


--
-- Name: appointments appointments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(patient_id);


--
-- Name: consultations consultations_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.consultations
    ADD CONSTRAINT consultations_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(appointment_id);


--
-- Name: preconsultation preconsultation_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.preconsultation
    ADD CONSTRAINT preconsultation_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(appointment_id);


--
-- Name: profile profile_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profile
    ADD CONSTRAINT profile_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(patient_id);