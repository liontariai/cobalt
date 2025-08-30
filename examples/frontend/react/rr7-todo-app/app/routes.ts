import type { RouteConfig } from "@react-router/dev/routes";
import { index, route } from "@react-router/dev/routes";

export default [
    index("routes/_index/route.tsx"),
    route("/error", "./routes/_auth/error.tsx"),
    route("/logout", "./routes/_auth/logout.tsx"),
] satisfies RouteConfig;
