import {
    useRouteError,
    isRouteErrorResponse,
    Link,
    useSearchParams,
} from "react-router-dom";

export default function AuthErrorPage() {
    const error = useRouteError();
    const [query] = useSearchParams();

    let message =
        query.get("error") ?? "An unknown authentication error occurred.";
    let status: number | undefined;
    let statusText: string | undefined;

    if (isRouteErrorResponse(error)) {
        status = error.status;
        statusText = error.statusText;
        if (error.data && typeof error.data === "string") {
            message = error.data;
        } else if (error.data && typeof error.data?.message === "string") {
            message = error.data.message;
        } else if (statusText) {
            message = statusText;
        }
    } else if (error instanceof Error) {
        message = error.message;
    }

    return (
        <div className="relative min-h-screen bg-gradient-to-r from-blue-400 to-purple-500 flex items-center justify-center p-4">
            <div className="text-center bg-white rounded-lg shadow-xl p-8 w-full max-w-2xl">
                <h1 className="text-2xl font-bold mb-4">
                    Authentication Error
                </h1>
                {status && (
                    <div className="text-gray-500 mb-2">
                        <strong>Status:</strong> {status}
                    </div>
                )}
                <div className="text-gray-700 mb-4">{message}</div>
                <Link
                    onClick={() => {
                        document.cookie =
                            "accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
                        document.cookie =
                            "refreshToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
                    }}
                    to="/"
                    className="inline-block px-6 py-2.5 bg-blue-600 text-white font-medium text-xs leading-tight uppercase rounded shadow-md hover:bg-blue-700 hover:shadow-lg focus:bg-blue-700 focus:shadow-lg focus:outline-none focus:ring-0 active:bg-blue-800 active:shadow-lg transition duration-150 ease-in-out"
                >
                    Go to Login
                </Link>
            </div>
        </div>
    );
}
