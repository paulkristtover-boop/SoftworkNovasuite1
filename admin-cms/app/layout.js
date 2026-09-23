import './globals.css';

export const metadata = {
  title: 'SoftworkNovaSuite Admin CMS',
  description: 'Admin dashboard for SoftworkNovaSuite USDT bot',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
