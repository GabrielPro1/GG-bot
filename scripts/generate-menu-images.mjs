/**
 * Rigenera le immagini di testata del menu in media/menu/.
 * Uso: node scripts/generate-menu-images.mjs
 *
 * Usa i font di sistema (Segoe UI/Arial Black su Windows, DejaVu su Linux) e
 * disegna le icone con il canvas, così le immagini restano coerenti tra loro.
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'media', 'menu');
const WIDTH = 1070;
const HEIGHT = 746;

function registerFont(candidates, alias) {
    for (const candidate of candidates) {
        if (!existsSync(candidate))
            continue;
        if (GlobalFonts.registerFromPath(candidate, alias))
            return alias;
    }
    return 'sans-serif';
}

const DISPLAY = registerFont([
    'C:/Windows/Fonts/ariblk.ttf',
    'C:/Windows/Fonts/segoeuib.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
], 'GG Display');
const BOLD = registerFont([
    'C:/Windows/Fonts/segoeuib.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
], 'GG Bold');
const REGULAR = registerFont([
    'C:/Windows/Fonts/segoeui.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
], 'GG Regular');

function fontSpec(size, family = BOLD, weight = 700) {
    return `${weight} ${size}px "${family}"`;
}

function rgba(hex, alpha) {
    const value = Number.parseInt(hex.slice(1), 16);
    const red = (value >> 16) & 0xff;
    const green = (value >> 8) & 0xff;
    const blue = value & 0xff;
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function drawGear(ctx) {
    ctx.beginPath();
    ctx.arc(0, 0, 25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.stroke();
    for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 29, Math.sin(angle) * 29);
        ctx.lineTo(Math.cos(angle) * 39, Math.sin(angle) * 39);
        ctx.stroke();
    }
}

function drawGamepad(ctx) {
    ctx.beginPath();
    ctx.roundRect(-42, -25, 84, 50, 22);
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(-34, -5, 22, 10, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-28, -11, 10, 22, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(20, -7, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(30, 5, 4.5, 0, Math.PI * 2);
    ctx.fill();
}

function drawRobot(ctx) {
    ctx.beginPath();
    ctx.roundRect(-31, -22, 62, 46, 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(0, -36);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -40, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-39, -9, 5, 18, 2.5);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(34, -9, 5, 18, 2.5);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-12, -6, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(12, -6, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-11, 11);
    ctx.lineTo(11, 11);
    ctx.stroke();
}

function drawSmiley(ctx) {
    ctx.beginPath();
    ctx.arc(0, 0, 35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-12, -8, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(12, -8, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 2, 21, 0.16 * Math.PI, 0.84 * Math.PI);
    ctx.stroke();
}

function drawShield(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, -38);
    ctx.lineTo(33, -25);
    ctx.lineTo(33, 0);
    ctx.quadraticCurveTo(33, 25, 0, 40);
    ctx.quadraticCurveTo(-33, 25, -33, 0);
    ctx.lineTo(-33, -25);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(-3, 12);
    ctx.lineTo(16, -11);
    ctx.stroke();
}

function drawCrown(ctx) {
    ctx.beginPath();
    ctx.moveTo(-38, 24);
    ctx.lineTo(-42, -20);
    ctx.lineTo(-19, -2);
    ctx.lineTo(0, -32);
    ctx.lineTo(19, -2);
    ctx.lineTo(42, -20);
    ctx.lineTo(38, 24);
    ctx.closePath();
    ctx.stroke();
    for (const [x, y] of [[-42, -20], [-19, -2], [0, -32], [19, -2], [42, -20]]) {
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawFolder(ctx) {
    ctx.beginPath();
    ctx.moveTo(-38, -24);
    ctx.lineTo(-12, -24);
    ctx.quadraticCurveTo(-6, -24, -2, -17);
    ctx.lineTo(2, -12);
    ctx.lineTo(38, -12);
    ctx.quadraticCurveTo(42, -12, 42, -8);
    ctx.lineTo(42, 28);
    ctx.quadraticCurveTo(42, 34, 36, 34);
    ctx.lineTo(-32, 34);
    ctx.quadraticCurveTo(-38, 34, -38, 28);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-38, -7);
    ctx.lineTo(42, -7);
    ctx.stroke();
}

const CATEGORIES = [
    {
        key: 'core',
        index: '01',
        title: 'CORE',
        subtitle: 'Comandi di base e informazioni',
        accent: '#38bdf8',
        accent2: '#2563eb',
        icon: drawGear,
    },
    {
        key: 'rpg',
        index: '02',
        title: 'RPG',
        subtitle: 'Avventure, missioni e combattimenti',
        accent: '#fb923c',
        accent2: '#dc2626',
        icon: drawGamepad,
    },
    {
        key: 'ai',
        index: '03',
        title: 'AI',
        subtitle: 'Parla con l\'intelligenza artificiale',
        accent: '#a78bfa',
        accent2: '#6d28d9',
        icon: drawRobot,
    },
    {
        key: 'fun',
        index: '04',
        title: 'FUN',
        subtitle: 'Giochi veloci e comandi divertenti',
        accent: '#f472b6',
        accent2: '#c026d3',
        icon: drawSmiley,
    },
    {
        key: 'group',
        index: '05',
        title: 'GROUP',
        subtitle: 'Strumenti per gestire i gruppi',
        accent: '#34d399',
        accent2: '#0d9488',
        icon: drawShield,
    },
    {
        key: 'owner',
        index: '06',
        title: 'OWNER',
        subtitle: 'Comandi riservati agli owner',
        accent: '#fbbf24',
        accent2: '#d97706',
        icon: drawCrown,
    },
    {
        key: 'other',
        index: '07',
        title: 'MENÙ PRINCIPALE',
        subtitle: 'Scegli una categoria per iniziare',
        accent: '#94a3b8',
        accent2: '#475569',
        icon: drawFolder,
    },
];

function drawBackground(ctx, category) {
    const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    background.addColorStop(0, '#101725');
    background.addColorStop(0.55, '#090d16');
    background.addColorStop(1, '#05070b');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const glow = ctx.createRadialGradient(WIDTH * 0.78, -30, 0, WIDTH * 0.78, -30, WIDTH * 0.72);
    glow.addColorStop(0, rgba(category.accent, 0.4));
    glow.addColorStop(0.4, rgba(category.accent2, 0.17));
    glow.addColorStop(1, rgba(category.accent2, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const lowerGlow = ctx.createRadialGradient(-80, HEIGHT + 90, 0, -80, HEIGHT + 90, 520);
    lowerGlow.addColorStop(0, rgba(category.accent2, 0.15));
    lowerGlow.addColorStop(1, rgba(category.accent2, 0));
    ctx.fillStyle = lowerGlow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    for (let x = 0; x < WIDTH; x += 48) {
        for (let y = 0; y < HEIGHT; y += 48) {
            ctx.fillRect(x, y, 2, 2);
        }
    }

    ctx.save();
    ctx.translate(WIDTH - 10, HEIGHT * 0.05);
    ctx.strokeStyle = rgba(category.accent, 0.17);
    ctx.lineWidth = 2;
    for (const radius of [240, 330]) {
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0.25 * Math.PI, 1.05 * Math.PI);
        ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(WIDTH - 120, 0);
    ctx.rotate(-0.35);
    ctx.fillStyle = rgba(category.accent, 0.045);
    for (let index = 0; index < 4; index += 1) {
        ctx.fillRect(index * 58, -100, 22, HEIGHT + 200);
    }
    ctx.restore();
}

function drawBigIndex(ctx, category) {
    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.letterSpacing = '-8px';
    ctx.font = fontSpec(300, DISPLAY, 700);
    ctx.fillStyle = rgba(category.accent, 0.055);
    ctx.fillText(category.index, WIDTH - 34, HEIGHT - 64);
    ctx.restore();
}

function drawBrand(ctx, category) {
    const x = 72;
    const y = 58;
    const mark = 46;
    const gradient = ctx.createLinearGradient(x, y, x + mark, y + mark);
    gradient.addColorStop(0, category.accent);
    gradient.addColorStop(1, category.accent2);

    ctx.save();
    ctx.shadowColor = rgba(category.accent, 0.45);
    ctx.shadowBlur = 24;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, y, mark, mark, 14);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = fontSpec(18, DISPLAY, 700);
    ctx.fillText('GG', x + mark / 2, y + mark / 2 + 1);
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.font = fontSpec(20, BOLD, 700);
    ctx.letterSpacing = '3px';
    ctx.fillText('GG BOT', x + mark + 18, y + 22);
    ctx.font = fontSpec(12, BOLD, 600);
    ctx.letterSpacing = '2.5px';
    ctx.fillStyle = rgba(category.accent, 0.92);
    ctx.fillText('COMMAND CENTER', x + mark + 18, y + 43);
    ctx.restore();
}

function drawSectionLabel(ctx, category) {
    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.13)';
    ctx.font = fontSpec(58, DISPLAY, 700);
    ctx.fillText(category.index, WIDTH - 72, 100);
    ctx.font = fontSpec(12, BOLD, 600);
    ctx.letterSpacing = '2px';
    ctx.fillStyle = rgba(category.accent, 0.9);
    ctx.fillText(`SEZIONE ${category.index} / ${String(CATEGORIES.length).padStart(2, '0')}`, WIDTH - 72, 126);
    ctx.restore();
}

function drawEmblem(ctx, category) {
    const x = 72;
    const y = 234;
    const size = 152;
    const radius = 38;
    const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
    gradient.addColorStop(0, category.accent);
    gradient.addColorStop(1, category.accent2);

    ctx.save();
    ctx.shadowColor = rgba(category.accent, 0.55);
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, radius);
    ctx.fill();
    ctx.restore();

    const gloss = ctx.createLinearGradient(x, y, x, y + size);
    gloss.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    gloss.addColorStop(0.5, 'rgba(255, 255, 255, 0.04)');
    gloss.addColorStop(1, 'rgba(0, 0, 0, 0.16)');
    ctx.fillStyle = gloss;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, radius);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x + 0.75, y + 0.75, size - 1.5, size - 1.5, radius - 0.75);
    ctx.stroke();

    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.scale(1.28, 1.28);
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 5.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    category.icon(ctx);
    ctx.restore();
}

function drawTitle(ctx, category) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    let size = 104;
    ctx.letterSpacing = category.title.length > 10 ? '1px' : '4px';
    while (size > 60) {
        ctx.font = fontSpec(size, DISPLAY, 700);
        if (ctx.measureText(category.title).width <= 760)
            break;
        size -= 2;
    }
    const titleGradient = ctx.createLinearGradient(0, 430, 0, 540);
    titleGradient.addColorStop(0, '#ffffff');
    titleGradient.addColorStop(1, rgba(category.accent, 0.92));
    ctx.fillStyle = titleGradient;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 8;
    ctx.fillText(category.title, 72, 524);
    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    const underline = ctx.createLinearGradient(72, 0, 200, 0);
    underline.addColorStop(0, category.accent);
    underline.addColorStop(1, rgba(category.accent2, 0));
    ctx.fillStyle = underline;
    ctx.beginPath();
    ctx.roundRect(72, 552, 128, 6, 3);
    ctx.fill();
    ctx.restore();
}

function drawSubtitle(ctx, category) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    let size = 28;
    ctx.font = fontSpec(size, REGULAR, 400);
    while (size > 20) {
        ctx.font = fontSpec(size, REGULAR, 400);
        if (ctx.measureText(category.subtitle).width <= 760)
            break;
        size -= 1;
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.66)';
    ctx.fillText(category.subtitle, 72, 612);
    ctx.restore();
}

function drawFooter(ctx, category) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(72, 682);
    ctx.lineTo(WIDTH - 72, 682);
    ctx.stroke();

    ctx.fillStyle = rgba(category.accent, 0.95);
    ctx.beginPath();
    ctx.arc(78, 710, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = fontSpec(12, BOLD, 600);
    ctx.letterSpacing = '2px';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
    ctx.fillText('USA /MENU PER CAMBIARE SEZIONE', 92, 714);
    ctx.restore();
}

export async function generateMenuImages() {
    await mkdir(OUT_DIR, { recursive: true });
    for (const category of CATEGORIES) {
        const canvas = createCanvas(WIDTH, HEIGHT);
        const ctx = canvas.getContext('2d');
        drawBackground(ctx, category);
        drawBigIndex(ctx, category);
        drawBrand(ctx, category);
        drawSectionLabel(ctx, category);
        drawEmblem(ctx, category);
        drawTitle(ctx, category);
        drawSubtitle(ctx, category);
        drawFooter(ctx, category);
        const buffer = await canvas.encode('png');
        await writeFile(join(OUT_DIR, `${category.key}.png`), buffer);
        console.log(`${category.key}.png — ${(buffer.byteLength / 1024).toFixed(1)} KB`);
    }
}

const isEntryPoint = process.argv[1] !== undefined
    && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint)
    await generateMenuImages();
