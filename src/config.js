// In development Vite proxies /api to the local Node.js server. In production
// the same Node.js server serves both the API and the built React application.
export const API_URL = import.meta.env.VITE_API_URL || "/api";
