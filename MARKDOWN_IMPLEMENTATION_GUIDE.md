# Cortex Markdown Implementation Guide

## Quick Reference: Battle-Tested Patterns from 6 Major Chat UIs

### 1. Core Dependencies (Recommended)

```json
{
  "react-markdown": "^10.0.0",
  "remark-gfm": "^4.0.0",
  "remark-math": "^6.0.0",
  "remark-breaks": "^4.0.0",
  "rehype-katex": "^7.0.0",
  "rehype-highlight": "^7.0.0",
  "react-syntax-highlighter": "^15.5.0",
  "mermaid": "^10.0.0"
}
```

### 2. Markdown Component Template

```typescript
import React, { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';

import { code, a, p, img } from './MarkdownComponents';
import MarkdownErrorBoundary from './MarkdownErrorBoundary';

interface MarkdownProps {
  content: string;
  isLatestMessage?: boolean;
}

const Markdown = memo(function Markdown({ content = '', isLatestMessage = false }: MarkdownProps) {
  const remarkPlugins = useMemo(
    () => [remarkGfm, remarkMath, remarkBreaks],
    []
  );

  const rehypePlugins = useMemo(
    () => [
      [rehypeKatex],
      [
        rehypeHighlight,
        {
          detect: true,
          ignoreMissing: true,
        },
      ],
    ],
    []
  );

  return (
    <MarkdownErrorBoundary content={content}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{
          code,
          a,
          p,
          img,
        }}
      >
        {content}
      </ReactMarkdown>
    </MarkdownErrorBoundary>
  );
});

Markdown.displayName = 'Markdown';
export default Markdown;
```

### 3. Code Block Component

```typescript
import React, { useState, useCallback } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { IconCopy, IconCheck, IconDownload } from '@tabler/icons-react';

interface CodeBlockProps {
  language: string;
  value: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language, value }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 });

  const onCopy = useCallback(() => {
    if (!isCopied) copyToClipboard(value);
  }, [isCopied, value, copyToClipboard]);

  const downloadAsFile = useCallback(() => {
    const blob = new Blob([value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `code.${getFileExtension(language)}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [value, language]);

  return (
    <div className="relative w-full rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800 px-4 py-2">
        <span className="text-xs font-mono text-gray-600 dark:text-gray-400 uppercase">
          {language || 'text'}
        </span>
        
        <div className="flex items-center gap-2">
          <button
            onClick={downloadAsFile}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            title="Download"
          >
            <IconDownload size={16} />
          </button>
          
          <button
            onClick={onCopy}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            title={isCopied ? 'Copied!' : 'Copy'}
          >
            {isCopied ? <IconCheck size={16} /> : <IconCopy size={16} />}
          </button>
        </div>
      </div>

      {/* Code */}
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          background: 'transparent',
          padding: '1rem',
        }}
        codeTagProps={{
          style: {
            fontSize: '14px',
            fontFamily: 'var(--font-mono)',
          },
        }}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
};

function getFileExtension(language: string): string {
  const extensions: Record<string, string> = {
    javascript: 'js',
    typescript: 'ts',
    python: 'py',
    java: 'java',
    cpp: 'cpp',
    csharp: 'cs',
    ruby: 'rb',
    php: 'php',
    go: 'go',
    rust: 'rs',
    sql: 'sql',
    html: 'html',
    css: 'css',
    json: 'json',
    yaml: 'yaml',
    bash: 'sh',
    shell: 'sh',
  };
  return extensions[language.toLowerCase()] || 'txt';
}
```

### 4. Streaming Optimization (from open-webui)

```typescript
import { useEffect, useRef } from 'react';

interface StreamingMarkdownProps {
  content: string;
  done: boolean;
  onParsed?: (tokens: any[]) => void;
}

export const useStreamingMarkdown = ({ content, done, onParsed }: StreamingMarkdownProps) => {
  const pendingUpdateRef = useRef<number | null>(null);
  const lastContentRef = useRef<string>('');

  useEffect(() => {
    const parseTokens = () => {
      if (content === lastContentRef.current) return;
      lastContentRef.current = content;
      
      // Parse markdown tokens
      const tokens = marked.lexer(content);
      onParsed?.(tokens);
    };

    if (done) {
      // Fully parsed, render immediately
      if (pendingUpdateRef.current) {
        cancelAnimationFrame(pendingUpdateRef.current);
        pendingUpdateRef.current = null;
      }
      parseTokens();
    } else if (!pendingUpdateRef.current) {
      // Throttle to animation frame while streaming
      pendingUpdateRef.current = requestAnimationFrame(() => {
        pendingUpdateRef.current = null;
        parseTokens();
      });
    }

    return () => {
      if (pendingUpdateRef.current) {
        cancelAnimationFrame(pendingUpdateRef.current);
      }
    };
  }, [content, done, onParsed]);
};
```

### 5. Streaming Cursor Indicator (from chatbot-ui)

```typescript
// In your code component renderer
if (firstChildAsString === "▍") {
  return (
    <span className="mt-1 animate-pulse cursor-default">
      ▍
    </span>
  );
}
```

### 6. Custom Markdown Components

```typescript
// MarkdownComponents.tsx

export const code: React.ElementType = memo(function MarkdownCode({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match && match[1];
  const isSingleLine = typeof children === 'string' && children.split('\n').length === 1;

  // Inline code
  if (isSingleLine) {
    return (
      <code className={`bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded ${className}`}>
        {children}
      </code>
    );
  }

  // Code block
  return <CodeBlock language={lang ?? 'text'} value={String(children)} />;
});

export const a: React.ElementType = memo(function MarkdownAnchor({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 dark:text-blue-400 hover:underline"
    >
      {children}
    </a>
  );
});

export const p: React.ElementType = memo(function MarkdownParagraph({
  children,
}: {
  children: React.ReactNode;
}) {
  return <p className="mb-2 whitespace-pre-wrap">{children}</p>;
});

export const img: React.ElementType = memo(function MarkdownImage({
  src,
  alt,
  title,
}: {
  src?: string;
  alt?: string;
  title?: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      title={title}
      className="max-w-full h-auto rounded-lg"
    />
  );
});
```

### 7. Error Boundary

```typescript
import React from 'react';

interface MarkdownErrorBoundaryProps {
  children: React.ReactNode;
  content: string;
}

interface MarkdownErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export default class MarkdownErrorBoundary extends React.Component<
  MarkdownErrorBoundaryProps,
  MarkdownErrorBoundaryState
> {
  constructor(props: MarkdownErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Markdown rendering error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">
            Failed to render markdown. Showing raw content:
          </p>
          <pre className="mt-2 text-xs overflow-auto max-h-64 bg-white dark:bg-gray-900 p-2 rounded">
            {this.props.content}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
```

## Key Takeaways

1. **Use react-markdown** — Most battle-tested, 5/6 projects use it
2. **Always include remark-gfm** — GitHub Flavored Markdown is standard
3. **Add remark-math + rehype-katex** — LaTeX support expected in modern chat UIs
4. **Throttle streaming updates** — Use requestAnimationFrame to avoid re-renders
5. **Sticky code block headers** — Users expect copy/download buttons always visible
6. **Handle streaming cursor** — Show `▍` character while streaming
7. **Error boundaries** — Gracefully degrade if markdown parsing fails
8. **Mermaid support** — 4/6 projects support it; consider adding

## Performance Tips

- Memoize markdown components to prevent unnecessary re-renders
- Use `useMemo` for plugin arrays
- Throttle streaming updates with `requestAnimationFrame`
- Lazy-load Mermaid and other heavy libraries
- Consider code-splitting for syntax highlighter themes

## Testing Checklist

- [ ] Inline code rendering
- [ ] Multi-line code blocks
- [ ] Copy button functionality
- [ ] Download button functionality
- [ ] Streaming markdown (partial content)
- [ ] LaTeX math rendering
- [ ] Mermaid diagrams
- [ ] Links and images
- [ ] Tables (GFM)
- [ ] Blockquotes
- [ ] Lists (ordered/unordered)
- [ ] Error handling (malformed markdown)

---

**Based on analysis of**: LibreChat, chatbot-ui, open-webui, lobe-chat, chatbox, gpt4-pdf-chatbot-langchain  
**Research Date**: March 31, 2026
