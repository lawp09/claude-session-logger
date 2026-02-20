'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
}

// Bundle web allégé : charge les langages à la demande au lieu de tout embarquer
let shikiPromise: Promise<typeof import('shiki/bundle/web')> | null = null;

function getShiki() {
  if (!shikiPromise) {
    shikiPromise = import('shiki/bundle/web');
  }
  return shikiPromise;
}

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  json: 'json',
  md: 'markdown',
  css: 'css',
  html: 'html',
  sql: 'sql',
  dockerfile: 'dockerfile',
  toml: 'toml',
};

function normalizeLanguage(lang?: string): string {
  if (!lang) return 'text';
  const lower = lang.toLowerCase();
  return LANGUAGE_MAP[lower] || lower;
}

export function detectLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const filename = filePath.split('/').pop()?.toLowerCase() || '';
  if (filename === 'dockerfile') return 'dockerfile';
  if (filename === 'makefile') return 'makefile';
  return LANGUAGE_MAP[ext] || 'text';
}

export default function CodeBlock({ code, language, showLineNumbers = false }: CodeBlockProps) {
  const { theme } = useTheme();
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const lang = normalizeLanguage(language);
  const shikiTheme = theme === 'light' ? 'github-light' : 'github-dark';

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      try {
        const shiki = await getShiki();
        const highlighted = await shiki.codeToHtml(code, {
          lang: lang as never,
          theme: shikiTheme,
        });
        if (!cancelled) {
          setHtml(highlighted);
          setLoading(false);
        }
      } catch {
        // Fallback if language not supported
        if (!cancelled) {
          setHtml('');
          setLoading(false);
        }
      }
    }

    highlight();
    return () => { cancelled = true; };
  }, [code, lang, shikiTheme]);

  if (loading || !html) {
    return (
      <pre className={`overflow-auto rounded-md bg-surface p-3 text-xs text-text-secondary ${showLineNumbers ? 'pl-10' : ''}`}>
        <code>{code}</code>
      </pre>
    );
  }

  return (
    <div
      className="overflow-auto rounded-md text-xs [&_pre]:overflow-auto [&_pre]:p-3 [&_code]:text-xs"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
