import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

test("renders DashboardHome KPIs on root route", async () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>
  );

  // Shell still renders
  expect(screen.getByText(/Operations Dashboard/i)).toBeInTheDocument();

  // DashboardHome KPI cards render (use stable testids)
  expect(await screen.findByTestId("kpi-route-completion")).toBeInTheDocument();
  expect(screen.getByTestId("kpi-task-completion")).toBeInTheDocument();
  expect(screen.getByTestId("kpi-active-drivers")).toBeInTheDocument();
  expect(screen.getByTestId("kpi-active-routes")).toBeInTheDocument();
});
