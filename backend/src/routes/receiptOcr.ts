import express, { Router } from "express";
import { authMiddleware } from "../middleware/auth";

// Optional "detailed read": forwards the receipt image to the local PaddleOCR service.
// The image is held in memory for this request only; it is never stored or logged.
const OCR_SERVICE_URL = (
  process.env.OCR_SERVICE_URL || "http://127.0.0.1:8765"
).replace(/\/+$/, "");
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const receiptOcrRouter = Router();
receiptOcrRouter.post(
  "/receipts/ocr",
  authMiddleware,
  express.raw({ type: IMAGE_TYPES, limit: "6mb" }),
  async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    if (!Buffer.isBuffer(req.body) || !req.body.length)
      return res
        .status(400)
        .json({ code: "INVALID_IMAGE", error: "รองรับเฉพาะภาพ JPG, PNG หรือ WebP" });
    try {
      const response = await fetch(OCR_SERVICE_URL + "/ocr", {
        method: "POST",
        body: new Uint8Array(req.body),
        signal: AbortSignal.timeout(90_000),
      });
      const data = (await response.json().catch(() => null)) as {
        text?: unknown;
      } | null;
      if (!response.ok || typeof data?.text !== "string")
        return res
          .status(502)
          .json({ code: "OCR_FAILED", error: "อ่านภาพละเอียดไม่สำเร็จ" });
      return res.json({ text: data.text });
    } catch {
      return res.status(503).json({
        code: "OCR_UNAVAILABLE",
        error: "บริการอ่านละเอียดยังไม่พร้อม กรอกข้อมูลเองได้",
      });
    }
  },
);
