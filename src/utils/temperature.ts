export type TemperatureUnit = 'C' | 'F';

/**
 * Converts a numeric Celsius temperature to Fahrenheit at 1-decimal precision.
 */
export function celsiusToFahrenheit(celsius: number): number {
  return Number(((celsius * 9) / 5 + 32).toFixed(1));
}

/**
 * Converts a numeric Fahrenheit temperature to Celsius at 1-decimal precision.
 */
export function fahrenheitToCelsius(fahrenheit: number): number {
  return Number((((fahrenheit - 32) * 5) / 9).toFixed(1));
}

/**
 * Converts a Celsius temperature to the requested unit.
 * Keeps value canonical in Celsius if unit is 'C', or converts to Fahrenheit at 1-decimal precision.
 */
export function convertTemperature(celsius: number, unit: TemperatureUnit): number {
  if (unit === 'F') {
    return celsiusToFahrenheit(celsius);
  }
  return Number(celsius.toFixed(1));
}

/**
 * Returns the label for the temperature unit ('°C' or '°F').
 */
export function getTemperatureUnitLabel(unit: TemperatureUnit): string {
  return unit === 'F' ? '°F' : '°C';
}

export interface FormatTemperatureOptions {
  includeUnit?: boolean;
  precision?: number;
}

/**
 * Formats a canonical Celsius temperature for display in the target unit.
 * For Fahrenheit, defaults to 1-decimal precision.
 * For Celsius, integers are shown without decimals, floats with 1-decimal.
 */
export function formatTemperature(
  celsius: number | null | undefined,
  unit: TemperatureUnit = 'C',
  options: FormatTemperatureOptions = {}
): string {
  const { includeUnit = true, precision } = options;
  const unitLabel = includeUnit ? getTemperatureUnitLabel(unit) : '';

  if (celsius === null || celsius === undefined || !Number.isFinite(celsius)) {
    return `--${unitLabel}`;
  }

  if (unit === 'F') {
    const fVal = celsiusToFahrenheit(celsius);
    const formattedNum = precision !== undefined ? fVal.toFixed(precision) : fVal.toFixed(1);
    return `${formattedNum}${unitLabel}`;
  }

  const cVal = precision !== undefined ? celsius.toFixed(precision) : (Number.isInteger(celsius) ? String(celsius) : celsius.toFixed(1));
  return `${cVal}${unitLabel}`;
}

/**
 * Regex to find Celsius temperature tokens in arbitrary text.
 * Matches patterns like:
 * - "28°C"
 * - "35 °C"
 * - "28.5°C"
 * - "8°C"
 */
const CELSIUS_TOKEN_REGEX = /(\b\d+(?:\.\d+)?)\s*°C\b/gi;

/**
 * Formats Celsius temperature occurrences in a string (e.g. alert messages or descriptions)
 * into the target unit without mutating the canonical source text.
 */
export function formatTemperatureText(text: string, unit: TemperatureUnit = 'C'): string {
  if (!text || unit === 'C') {
    return text;
  }

  return text.replace(CELSIUS_TOKEN_REGEX, (_match, numStr) => {
    const celsius = parseFloat(numStr);
    if (!Number.isFinite(celsius)) return _match;
    const fVal = celsiusToFahrenheit(celsius);
    return `${fVal.toFixed(1)}°F`;
  });
}
