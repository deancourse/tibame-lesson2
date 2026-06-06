// 來源 IP 顯示遮蔽：IPv4 將中間兩段遮成 `a.*.*.d`；其餘格式做合理 fallback。
// 僅為前端顯示用途，原始 IP 仍完整保存在資料庫。
export function maskIp(ip: string | null | undefined): string {
  if (!ip) return "—";
  const trimmed = ip.trim();

  const v4 = trimmed.split(".");
  if (v4.length === 4 && v4.every((p) => /^\d{1,3}$/.test(p))) {
    return `${v4[0]}.*.*.${v4[3]}`;
  }

  // IPv6 等含冒號的格式：保留首尾段，中間以 *** 取代。
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":").filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]}:***:${parts[parts.length - 1]}`;
    }
    return "***";
  }

  return "***";
}

// 依開關決定顯示完整或遮蔽後的 IP；空值一律顯示破折號。
export function displayIp(ip: string | null | undefined, masked: boolean): string {
  if (!ip) return "—";
  return masked ? maskIp(ip) : ip;
}
