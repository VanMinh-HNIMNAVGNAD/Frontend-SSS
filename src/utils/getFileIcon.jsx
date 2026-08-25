import {
	Folder,
	FileText,
	FileSpreadsheet,
	Image as ImageIcon,
	FileCode,
	FileArchive,
	Video,
	Music,
	File,
} from 'lucide-react';

export function getFileIcon(item, sizeClass = 'w-5 h-5') {
	if (!item) {
		return <File className={`${sizeClass} text-gray-500 shrink-0`} />;
	}

	if (item.type === 'folder') {
		return <Folder className={`${sizeClass} text-amber-500 fill-amber-100 dark:fill-amber-950/40 shrink-0`} />;
	}

	const name = (item.name || '').toLowerCase();
	const mime = (item.mimeType || '').toLowerCase();

	if (name.endsWith('.md') || name.endsWith('.markdown')) {
		return <FileCode className={`${sizeClass} text-indigo-500 dark:text-indigo-400 shrink-0`} />;
	}

	if (name.endsWith('.pdf') || mime.includes('pdf')) {
		return <FileText className={`${sizeClass} text-rose-500 dark:text-rose-400 shrink-0`} />;
	}

	if (name.endsWith('.docx') || name.endsWith('.doc') || name.endsWith('.txt') || name.endsWith('.log') || mime.includes('word') || mime.startsWith('text/plain')) {
		return <FileText className={`${sizeClass} text-blue-500 dark:text-blue-400 shrink-0`} />;
	}

	if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv') || mime.includes('spreadsheet') || mime.includes('csv')) {
		return <FileSpreadsheet className={`${sizeClass} text-emerald-600 dark:text-emerald-400 shrink-0`} />;
	}

	if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.svg') || name.endsWith('.webp') || name.endsWith('.gif') || mime.startsWith('image/')) {
		return <ImageIcon className={`${sizeClass} text-purple-500 dark:text-purple-400 shrink-0`} />;
	}

	if (name.endsWith('.mp4') || name.endsWith('.mkv') || name.endsWith('.mov') || name.endsWith('.webm') || mime.startsWith('video/')) {
		return <Video className={`${sizeClass} text-violet-500 dark:text-violet-400 shrink-0`} />;
	}

	if (name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.flac') || name.endsWith('.ogg') || name.endsWith('.m4a') || mime.startsWith('audio/')) {
		return <Music className={`${sizeClass} text-pink-500 dark:text-pink-400 shrink-0`} />;
	}

	if (name.endsWith('.zip') || name.endsWith('.rar') || name.endsWith('.7z') || name.endsWith('.tar') || name.endsWith('.gz') || mime.includes('zip') || mime.includes('compressed')) {
		return <FileArchive className={`${sizeClass} text-amber-600 dark:text-amber-400 shrink-0`} />;
	}

	if (name.endsWith('.js') || name.endsWith('.jsx') || name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.py') || name.endsWith('.json') || name.endsWith('.html') || name.endsWith('.css') || name.endsWith('.xml') || name.endsWith('.yaml') || name.endsWith('.yml') || name.endsWith('.sql')) {
		return <FileCode className={`${sizeClass} text-amber-500 dark:text-amber-400 shrink-0`} />;
	}

	return <File className={`${sizeClass} text-gray-500 dark:text-gray-400 shrink-0`} />;
}
