import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { VehiclesPage } from "./Vehicles";
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
          id: "v1",
          plate: "ABC-1234",
          make: "Toyota",
          model: "Corolla",
          year: 2024,
          color: "white",
          status: "AVAILABLE",
          mileage: 1000,
          purchasedAt: "2024-06-01T00:00:00.000Z",
          ownerId: null,
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

describe("VehiclesPage", () => {
  it("admin sees add/edit/delete controls", async () => {
    setUser("ADMIN");
    render(renderWithProviders(<VehiclesPage />));
    expect(await screen.findByRole("button", { name: "新增車輛" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "編輯" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刪除" })).toBeInTheDocument();
  });

  it("user sees no mutation controls", async () => {
    setUser("USER");
    render(renderWithProviders(<VehiclesPage />));
    await screen.findByText("ABC-1234");
    expect(screen.queryByRole("button", { name: "新增車輛" })).toBeNull();
    expect(screen.queryByRole("button", { name: "編輯" })).toBeNull();
    expect(screen.queryByRole("button", { name: "刪除" })).toBeNull();
  });

  it("prefills purchase date when editing", async () => {
    setUser("ADMIN");
    render(renderWithProviders(<VehiclesPage />));
    fireEvent.click(await screen.findByRole("button", { name: "編輯" }));
    const dateInput = await screen.findByLabelText("購買日期");
    expect(dateInput).toHaveValue("2024-06-01");
  });
});
