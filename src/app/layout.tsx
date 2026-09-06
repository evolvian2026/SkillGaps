import type { Metadata } from "next";
import "./globals.css";
import { Analytics } from "@/components/analytics";

export const metadata: Metadata = {
  title: {
    default: "SkillGaps — know your hiring gap before the drive",
    template: "%s · SkillGaps",
  },
  description:
    "Diagnostic assessments that show engineering students where they stand against real hiring bars, and give their college cohort-level visibility.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      {/* System font stack: no webfont download on a slow campus connection. */}
      <body className="min-h-screen font-[system-ui,-apple-system,'Segoe_UI',Roboto,sans-serif] antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
