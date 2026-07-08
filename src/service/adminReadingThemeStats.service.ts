import User from "../model/User";
import ReadingThemeChangeLog, {
  type ReadingThemeChangeScope,
} from "../model/ReadingThemeChangeLog";
import {
  READING_STYLE_LABELS,
  THEME_DISPLAY_META,
} from "../constant/readingThemeManifest.generated";
import { CACHE_CONFIG } from "../config/cache";
import {
  buildCacheKey,
  getOrSetCache,
  invalidateCacheByPrefix,
} from "../utils/cache";

const DEFAULT_DAYS = 30;
export const MAX_READING_THEME_STATS_DAYS = 90;

const READING_THEME_STATS_CACHE_PREFIX = buildCacheKey(
  "stats",
  "v1",
  "admin",
  "reading-themes",
);

const STANDARD_READING_LABEL = "标准阅读";
const DEFAULT_THEME_LABEL = "默认主题色";

export interface AdminReadingThemeStatsQuery {
  days?: number;
}

export interface ReadingThemeThemeStat {
  themeId: string | null;
  label: string;
  backgroundColor?: string;
  cardColor?: string;
  userCount?: number;
  percentage?: number;
  changeCount?: number;
  uniqueUsers?: number;
}

export interface ReadingThemeStyleStat {
  styleKey: string | null;
  label: string;
  userCount?: number;
  percentage?: number;
  changeCount?: number;
  uniqueUsers?: number;
  themeStats: ReadingThemeThemeStat[];
}

export interface AdminReadingThemeStatsReport {
  generatedAt: string;
  days: number;
  startAt: string;
  endAt: string;
  totalUsers: number;
  globalScopeUserCount: number;
  totalGlobalChanges: number;
  totalNoteChanges: number;
  currentGlobal: {
    styleStats: ReadingThemeStyleStat[];
  };
  globalChanges: ReadingThemeStyleStat[];
  noteChanges: ReadingThemeStyleStat[];
}

interface StyleThemeGroupRow {
  _id: {
    readingStyleKey: string | null;
    readingThemeId: string | null;
  };
  changeCount?: number;
  userCount?: number;
  users?: string[];
}

function normalizeDays(days?: number): number {
  if (!Number.isFinite(days)) return DEFAULT_DAYS;
  return Math.min(
    MAX_READING_THEME_STATS_DAYS,
    Math.max(1, Math.floor(days as number)),
  );
}

function buildDateRange(days: number): { startAt: Date; endAt: Date } {
  const endAt = new Date();
  const startAt = new Date(endAt.getTime() - days * 24 * 60 * 60 * 1000);
  return { startAt, endAt };
}

function styleLabel(styleKey: string | null): string {
  if (styleKey === null) return STANDARD_READING_LABEL;
  return READING_STYLE_LABELS[styleKey] || styleKey;
}

function themeLabel(themeId: string | null): string {
  if (themeId === null) return DEFAULT_THEME_LABEL;
  return THEME_DISPLAY_META[themeId]?.name || themeId;
}

function styleSortKey(styleKey: string | null): string {
  if (styleKey === null) return "0";
  return `1:${styleKey}`;
}

function themeSortKey(themeId: string | null): string {
  if (themeId === null) return "0";
  return `1:${themeId}`;
}

function buildStyleStatsFromRows(
  rows: StyleThemeGroupRow[],
  mode: "snapshot" | "changes",
  denominator: number,
): ReadingThemeStyleStat[] {
  const styleMap = new Map<
    string,
    {
      styleKey: string | null;
      total: number;
      themes: Map<
        string,
        {
          themeId: string | null;
          count: number;
          uniqueUsers?: number;
        }
      >;
    }
  >();

  for (const row of rows) {
    const styleKey = row._id.readingStyleKey ?? null;
    const themeId = row._id.readingThemeId ?? null;
    const styleKeyToken = styleKey ?? "__null__";
    const themeKeyToken = themeId ?? "__null__";
    const count =
      mode === "snapshot"
        ? row.userCount ?? 0
        : row.changeCount ?? 0;
    const uniqueUsers =
      mode === "changes" ? row.users?.length ?? 0 : undefined;

    if (!styleMap.has(styleKeyToken)) {
      styleMap.set(styleKeyToken, {
        styleKey,
        total: 0,
        themes: new Map(),
      });
    }

    const styleEntry = styleMap.get(styleKeyToken)!;
    styleEntry.total += count;

    if (!styleEntry.themes.has(themeKeyToken)) {
      styleEntry.themes.set(themeKeyToken, {
        themeId,
        count: 0,
        uniqueUsers: mode === "changes" ? 0 : undefined,
      });
    }

    const themeEntry = styleEntry.themes.get(themeKeyToken)!;
    themeEntry.count += count;
    if (mode === "changes" && uniqueUsers !== undefined) {
      themeEntry.uniqueUsers = (themeEntry.uniqueUsers ?? 0) + uniqueUsers;
    }
  }

  return [...styleMap.values()]
    .sort((a, b) => styleSortKey(a.styleKey).localeCompare(styleSortKey(b.styleKey)))
    .map((styleEntry) => {
      const themeStats = [...styleEntry.themes.values()]
        .sort((a, b) =>
          themeSortKey(a.themeId).localeCompare(themeSortKey(b.themeId)),
        )
        .map((themeEntry) => {
          const meta = themeEntry.themeId
            ? THEME_DISPLAY_META[themeEntry.themeId]
            : undefined;
          const base = {
            themeId: themeEntry.themeId,
            label: themeLabel(themeEntry.themeId),
            backgroundColor: meta?.backgroundColor,
            cardColor: meta?.cardColor,
          };

          if (mode === "snapshot") {
            return {
              ...base,
              userCount: themeEntry.count,
              percentage:
                denominator > 0
                  ? Math.round((themeEntry.count / denominator) * 1000) / 10
                  : 0,
            };
          }

          return {
            ...base,
            changeCount: themeEntry.count,
            uniqueUsers: themeEntry.uniqueUsers ?? 0,
          };
        });

      if (mode === "snapshot") {
        return {
          styleKey: styleEntry.styleKey,
          label: styleLabel(styleEntry.styleKey),
          userCount: styleEntry.total,
          percentage:
            denominator > 0
              ? Math.round((styleEntry.total / denominator) * 1000) / 10
              : 0,
          themeStats,
        };
      }

      const styleUniqueUsers = themeStats.reduce(
        (max, item) => Math.max(max, item.uniqueUsers ?? 0),
        0,
      );

      return {
        styleKey: styleEntry.styleKey,
        label: styleLabel(styleEntry.styleKey),
        changeCount: styleEntry.total,
        uniqueUsers: styleUniqueUsers,
        themeStats,
      };
    });
}

async function aggregateChanges(
  scope: ReadingThemeChangeScope,
  startAt: Date,
  endAt: Date,
): Promise<StyleThemeGroupRow[]> {
  return ReadingThemeChangeLog.aggregate<StyleThemeGroupRow>([
    {
      $match: {
        scope,
        createdAt: { $gte: startAt, $lte: endAt },
      },
    },
    {
      $group: {
        _id: {
          readingStyleKey: "$readingStyleKey",
          readingThemeId: "$readingThemeId",
        },
        changeCount: { $sum: 1 },
        users: { $addToSet: "$userId" },
      },
    },
  ]);
}

async function aggregateCurrentGlobal(): Promise<{
  rows: StyleThemeGroupRow[];
  globalScopeUserCount: number;
}> {
  const [rows, globalScopeUserCount] = await Promise.all([
    User.aggregate<StyleThemeGroupRow>([
      { $match: { readingThemeApplyScope: "global" } },
      {
        $group: {
          _id: {
            readingStyleKey: "$defaultReadingStyleKey",
            readingThemeId: "$defaultReadingThemeId",
          },
          userCount: { $sum: 1 },
        },
      },
    ]),
    User.countDocuments({ readingThemeApplyScope: "global" }),
  ]);

  return { rows, globalScopeUserCount };
}

function sumChangeCount(styleStats: ReadingThemeStyleStat[]): number {
  return styleStats.reduce((sum, item) => sum + (item.changeCount ?? 0), 0);
}

function enrichChangeStatsWithUniqueUsers(
  rows: StyleThemeGroupRow[],
): StyleThemeGroupRow[] {
  return rows.map((row) => ({
    ...row,
    changeCount: row.changeCount ?? 0,
    userCount: row.users?.length ?? 0,
  }));
}

function buildChangeStyleStats(rows: StyleThemeGroupRow[]): ReadingThemeStyleStat[] {
  const styleMap = new Map<
    string,
    {
      styleKey: string | null;
      changeCount: number;
      users: Set<string>;
      themes: Map<
        string,
        {
          themeId: string | null;
          changeCount: number;
          users: Set<string>;
        }
      >;
    }
  >();

  for (const row of rows) {
    const styleKey = row._id.readingStyleKey ?? null;
    const themeId = row._id.readingThemeId ?? null;
    const styleKeyToken = styleKey ?? "__null__";
    const themeKeyToken = themeId ?? "__null__";
    const users = row.users ?? [];

    if (!styleMap.has(styleKeyToken)) {
      styleMap.set(styleKeyToken, {
        styleKey,
        changeCount: 0,
        users: new Set<string>(),
        themes: new Map(),
      });
    }

    const styleEntry = styleMap.get(styleKeyToken)!;
    styleEntry.changeCount += row.changeCount ?? 0;
    for (const userId of users) {
      styleEntry.users.add(userId);
    }

    if (!styleEntry.themes.has(themeKeyToken)) {
      styleEntry.themes.set(themeKeyToken, {
        themeId,
        changeCount: 0,
        users: new Set<string>(),
      });
    }

    const themeEntry = styleEntry.themes.get(themeKeyToken)!;
    themeEntry.changeCount += row.changeCount ?? 0;
    for (const userId of users) {
      themeEntry.users.add(userId);
    }
  }

  return [...styleMap.values()]
    .sort((a, b) => styleSortKey(a.styleKey).localeCompare(styleSortKey(b.styleKey)))
    .map((styleEntry) => ({
      styleKey: styleEntry.styleKey,
      label: styleLabel(styleEntry.styleKey),
      changeCount: styleEntry.changeCount,
      uniqueUsers: styleEntry.users.size,
      themeStats: [...styleEntry.themes.values()]
        .sort((a, b) =>
          themeSortKey(a.themeId).localeCompare(themeSortKey(b.themeId)),
        )
        .map((themeEntry) => {
          const meta = themeEntry.themeId
            ? THEME_DISPLAY_META[themeEntry.themeId]
            : undefined;
          return {
            themeId: themeEntry.themeId,
            label: themeLabel(themeEntry.themeId),
            backgroundColor: meta?.backgroundColor,
            cardColor: meta?.cardColor,
            changeCount: themeEntry.changeCount,
            uniqueUsers: themeEntry.users.size,
          };
        }),
    }));
}

export class AdminReadingThemeStatsService {
  static invalidateReportCache(): void {
    invalidateCacheByPrefix(READING_THEME_STATS_CACHE_PREFIX);
  }

  static async getReport(
    query: AdminReadingThemeStatsQuery = {},
  ): Promise<AdminReadingThemeStatsReport> {
    const days = normalizeDays(query.days);
    const cacheKey = buildCacheKey(
      READING_THEME_STATS_CACHE_PREFIX,
      String(days),
    );

    return getOrSetCache(
      cacheKey,
      CACHE_CONFIG.admin.readingThemeStatsTtlSeconds,
      () => AdminReadingThemeStatsService.buildReport(days),
    );
  }

  private static async buildReport(
    days: number,
  ): Promise<AdminReadingThemeStatsReport> {
    const { startAt, endAt } = buildDateRange(days);

    const [
      totalUsers,
      currentGlobalAgg,
      globalChangeRows,
      noteChangeRows,
    ] = await Promise.all([
      User.countDocuments(),
      aggregateCurrentGlobal(),
      aggregateChanges("global", startAt, endAt),
      aggregateChanges("note", startAt, endAt),
    ]);

    const currentGlobalStyleStats = buildStyleStatsFromRows(
      currentGlobalAgg.rows,
      "snapshot",
      currentGlobalAgg.globalScopeUserCount,
    );
    const globalChanges = buildChangeStyleStats(
      enrichChangeStatsWithUniqueUsers(globalChangeRows),
    );
    const noteChanges = buildChangeStyleStats(
      enrichChangeStatsWithUniqueUsers(noteChangeRows),
    );

    return {
      generatedAt: new Date().toISOString(),
      days,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      totalUsers,
      globalScopeUserCount: currentGlobalAgg.globalScopeUserCount,
      totalGlobalChanges: sumChangeCount(globalChanges),
      totalNoteChanges: sumChangeCount(noteChanges),
      currentGlobal: {
        styleStats: currentGlobalStyleStats,
      },
      globalChanges,
      noteChanges,
    };
  }
}
