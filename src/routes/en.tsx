import { createFileRoute, Outlet } from "@tanstack/react-router";

/** /en layout — English mirrors live under this prefix. */
export const Route = createFileRoute("/en")({
  component: () => <Outlet />,
});
