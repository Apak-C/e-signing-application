import { describe, expect, test } from "bun:test";
import { app } from "../src/index";
import { PDFDocument } from "pdf-lib";

describe("BlockSign Backend API", () => {
  test("Health check returns correct runtime", async () => {
    const response = await app.handle(new Request("http://localhost/health"));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.status).toEqual("ok");
    expect(data.runtime).toEqual("bun");
  });

  test("Upload PDF document with email dispatch, list documents, sign, and download", async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([400, 400]);
    const pdfBytes = await pdfDoc.save();

    const formData = new FormData();
    formData.append("file", new File([pdfBytes], "partnership_agreement.pdf", { type: "application/pdf" }));
    formData.append("signerEmail", "partner@enterprise.com");

    // 1. Upload & Request
    const uploadRes = await app.handle(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body: formData,
      })
    );
    const uploadData = await uploadRes.json();
    expect(uploadRes.status).toBe(200);
    expect(uploadData.success).toBe(true);
    expect(uploadData.documentId).toBeDefined();
    expect(uploadData.emailPreview).toBeDefined();
    expect(uploadData.emailPreview.to).toBe("partner@enterprise.com");
    expect(uploadData.emailPreview.link).toContain("/sign/");
    const docId = uploadData.documentId;

    // 2. Fetch single document for Signer Portal
    const docRes = await app.handle(new Request(`http://localhost/api/document/${docId}`));
    const docData = await docRes.json();
    expect(docRes.status).toBe(200);
    expect(docData.document.id).toBe(docId);
    expect(docData.document.status).toBe("pending");

    // 3. List documents for Requester Dashboard
    const listRes = await app.handle(new Request("http://localhost/api/documents"));
    const listData = await listRes.json();
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listData.documents)).toBe(true);

    // 4. Sign document (Signer Portal submission)
    const signRes = await app.handle(
      new Request(`http://localhost/api/sign/${docId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerName: "Alex Vance" }),
      })
    );
    const signData = await signRes.json();
    expect(signRes.status).toBe(200);
    expect(signData.success).toBe(true);
    expect(signData.downloadUrl).toBeDefined();

    // 5. Download signed document
    const downloadRes = await app.handle(new Request(`http://localhost/api/download/${docId}`));
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("Content-Type")).toBe("application/pdf");
    expect(downloadRes.headers.get("Content-Disposition")).toContain("signed-partnership_agreement.pdf");

    // 6. Delete/Close document
    const deleteRes = await app.handle(
      new Request(`http://localhost/api/document/${docId}`, {
        method: "DELETE",
      })
    );
    const deleteData = await deleteRes.json();
    expect(deleteRes.status).toBe(200);
    expect(deleteData.success).toBe(true);

    // Verify it is no longer returned
    const getAfterDelete = await app.handle(new Request(`http://localhost/api/document/${docId}`));
    expect(getAfterDelete.status).toBe(404);
  });
});
