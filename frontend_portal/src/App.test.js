import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

test("renders dashboard header title", () => {
  // Render on a lightweight route to avoid async polling effects (LiveTracking) during this smoke test.
  render(
    <MemoryRouter initialEntries={["/analytics"]}>
      <App />
    </MemoryRouter>
  );

  expect(screen.getByText(/Operations Dashboard/i)).toBeInTheDocument();
});
