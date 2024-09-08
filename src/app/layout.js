import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Open Video Meeting",
  description: "Open Video Meeting is a Video conferencing website that allows you to easily join meetings without creating accounts or registering, where you can chat, share screen and camera , created by Diego Ivan Perea Montealegre",
  creator: "Diego Ivan Perea Montealegre",
      icons: {
    icon: './icon.ico', // Ruta correcta del ícono
  },    
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
