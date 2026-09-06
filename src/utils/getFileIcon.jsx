import {
	Folder,
	FileText,
	FileSpreadsheet,
	Image as ImageIcon,
	FileCode,
	FileArchive,
	Video,
	Music,
	Database,
	Layers,
	File,
} from 'lucide-react';
import { getEffectiveColor } from './fileColors';

/**
 * Trả về icon React cho một file/folder, màu sắc theo ngôn ngữ lập trình
 * hoặc customColor nếu người dùng đã tùy chỉnh.
 *
 * @param {object} item       - { type, name, mimeType, customColor }
 * @param {string} sizeClass  - Tailwind class kích thước (mặc định 'w-5 h-5')
 */
export function getFileIcon(item, sizeClass = 'w-5 h-5') {
	if (!item) {
		return <File className={`${sizeClass} text-gray-500 shrink-0`} />;
	}

	// Tính màu hiệu lực (customColor ưu tiên, còn lại dùng màu mặc định theo loại)
	const color = getEffectiveColor(item);
	const style = { color };

	const name = (item.name || '').toLowerCase();
	const mime = (item.mimeType || '').toLowerCase();

	if (item.type === 'folder') {
		return <Folder className={`${sizeClass} shrink-0`} style={style} />;
	}

	// ── PDF ──
	if (name.endsWith('.pdf') || mime.includes('pdf')) {
		return <FileText className={`${sizeClass} shrink-0`} style={style} />;
	}

	// ── Spreadsheet ──
	if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv') || mime.includes('spreadsheet') || mime.includes('csv')) {
		return <FileSpreadsheet className={`${sizeClass} shrink-0`} style={style} />;
	}

	// ── Office docs ──
	if (name.endsWith('.docx') || name.endsWith('.doc') || name.endsWith('.txt') || name.endsWith('.log') || mime.includes('word') || mime.startsWith('text/plain')) {
		return <FileText className={`${sizeClass} shrink-0`} style={style} />;
	}

	// ── Ảnh ──
	if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.svg') || name.endsWith('.webp') || name.endsWith('.gif') || mime.startsWith('image/')) {
		return <ImageIcon className={`${sizeClass} shrink-0`} style={style} />;
	}

	// ── Video ──
	if (name.endsWith('.mp4') || name.endsWith('.mkv') || name.endsWith('.mov') || name.endsWith('.webm') || mime.startsWith('video/')) {
		return <Video className={`${sizeClass} shrink-0`} style={style} />;
	}

	// ── Audio ──
	if (name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.flac') || name.endsWith('.ogg') || name.endsWith('.m4a') || mime.startsWith('audio/')) {
		return <Music className={`${sizeClass} shrink-0`} style={style} />;
	}

	// ── Archive ──
	if (name.endsWith('.zip') || name.endsWith('.rar') || name.endsWith('.7z') || name.endsWith('.tar') || name.endsWith('.gz') || mime.includes('zip') || mime.includes('compressed')) {
		return <FileArchive className={`${sizeClass} shrink-0`} style={style} />;
	}

	// ── Database / SQL ──
	if (name.endsWith('.sql') || name.endsWith('.db') || name.endsWith('.sqlite')) {
		return <Database className={`${sizeClass} shrink-0`} style={style} />;
	}

	// ── Figma ──
	if (name.endsWith('.fig')) {
		return <Layers className={`${sizeClass} shrink-0`} style={style} />;
	}

	// ── Markdown ──
	if (name.endsWith('.md') || name.endsWith('.markdown')) {
		return <FileCode className={`${sizeClass} shrink-0`} style={style} />;
	}

	// ── Code (mọi extension lập trình) ──
	if (/\.(js|jsx|mjs|cjs|ts|tsx|py|pyw|java|class|jar|c|cpp|cc|cxx|h|hpp|cs|go|rb|php|sh|bash|zsh|fish|kt|kts|swift|rs|dart|lua|json|yaml|yml|toml|ini|conf|env|html|htm|css|scss|sass|less|vue|svelte|graphql|gql|prisma|xml)$/i.test(name)) {
		return <FileCode className={`${sizeClass} shrink-0`} style={style} />;
	}

	return <File className={`${sizeClass} shrink-0`} style={style} />;
}
