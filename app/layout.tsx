import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Warehouse Information System",
  description: "WIS dashboard with Supabase RBAC"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster
          position="top-center"
          richColors
          offset={16}
          mobileOffset={{ top: "max(12px, env(safe-area-inset-top, 0px))" }}
          toastOptions={{
            classNames: {
              toast: "w-full max-w-full min-w-0 justify-center text-center sm:text-left sm:justify-start"
            }
          }}
        />
      </body>
    </html>
  );
}
