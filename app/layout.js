import "./globals.css";
import { ThemeProvider } from "../components/ThemeProvider";
import AuthGate from "../components/AuthGate";

export const metadata = {
  title: "BELIEFX — Trading Journal",
  description: "Journal de trading professionnel",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <ThemeProvider>
          <AuthGate>{children}</AuthGate>
        </ThemeProvider>
      </body>
    </html>
  );
}
