import { describe, expect, test } from "bun:test";
import { app } from "../src/index";
import { PDFDocument } from "pdf-lib";

describe("InkFlow Comprehensive API & Core Logic Tests", () => {
  const samplePng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  // Helper to generate a valid PDF byte buffer
  const createTestPdf = async (pageCount = 1): Promise<Uint8Array> => {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i++) {
      pdfDoc.addPage([500, 700]);
    }
    return await pdfDoc.save();
  };

  // 1. Health & Runtime Endpoint
  test("1. GET /health returns ok status and bun runtime", async () => {
    const res = await app.handle(new Request("http://localhost/health"));
    const data: any = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.runtime).toBe("bun");
  });

  // 2. Upload Validation - Missing Files
  test("2. POST /api/upload returns 400 when no files are attached", async () => {
    const formData = new FormData();
    formData.append("signerEmail", "test.signer@enterprise.com");

    const res = await app.handle(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body: formData,
      })
    );
    const data: any = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("No files provided");
  });

  // 3. Upload Validation - Non-PDF File Format
  test("3. POST /api/upload rejects non-PDF document formats (.txt)", async () => {
    const formData = new FormData();
    formData.append("files", new File(["sample text"], "invalid.txt", { type: "text/plain" }));
    formData.append("signerEmail", "test.signer@enterprise.com");

    const res = await app.handle(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body: formData,
      })
    );
    const data: any = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Unsupported file format");
  });

  // 4. Successful Single PDF Upload & Email Dispatch Preview
  test("4. POST /api/upload successfully uploads single PDF document", async () => {
    const pdfBytes = await createTestPdf(1);
    const formData = new FormData();
    formData.append("files", new File([pdfBytes], "Executive_NDA.pdf", { type: "application/pdf" }));
    formData.append("signerEmail", "executive@enterprise.com");

    const res = await app.handle(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body: formData,
      })
    );
    const data: any = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.count).toBe(1);
    expect(data.documents[0].fileName).toBe("Executive_NDA.pdf");
    expect(data.emailPreview.to).toBe("executive@enterprise.com");
  });

  // 5. Multi-File Batch Document Upload
  test("5. POST /api/upload handles multi-document batch signing requests", async () => {
    const pdfBytes1 = await createTestPdf(1);
    const pdfBytes2 = await createTestPdf(2);

    const formData = new FormData();
    formData.append("files", new File([pdfBytes1], "Batch_Doc_1.pdf", { type: "application/pdf" }));
    formData.append("files", new File([pdfBytes2], "Batch_Doc_2.pdf", { type: "application/pdf" }));
    formData.append("signerEmail", "batch.signer@enterprise.com");

    const res = await app.handle(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body: formData,
      })
    );
    const data: any = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.count).toBe(2);
    expect(data.documents.length).toBe(2);
  });

  // 6. Fetch Document Activity List
  test("6. GET /api/documents returns list of all uploaded contracts", async () => {
    const res = await app.handle(new Request("http://localhost/api/documents"));
    const data: any = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.documents)).toBe(true);
    expect(data.documents.length).toBeGreaterThan(0);
  });

  // 7. Single Document Details & 404 Error Handling
  test("7. GET /api/document/:id fetches details or returns 404 for invalid ID", async () => {
    const invalidRes = await app.handle(new Request("http://localhost/api/document/non-existent-id"));
    expect(invalidRes.status).toBe(404);

    // Get a valid document ID from documents list
    const listRes = await app.handle(new Request("http://localhost/api/documents"));
    const listData: any = await listRes.json();
    const validId = listData.documents[0].id;

    const validRes = await app.handle(new Request(`http://localhost/api/document/${validId}`));
    const validData: any = await validRes.json();
    expect(validRes.status).toBe(200);
    expect(validData.success).toBe(true);
    expect(validData.document.id).toBe(validId);
  });

  // 8. Stream Raw Inline PDF File for Browser Viewer
  test("8. GET /api/document/:id/file streams PDF with correct Content-Type headers", async () => {
    const listRes = await app.handle(new Request("http://localhost/api/documents"));
    const listData: any = await listRes.json();
    const docId = listData.documents[0].id;

    const res = await app.handle(new Request(`http://localhost/api/document/${docId}/file`));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("inline");
  });

  // 9. Sign Document with Custom Signature Drawing & Coordinates
  test("9. POST /api/sign/:id stamps signature image and updates status to completed", async () => {
    // Upload a new document to sign
    const pdfBytes = await createTestPdf(2);
    const formData = new FormData();
    formData.append("files", new File([pdfBytes], "Contract_To_Sign.pdf", { type: "application/pdf" }));
    formData.append("signerEmail", "signer@enterprise.com");

    const uploadRes = await app.handle(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body: formData,
      })
    );
    const uploadData: any = await uploadRes.json();
    const docId = uploadData.documents[0].id;

    // Sign the document
    const signRes = await app.handle(
      new Request(`http://localhost/api/sign/${docId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signerName: "Jonathan Vance",
          signatureImage: samplePng,
          x: 120,
          y: 200,
          pageNumber: 1,
        }),
      })
    );
    const signData: any = await signRes.json();
    expect(signRes.status).toBe(200);
    expect(signData.success).toBe(true);
    expect(signData.downloadUrl).toContain(`/api/download/${docId}`);

    // Verify document status in DB updated to completed
    const docDetailRes = await app.handle(new Request(`http://localhost/api/document/${docId}`));
    const docDetailData: any = await docDetailRes.json();
    expect(docDetailData.document.status).toBe("completed");
    expect(docDetailData.document.signed_at).toBeDefined();
  });

  // 10. Download Executed Signed PDF Attachment
  test("10. GET /api/download/:id delivers signed PDF attachment or 404 for unsigned", async () => {
    // Test unsigned 404
    const pdfBytes = await createTestPdf(1);
    const formData = new FormData();
    formData.append("files", new File([pdfBytes], "Unsigned_Doc.pdf", { type: "application/pdf" }));
    formData.append("signerEmail", "unsigned@enterprise.com");

    const uploadRes = await app.handle(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body: formData,
      })
    );
    const uploadData: any = await uploadRes.json();
    const unsignedId = uploadData.documents[0].id;

    const unsignedDownloadRes = await app.handle(new Request(`http://localhost/api/download/${unsignedId}`));
    expect(unsignedDownloadRes.status).toBe(404);

    // Sign the document and test download
    await app.handle(
      new Request(`http://localhost/api/sign/${unsignedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerName: "Elena Rostova" }),
      })
    );

    const signedDownloadRes = await app.handle(new Request(`http://localhost/api/download/${unsignedId}`));
    expect(signedDownloadRes.status).toBe(200);
    expect(signedDownloadRes.headers.get("Content-Type")).toBe("application/pdf");
    expect(signedDownloadRes.headers.get("Content-Disposition")).toContain("attachment");
  });

  // 11. Document Deletion Lifecycle
  test("11. DELETE /api/document/:id removes document from system", async () => {
    const pdfBytes = await createTestPdf(1);
    const formData = new FormData();
    formData.append("files", new File([pdfBytes], "Delete_Me.pdf", { type: "application/pdf" }));
    formData.append("signerEmail", "delete@enterprise.com");

    const uploadRes = await app.handle(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body: formData,
      })
    );
    const uploadData: any = await uploadRes.json();
    const docId = uploadData.documents[0].id;

    const deleteRes = await app.handle(
      new Request(`http://localhost/api/document/${docId}`, {
        method: "DELETE",
      })
    );
    const deleteData: any = await deleteRes.json();
    expect(deleteRes.status).toBe(200);
    expect(deleteData.success).toBe(true);

    // Verify it returns 404 after deletion
    const fetchRes = await app.handle(new Request(`http://localhost/api/document/${docId}`));
    expect(fetchRes.status).toBe(404);
  });

  // 12. Seed 20 Clean Sample Contracts Showcase
  test("12. POST /api/seed seeds sample documents into database", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/seed", {
        method: "POST",
      })
    );
    const data: any = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.count).toBe(20);
  });
});
