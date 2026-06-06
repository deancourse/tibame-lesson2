import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { EmployeesPage } from "./Employees";
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
          id: "e1",
          employeeNo: "EMP0001",
          name: "陳志明",
          email: "alice@vms.local",
          department: "資訊部",
          position: "工程師",
          hiredAt: "2023-09-01T00:00:00.000Z",
          phone: "0900-000-001",
          status: "ACTIVE",
          username: "alice",
          role: "USER",
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

describe("EmployeesPage", () => {
  it("prefills hire date when editing", async () => {
    setUser("ADMIN");
    render(renderWithProviders(<EmployeesPage />));
    fireEvent.click(await screen.findByRole("button", { name: "編輯" }));
    const dateInput = await screen.findByLabelText("入職日期");
    expect(dateInput).toHaveValue("2023-09-01");
  });
});
