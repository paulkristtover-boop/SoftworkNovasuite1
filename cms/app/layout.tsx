import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NovaSuite Admin',
  description: 'NovaSuite PTC Admin CMS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
