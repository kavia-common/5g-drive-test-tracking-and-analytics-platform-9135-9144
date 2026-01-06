import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders dashboard header title", () => {
  render(<App />);
  expect(screen.getByText(/Operations Dashboard/i)).toBeInTheDocument();
});
