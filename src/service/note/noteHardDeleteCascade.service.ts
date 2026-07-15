import { MediaReferenceService } from "../mediaReference.service";
import { ShareSecurityTaskService } from "../shareSecurityTask.service";

/**
 * Hard-delete side effects shared by trash purge, Admin live delete,
 * Admin notebook delete, and user-migration overwrite.
 * Does not delete the Note document itself.
 */
export async function cascadeHardDeleteNoteSideEffects(
  userId: string,
  noteId: string,
): Promise<void> {
  if (!userId || !noteId) return;

  await MediaReferenceService.releaseNoteRefs(userId, noteId);

  const { ReminderService } = await import("../reminder.service");
  await ReminderService.deleteByNoteId(noteId, userId);

  await ShareSecurityTaskService.deleteByNoteId(noteId, userId);
}

export async function cascadeHardDeleteNoteSideEffectsMany(
  userId: string,
  noteIds: string[],
): Promise<void> {
  const ids = (noteIds || [])
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  if (!userId || !ids.length) return;

  // Sequential: releaseNoteRefs may enqueue COS deletes; keep order predictable.
  for (const noteId of ids) {
    await cascadeHardDeleteNoteSideEffects(userId, noteId);
  }
}
