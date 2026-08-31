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

  test("Multi-file batch upload, inline stream, list, sign, and download", async () => {
    // 1. Create two dummy PDFs for batch upload
    const pdfDoc1 = await PDFDocument.create();
    pdfDoc1.addPage([400, 400]);
    const pdfBytes1 = await pdfDoc1.save();

    const pdfDoc2 = await PDFDocument.create();
    pdfDoc2.addPage([400, 400]);
    const pdfBytes2 = await pdfDoc2.save();

    const formData = new FormData();
    formData.append("files", new File([pdfBytes1], "contract_part1.pdf", { type: "application/pdf" }));
    formData.append("files", new File([pdfBytes2], "contract_part2.pdf", { type: "application/pdf" }));
    formData.append("signerEmail", "batch.signer@enterprise.com");

    // 2. Batch Upload Request
    const uploadRes = await app.handle(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body: formData,
      })
    );
    const uploadData = await uploadRes.json();
    expect(uploadRes.status).toBe(200);
    expect(uploadData.success).toBe(true);
    expect(uploadData.count).toBe(2);
    expect(uploadData.documents.length).toBe(2);
    const docId1 = uploadData.documents[0].id;

    // 3. Test inline PDF stream endpoint for embedded viewer
    const fileStreamRes = await app.handle(new Request(`http://localhost/api/document/${docId1}/file`));
    expect(fileStreamRes.status).toBe(200);
    expect(fileStreamRes.headers.get("Content-Type")).toBe("application/pdf");
    expect(fileStreamRes.headers.get("Content-Disposition")).toContain("inline");

    // 4. Sign document
    const signRes = await app.handle(
      new Request(`http://localhost/api/sign/${docId1}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerName: "Alex Vance" }),
      })
    );
    const signData = await signRes.json();
    expect(signRes.status).toBe(200);
    expect(signData.success).toBe(true);

    // 5. Download signed document
    const downloadRes = await app.handle(new Request(`http://localhost/api/download/${docId1}`));
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("Content-Type")).toBe("application/pdf");
  });
});
