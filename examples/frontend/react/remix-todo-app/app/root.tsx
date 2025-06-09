import type { LinksFunction } from "@remix-run/node";
import {
    Links,
    LiveReload,
    Meta,
    Outlet,
    Scripts,
    ScrollRestoration,
} from "@remix-run/react";
import styles from "./styles/tailwind.css";
import sdk from "sdk";
sdk.init({
    sseFetchTransform: async (url, options) => [
        url,
        {
            ...options,
            headers: {
                ...(options?.headers ?? {}),
                "Accept-Encoding": "*",
            },
        },
    ],
    get headers() {
        if ("window" in globalThis && globalThis.window.localStorage) {
            return {
                Authorization:
                    globalThis.window.localStorage.getItem("userid") ??
                    "anonymous",
            };
        }
        return {
            Authorization: "anonymous",
        };
    },
});

export const links: LinksFunction = () => [{ rel: "stylesheet", href: styles }];

export default function App() {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1"
                />
                <meta name="description" content="Todo App" />
                <title>Todo App</title>
                <Meta />
                <Links />
            </head>
            <body>
                <Outlet />
                <ScrollRestoration />
                <Scripts />
                <LiveReload />
            </body>
        </html>
    );
}
