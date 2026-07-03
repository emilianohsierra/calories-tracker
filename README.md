# Registro Calórico 🍽️

Aplicación web para llevar el control calórico de tu alimentación subiendo **fotos de tus platillos**. La IA (OpenAI GPT-4o vision) analiza cada foto y genera automáticamente:

- **Título** del platillo
- **Descripción** e ingredientes detectados
- **Calorías estimadas** y macronutrientes (proteína, carbohidratos, grasas)
- Tipo de comida (desayuno / comida / cena / snack) y nivel de confianza de la estimación

Todos los valores son editables antes de guardar.

## Funcionalidades

- 📷 Sube o toma una foto de tu platillo; se analiza con IA (puedes añadir una nota para mejorar la estimación, ej. "son 2 tacos de pastor")
- 📊 Resumen diario: calorías consumidas vs. tu meta, con medidor y tarjetas de macros
- 📈 Gráfica de los últimos 7 días (haz clic en una barra para ver ese día)
- 🗓️ Navegación por días y registro retroactivo
- 🎯 Meta calórica diaria configurable
- 🗄️ Todo se guarda localmente en SQLite (`data/app.db`) y las fotos en `data/uploads/`

## Requisitos

- Node.js 20+
- Una clave de API de OpenAI: <https://platform.openai.com/api-keys>

## Instalación y uso

```bash
npm install

# Configura tu clave de OpenAI
cp .env.local.example .env.local
# edita .env.local y coloca tu OPENAI_API_KEY

npm run dev
```

Abre <http://localhost:7350> (o `http://<ip-de-tu-máquina>:7350` desde el celular en la misma red).

> El puerto 7350 está fijado en los scripts de `package.json` porque cae dentro del rango que el firewall de esta máquina ya permite (6000-10000).

Para producción:

```bash
npm run build
npm start
```

## Configuración

El análisis de imágenes funciona con **OpenAI (ChatGPT)** o **Grok (xAI)** — ambos usan la misma API de chat-completions. Configura al menos una clave:

| Variable | Descripción | Por defecto |
|---|---|---|
| `AI_PROVIDER` | Proveedor a usar: `openai` \| `grok`. Si se omite, se usa el que tenga clave (OpenAI tiene prioridad si hay ambas) | auto |
| `OPENAI_API_KEY` | Clave de OpenAI (<https://platform.openai.com/api-keys>) | — |
| `OPENAI_MODEL` | Modelo de visión de OpenAI | `gpt-4o-mini` |
| `XAI_API_KEY` | Clave de xAI (<https://console.x.ai>) | — |
| `XAI_MODEL` | Modelo de visión de Grok | `grok-4.3` |

> `gpt-4o-mini` es económico y suficiente para la mayoría de platillos; si quieres estimaciones más finas usa `OPENAI_MODEL=gpt-4o`. Para cambiar de proveedor basta editar `.env.local` y reiniciar el servidor.

## Estructura

```
app/
  page.js                  # Vista principal (resumen, gráfica, platillos)
  api/analyze/route.js     # Análisis de imagen con OpenAI (título, descripción, kcal, macros)
  api/meals/...            # CRUD de platillos
  api/summary/route.js     # Totales por día (gráfica semanal)
  api/settings/route.js    # Meta calórica
  api/uploads/[name]/      # Sirve las fotos guardadas
components/                # DailySummary, WeekChart, MealList, AddMealModal
lib/                       # SQLite, cliente OpenAI, utilidades de imagen/fechas
data/                      # Base de datos y fotos (se crea sola; no se versiona)
```

## Notas

- Las estimaciones calóricas por foto son aproximadas; la app muestra el nivel de confianza y siempre puedes ajustar los valores antes de guardar.
- Las imágenes se reducen en el navegador (máx. 1280 px) antes de subirse para ahorrar tokens y espacio.
