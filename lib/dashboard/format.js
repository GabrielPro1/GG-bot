const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

function normalizeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

/** Formatta una dimensione in byte usando unità binarie (1 KB = 1024 B). */
export function formatBytes(bytes, decimals = 1) {
    const value = normalizeNumber(bytes);
    if (value <= 0) {
        return '0 B';
    }
    const exponent = Math.min(BYTE_UNITS.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
    const scaled = value / 1024 ** exponent;
    const digits = exponent === 0 ? 0 : Math.max(0, decimals);
    return `${scaled.toFixed(digits).replace('.', ',')} ${BYTE_UNITS[exponent]}`;
}

/** Percentuale leggibile, con virgola decimale italiana. */
export function formatPercent(value, decimals = 0) {
    const number = normalizeNumber(value);
    return `${number.toFixed(Math.max(0, decimals)).replace('.', ',')}%`;
}

/** Durata compatta in italiano, es. "2g 4h", "3h 12m", "45s". */
export function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(normalizeNumber(totalSeconds)));
    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor((seconds % 86_400) / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);
    const remainingSeconds = seconds % 60;
    if (days > 0) {
        return `${days}g ${hours}h`;
    }
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
}

export function formatCount(value) {
    return Math.max(0, Math.trunc(normalizeNumber(value))).toLocaleString('it-IT');
}
