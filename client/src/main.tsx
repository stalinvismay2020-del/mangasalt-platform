import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Supabase auth redirects (email confirmation, password reset) arrive as #access_token=…
// Leave those for supabase-js to read; otherwise make sure we're on a hash route.
const h = window.location.hash;
const isAuthRedirect = /access_token=|error_description=|error_code=/.test(h);
if (!isAuthRedirect && !h.startsWith("#/")) window.location.hash = "#/";

createRoot(document.getElementById("root")!).render(<App />);
