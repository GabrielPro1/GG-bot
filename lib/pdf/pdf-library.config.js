import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { BOOK_PAGE_OFFSETS } from './book-offsets.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function intFromEnv(name, fallback, min = 0) {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === '')
        return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value))
        return fallback;
    return Math.max(min, Math.trunc(value));
}

function boolFromEnv(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === '')
        return fallback;
    return raw.trim().toLowerCase() === 'true';
}

export const PDF_CONFIG_DEFAULTS = {
    booksDir: 'libri',
    maxPagesPerRequest: 15,
    renderScale: 2,
    maxPdfBytes: 200 * 1024 * 1024,
    maxConcurrentRenders: 3,
    sendDelayMs: 600,
    imageFormat: 'jpeg',
    jpegQuality: 82,
    maxImageBytes: 10 * 1024 * 1024,
    cacheEnabled: true,
    cacheDir: 'data/pdf-cache',
    cacheMaxBytes: 300 * 1024 * 1024,
    cacheMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
    renderer: 'pdfjs',
};

export function getPdfConfig() {
    const renderer = (process.env.PDF_RENDERER ?? PDF_CONFIG_DEFAULTS.renderer).trim().toLowerCase();
    const imageFormat = (process.env.PDF_IMAGE_FORMAT ?? PDF_CONFIG_DEFAULTS.imageFormat).trim().toLowerCase() === 'png'
        ? 'png'
        : 'jpeg';
    return {
        booksDir: path.resolve(PROJECT_ROOT, PDF_CONFIG_DEFAULTS.booksDir),
        maxPagesPerRequest: intFromEnv('PDF_MAX_PAGES_PER_REQUEST', PDF_CONFIG_DEFAULTS.maxPagesPerRequest, 1),
        renderScale: intFromEnv('PDF_RENDER_SCALE', PDF_CONFIG_DEFAULTS.renderScale, 1),
        maxPdfBytes: intFromEnv('PDF_MAX_BYTES', PDF_CONFIG_DEFAULTS.maxPdfBytes, 1),
        maxConcurrentRenders: intFromEnv('PDF_MAX_CONCURRENT_RENDERS', PDF_CONFIG_DEFAULTS.maxConcurrentRenders, 1),
        sendDelayMs: intFromEnv('PDF_SEND_DELAY_MS', PDF_CONFIG_DEFAULTS.sendDelayMs, 0),
        imageFormat,
        jpegQuality: intFromEnv('PDF_JPEG_QUALITY', PDF_CONFIG_DEFAULTS.jpegQuality, 1),
        maxImageBytes: intFromEnv('PDF_MAX_IMAGE_BYTES', PDF_CONFIG_DEFAULTS.maxImageBytes, 1),
        cacheEnabled: boolFromEnv('PDF_CACHE_ENABLED', PDF_CONFIG_DEFAULTS.cacheEnabled),
        cacheDir: path.resolve(PROJECT_ROOT, PDF_CONFIG_DEFAULTS.cacheDir),
        cacheMaxBytes: intFromEnv('PDF_CACHE_MAX_BYTES', PDF_CONFIG_DEFAULTS.cacheMaxBytes, 1),
        cacheMaxAgeMs: intFromEnv('PDF_CACHE_MAX_AGE_MS', PDF_CONFIG_DEFAULTS.cacheMaxAgeMs, 1),
        renderer,
        bookOffsets: BOOK_PAGE_OFFSETS,
    };
}