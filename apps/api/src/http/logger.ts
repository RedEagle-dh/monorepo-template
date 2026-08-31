export type LogLevel = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const LEVELS: Record<LogLevel, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};

export interface Logger {
	debug(message: string, fields?: Fields): void;
	info(message: string, fields?: Fields): void;
	warn(message: string, fields?: Fields): void;
	error(message: string, fields?: Fields): void;
	child(bindings: Fields): Logger;
}

/** One JSON line per event. warn/error go to stderr, the rest to stdout. */
export function createLogger(level: LogLevel, bindings: Fields = {}): Logger {
	const floor = LEVELS[level];
	const emit = (lvl: LogLevel, message: string, fields?: Fields): void => {
		if (LEVELS[lvl] < floor) return;
		const line = JSON.stringify({
			level: lvl,
			time: new Date().toISOString(),
			message,
			...bindings,
			...fields,
		});
		if (LEVELS[lvl] >= LEVELS.warn) console.error(line);
		else console.log(line);
	};
	return {
		debug: (message, fields) => emit("debug", message, fields),
		info: (message, fields) => emit("info", message, fields),
		warn: (message, fields) => emit("warn", message, fields),
		error: (message, fields) => emit("error", message, fields),
		child: (childBindings) =>
			createLogger(level, { ...bindings, ...childBindings }),
	};
}

export const silentLogger: Logger = {
	debug() {},
	info() {},
	warn() {},
	error() {},
	child: () => silentLogger,
};

/** Serializable description of an unknown thrown value. */
export function describeError(error: unknown): Fields {
	if (error instanceof Error) {
		return { name: error.name, message: error.message, stack: error.stack };
	}
	return { value: String(error) };
}
