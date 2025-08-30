import { useEffect } from "react";

export default function Logout() {
    useEffect(() => {
        document.cookie =
            "accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
        document.cookie =
            "refreshToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
        window.location.href = "/";
    }, []);

    return (
        <div className="relative min-h-screen bg-gradient-to-r from-blue-400 to-purple-500 flex items-center justify-center p-4">
            <div className="text-center bg-white rounded-lg shadow-xl p-8 w-full max-w-2xl">
                <h2 className="text-2xl font-bold mb-4">Logging you out...</h2>
                <p>You will be redirected shortly.</p>
            </div>
        </div>
    );
}
