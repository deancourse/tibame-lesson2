import { describe, expect, it } from "vitest";
import { displayIp, maskIp } from "./ip";

describe("maskIp", () => {
  it("masks the middle two octets of an IPv4 address", () => {
    expect(maskIp("192.168.10.25")).toBe("192.*.*.25");
    expect(maskIp("10.0.0.1")).toBe("10.*.*.1");
  });

  it("returns dash for empty values", () => {
    expect(maskIp(null)).toBe("—");
    expect(maskIp(undefined)).toBe("—");
    expect(maskIp("")).toBe("—");
  });

  it("falls back for IPv6 addresses", () => {
    expect(maskIp("2001:db8::1")).toBe("2001:***:1");
  });

  it("falls back for non-standard formats", () => {
    expect(maskIp("localhost")).toBe("***");
  });
});

describe("displayIp", () => {
  it("masks when masked=true", () => {
    expect(displayIp("192.168.10.25", true)).toBe("192.*.*.25");
  });

  it("shows full IP when masked=false", () => {
    expect(displayIp("192.168.10.25", false)).toBe("192.168.10.25");
  });

  it("returns dash for empty values regardless of toggle", () => {
    expect(displayIp(null, true)).toBe("—");
    expect(displayIp(null, false)).toBe("—");
  });
});
