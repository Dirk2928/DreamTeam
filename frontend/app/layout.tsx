import type { Metadata } from "next";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

export const metadata: Metadata = { title: { default: "PKonek", template: "%s | PKonek" }, description: "Connect Pasig City community concerns to visible action." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><AuthProvider>{children}</AuthProvider><Toaster richColors position="top-right"/></body></html>; }
