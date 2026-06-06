import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import { AuditLogsPage } from "./AuditLogs";
import { RequireAdmin } from "@/components/RequireAuth";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  };
});

beforeEach(() => {
  vi.mocked(apiClient.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: {
      items: [
        {
          id: "a1",
          createdAt: "2026-05-29T10:00:00.000Z",
          actorId: "u1",
          actorUsername: "admin1",
          actorRole: "ADMIN",
          action: "employee.create",
          method: "POST",
          path: "/api/employees",
          targetType: "employee",
          targetId: "emp-123",
          outcome: "SUCCESS",
          statusCode: 201,
          ip: "127.0.0.1",
          userAgent: "jest",
          metadata: { params: { body: { color: "黑" } } },
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    },
  });
});

function setUser(role: "ADMIN" | "USER") {
  useAuthStore.setState({
    user: { id: "u", name: "U", role, employeeId: "u", email: "u@x" },
    csrfToken: "csrf",
    hydrated: true,
  });
}

describe("AuditLogsPage", () => {
  it("admin sees list with localized action, masked IP and filters", async () => {
    setUser("ADMIN");
    render(renderWithProviders(<AuditLogsPage />));
    // 動作以中文標籤顯示，而非原始字串
    expect(await screen.findByText("建立員工")).toBeInTheDocument();
    expect(screen.queryByText("employee.create")).toBeNull();
    expect(screen.getByText("admin1")).toBeInTheDocument();
    // 來源 IP 預設遮蔽
    expect(screen.getByText("127.*.*.1")).toBeInTheDocument();
    expect(screen.queryByText("127.0.0.1")).toBeNull();
    // 篩選控制（複選下拉顯示 placeholder、日期/操作者以 label 斷言）
    expect(screen.getByLabelText("操作者")).toBeInTheDocument();
    expect(screen.getByText("全部動作")).toBeInTheDocument();
    expect(screen.getByText("全部結果")).toBeInTheDocument();
    expect(screen.getByLabelText("起始日")).toBeInTheDocument();
    expect(screen.getByLabelText("結束日")).toBeInTheDocument();
  });

  it("toggles source IP masking", async () => {
    setUser("ADMIN");
    render(renderWithProviders(<AuditLogsPage />));
    await screen.findByText("建立員工");
    expect(screen.getByText("127.*.*.1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /來源 IP/ }));
    expect(await screen.findByText("127.0.0.1")).toBeInTheDocument();
    expect(screen.queryByText("127.*.*.1")).toBeNull();
  });

  it("reveals full parameters in a hover card", async () => {
    setUser("ADMIN");
    render(renderWithProviders(<AuditLogsPage />));
    await screen.findByText("建立員工");
    // 預設不直接顯示參數 JSON，只呈現精簡的「檢視」觸發點
    const trigger = screen.getByRole("button", { name: /參數/ });
    expect(screen.queryByText(/"color"/)).toBeNull();
    // hover 後浮出卡片顯示完整 metadata
    fireEvent.mouseEnter(trigger);
    const card = await screen.findByRole("tooltip");
    expect(card.textContent).toContain("color");
    expect(card.textContent).toContain("黑");
    // 移開後卡片收起
    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("copies parameters to clipboard on click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    setUser("ADMIN");
    render(renderWithProviders(<AuditLogsPage />));
    await screen.findByText("建立員工");
    const trigger = screen.getByRole("button", { name: /參數/ });
    fireEvent.click(trigger);
    // 完整格式化 JSON 寫入剪貼簿
    expect(writeText).toHaveBeenCalledTimes(1);
    const copiedText = writeText.mock.calls[0]?.[0] ?? "";
    expect(copiedText).toContain('"color"');
    expect(copiedText).toContain("黑");
    // 顯示「已複製」回饋
    expect(await screen.findByText("已複製")).toBeInTheDocument();
  });

  it("user is redirected away by RequireAdmin", async () => {
    setUser("USER");
    render(
      renderWithProviders(
        <Routes>
          <Route path="/" element={<div>home</div>} />
          <Route
            path="/audit-logs"
            element={
              <RequireAdmin>
                <AuditLogsPage />
              </RequireAdmin>
            }
          />
        </Routes>,
        ["/audit-logs"],
      ),
    );
    expect(await screen.findByText("home")).toBeInTheDocument();
    expect(screen.queryByText("操作紀錄")).toBeNull();
  });
});
