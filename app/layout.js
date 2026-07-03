import './globals.css';

export const metadata = {
  title: 'Registro Calórico',
  description: 'Control calórico con análisis de platillos por IA',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
