import { Inter } from 'next/font/google';
import './globals.css';
import PushRegister from '@/components/PushRegister';

// Ola1-S8: Inter self-hosted (next/font, sin request a Google en runtime). Variable font → no enumerar
// pesos. display:'swap' → sin FOIT; fallback system-ui mientras carga. Expone --font-inter en <html>.
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata = {
  title: 'Registro Calórico',
  description: 'Control calórico con análisis de platillos por IA',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Coach' },
};

// Anti-flash: fija data-theme ANTES del primer render (lee localStorage). En "system"
// no pone atributo → el @media (prefers-color-scheme) de globals.css resuelve el tema.
const THEME_INIT = `try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute('content',t==='dark'?'#0B0D10':'#FBFBF9');}}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={inter.variable}>
      <head>
        <meta name="theme-color" content="#FBFBF9" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <PushRegister />
        {children}
      </body>
    </html>
  );
}
