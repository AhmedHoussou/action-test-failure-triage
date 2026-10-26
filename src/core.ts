/**
 * Lightweight, zero-dependency GitHub Actions core helper.
 * Fully compatible with GitHub Actions runner conventions and local development.
 */

export function getInput(name: string): string {
  // GitHub Actions runners pass inputs as INPUT_<UPPERCASE_NAME>
  const envKey = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
  const fallbackKey = name.replace(/-/g, '_').toUpperCase();

  const val =
    process.env[envKey] ||
    process.env[fallbackKey] ||
    process.env[name] ||
    '';

  return val.trim();
}

export function info(message: string): void {
  console.log(message);
}

export function setFailed(message: string): void {
  process.exitCode = 1;
  // GitHub Actions workflow command syntax for error annotations
  console.error(`::error::${message}`);
}