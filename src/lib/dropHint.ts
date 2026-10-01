/**
 * A drop that carries no files used to do nothing at all, which read as
 * "drag and drop is broken". It is what a browser hands over for an item
 * dragged out of Zotero, its own download bar or a mail attachment: a link
 * or a file promise, not a file. Say so.
 */
import { toast } from './toast';

export function notifyEmptyDrop(): void {
  toast.info(
        'Nothing to upload came through. Drag the PDF file itself, from Finder or File Explorer. '
        + 'Items dragged from Zotero, a browser\'s download bar or an email arrive as links, not files: '
        + 'save the PDF first, then drag it in or click to browse.',
  );
}
