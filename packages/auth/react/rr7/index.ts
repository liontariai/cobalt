import type { BaseIssue, BaseSchema, StringSchema } from "valibot";
import { type LoaderFunctionArgs, redirect } from "react-router";
import { createClient } from "@openauthjs/openauth/client";
import { object, string } from "valibot";

export function getAuthToken(
    request?: Request,
    cookieName: string = "accessToken",
) {
    const getCookie = (cookie: string, name: string) => {
        if (!cookie) return undefined;
        return cookie
            .split(";")
            .find((c) => c.trim().startsWith(`${name}=`))
            ?.split("=")[1];
    };

    if (typeof document !== "undefined") {
        return getCookie(document.cookie, cookieName);
    }

    if (request) {
        return getCookie(request.headers.get("Cookie") ?? "", cookieName);
    }

    return undefined;
}

export function makeAuthLoader(
    options: {
        clientID: string;
        issuer: string;
        subjects?: {
            [subjectName: string]: {
                [key: string]: BaseSchema<any, any, BaseIssue<any>>;
            } & {
                id: StringSchema<undefined>;
            };
        };
        cookieOptions?: {
            maxAge?: number;
            path?: string;
            // httpOnly?: boolean;
            secure?: boolean;
            sameSite?: "lax" | "strict" | "none";
        };
        cookieNames?: {
            accessToken: string;
            refreshToken: string;
        };
    },
    onAuth?: (token: {
        tokens: { access: string; refresh: string | undefined };
    }) => void,
) {
    const authClient = createClient({
        clientID: options.clientID,
        issuer: options.issuer,
    });
    const getCookie = (request: Request, name: string) => {
        const cookie = request.headers.get("Cookie");
        if (!cookie) return undefined;
        return cookie
            .split(";")
            .find((c) => c.trim().startsWith(`${name}=`))
            ?.split("=")[1];
    };

    const subjects = options.subjects ?? {
        user: {
            id: string(),
        },
    };
    const subjectSchema = Object.fromEntries(
        Object.entries(subjects).map(([subjectName, subject]) => [
            subjectName,
            object(subject),
        ]),
    );

    return async ({ request }: LoaderFunctionArgs) => {
        const url = new URL(request.url);
        const callback = url.searchParams.get("callback");
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (callback === "auth" && code) {
            const token = await authClient.exchange(
                code,
                url.origin + "?callback=auth",
            );

            if (!token.err) {
                const {
                    maxAge = 604_800,
                    path = "/",
                    secure = true,
                    // httpOnly = true,
                    sameSite = "strict",
                } = options.cookieOptions ?? {};

                const cookies: Record<
                    string,
                    { value: string; httpOnly: boolean; secure: boolean }
                > = {
                    [options.cookieNames?.accessToken ?? "accessToken"]: {
                        value: token.tokens.access,
                        httpOnly: false,
                        secure: false,
                    },
                    [options.cookieNames?.refreshToken ?? "refreshToken"]: {
                        value: token.tokens.refresh,
                        httpOnly: true,
                        secure,
                    },
                };
                const cookieString = Object.entries(cookies)
                    .map(
                        ([key, cookie]) =>
                            `${key}=${cookie.value}; Max-Age=${maxAge}; Path=${path}; ${cookie.httpOnly ? "HttpOnly;" : ""} ${cookie.secure ? "Secure;" : ""} SameSite=${sameSite}`,
                    )
                    .join(", ");

                onAuth?.(token);

                return redirect(url.origin, {
                    headers: {
                        "Set-Cookie": cookieString,
                    },
                });
            }
            // handle error
        }

        const authToken = getCookie(
            request,
            options.cookieNames?.accessToken ?? "accessToken",
        );
        const refreshToken = getCookie(
            request,
            options.cookieNames?.refreshToken ?? "refreshToken",
        );

        if (authToken) {
            const result = await authClient.verify(subjectSchema, authToken, {
                refresh: refreshToken ?? undefined,
            });

            if (result.err) {
                if (result.err.name === "InvalidAccessTokenError") {
                    console.error(`Invalid access token: ${authToken}`);
                    console.error(
                        `This can also happen, if the subject schema is not matching the server side configuration.`,
                    );
                    console.error(
                        `The given subject schema is: ${JSON.stringify(subjectSchema)} (default if not given)`,
                    );
                }

                return redirect(
                    url.origin + "?callback=auth&error=invalid_token",
                    {
                        headers: {
                            "Set-Cookie": [
                                `${options.cookieNames?.accessToken ?? "accessToken"}=; Max-Age=0; Path=/`,
                                `${options.cookieNames?.refreshToken ?? "refreshToken"}=; Max-Age=0; Path=/`,
                            ].join(", "),
                        },
                    },
                );
            }

            onAuth?.({ tokens: { access: authToken, refresh: refreshToken } });
            return null;
        }

        if (error) {
            // display an error page and then redirect to the auth page
            console.error(error);
        }

        if (!authToken) {
            const { url: authUrl } = await authClient.authorize(
                url.origin + "?callback=auth",
                "code",
            );
            return redirect(authUrl);
        }

        onAuth?.({ tokens: { access: authToken, refresh: refreshToken } });
        return null;
    };
}
