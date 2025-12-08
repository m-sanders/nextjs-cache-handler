import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { compressValue, decompressValue } from "./compression";
import type { CacheHandlerValue } from "../handlers/cache-handler.types";
import type { CachedRouteKind } from "next/dist/server/response-cache";

const gunzipAsync = promisify(gunzip);

describe("compression", () => {
  describe("compressValue", () => {
    it("should compress a cache value with APP_ROUTE kind", async () => {
      const cacheValue: CacheHandlerValue = {
        lastModified: Date.now(),
        tags: ["tag1", "tag2"],
        lifespan: {
          lastModifiedAt: 1000,
          staleAt: 2000,
          expireAt: 3000,
          staleAge: 1000,
          expireAge: 2000,
          revalidate: 60,
        },
        value: {
          kind: "APP_ROUTE" as CachedRouteKind.APP_ROUTE,
          body: Buffer.from("Hello, World!"),
          headers: {},
          status: 200,
        },
      };

      const compressed = await compressValue(cacheValue);

      expect(Buffer.isBuffer(compressed)).toBe(true);
      expect(compressed.length).toBeGreaterThan(0);

      // Verify it's gzipped (magic bytes)
      expect(compressed[0]).toBe(0x1f);
      expect(compressed[1]).toBe(0x8b);

      // Verify we can decompress it
      const decompressed = await gunzipAsync(compressed);
      const parsed = JSON.parse(decompressed.toString("utf-8"));
      expect(parsed.lastModified).toBe(cacheValue.lastModified);
      expect(parsed.tags).toEqual(cacheValue.tags);
      expect(parsed.value.kind).toBe("APP_ROUTE");
      expect(parsed.value.body).toBe(
        Buffer.from("Hello, World!").toString("base64"),
      );
    });

    it("should compress a cache value with APP_PAGE kind", async () => {
      const cacheValue: CacheHandlerValue = {
        lastModified: Date.now(),
        tags: ["page-tag"],
        lifespan: null,
        value: {
          kind: "APP_PAGE" as CachedRouteKind.APP_PAGE,
          html: "<html></html>",
          rscData: Buffer.from("RSC data"),
          headers: {},
          status: 200,
          postponed: undefined,
          segmentData: undefined,
        },
      };

      const compressed = await compressValue(cacheValue);

      expect(Buffer.isBuffer(compressed)).toBe(true);
      expect(compressed[0]).toBe(0x1f);
      expect(compressed[1]).toBe(0x8b);

      const decompressed = await gunzipAsync(compressed);
      const parsed = JSON.parse(decompressed.toString("utf-8"));
      expect(parsed.value.kind).toBe("APP_PAGE");
      expect(parsed.value.rscData).toBe(
        Buffer.from("RSC data").toString("base64"),
      );
    });

    it("should compress a cache value with APP_PAGE kind and segmentData", async () => {
      const segmentData = new Map<string, Buffer>();
      segmentData.set("segment1", Buffer.from("data1"));
      segmentData.set("segment2", Buffer.from("data2"));

      const cacheValue: CacheHandlerValue = {
        lastModified: Date.now(),
        tags: [],
        lifespan: null,
        value: {
          kind: "APP_PAGE" as CachedRouteKind.APP_PAGE,
          html: "<html></html>",
          rscData: Buffer.from("RSC data"),
          segmentData,
          headers: {},
          status: 200,
          postponed: undefined,
        },
      };

      const compressed = await compressValue(cacheValue);

      expect(Buffer.isBuffer(compressed)).toBe(true);

      const decompressed = await gunzipAsync(compressed);
      const parsed = JSON.parse(decompressed.toString("utf-8"));
      expect(parsed.value.segmentData).toEqual({
        segment1: Buffer.from("data1").toString("base64"),
        segment2: Buffer.from("data2").toString("base64"),
      });
    });

    it("should handle cache value with no value field", async () => {
      const cacheValue: CacheHandlerValue = {
        lastModified: Date.now(),
        tags: [],
        lifespan: null,
        value: null,
      };

      const compressed = await compressValue(cacheValue);

      expect(Buffer.isBuffer(compressed)).toBe(true);
      expect(compressed[0]).toBe(0x1f);
      expect(compressed[1]).toBe(0x8b);

      const decompressed = await gunzipAsync(compressed);
      const parsed = JSON.parse(decompressed.toString("utf-8"));
      expect(parsed.value).toBeNull();
    });

    it("should handle APP_ROUTE with undefined body", async () => {
      const cacheValue: CacheHandlerValue = {
        lastModified: Date.now(),
        tags: [],
        lifespan: null,
        value: {
          kind: "APP_ROUTE" as CachedRouteKind.APP_ROUTE,
          body: undefined as any,
          headers: {},
          status: 200,
        },
      };

      const compressed = await compressValue(cacheValue);

      expect(Buffer.isBuffer(compressed)).toBe(true);

      const decompressed = await gunzipAsync(compressed);
      const parsed = JSON.parse(decompressed.toString("utf-8"));
      expect(parsed.value.body).toBeUndefined();
    });

    it("should compress large buffers efficiently", async () => {
      const largeBuffer = Buffer.alloc(100000, "a");
      const cacheValue: CacheHandlerValue = {
        lastModified: Date.now(),
        tags: [],
        lifespan: null,
        value: {
          kind: "APP_ROUTE" as CachedRouteKind.APP_ROUTE,
          body: largeBuffer,
          headers: {},
          status: 200,
        },
      };

      const compressed = await compressValue(cacheValue);

      // Compressed size should be much smaller than original
      const decompressed = await gunzipAsync(compressed);
      expect(decompressed.length).toBeGreaterThan(largeBuffer.length);
      // But compressed should be significantly smaller
      expect(compressed.length).toBeLessThan(largeBuffer.length / 10);
    });
  });

  describe("decompressValue", () => {
    it("should decompress a Buffer with gzip magic bytes", async () => {
      const cacheValue: CacheHandlerValue = {
        lastModified: 123456,
        tags: ["test-tag"],
        lifespan: null,
        value: {
          kind: "APP_ROUTE" as CachedRouteKind.APP_ROUTE,
          body: Buffer.from("Test body"),
          headers: {},
          status: 200,
        },
      };

      const compressed = await compressValue(cacheValue);
      const decompressed = await decompressValue(compressed);

      expect(decompressed).not.toBeNull();
      expect(decompressed!.lastModified).toBe(123456);
      expect(decompressed!.tags).toEqual(["test-tag"]);
      expect(decompressed!.value?.kind).toBe("APP_ROUTE");
      expect(Buffer.isBuffer((decompressed!.value as any).body)).toBe(true);
      expect((decompressed!.value as any).body.toString()).toBe("Test body");
    });

    it("should handle base64-encoded gzipped string", async () => {
      const cacheValue: CacheHandlerValue = {
        lastModified: 123456,
        tags: [],
        lifespan: null,
        value: {
          kind: "APP_ROUTE" as CachedRouteKind.APP_ROUTE,
          body: Buffer.from("Test"),
          headers: {},
          status: 200,
        },
      };

      const compressed = await compressValue(cacheValue);
      const base64String = compressed.toString("base64");

      const decompressed = await decompressValue(base64String);

      expect(decompressed).not.toBeNull();
      expect(decompressed!.lastModified).toBe(123456);
      expect(Buffer.isBuffer((decompressed!.value as any).body)).toBe(true);
    });

    it("should handle legacy uncompressed JSON string", async () => {
      const cacheValue = {
        lastModified: 123456,
        tags: ["legacy"],
        lifespan: null,
        value: {
          kind: "APP_ROUTE" as CachedRouteKind.APP_ROUTE,
          body: Buffer.from("Legacy body").toString("base64"),
          headers: {},
          status: 200,
        },
      };

      const jsonString = JSON.stringify(cacheValue);
      const decompressed = await decompressValue(jsonString);

      expect(decompressed).not.toBeNull();
      expect(decompressed!.lastModified).toBe(123456);
      expect(decompressed!.tags).toEqual(["legacy"]);
      expect(Buffer.isBuffer((decompressed!.value as any).body)).toBe(true);
      expect((decompressed!.value as any).body.toString()).toBe("Legacy body");
    });

    it("should handle APP_PAGE with rscData", async () => {
      const cacheValue: CacheHandlerValue = {
        lastModified: Date.now(),
        tags: [],
        lifespan: null,
        value: {
          kind: "APP_PAGE" as CachedRouteKind.APP_PAGE,
          html: "<html></html>",
          rscData: Buffer.from("RSC content"),
          headers: {},
          status: 200,
          postponed: undefined,
          segmentData: undefined,
        },
      };

      const compressed = await compressValue(cacheValue);
      const decompressed = await decompressValue(compressed);

      expect(decompressed).not.toBeNull();
      expect(decompressed!.value?.kind).toBe("APP_PAGE");
      expect(Buffer.isBuffer((decompressed!.value as any).rscData)).toBe(true);
      expect((decompressed!.value as any).rscData.toString()).toBe(
        "RSC content",
      );
    });

    it("should handle APP_PAGE with segmentData", async () => {
      const segmentData = new Map<string, Buffer>();
      segmentData.set("seg1", Buffer.from("segment1-data"));
      segmentData.set("seg2", Buffer.from("segment2-data"));

      const cacheValue: CacheHandlerValue = {
        lastModified: Date.now(),
        tags: [],
        lifespan: null,
        value: {
          kind: "APP_PAGE" as CachedRouteKind.APP_PAGE,
          html: "<html></html>",
          rscData: Buffer.from("RSC"),
          segmentData,
          headers: {},
          status: 200,
          postponed: undefined,
        },
      };

      const compressed = await compressValue(cacheValue);
      const decompressed = await decompressValue(compressed);

      expect(decompressed).not.toBeNull();
      const decompressedValue = decompressed!.value as any;
      expect(decompressedValue.segmentData).toBeInstanceOf(Map);
      expect(decompressedValue.segmentData.size).toBe(2);
      expect(Buffer.isBuffer(decompressedValue.segmentData.get("seg1"))).toBe(
        true,
      );
      expect(decompressedValue.segmentData.get("seg1").toString()).toBe(
        "segment1-data",
      );
      expect(decompressedValue.segmentData.get("seg2").toString()).toBe(
        "segment2-data",
      );
    });

    it("should return null for empty string", async () => {
      const result = await decompressValue("");
      expect(result).toBeNull();
    });

    it("should return null for null input", async () => {
      const result = await decompressValue(null as any);
      expect(result).toBeNull();
    });

    it("should handle corruption gracefully", async () => {
      const corruptedBuffer = Buffer.from([0x1f, 0x8b, 0xff, 0xff, 0xff]);
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      const result = await decompressValue(corruptedBuffer);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to decompress cache value:",
        expect.objectContaining({
          message: expect.any(String),
        }),
      );

      consoleErrorSpy.mockRestore();
    });

    it("should handle invalid JSON gracefully", async () => {
      const invalidJson = "not valid json";
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      const result = await decompressValue(invalidJson);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("compress/decompress round-trip", () => {
    it("should preserve all data through compress/decompress cycle", async () => {
      const originalValue: CacheHandlerValue = {
        lastModified: 1234567890,
        tags: ["tag1", "tag2", "tag3"],
        lifespan: {
          lastModifiedAt: 1000,
          staleAt: 2000,
          expireAt: 3000,
          staleAge: 1000,
          expireAge: 2000,
          revalidate: 300,
        },
        value: {
          kind: "APP_ROUTE" as CachedRouteKind.APP_ROUTE,
          body: Buffer.from("Test content with special chars: 你好世界 🚀"),
          headers: { "content-type": "application/json" },
          status: 200,
        },
      };

      const compressed = await compressValue(originalValue);
      const decompressed = await decompressValue(compressed);

      expect(decompressed).not.toBeNull();
      expect(decompressed!.lastModified).toBe(originalValue.lastModified);
      expect(decompressed!.tags).toEqual(originalValue.tags);
      expect(decompressed!.lifespan).toEqual(originalValue.lifespan);
      expect(decompressed!.value?.kind).toBe("APP_ROUTE");
      expect((decompressed!.value as any).body.toString()).toBe(
        "Test content with special chars: 你好世界 🚀",
      );
    });

    it("should handle empty arrays and objects", async () => {
      const originalValue: CacheHandlerValue = {
        lastModified: Date.now(),
        tags: [],
        lifespan: null,
        value: {
          kind: "APP_PAGE" as CachedRouteKind.APP_PAGE,
          html: "",
          rscData: Buffer.from(""),
          headers: {},
          status: 200,
          postponed: undefined,
          segmentData: undefined,
        },
      };

      const compressed = await compressValue(originalValue);
      const decompressed = await decompressValue(compressed);

      expect(decompressed).not.toBeNull();
      expect(decompressed!.tags).toEqual([]);
      expect((decompressed!.value as any).rscData.length).toBe(0);
    });

    it("should handle Buffer with both compression enabled (Buffer response)", async () => {
      const originalValue: CacheHandlerValue = {
        lastModified: Date.now(),
        tags: ["compression-test"],
        lifespan: null,
        value: {
          kind: "APP_ROUTE" as CachedRouteKind.APP_ROUTE,
          body: Buffer.from("Compressed Buffer test"),
          headers: {},
          status: 200,
        },
      };

      // Simulate Redis with BLOB_STRING support returning Buffer
      const compressed = await compressValue(originalValue);
      const decompressed = await decompressValue(compressed); // Receives Buffer directly

      expect(decompressed).not.toBeNull();
      expect((decompressed!.value as any).body.toString()).toBe(
        "Compressed Buffer test",
      );
    });

    it("should handle string with compression enabled (string response)", async () => {
      const originalValue: CacheHandlerValue = {
        lastModified: Date.now(),
        tags: ["string-test"],
        lifespan: null,
        value: {
          kind: "APP_ROUTE" as CachedRouteKind.APP_ROUTE,
          body: Buffer.from("String fallback test"),
          headers: {},
          status: 200,
        },
      };

      // Simulate Redis without BLOB_STRING support returning base64 string
      const compressed = await compressValue(originalValue);
      const base64String = compressed.toString("base64");
      const decompressed = await decompressValue(base64String); // Receives string

      expect(decompressed).not.toBeNull();
      expect((decompressed!.value as any).body.toString()).toBe(
        "String fallback test",
      );
    });
  });
});
