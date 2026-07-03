import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getUploadsDir } from '@/lib/db';

const MIME_BY_EXT = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

export async function GET(request, { params }) {
  const { name } = await params;
  const safe = path.basename(name);
  const mime = MIME_BY_EXT[path.extname(safe).toLowerCase()];
  if (!mime) {
    return NextResponse.json({ error: 'Archivo inválido' }, { status: 400 });
  }
  try {
    const data = await fs.readFile(path.join(getUploadsDir(), safe));
    return new NextResponse(data, {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Imagen no encontrada' }, { status: 404 });
  }
}
