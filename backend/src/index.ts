import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';

// Ensure storage directory exists
mkdirSync('./storage', { recursive: true });

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
      const signUrl = `http://localhost:5173/sign/${id}`;

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

    // Mock outgoing email notification dispatch preview
    const emailPreview = {
      to: body.signerEmail,
      from: 'BlockSign Dispatch <notifications@blocksign.io>',
      subject: uploadedDocs.length === 1 
        ? `Action Required: Please sign "${uploadedDocs[0].fileName}"`
        : `Action Required: ${uploadedDocs.length} documents awaiting your signature`,
      body: `You have received ${uploadedDocs.length} document(s) for digital signature via BlockSign. Review and execute each document securely via the attached signing link(s).`,
      link: uploadedDocs[0].signUrl,
      documents: uploadedDocs,
      dispatchedAt: now
    };

    return { 
      success: true, 
      count: uploadedDocs.length,
      documents: uploadedDocs,
      // Backward compatibility fields for single upload handlers
      documentId: uploadedDocs[0].id, 
      fileName: uploadedDocs[0].fileName,
      signUrl: uploadedDocs[0].signUrl,
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
      fileUrl: `http://localhost:3000/api/document/${params.id}/file` 
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

      const firstPage = pages[0];
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const timestamp = new Date().toISOString();
      const displayDate = new Date().toLocaleString();

      // Draw visible signature verification badge onto first page
      firstPage.drawRectangle({
        x: 45,
        y: 40,
        width: 320,
        height: 65,
        borderColor: rgb(0.12, 0.44, 0.98),
        borderWidth: 1.5,
        color: rgb(0.96, 0.98, 1.0),
        opacity: 0.95,
      });

      firstPage.drawText(`[VERIFIED] Digitally Signed with BlockSign`, {
        x: 55,
        y: 85,
        size: 10,
        font: helveticaBold,
        color: rgb(0.12, 0.44, 0.98),
      });

      firstPage.drawText(`Signed by: ${body.signerName}`, {
        x: 55,
        y: 68,
        size: 11,
        font: helveticaBold,
        color: rgb(0.1, 0.1, 0.1),
      });

      firstPage.drawText(`Date: ${displayDate} • Ref: ${params.id.slice(0, 8)}`, {
        x: 55,
        y: 50,
        size: 8.5,
        font: helvetica,
        color: rgb(0.4, 0.4, 0.4),
      });

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
        downloadUrl: `http://localhost:3000/api/download/${params.id}`,
        fileUrl: `http://localhost:3000/api/document/${params.id}/file`,
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
      signerName: t.String()
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

  // 8. Seed 20 Sample Documents for showcase
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

    for (let i = 0; i < sampleList.length; i++) {
      const item = sampleList[i];
      const id = `sample-${crypto.randomUUID()}`;
      const originalPath = `./storage/${id}-${item.title}`;
      const signedPath = item.status === 'completed' ? `./storage/signed-${id}.pdf` : null;
      
      const createdDate = new Date(Date.now() - (sampleList.length - i) * 3600000 * 4).toISOString();
      const signedDate = item.status === 'completed' ? new Date(Date.now() - (sampleList.length - i) * 3600000 * 2).toISOString() : null;

      // Create a lightweight valid sample PDF
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([500, 600]);
      page.drawText(`BlockSign Document: ${item.title}`, { x: 50, y: 550, size: 16 });
      page.drawText(`Recipient: ${item.email}`, { x: 50, y: 520, size: 12 });
      page.drawText(`Dispatched: ${new Date(createdDate).toLocaleString()}`, { x: 50, y: 490, size: 10 });

      if (item.status === 'completed') {
        page.drawRectangle({
          x: 45, y: 40, width: 320, height: 65,
          borderColor: rgb(0.12, 0.44, 0.98), borderWidth: 1.5,
          color: rgb(0.96, 0.98, 1.0), opacity: 0.95
        });
        page.drawText(`[VERIFIED] Digitally Signed with BlockSign`, { x: 55, y: 85, size: 10, color: rgb(0.12, 0.44, 0.98) });
        page.drawText(`Signed by: ${item.signer}`, { x: 55, y: 68, size: 11, color: rgb(0.1, 0.1, 0.1) });
        page.drawText(`Date: ${new Date(signedDate!).toLocaleString()} • Ref: ${id.slice(0, 8)}`, { x: 55, y: 50, size: 8.5, color: rgb(0.4, 0.4, 0.4) });
      }

      const pdfBytes = await pdfDoc.save();
      await Bun.write(originalPath, pdfBytes);
      if (signedPath) {
        await Bun.write(signedPath, pdfBytes);
      }

      db.run(
        'INSERT INTO documents (id, title, original_path, signed_path, status, signer_email, created_at, signed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, item.title, originalPath, signedPath, item.status, item.email, createdDate, signedDate]
      );
    }

    return { success: true, message: 'Seeded 20 sample documents successfully', count: sampleList.length };
  });

if (import.meta.main) {
  app.listen(3000);
  console.log(`BlockSign Backend running at ${app.server?.hostname}:${app.server?.port}`);
}