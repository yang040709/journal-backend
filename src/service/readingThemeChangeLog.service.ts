import ReadingThemeChangeLog, {
  type ReadingThemeChangeScope,
} from "../model/ReadingThemeChangeLog";
import { AdminReadingThemeStatsService } from "./adminReadingThemeStats.service";

export interface ReadingThemeSelection {
  readingStyleKey: string | null;
  readingThemeId: string | null;
}

function normalizeSelection(
  selection: ReadingThemeSelection,
): ReadingThemeSelection {
  const readingStyleKey =
    selection.readingStyleKey === undefined ||
    selection.readingStyleKey === null
      ? null
      : String(selection.readingStyleKey);
  const readingThemeId =
    readingStyleKey === null ||
    selection.readingThemeId === undefined ||
    selection.readingThemeId === null
      ? null
      : String(selection.readingThemeId);

  return { readingStyleKey, readingThemeId };
}

function isSameSelection(
  left: ReadingThemeSelection,
  right: ReadingThemeSelection,
): boolean {
  const a = normalizeSelection(left);
  const b = normalizeSelection(right);
  return (
    a.readingStyleKey === b.readingStyleKey &&
    a.readingThemeId === b.readingThemeId
  );
}

export class ReadingThemeChangeLogService {
  static async recordChange(
    userId: string,
    scope: ReadingThemeChangeScope,
    before: ReadingThemeSelection,
    after: ReadingThemeSelection,
    noteId?: string,
  ): Promise<void> {
    if (isSameSelection(before, after)) {
      return;
    }

    const normalized = normalizeSelection(after);

    await ReadingThemeChangeLog.create({
      userId,
      scope,
      noteId: scope === "note" ? noteId : undefined,
      readingStyleKey: normalized.readingStyleKey,
      readingThemeId: normalized.readingThemeId,
    });

    AdminReadingThemeStatsService.invalidateReportCache();
  }
}
