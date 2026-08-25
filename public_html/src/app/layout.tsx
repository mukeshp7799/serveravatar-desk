import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "../components/ThemeProvider";
import I18nProvider from "../components/I18nProvider";
import Toaster from "../components/Toaster";
import AppTooltip from "../components/Tooltip";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Serveravatar Hub - HR & Project Management",
  description: "Integrated HR & Project Management System",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('theme') || 'system';
                  var r = t === 'system'
                    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                    : t;
                  document.documentElement.setAttribute('data-theme', r);

                  var lang = localStorage.getItem('i18nextLng');
                  if (lang) {
                    var dir = (lang === 'ur') ? 'rtl' : 'ltr';
                    document.documentElement.lang = lang;
                    document.documentElement.dir = dir;
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <I18nProvider>
          <ThemeProvider>
            {children}
            <Toaster />
            <AppTooltip />
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
