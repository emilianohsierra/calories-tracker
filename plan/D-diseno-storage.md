# Paso D — Diseño: Fotos a Supabase Storage (último bloqueante serverless)

**De:** Torvalds (CTO) · **Para:** Lugia (Director)
**Estado:** BORRADOR de diseño. **No ejecutado, no cableado.** A la espera de: (1) validación en vivo de la app migrada (Pasos 4-6), (2) tu GO a Paso D.
**Objetivo:** eliminar el último bloqueante de deploy serverless — hoy `app/api/analyze/route.js:87` hace `fs.writeFile` y `app/api/uploads/[name]` sirve desde disco (H16/R5). En Vercel el FS es efímero → la foto se pierde/500. Se mueven las fotos a **Supabase Storage** (bucket **privado**), coherente con el stack ya elegido y sin service_role en runtime.

---

## Decisiones de diseño

### 1) Bucket PRIVADO + carpeta por usuario
- Bucket `meal-photos`, **privado** (las fotos son datos personales; nada público).
- Ruta del objeto: **`{user_id}/{uuid}.{ext}`**. La primera carpeta = `auth.uid()` habilita RLS por usuario en `storage.objects` (mismo patrón que meals).
- En `meals.image` se guarda **solo el nombre** `{uuid}.{ext}` (bare, sin `/`) — compatible con el saneado actual (`[^a-zA-Z0-9.-]`). La ruta completa se reconstruye siempre como `{session.user.id}/{image}`. Beneficio: un usuario **solo puede direccionar su propia carpeta**, porque el `user_id` sale de la sesión, no del cliente (defensa extra sobre la RLS).

### 2) Autorización = RLS de Storage bajo la sesión del usuario (sin service_role)
Todas las operaciones (subir, firmar URL, borrar) corren con el cliente autenticado del usuario. La RLS de `storage.objects` restringe a la carpeta propia. **No se usa service_role** (consistente con VB-4). Un usuario no puede subir, ver ni firmar URLs de la carpeta de otro.

### 3) Servir la imagen = URL firmada de corta vida (recomendado: Opción B)
- **Opción B (recomendada):** `app/api/meals` GET genera una **URL firmada** por cada foto con `createSignedUrls([...], 600)` (batch) y devuelve `image_url` en cada meal. `components/MealList.js` usa `meal.image_url`. **Se elimina `app/api/uploads/[name]`.** Menos rutas, una sola llamada batch por carga de día.
  - **Expiración ~600s (ajuste del Director):** se sube de 60s a **~300-600s** para dar margen si el usuario hace scroll de un historial largo con lazy-load y alguna miniatura se pide tarde. Se regenera igual al reload; 600s es holgado sin ser eterno.
- **Opción A (alternativa):** conservar `app/api/uploads/[name]` pero reemplazando su cuerpo: `getUser` 401 → firmar `{user.id}/{basename(name)}` → `redirect(signedUrl)`. Menos cambio en el cliente, pero un redirect por imagen.

Recomiendo **B**: el modal (`AddMealModal`) muestra la foto local (blob) durante la creación; solo `MealList` (vía meals GET) necesita la URL servida, así que firmar en el GET cubre todo y borra una ruta.

---

## Cambios por archivo (Paso D)

| Archivo | Hoy | Después |
|---|---|---|
| **(nuevo) SQL de Storage** | — | Crear bucket `meal-photos` privado + políticas RLS `storage.objects` por `auth.uid()` (SQL propuesta abajo). Lo corre Emiliano. |
| `app/api/analyze/route.js` | `fs.writeFile(uploadsDir, filename, buffer)`; `reuse` chequea archivo en disco | `supabase.storage.from('meal-photos').upload('{user.id}/{uuid}.{ext}', buffer, { contentType: file.type })`; `reuse` chequea existencia en Storage (`list`/`exists`) y omite re-subida. Sigue devolviendo `imagen: '{uuid}.{ext}'` (bare). Ya tiene `getUser` (del Paso 3). |
| `app/api/meals/route.js` GET | devuelve `meals` con `image` (filename) | además firma URLs: `createSignedUrls(paths, 600)` y agrega `image_url` a cada meal (Opción B). |
| `components/MealList.js` | `src={`/api/uploads/${meal.image}`}` | `src={meal.image_url}` (placeholder si no hay). |
| `app/api/uploads/[name]/route.js` | lee de disco | **eliminar** (Opción B) o convertir en redirect a URL firmada (Opción A). |
| `app/api/meals/[id]/route.js` | `fs.unlink(uploadsDir, filename)` | `supabase.storage.from('meal-photos').remove(['{user.id}/{filename}'])`. |
| `lib/db.js` | `getUploadsDir` | **eliminar** (ya no hay disco). Con esto desaparece todo uso de `fs` para datos. |

Sin nuevas env vars: se reusa `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` + la sesión.

---

## SQL propuesta (Storage) — ⛔ NO EJECUTAR aún, para tu revisión

```sql
-- Bucket privado para fotos de platillos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-photos', 'meal-photos', false, 8388608,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- RLS en storage.objects: cada quien SOLO su carpeta {auth.uid()}/...
drop policy if exists meal_photos_select_own on storage.objects;
create policy meal_photos_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'meal-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists meal_photos_insert_own on storage.objects;
create policy meal_photos_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'meal-photos'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists meal_photos_delete_own on storage.objects;
create policy meal_photos_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'meal-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
```

---

## Orden de ejecución (cuando haya GO)
- **D.1** — Correr la SQL de Storage (bucket + políticas). Verificar bucket privado en el dashboard.
- **D.2** — `analyze` sube a Storage; `meals` GET firma URLs; `MealList` usa `image_url`; eliminar `/api/uploads`; `meals/[id]` borra de Storage; quitar `getUploadsDir`/`fs`. `npm run build`.
- **D.3** — **Primer deploy a Vercel**: pegar env (`ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `FREE_ANALYSIS_LIMIT`) en Project Settings. Ya sin `fs` ni SQLite → 100% serverless-ready.

---

## Riesgos / notas
| Tema | Nota |
|---|---|
| URLs firmadas expiran (~600s) | Se generan al cargar el día; un reload las regenera. 600s da margen para scroll/lazy-load de historial largo. |
| Preview en creación no depende de Storage | **Confirmado**: `AddMealModal` muestra `photo.url` (blob local `URL.createObjectURL`), nunca una URL firmada. El firmado solo ocurre en `MealList` (meals GET), tras guardar. |
| Borrado huérfano | Si el borrado del meal falla tras remover la foto (o viceversa), puede quedar un huérfano. Orden: borrar fila (RLS) y luego `remove` best-effort (como hoy con `unlink().catch()`). |
| Reuse en reanálisis | Al reanalizar se reutiliza el objeto ya subido (no re-subir): chequear existencia antes de `upload`. |
| Migración de fotos viejas | No aplica: se empezó limpio (H18); no hay fotos en disco que migrar en producción. |
| Costo/limpieza | Fotos huérfanas y retención = deuda futura (job de limpieza), no para D. |

---

## Lo que NO hago hasta tu GO
No ejecuto la SQL de Storage, no toco `analyze`/`meals`/`uploads`/`meals/[id]`/`lib/db.js`, no creo el bucket. Todo queda como diseño para tu revisión.
