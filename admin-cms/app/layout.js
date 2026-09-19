import './globals.css';

export const metadata = {
  title: 'NovaSuite Admin',
  description: 'NovaSuite PTC Admin CMS',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
