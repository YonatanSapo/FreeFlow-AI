/**
 * Minimal structured-logging interface.
 * Concrete implementations live in src/adapters/ (VSCode OutputChannel, etc.).
 */
export interface Logger {
	info(message: string): void;
	warn(message: string): void;
	error(message: string, err?: unknown): void;
}

/** No-op logger — useful in tests and as a default. */
export const NullLogger: Logger = {
	info() { /* intentionally empty */ },
	warn() { /* intentionally empty */ },
	error() { /* intentionally empty */ },
};
