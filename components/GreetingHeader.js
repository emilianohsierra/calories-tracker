'use client';

// Saludo por hora local + subtítulo del coach.
export default function GreetingHeader({ name, subtitle }) {
  const h = new Date().getHours();
  const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  return (
    <header className="greeting">
      <div>
        <h1 className="greeting-title">
          {saludo}
          {name ? `, ${name}` : ''}
        </h1>
        {subtitle && <p className="greeting-sub">{subtitle}</p>}
      </div>
    </header>
  );
}
