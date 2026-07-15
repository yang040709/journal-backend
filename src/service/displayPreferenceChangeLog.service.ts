import DisplayPreferenceChangeLog from "../model/DisplayPreferenceChangeLog";
import { DISPLAY_PREFERENCE_SETTING_KEYS } from "../constant/displayPreference";
import type { UpdateDisplayPreferenceInput } from "../schemas/displayPreference.schema";

export class DisplayPreferenceChangeLogService {
  static async recordChanges(
    userId: string,
    changes: UpdateDisplayPreferenceInput,
  ): Promise<void> {
    const entries = DISPLAY_PREFERENCE_SETTING_KEYS.flatMap((key) => {
      if (changes[key as keyof UpdateDisplayPreferenceInput] === undefined) {
        return [];
      }
      return [
        {
          userId,
          settingKey: key,
          value: changes[key as keyof UpdateDisplayPreferenceInput] as
            | boolean
            | string,
        },
      ];
    });

    if (entries.length === 0) return;

    await DisplayPreferenceChangeLog.insertMany(entries);
  }
}
