import { createClient } from "@openauthjs/openauth/client";
import { serialize as serializeCookie } from "cookie";
import { type LoaderFunctionArgs, redirect } from "react-router";
import type { BaseIssue, BaseSchema, StringSchema } from "valibot";
import { object, string } from "valibot";

export function getCookie(
    cookieName: string = "accessToken",
    request?: Request,
) {
    const _getCookie = (cookie: string, name: string) => {
        if (!cookie) return undefined;
        return cookie
            .split(";")
            .find((c) => c.trim().startsWith(`${name}=`))
            ?.split("=")[1];
    };

    if (typeof document !== "undefined") {
        return _getCookie(document.cookie, cookieName);
    }

    if (request) {
        return _getCookie(request.headers.get("Cookie") ?? "", cookieName);
    }

    return undefined;
}
export function accessTokenFromCookie(
    cookieName: string = "accessToken",
    request?: Request,
) {
    return getCookie(cookieName, request);
}

export function makeAuthLoader(
    options: {
        unprotectedPaths?: string[];
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
            secure?: boolean;
        };
        cookieNames?: {
            accessToken: string;
            refreshToken: string;
        };
    },
    onAuth?: (data: {
        tokens: { access: string; refresh: string | undefined };
        request: Request;
    }) => Response | undefined | void,
    onError?: (error: "invalid_token" | string) => Response | undefined | void,
) {
    const authClient = createClient({
        clientID: options.clientID,
        issuer: options.issuer,
    });

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

    const accessTokenCookieName =
        options.cookieNames?.accessToken ?? "accessToken";
    const refreshTokenCookieName =
        options.cookieNames?.refreshToken ?? "refreshToken";

    return async ({ request }: LoaderFunctionArgs) => {
        const url = new URL(request.url);

        let origin = url.origin;
        // get the origin from the proxy headers
        const proxyHost = request.headers.get("X-Forwarded-Host");
        const proxyProto = request.headers.get("X-Forwarded-Proto");
        const behindProxy = proxyHost && proxyProto;
        if (behindProxy) {
            origin = `${proxyProto}${proxyProto.endsWith(":") ? "" : ":"}//${proxyHost}`;
        }

        if (options.unprotectedPaths?.includes(url.pathname)) {
            return null;
        }

        const callback = url.searchParams.get("callback");
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (callback === "auth" && code) {
            const token = await authClient.exchange(
                code,
                origin + "?callback=auth",
            );

            if (!token.err) {
                const {
                    maxAge = 604_800,
                    path = "/",
                    secure = true,
                } = options.cookieOptions ?? {};

                const cookiesMap: Record<
                    string,
                    { value?: string; httpOnly: boolean; secure: boolean }
                > = {
                    [accessTokenCookieName]: {
                        value: token.tokens.access,
                        httpOnly: false,
                        secure,
                    },
                    [refreshTokenCookieName]: {
                        value: token.tokens.refresh,
                        httpOnly: true,
                        secure,
                    },
                };

                const headers = new Headers();
                for (const [key, cookie] of Object.entries(cookiesMap)) {
                    if (cookie.value) {
                        headers.append(
                            "Set-Cookie",
                            serializeCookie(key, cookie.value, {
                                maxAge,
                                path,
                                httpOnly: cookie.httpOnly,
                                secure: cookie.secure,
                            }),
                        );
                    }
                }

                return (
                    onAuth?.({ tokens: token.tokens, request }) ??
                    redirect(origin, {
                        headers,
                    })
                );
            }
        }

        if (error) {
            // display an error page and then redirect to the auth page
            return onError?.(error) ?? null;
        }

        const authToken = getCookie(accessTokenCookieName, request);
        const refreshToken = getCookie(refreshTokenCookieName, request);

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

                const headers = new Headers();
                headers.append(
                    "Set-Cookie",
                    serializeCookie(accessTokenCookieName, "", {
                        maxAge: 0,
                        path: "/",
                        httpOnly: false,
                        secure: true,
                    }),
                );
                headers.append(
                    "Set-Cookie",
                    serializeCookie(refreshTokenCookieName, "", {
                        maxAge: 0,
                        path: "/",
                        httpOnly: true,
                        secure: true,
                    }),
                );

                return redirect(origin + "?callback=auth&error=invalid_token", {
                    headers,
                });
            }

            return (
                onAuth?.({
                    tokens: {
                        access: authToken,
                        refresh: refreshToken,
                    },
                    request,
                }) ?? null
            );
        }

        if (!authToken) {
            const { url: authUrl } = await authClient.authorize(
                origin + "?callback=auth",
                "code",
            );
            return redirect(authUrl);
        }

        return (
            onAuth?.({
                tokens: { access: authToken, refresh: refreshToken },
                request,
            }) ?? null
        );
    };
}
