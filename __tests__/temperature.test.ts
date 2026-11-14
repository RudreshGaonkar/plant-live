import {
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  convertTemperature,
  getTemperatureUnitLabel,
  formatTemperature,
  formatTemperatureText,
} from '@/utils/temperature';

describe('Universal Temperature Utilities', () => {
  describe('celsiusToFahrenheit & fahrenheitToCelsius', () => {
    it('converts 0°C to 32°F', () => {
      expect(celsiusToFahrenheit(0)).toBe(32);
    });

    it('converts 100°C to 212°F', () => {
      expect(celsiusToFahrenheit(100)).toBe(212);
    });

    it('converts 28°C to 82.4°F with 1-decimal precision', () => {
      expect(celsiusToFahrenheit(28)).toBe(82.4);
    });

    it('converts 35°C to 95°F', () => {
      expect(celsiusToFahrenheit(35)).toBe(95);
    });

    it('converts 82.4°F back to 28°C', () => {
      expect(fahrenheitToCelsius(82.4)).toBe(28);
    });
  });

  describe('convertTemperature & getTemperatureUnitLabel', () => {
    it('returns Celsius when unit is C', () => {
      expect(convertTemperature(24, 'C')).toBe(24);
      expect(getTemperatureUnitLabel('C')).toBe('°C');
    });

    it('returns Fahrenheit when unit is F', () => {
      expect(convertTemperature(24, 'F')).toBe(75.2);
      expect(getTemperatureUnitLabel('F')).toBe('°F');
    });
  });

  describe('formatTemperature', () => {
    it('formats null or undefined gracefully', () => {
      expect(formatTemperature(null, 'C')).toBe('--°C');
      expect(formatTemperature(undefined, 'F')).toBe('--°F');
      expect(formatTemperature(null, 'F', { includeUnit: false })).toBe('--');
    });

    it('formats Celsius correctly', () => {
      expect(formatTemperature(24, 'C')).toBe('24°C');
      expect(formatTemperature(24.5, 'C')).toBe('24.5°C');
      expect(formatTemperature(24, 'C', { includeUnit: false })).toBe('24');
    });

    it('formats Fahrenheit correctly at 1-decimal precision', () => {
      expect(formatTemperature(24, 'F')).toBe('75.2°F');
      expect(formatTemperature(35, 'F')).toBe('95.0°F');
      expect(formatTemperature(35, 'F', { includeUnit: false })).toBe('95.0');
    });
  });

  describe('formatTemperatureText', () => {
    it('returns original text when unit is C', () => {
      const text = 'Temperature is 28°C on the Balcony (max: 35°C).';
      expect(formatTemperatureText(text, 'C')).toBe(text);
    });

    it('converts Celsius tokens to Fahrenheit when unit is F without mutating canonical stored text', () => {
      const text = 'Temperature is 28°C on the Balcony (max: 35°C).';
      expect(formatTemperatureText(text, 'F')).toBe(
        'Temperature is 82.4°F on the Balcony (max: 95.0°F).'
      );
    });

    it('handles multiple tokens and decimals in text', () => {
      const text = 'Current: 24.5°C, Limit: 32°C, Extreme: 8°C.';
      expect(formatTemperatureText(text, 'F')).toBe(
        'Current: 76.1°F, Limit: 89.6°F, Extreme: 46.4°F.'
      );
    });
  });
});
