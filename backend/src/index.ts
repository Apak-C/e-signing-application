import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Database } from 'bun:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Ensure storage directory exists
mkdirSync('./storage', { recursive: true });

// Dynamic base URL for production vs development
const PORT = Number(process.env.PORT) || 3000;
const getBaseUrl = () => {
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL;
  return `http://localhost:${PORT}`;
};
const getFrontendUrl = () => {
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL;
  return 'http://localhost:5173';
};

// Check if frontend dist exists (production mode)
const FRONTEND_DIST = join(import.meta.dir, '../../frontend/dist');
const IS_PRODUCTION = existsSync(FRONTEND_DIST);

export const db = new Database('blocksign.db');
db.run(`CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT,
  original_path TEXT,
  signed_path TEXT,
  status TEXT,
  signer_email TEXT,
  created_at TEXT,
  signed_at TEXT
)`);

// Ensure columns exist
try { db.run(`ALTER TABLE documents ADD COLUMN created_at TEXT`); } catch {}
try { db.run(`ALTER TABLE documents ADD COLUMN signed_at TEXT`); } catch {}

export const app = new Elysia()
  .use(cors())
  .get('/health', () => ({ status: 'ok', runtime: 'bun' }))
  
  // 1. Multi-File Batch Upload & Request Signature
  .post('/api/upload', async ({ body, set }) => {
    let rawFiles: File[] = [];

    if (body.files) {
      if (Array.isArray(body.files)) {
        rawFiles = body.files;
      } else if (body.files instanceof File || (body.files && (body.files as any).name)) {
        rawFiles = [body.files as File];
      } else if (typeof body.files === 'object') {
        rawFiles = Object.values(body.files).filter((f: any) => f && f.name) as File[];
      }
    }

    if (body.file) {
      if (Array.isArray(body.file)) {
        rawFiles.push(...body.file);
      } else if (body.file instanceof File || (body.file && (body.file as any).name)) {
        rawFiles.push(body.file as File);
      }
    }

    if (rawFiles.length === 0) {
      set.status = 400;
      return {
        success: false,
        error: 'No files provided. Please select at least one PDF file.'
      };
    }

    const now = new Date().toISOString();
    const uploadedDocs: Array<{ id: string; fileName: string; signUrl: string }> = [];

    for (const file of rawFiles) {
      // Validate that the file is a PDF
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        set.status = 400;
        return {
          success: false,
          error: `Unsupported file format in "${file.name}". Only PDF documents (.pdf) are supported.`
        };
      }

      const id = crypto.randomUUID();
      const originalPath = `./storage/${id}-${file.name}`;
      const signUrl = `${getFrontendUrl()}/sign/${id}`;

      await Bun.write(originalPath, file);

      db.run(
        'INSERT INTO documents (id, title, original_path, status, signer_email, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, file.name, originalPath, 'pending', body.signerEmail, now]
      );

      uploadedDocs.push({
        id,
        fileName: file.name,
        signUrl
      });
    }

    const firstDoc = uploadedDocs[0]!;

    // Mock outgoing email notification dispatch preview
    const emailPreview = {
      to: body.signerEmail,
      from: 'InkFlow Dispatch <notifications@inkflow.io>',
      subject: uploadedDocs.length === 1 
        ? `Action Required: Please sign "${firstDoc.fileName}"`
        : `Action Required: ${uploadedDocs.length} documents awaiting your signature`,
      body: `You have received ${uploadedDocs.length} document(s) for digital signature via InkFlow. Review and execute each document securely via the attached signing link(s).`,
      link: firstDoc.signUrl,
      documents: uploadedDocs,
      dispatchedAt: now
    };

    return { 
      success: true, 
      count: uploadedDocs.length,
      documents: uploadedDocs,
      // Backward compatibility fields for single upload handlers
      documentId: firstDoc.id, 
      fileName: firstDoc.fileName,
      signUrl: firstDoc.signUrl,
      emailPreview
    };
  }, {
    body: t.Object({
      signerEmail: t.String(),
      files: t.Optional(t.Any()),
      file: t.Optional(t.Any())
    })
  })

  // 2. Fetch All Documents
  .get('/api/documents', () => {
    const docs = db.query('SELECT id, title, status, signer_email, created_at, signed_at FROM documents ORDER BY rowid DESC').all();
    return { success: true, documents: docs };
  })

  // 3. Fetch Single Document Details
  .get('/api/document/:id', async ({ params, set }) => {
    const doc = db.query('SELECT id, title, status, signer_email, created_at, signed_at FROM documents WHERE id = ?').get(params.id) as any;
    if (!doc) {
      set.status = 404;
      return { error: 'Document not found' };
    }
    return { 
      success: true, 
      document: doc,
      fileUrl: `${getBaseUrl()}/api/document/${params.id}/file` 
    };
  })

  // 4. Stream Raw / Inline PDF File for embedded browser viewing
  .get('/api/document/:id/file', async ({ params, set }) => {
    const doc = db.query('SELECT * FROM documents WHERE id = ?').get(params.id) as any;
    if (!doc) {
      set.status = 404;
      return { error: 'Document not found' };
    }

    const targetPath = doc.signed_path && doc.status === 'completed' ? doc.signed_path : doc.original_path;
    const file = Bun.file(targetPath);
    const exists = await file.exists();
    if (!exists) {
      set.status = 404;
      return { error: 'File on disk not found' };
    }

    set.headers['Content-Type'] = 'application/pdf';
    set.headers['Content-Disposition'] = `inline; filename="${doc.title || 'document.pdf'}"`;
    return file;
  })

  // 5. Sign Document Endpoint
  .post('/api/sign/:id', async ({ params, body, set }) => {
    const doc = db.query('SELECT * FROM documents WHERE id = ?').get(params.id) as any;
    if (!doc) {
      set.status = 404;
      return { success: false, error: 'Document not found or invalid signing link' };
    }

    try {
      const existingPdfBytes = await Bun.file(doc.original_path).arrayBuffer();
      
      let pdfDoc: PDFDocument;
      try {
        pdfDoc = await PDFDocument.load(existingPdfBytes);
      } catch (pdfErr) {
        set.status = 400;
        return { 
          success: false, 
          error: 'The uploaded file is not a valid PDF document. Please re-upload as a standard PDF file.' 
        };
      }

      const pages = pdfDoc.getPages();
      if (pages.length === 0) {
        set.status = 400;
        return { success: false, error: 'The PDF file contains no pages.' };
      }

      const pageIndex = typeof body.pageNumber === 'number' ? Math.max(0, Math.min(pages.length - 1, body.pageNumber - 1)) : 0;
      const targetPage = (pages[pageIndex] || pages[0])!;
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const timestamp = new Date().toISOString();

      const hasSignatureImage = !!(body.signatureImage && body.signatureImage.startsWith('data:image/'));
      const posX = typeof body.x === 'number' ? body.x : 55;
      const posY = typeof body.y === 'number' ? body.y : 65;

      // Draw clean signature stamp without Date or Ref lines
      if (hasSignatureImage) {
        try {
          const base64Data = body.signatureImage!.replace(/^data:image\/\w+;base64,/, '');
          const imageBytes = Uint8Array.from(Buffer.from(base64Data, 'base64'));
          const embeddedImage = await pdfDoc.embedPng(imageBytes);

          // Draw the user's actual drawn signature image at target (x, y)
          targetPage.drawImage(embeddedImage, {
            x: posX,
            y: posY,
            width: 140,
            height: 50,
          });
        } catch (imgErr) {
          console.warn('Could not embed custom signature PNG:', imgErr);
        }

        // Draw signer name directly under the signature image (without 'Signed by:' prefix)
        targetPage.drawText(body.signerName, {
          x: posX,
          y: Math.max(5, posY - 14),
          size: 11,
          font: helveticaBold,
          color: rgb(0.1, 0.1, 0.1),
        });
      } else {
        targetPage.drawText(body.signerName, {
          x: posX,
          y: posY,
          size: 12,
          font: helveticaBold,
          color: rgb(0.1, 0.1, 0.1),
        });
      }

      const pdfBytes = await pdfDoc.save();
      const signedPath = `./storage/signed-${params.id}.pdf`;
      await Bun.write(signedPath, pdfBytes);

      db.run(
        'UPDATE documents SET status = ?, signed_path = ?, signed_at = ? WHERE id = ?', 
        ['completed', signedPath, timestamp, params.id]
      );

      return { 
        success: true, 
        message: 'Document successfully signed and returned to sender', 
        downloadUrl: `${getBaseUrl()}/api/download/${params.id}`,
        fileUrl: `${getBaseUrl()}/api/document/${params.id}/file`,
        signedAt: timestamp
      };
    } catch (err: any) {
      console.error('Error signing document:', err);
      set.status = 500;
      return { 
        success: false, 
        error: `Server failed to stamp document: ${err?.message || 'Unknown error'}` 
      };
    }
  }, {
    body: t.Object({
      signerName: t.String(),
      signatureImage: t.Optional(t.String()),
      x: t.Optional(t.Number()),
      y: t.Optional(t.Number()),
      pageNumber: t.Optional(t.Number())
    })
  })

  // 6. Download Signed Document Endpoint
  .get('/api/download/:id', async ({ params, set }) => {
    const doc = db.query('SELECT * FROM documents WHERE id = ?').get(params.id) as any;
    if (!doc || !doc.signed_path) {
      set.status = 404;
      return { error: 'Signed document not found or not yet signed' };
    }

    const file = Bun.file(doc.signed_path);
    const exists = await file.exists();
    if (!exists) {
      set.status = 404;
      return { error: 'File on disk not found' };
    }

    set.headers['Content-Type'] = 'application/pdf';
    set.headers['Content-Disposition'] = `attachment; filename="signed-${doc.title || 'document.pdf'}"`;
    return file;
  })

  // 7. Delete/Close Document Endpoint
  .delete('/api/document/:id', async ({ params, set }) => {
    const doc = db.query('SELECT * FROM documents WHERE id = ?').get(params.id) as any;
    if (!doc) {
      set.status = 404;
      return { success: false, error: 'Document not found' };
    }

    db.run('DELETE FROM documents WHERE id = ?', [params.id]);
    return { success: true, message: 'Document removed successfully' };
  })

  // 8. Seed 20 Clean Sample Documents for showcase
  .post('/api/seed', async () => {
    const sampleList = [
      { title: 'Non-Disclosure Agreement (NDA).pdf', email: 'sarah.jenkins@techcorp.io', status: 'completed', signer: 'Sarah Jenkins' },
      { title: 'Software License Agreement.pdf', email: 'david.miller@enterprise.com', status: 'pending', signer: '' },
      { title: 'Employment Contract - Senior Engineer.pdf', email: 'elena.rostova@cloudscale.net', status: 'completed', signer: 'Elena Rostova' },
      { title: 'Vendor Services Master Agreement.pdf', email: 'marcus.chen@nexusmedia.com', status: 'pending', signer: '' },
      { title: 'Mutual Confidentiality Agreement.pdf', email: 'amanda.baker@fintechpulse.io', status: 'completed', signer: 'Amanda Baker' },
      { title: 'Commercial Lease Agreement.pdf', email: 'robert.fischer@apexholdings.com', status: 'pending', signer: '' },
      { title: 'Consulting Statement of Work.pdf', email: 'julia.vance@quantumdigital.co', status: 'completed', signer: 'Julia Vance' },
      { title: 'IP Assignment & Transfer Deed.pdf', email: 'kevin.wright@innovatelabs.io', status: 'pending', signer: '' },
      { title: 'Freelance Design Contract.pdf', email: 'chloe.dupont@ateliercreatif.fr', status: 'completed', signer: 'Chloe Dupont' },
      { title: 'Enterprise SLA Agreement.pdf', email: 'samuel.oak@globalcloud.com', status: 'pending', signer: '' },
      { title: 'Privacy Policy Acknowledgment.pdf', email: 'lucas.silva@brasiltech.com.br', status: 'completed', signer: 'Lucas Silva' },
      { title: 'Partner Distribution Agreement.pdf', email: 'hannah.schmidt@nordicventures.de', status: 'pending', signer: '' },
      { title: 'Board Resolution Consent.pdf', email: 'victor.kane@kaneenterprises.com', status: 'completed', signer: 'Victor Kane' },
      { title: 'Real Estate Purchase Offer.pdf', email: 'rachel.green@manhattanrealty.com', status: 'pending', signer: '' },
      { title: 'Software Maintenance Contract.pdf', email: 'brian.adams@rockwellsys.com', status: 'completed', signer: 'Brian Adams' },
      { title: 'Employee Stock Option Plan (ESOP).pdf', email: 'natalie.portman@biogenics.org', status: 'pending', signer: '' },
      { title: 'Master Service Agreement (MSA).pdf', email: 'george.clanton@vaporwave.fm', status: 'completed', signer: 'George Clanton' },
      { title: 'Independent Contractor Agreement.pdf', email: 'fiona.gallagher@southsideops.com', status: 'pending', signer: '' },
      { title: 'Affiliate Marketing Agreement.pdf', email: 'ethan.hunt@imf-security.gov', status: 'completed', signer: 'Ethan Hunt' },
      { title: 'Term Sheet - Series A Financing.pdf', email: 'maya.lin@horizonventures.com', status: 'pending', signer: '' },
    ];

    sampleList.forEach((item, i) => {
      const id = `sample-${crypto.randomUUID()}`;
      const originalPath = `./storage/${id}-${item.title}`;
      const signedPath = item.status === 'completed' ? `./storage/signed-${id}.pdf` : null;
      
      const createdDate = new Date(Date.now() - (sampleList.length - i) * 3600000 * 4).toISOString();
      const signedDate = item.status === 'completed' ? new Date(Date.now() - (sampleList.length - i) * 3600000 * 2).toISOString() : null;

      // Create a clean valid original sample PDF without any signature stamp
      PDFDocument.create().then(async (pdfDoc) => {
        const page = pdfDoc.addPage([500, 600]);
        page.drawText(`InkFlow Document: ${item.title}`, { x: 50, y: 550, size: 16 });
        page.drawText(`Recipient: ${item.email}`, { x: 50, y: 520, size: 12 });
        page.drawText(`Dispatched: ${new Date(createdDate).toLocaleString()}`, { x: 50, y: 490, size: 10 });

        const originalBytes = await pdfDoc.save();
        await Bun.write(originalPath, originalBytes);

        // If completed, create signed version with clean signer name only (no Date, Ref, or Signed by: prefix)
        if (item.status === 'completed' && signedPath) {
          const signedDoc = await PDFDocument.load(originalBytes);
          const signedPage = signedDoc.getPages()[0]!;
          const font = await signedDoc.embedFont(StandardFonts.HelveticaBold);
          signedPage.drawText(item.signer, { x: 55, y: 65, size: 12, font, color: rgb(0.1, 0.1, 0.1) });
          const signedBytes = await signedDoc.save();
          await Bun.write(signedPath, signedBytes);
        }

        db.run(
          'INSERT INTO documents (id, title, original_path, signed_path, status, signer_email, created_at, signed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [id, item.title, originalPath, signedPath, item.status, item.email, createdDate, signedDate]
        );
      });
    });

    return { success: true, message: 'Seeded 20 clean sample documents successfully', count: sampleList.length };
  });

// Serve frontend static files in production
if (IS_PRODUCTION) {
  app
    .get('/assets/*', async ({ params, set }) => {
      const filePath = join(FRONTEND_DIST, 'assets', (params as any)['*']);
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return file;
      }
      set.status = 404;
      return 'Not found';
    })
    .get('/favicon.svg', async () => Bun.file(join(FRONTEND_DIST, 'favicon.svg')))
    .get('/logo.svg', async () => Bun.file(join(FRONTEND_DIST, 'logo.svg')))
    .get('/*', async ({ path, set }) => {
      // Try to serve exact static file first
      const exactFile = Bun.file(join(FRONTEND_DIST, path));
      if (await exactFile.exists()) {
        return exactFile;
      }
      // SPA fallback: serve index.html for all non-API routes
      return Bun.file(join(FRONTEND_DIST, 'index.html'));
    });
  console.log('Production mode: serving frontend from', FRONTEND_DIST);
}

if (import.meta.main) {
  app.listen(PORT);
  console.log(`InkFlow Backend running at ${app.server?.hostname}:${app.server?.port}`);
}