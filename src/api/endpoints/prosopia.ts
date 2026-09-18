/**
 * Typed wrappers for the Prosopia import job.
 *
 * Same style as ``endpoints/wizard.ts``: talks to ``../client`` directly
 * (no apiSwitch / mock branch) and emits dataBus events at the points
 * where server state changed.
 */

import { apiGet, apiPost } from '../client';
import { dataBus } from '../../lib/dataBus';
import type {
  ProsopiaImportRequest,
  ProsopiaImportStart,
  ProsopiaImportStatus,
} from '../../types/prosopia';

export async function startProsopiaImport(
  body: ProsopiaImportRequest,
): Promise<ProsopiaImportStart> {
  const res = await apiPost<ProsopiaImportStart>('/api/import/prosopia', body);
  // A draft row now exists server-side.
  dataBus.emit('profiles:changed');
  return res;
}

export async function getProsopiaImportStatus(
  runId: number,
): Promise<ProsopiaImportStatus> {
  const status = await apiGet<ProsopiaImportStatus>(
    `/api/import/prosopia/${runId}`,
  );
  // The job attaches seeds to the draft as it finishes; the polling
  // component stops after the first finished response, so this fires once.
  if (status.run.finished_at && !status.run.error) {
    dataBus.emit('profiles:changed');
    dataBus.emit('vault:changed');
  }
  return status;
}
