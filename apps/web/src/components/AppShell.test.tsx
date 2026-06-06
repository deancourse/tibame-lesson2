import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import { AppShell } from "./AppShell";
import { useAuthStore } from "@/store/auth";

beforeEach(() => {
  useAuthStore.setState({
    user: { id: "u", name: "王小明", role: "ADMIN", employeeId: "u", email: "u@x" },
    csrfToken: "csrf",
    hydrated: true,
  });
});

describe("AppShell", () => {
  it("shows identity only in the sidebar, not duplicated in the header", () => {
    render(
      renderWithProviders(
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<div>內容</div>} />
          </Route>
        </Routes>,
      ),
    );
    // 左下角側欄顯示姓名與角色
    expect(screen.getByText("王小明")).toBeInTheDocument();
    expect(screen.getByText("系統管理員")).toBeInTheDocument();
    // 標頭不再重複顯示歡迎詞
    expect(screen.queryByText(/歡迎回來/)).toBeNull();
    // 標頭保留主題切換與登出控制
    expect(screen.getByRole("button", { name: "切換主題" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /登出/ })).toBeInTheDocument();
  });
});
