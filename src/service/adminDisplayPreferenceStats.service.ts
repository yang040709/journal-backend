import User from "../model/User";
import DisplayPreferenceChangeLog from "../model/DisplayPreferenceChangeLog";
import {
  DISPLAY_PREFERENCE_SETTING_METAS,
  formatDisplayPreferenceValue,
  type DisplayPreferenceSettingMeta,
} from "../constant/displayPreference";
import { CACHE_CONFIG } from "../config/cache";
import {
  buildCacheKey,
  getOrSetCache,
  invalidateCacheByPrefix,
} from "../utils/cache";

const DISPLAY_PREFERENCE_STATS_CACHE_KEY = buildCacheKey(
  "stats",
  "v1",
  "admin",
  "display-preferences",
);

export interface DisplayPreferenceOptionStat {
  value: string;
  label: string;
  userCount: number;
  percentage: number;
}

export interface DisplayPreferenceSettingStat {
  key: string;
  label: string;
  description: string;
  type: DisplayPreferenceSettingMeta["type"];
  defaultValue: boolean | string;
  usersConfiguredCount: number;
  changeCount: number;
  optionStats: DisplayPreferenceOptionStat[];
  popularOption: DisplayPreferenceOptionStat | null;
}

export interface AdminDisplayPreferenceStatsReport {
  generatedAt: string;
  totalUsers: number;
  settings: DisplayPreferenceSettingStat[];
}

function normalizeStoredValue(meta: DisplayPreferenceSettingMeta, raw: unknown) {
  if (meta.type === "boolean") {
    return String(Boolean(raw));
  }
  const text = String(raw ?? meta.defaultValue);
  const valid = meta.options?.some((item) => item.value === text);
  return valid ? text : String(meta.defaultValue);
}

export class AdminDisplayPreferenceStatsService {
  static invalidateReportCache(): void {
    invalidateCacheByPrefix(DISPLAY_PREFERENCE_STATS_CACHE_KEY);
  }

  static async getReport(): Promise<AdminDisplayPreferenceStatsReport> {
    return getOrSetCache(
      DISPLAY_PREFERENCE_STATS_CACHE_KEY,
      CACHE_CONFIG.admin.displayPreferenceStatsTtlSeconds,
      () => AdminDisplayPreferenceStatsService.buildReport(),
    );
  }

  private static async buildReport(): Promise<AdminDisplayPreferenceStatsReport> {
    const totalUsers = await User.countDocuments();

    const [changeAgg, ...userValueAggs] = await Promise.all([
      DisplayPreferenceChangeLog.aggregate<{
        _id: string;
        changeCount: number;
        usersConfiguredCount: number;
      }>([
        {
          $group: {
            _id: "$settingKey",
            changeCount: { $sum: 1 },
            users: { $addToSet: "$userId" },
          },
        },
        {
          $project: {
            changeCount: 1,
            usersConfiguredCount: { $size: "$users" },
          },
        },
      ]),
      ...DISPLAY_PREFERENCE_SETTING_METAS.map((meta) =>
        User.aggregate<{ _id: unknown; count: number }>([
          {
            $group: {
              _id: `$${meta.key}`,
              count: { $sum: 1 },
            },
          },
        ]),
      ),
    ]);

    const changeMap = new Map(
      changeAgg.map((item) => [
        item._id,
        {
          changeCount: item.changeCount,
          usersConfiguredCount: item.usersConfiguredCount,
        },
      ]),
    );

    const settings = DISPLAY_PREFERENCE_SETTING_METAS.map((meta, index) => {
      const changeInfo = changeMap.get(meta.key) ?? {
        changeCount: 0,
        usersConfiguredCount: 0,
      };
      const valueAgg = userValueAggs[index] ?? [];

      const countByValue = new Map<string, number>();
      for (const row of valueAgg) {
        const normalized = normalizeStoredValue(meta, row._id);
        countByValue.set(
          normalized,
          (countByValue.get(normalized) ?? 0) + row.count,
        );
      }

      const optionStats: DisplayPreferenceOptionStat[] = (
        meta.options ?? []
      ).map((option) => {
        const userCount = countByValue.get(option.value) ?? 0;
        return {
          value: option.value,
          label: option.label,
          userCount,
          percentage:
            totalUsers > 0
              ? Math.round((userCount / totalUsers) * 1000) / 10
              : 0,
        };
      });

      const popularOption =
        optionStats.reduce<DisplayPreferenceOptionStat | null>(
          (best, current) => {
            if (!best || current.userCount > best.userCount) {
              return current;
            }
            return best;
          },
          null,
        );

      return {
        key: meta.key,
        label: meta.label,
        description: meta.description,
        type: meta.type,
        defaultValue: meta.defaultValue,
        usersConfiguredCount: changeInfo.usersConfiguredCount,
        changeCount: changeInfo.changeCount,
        optionStats,
        popularOption,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      totalUsers,
      settings,
    };
  }

  static formatValueLabel(key: string, value: unknown) {
    return formatDisplayPreferenceValue(key, value);
  }
}
