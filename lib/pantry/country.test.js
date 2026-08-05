import { describe, it, expect } from 'vitest';
import { countryFromBarcode, countryFromTags } from './country.js';

describe('pantry/country · countryFromBarcode (prefijo GS1 → ISO-2)', () => {
  it('MX = 750 (producto mexicano)', () => {
    expect(countryFromBarcode('7501055310333')).toBe('MX');
    expect(countryFromBarcode('750 100 3334367')).toBe('MX');
  });
  it('otros países LatAm/ES', () => {
    expect(countryFromBarcode('8412345678905')).toBe('ES'); // 841 ∈ 840–849
    expect(countryFromBarcode('7791234567890')).toBe('AR'); // 779
    expect(countryFromBarcode('7701234567890')).toBe('CO'); // 770
    expect(countryFromBarcode('7801234567890')).toBe('CL'); // 780
  });
  it('US/CA para prefijos 000–139', () => {
    expect(countryFromBarcode('0016500535027')).toBe('US');
    expect(countryFromBarcode('1391234567890')).toBe('US');
  });
  it('desconocido o inválido → null (no se asume país)', () => {
    expect(countryFromBarcode('4001234567890')).toBe(null); // 400 (DE) no está en el subconjunto
    expect(countryFromBarcode('12')).toBe(null);
    expect(countryFromBarcode('')).toBe(null);
    expect(countryFromBarcode(null)).toBe(null);
  });
});

describe('pantry/country · countryFromTags (país REAL de countries_tags de OFF)', () => {
  it('mapea el tag al ISO-2 (autoritativo, no el GS1)', () => {
    expect(countryFromTags(['en:mexico'])).toBe('MX');
    expect(countryFromTags(['en:spain'])).toBe('ES');
    expect(countryFromTags(['en:united-states'])).toBe('US');
    expect(countryFromTags('en:argentina,en:chile')).toBe('AR'); // primero soportado
  });
  it('sin tags o sin mapeo → null (nada de invención)', () => {
    expect(countryFromTags(['en:panama'])).toBe(null); // no soportado → null
    expect(countryFromTags([])).toBe(null);
    expect(countryFromTags(null)).toBe(null);
  });
});
