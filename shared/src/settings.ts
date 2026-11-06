// Pengaturan aplikasi yang disimpan di tabel app_settings (kunci-nilai bertipe teks). Tafsir dan nilai bawaan ada di sini
// supaya server dan klien memakai aturan yang sama.

export const SETTING_KEYS = {
  /** '1' = cuti bersama memotong Cuti Tahunan; '0' = tidak (bawaan). */
  jointLeaveDeducts: 'joint_leave_deducts_annual',
  /** JSON array id master status kepegawaian yang tidak dipotong cuti bersama (bawaan: Probation dan Magang). */
  jointLeaveExemptStatuses: 'joint_leave_exempt_status_ids',
} as const;

export interface JointLeaveSettings {
  enabled: boolean;
  exemptStatusIds: string[];
}

export const DEFAULT_JOINT_LEAVE_SETTINGS: JointLeaveSettings = {
  enabled: false,
  exemptStatusIds: ['status_probation', 'status_magang'],
};

/** Tafsirkan baris app_settings. Nilai hilang atau rusak jatuh ke bawaan. */
export function parseJointLeaveSettings(rows: readonly { key: string; value: string }[]): JointLeaveSettings {
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  let exempt = DEFAULT_JOINT_LEAVE_SETTINGS.exemptStatusIds;
  const raw = get(SETTING_KEYS.jointLeaveExemptStatuses);
  if (raw !== undefined) {
    try {
      const v: unknown = JSON.parse(raw);
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) exempt = v;
    } catch { /* pakai bawaan */ }
  }
  return { enabled: get(SETTING_KEYS.jointLeaveDeducts) === '1', exemptStatusIds: exempt };
}
