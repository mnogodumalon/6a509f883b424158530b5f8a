// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
export type GeoLocation = { lat: number; long: number; info?: string };

export type AttachmentType = 'file' | 'note' | 'url' | 'json';
export interface Attachment {
  id: string;
  type: AttachmentType;
  label: string | null;
  value: string | null;
  active: boolean;
  createdat?: string | null;
  updatedat?: string | null;
}

export interface AttachmentInput {
  type: AttachmentType;
  label?: string;
  value: string;
  active?: boolean;
}

export interface Kursplan {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    kursname?: LookupValue;
    trainer?: LookupValue;
    wochentag?: LookupValue;
    uhrzeit?: string;
    raum?: string;
    max_plaetze?: number;
    kurs_status?: LookupValue;
  };
}

export interface Buchungen {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    vorname?: string;
    nachname?: string;
    email?: string;
    kurs?: string; // applookup -> URL zu 'Kursplan' Record
    kursdatum?: string; // Format: YYYY-MM-DD oder ISO String
    buchungsstatus?: LookupValue;
  };
}

export const APP_IDS = {
  KURSPLAN: '6a509f71578595715144f358',
  BUCHUNGEN: '6a509f74f14684380deb788b',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'kursplan': {
    kursname: [{ key: "vinyasa_flow", label: "Vinyasa Flow" }, { key: "yin_yoga", label: "Yin Yoga" }, { key: "hatha_yoga", label: "Hatha Yoga" }, { key: "power_yoga", label: "Power Yoga" }, { key: "restorative_yoga", label: "Restorative Yoga" }, { key: "meditation", label: "Meditation" }, { key: "pranayama", label: "Pranayama" }],
    trainer: [{ key: "betreiberin", label: "Ich (Studiobetreiberin)" }, { key: "trainer_1", label: "Trainer/in 1" }, { key: "trainer_2", label: "Trainer/in 2" }, { key: "trainer_3", label: "Trainer/in 3" }],
    wochentag: [{ key: "montag", label: "Montag" }, { key: "dienstag", label: "Dienstag" }, { key: "mittwoch", label: "Mittwoch" }, { key: "donnerstag", label: "Donnerstag" }, { key: "freitag", label: "Freitag" }, { key: "samstag", label: "Samstag" }, { key: "sonntag", label: "Sonntag" }],
    kurs_status: [{ key: "findet_statt", label: "Findet statt" }, { key: "abgesagt", label: "Abgesagt" }],
  },
  'buchungen': {
    buchungsstatus: [{ key: "gebucht", label: "Gebucht" }, { key: "warteliste", label: "Warteliste" }, { key: "storniert", label: "Storniert" }],
  },
};

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'kursplan': {
    'kursname': 'lookup/select',
    'trainer': 'lookup/select',
    'wochentag': 'lookup/select',
    'uhrzeit': 'string/text',
    'raum': 'string/text',
    'max_plaetze': 'number',
    'kurs_status': 'lookup/radio',
  },
  'buchungen': {
    'vorname': 'string/text',
    'nachname': 'string/text',
    'email': 'string/email',
    'kurs': 'applookup/select',
    'kursdatum': 'date/date',
    'buchungsstatus': 'lookup/radio',
  },
};

export const HUB_TOPOLOGY: Record<string, { field: string; entity: string }[]> = {
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateKursplan = StripLookup<Kursplan['fields']>;
export type CreateBuchungen = StripLookup<Buchungen['fields']>;