import type { ProjectConfig } from "../../index";

export const files = {
    "app/app.css": (config: ProjectConfig) => `
@import "tailwindcss";

@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif,
    "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
}

html,
body {
  @apply bg-white dark:bg-gray-950;

  @media (prefers-color-scheme: dark) {
    color-scheme: dark;
  }
}
`,

    "app/root.tsx": (config: ProjectConfig) => `
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
    `,

    "app/routes.ts": (config: ProjectConfig) => `
import type { RouteConfig } from "@react-router/dev/routes";
import { index } from "@react-router/dev/routes";

export default [index("routes/home.tsx")] satisfies RouteConfig;
    `,

    "app/routes/home.tsx": (
        config: ProjectConfig,
    ) => `import type { Route } from "./+types/home";
import sdk from "sdk";

const profile = await sdk.query.profile((s) => s.$all({}));

export default function Home() {
    return (
        <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded shadow">
            <h1 className="text-2xl font-bold mb-4">Profile Page</h1>
            <div className="flex items-center mb-4">
                <img
                    src={\`https://ui-avatars.com/api/?name=\${profile.name}\`}
                    alt="avatar"
                    className="w-16 h-16 rounded-full mr-4"
                />
                <div>
                    <h2 className="text-xl font-semibold">{profile.name}</h2>
                    <p className="text-gray-600">Username: {profile.name}</p>
                </div>
            </div>
            <div>
                <p className="mb-2">
                    <span className="font-semibold">Email:</span> {profile.user}
                </p>
                <p className="mb-2">
                    <span className="font-semibold">Role:</span> User
                </p>
                <p className="mb-2">
                    <span className="font-semibold">Bio:</span> {profile.bio}
                </p>
            </div>
        </div>
    );
}
`,

    "react-router.config.ts": (
        config: ProjectConfig,
    ) => `import type { Config } from "@react-router/dev/config";

export default {
  // Config options...
  // Server-side render by default, to enable SPA mode set this to \`false\`
  ssr: true,
} satisfies Config;

`,
    "vite.config.ts": (
        config: ProjectConfig,
    ) => `import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig((config) => ({
    plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
    resolve:
        config.command === "build"
            ? {
                  alias: {
                      "react-dom/server": "react-dom/server.node",
                  },
              }
            : undefined,
}));
`,
};
