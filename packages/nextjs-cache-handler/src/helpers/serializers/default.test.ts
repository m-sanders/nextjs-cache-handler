import { defaultSerializer } from "./default";
import type { CacheHandlerValue } from "../../handlers/cache-handler.types";
import type { CachedRouteKind } from "next/dist/server/response-cache";

describe("defaultSerializer", () => {
  describe("serialize", () => {
    it("should serialize a cache value with APP_ROUTE kind", async () => {
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

      const serialized = await defaultSerializer.serialize(cacheValue);

      expect(typeof serialized).toBe("string");
      expect(serialized.length).toBeGreaterThan(0);

      // Verify it's valid JSON
      const parsed = JSON.parse(serialized);
      expect(parsed.lastModified).toBe(cacheValue.lastModified);
      expect(parsed.tags).toEqual(cacheValue.tags);
      expect(parsed.value.kind).toBe("APP_ROUTE");
      // Body should be base64 encoded
      expect(parsed.value.body).toBe(
        Buffer.from("Hello, World!").toString("base64"),
      );
    });

    it("should serialize a cache value with APP_PAGE kind", async () => {
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

      const serialized = await defaultSerializer.serialize(cacheValue);

      expect(typeof serialized).toBe("string");

      const parsed = JSON.parse(serialized);
      expect(parsed.value.kind).toBe("APP_PAGE");
      expect(parsed.value.rscData).toBe(
        Buffer.from("RSC data").toString("base64"),
      );
    });

    it("should serialize a cache value with APP_PAGE kind and segmentData", async () => {
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

      const serialized = await defaultSerializer.serialize(cacheValue);

      const parsed = JSON.parse(serialized);
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

      const serialized = await defaultSerializer.serialize(cacheValue);

      expect(typeof serialized).toBe("string");

      const parsed = JSON.parse(serialized);
      expect(parsed.value).toBeNull();
    });

    it("should not mutate original cache value", async () => {
      const originalBody = Buffer.from("Original");
      const cacheValue: CacheHandlerValue = {
        lastModified: Date.now(),
        tags: [],
        lifespan: null,
        value: {
          kind: "APP_ROUTE" as CachedRouteKind.APP_ROUTE,
          body: originalBody,
          headers: {},
          status: 200,
        },
      };

      await defaultSerializer.serialize(cacheValue);

      // Original should still be a Buffer
      expect(Buffer.isBuffer((cacheValue.value as any).body)).toBe(true);
      expect((cacheValue.value as any).body).toBe(originalBody);
    });
  });

  describe("deserialize", () => {
    it("should deserialize a JSON string", async () => {
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

      const serialized = await defaultSerializer.serialize(cacheValue);
      const deserialized = await defaultSerializer.deserialize(serialized);

      expect(deserialized).not.toBeNull();
      expect(deserialized!.lastModified).toBe(123456);
      expect(deserialized!.tags).toEqual(["test-tag"]);
      expect(deserialized!.value?.kind).toBe("APP_ROUTE");
      expect(Buffer.isBuffer((deserialized!.value as any).body)).toBe(true);
      expect((deserialized!.value as any).body.toString()).toBe("Test body");
    });

    it("should deserialize from Buffer", async () => {
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

      const serialized = await defaultSerializer.serialize(cacheValue);
      const buffer = Buffer.from(serialized, "utf-8");

      const deserialized = await defaultSerializer.deserialize(buffer);

      expect(deserialized).not.toBeNull();
      expect(deserialized!.lastModified).toBe(123456);
      expect(Buffer.isBuffer((deserialized!.value as any).body)).toBe(true);
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

      const serialized = await defaultSerializer.serialize(cacheValue);
      const deserialized = await defaultSerializer.deserialize(serialized);

      expect(deserialized).not.toBeNull();
      expect(deserialized!.value?.kind).toBe("APP_PAGE");
      expect(Buffer.isBuffer((deserialized!.value as any).rscData)).toBe(true);
      expect((deserialized!.value as any).rscData.toString()).toBe(
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

      const serialized = await defaultSerializer.serialize(cacheValue);
      const deserialized = await defaultSerializer.deserialize(serialized);

      expect(deserialized).not.toBeNull();
      const deserializedValue = deserialized!.value as any;
      expect(deserializedValue.segmentData).toBeInstanceOf(Map);
      expect(deserializedValue.segmentData.size).toBe(2);
      expect(Buffer.isBuffer(deserializedValue.segmentData.get("seg1"))).toBe(
        true,
      );
      expect(deserializedValue.segmentData.get("seg1").toString()).toBe(
        "segment1-data",
      );
      expect(deserializedValue.segmentData.get("seg2").toString()).toBe(
        "segment2-data",
      );
    });

    it("should return null for empty string", async () => {
      const result = await defaultSerializer.deserialize("");
      expect(result).toBeNull();
    });

    it("should return null for invalid JSON", async () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      const result = await defaultSerializer.deserialize("not valid json");

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("should handle null value", async () => {
      const cacheValue: CacheHandlerValue = {
        lastModified: Date.now(),
        tags: [],
        lifespan: null,
        value: null,
      };

      const serialized = await defaultSerializer.serialize(cacheValue);
      const deserialized = await defaultSerializer.deserialize(serialized);

      expect(deserialized).not.toBeNull();
      expect(deserialized!.value).toBeNull();
    });
  });

  describe("serialize/deserialize round-trip", () => {
    it("should preserve all data through round-trip", async () => {
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

      const serialized = await defaultSerializer.serialize(originalValue);
      const deserialized = await defaultSerializer.deserialize(serialized);

      expect(deserialized).not.toBeNull();
      expect(deserialized!.lastModified).toBe(originalValue.lastModified);
      expect(deserialized!.tags).toEqual(originalValue.tags);
      expect(deserialized!.lifespan).toEqual(originalValue.lifespan);
      expect(deserialized!.value?.kind).toBe("APP_ROUTE");
      expect((deserialized!.value as any).body.toString()).toBe(
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

      const serialized = await defaultSerializer.serialize(originalValue);
      const deserialized = await defaultSerializer.deserialize(serialized);

      expect(deserialized).not.toBeNull();
      expect(deserialized!.tags).toEqual([]);
      expect((deserialized!.value as any).rscData.length).toBe(0);
    });
  });

  describe("metadata", () => {
    it("should have correct name", () => {
      expect(defaultSerializer.name).toBe("default");
    });
  });
});
