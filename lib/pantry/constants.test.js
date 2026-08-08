import { describe, it, expect } from 'vitest';
import { imageOf } from './constants.js';

// N-I6: la URL mostrable debe preferir image_url (firmada/http) sobre `imagen` (que puede ser un
// PATH de storage no pintable → preview de etiqueta roto).
describe('constants · imageOf (N-I6: prefiere URL mostrable)', () => {
  it('prefiere image_url (firmada) sobre imagen (path de storage)', () => {
    expect(imageOf({ imagen: 'uid/pantry/x.jpg', image_url: 'https://signed/x.jpg?token=1' })).toBe('https://signed/x.jpg?token=1');
  });
  it('sin image_url → usa imagen (p.ej. objectURL de una foto manual)', () => {
    expect(imageOf({ imagen: 'blob:abc' })).toBe('blob:abc');
  });
  it('sin nada → cadena vacía', () => {
    expect(imageOf({})).toBe('');
    expect(imageOf(null)).toBe('');
  });
});
