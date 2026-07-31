import './globals.css';

export const metadata = {
  title: 'Registro Calórico',
  description: 'Control calórico con análisis de platillos por IA',
};

// Anti-flash: fija data-theme ANTES del primer render (lee localStorage). En "system"
// no pone atributo → el @media (prefers-color-scheme) de globals.css resuelve el tema.
const THEME_INIT = `try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute('content',t==='dark'?'#0B0D10':'#FBFBF9');}}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <meta name="theme-color" content="#FBFBF9" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
