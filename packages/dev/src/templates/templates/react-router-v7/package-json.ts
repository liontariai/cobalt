export const SCRIPTS = {
    build: "react-router build",
    dev: "react-router dev",
    start: "react-router-serve ./build/server/index.js",
    typecheck: "react-router typegen && tsc",
};

// React Router v7 specific dependencies
export const DEPENDENCIES = {
    "@react-router/node": "^7.5.3",
    "@react-router/serve": "^7.5.3",
    isbot: "^5.1.27",
    react: "^19.1.0",
    "react-dom": "^19.1.0",
    "react-router": "^7.5.3",
    "react-router-dom": "^7.7.1",
};

export const DEV_DEPENDENCIES = {
    "@react-router/dev": "^7.5.3",
    "@tailwindcss/vite": "^4.1.4",
    "@types/node": "^20",
    "@types/react": "^19.1.2",
    "@types/react-dom": "^19.1.2",
    tailwindcss: "^4.1.4",
    typescript: "^5.8.3",
    vite: "^6.3.3",
    "vite-tsconfig-paths": "^5.1.4",
};
