import "./globals.css";

export const metadata = {
  title: "KRA Ready Invoices",
  description: "Fast invoices, expenses, and KRA summaries for Kenyan SMEs",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
