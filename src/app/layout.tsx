import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Suspense } from "react";
import { Nav, NavLinks } from "@/components/nav";
import { ConfirmProvider, ToastProvider } from "@/components/feedback-ui";

export const metadata: Metadata = {
  title: { default: "Wardrobe Studio", template: "%s · Wardrobe Studio" },
  description: "A personal fashion journal and AI stylist that plans outfits from the clothes you actually own.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#f4efe6" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className="h-full">
      <body className="min-h-full">
        <ToastProvider>
          <ConfirmProvider>
            <div className="flex min-h-screen">
              <Suspense fallback={<NavLinks path="" />}>
                <Nav />
              </Suspense>
              <main className="min-w-0 flex-1 px-4 pt-6 pb-28 sm:px-6 md:px-10 md:pt-10 md:pb-12">
                <div className="mx-auto max-w-6xl">{children}</div>
              </main>
            </div>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
