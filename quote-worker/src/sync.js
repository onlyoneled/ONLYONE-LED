import { getGoogleAccessToken } from './google-auth.js';
import { listFolders, listPDFs, downloadPDF } from './drive.js';
import { extractQuoteData } from './claude-pdf.js';

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10MB limit

export async function syncDrive(env) {
  const credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT);
  const token = await getGoogleAccessToken(
    credentials,
    'https://www.googleapis.com/auth/drive.readonly'
  );

  const folders = await listFolders(token, env.DRIVE_ROOT_FOLDER_ID);
  const results = { processed: 0, skipped: 0, errors: [] };

  for (const folder of folders) {
    const vendor = folder.name;
    const pdfs = await listPDFs(token, folder.id);

    for (const pdf of pdfs) {
      try {
        // Skip already processed
        const existing = await env.DB.prepare(
          'SELECT id FROM quotes WHERE drive_file_id = ?'
        ).bind(pdf.id).first();

        if (existing) { results.skipped++; continue; }

        // Size guard
        const sizeBytes = parseInt(pdf.size || '0');
        if (sizeBytes > MAX_PDF_BYTES) {
          results.errors.push({ file: pdf.name, vendor, error: `PDF too large: ${Math.round(sizeBytes/1024)}KB` });
          continue;
        }

        const buf = await downloadPDF(token, pdf.id);
        const quote = await extractQuoteData(env.CLAUDE_API_KEY, buf, vendor, pdf.name);

        await env.DB.prepare(
          `INSERT INTO quotes (vendor, title, date, items, content, total_price, drive_file_id, drive_file_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          vendor,
          quote.title || pdf.name,
          quote.date || null,
          JSON.stringify(quote.items || []),
          quote.content || null,
          quote.total_price || null,
          pdf.id,
          pdf.name
        ).run();

        results.processed++;
      } catch (err) {
        results.errors.push({ file: pdf.name, vendor, error: err.message });
      }
    }
  }

  return results;
}
