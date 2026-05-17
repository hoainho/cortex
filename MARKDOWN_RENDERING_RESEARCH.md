# Electron AI Chat Apps: Markdown Rendering Implementation Guide

## REAL CODE IMPLEMENTATIONS EXTRACTED

### 1. CLINE (clinebot/cline) - VS Code Extension with Webview
**Status**: Production, 3.76.0+
**Architecture**: VS Code Webview (React) + TypeScript

#### Key Files:
- `webview-ui/src/components/common/CodeBlock.tsx` - Syntax highlighting
- `webview-ui/src/components/common/MarkdownBlock.tsx` - Main markdown renderer
- `webview-ui/src/components/chat/MarkdownRow.tsx` - Chat message wrapper

#### Dependencies (from package.json):
```json
{
  "react-markdown": "^9.0.1",
  "rehype-highlight": "^7.0.0",
  "remark-gfm": "^4.0.0",
  "react-syntax-highlighter": "^16.1.1",
  "react-remark": "^2.1.0"
}
```

#### CodeBlock.tsx Implementation:
```typescript
// Uses react-remark + rehype-highlight for syntax highlighting
// VSCode CSS variables for theming (--vscode-editor-background, etc.)
// Styled-components for dynamic theming
// Special handling for:
// - Diff blocks (.hljs-addition, .hljs-deletion)
// - Inline code vs code blocks
// - File extension detection (strips .js from file.js)
// - Force wrap mode for terminal output

const StyledMarkdown = styled.div<{ forceWrap: boolean }>`
  pre {
    background-color: ${CODE_BLOCK_BG_COLOR};
    border-radius: 5px;
    padding: 10px 10px;
  }
  
  pre > code {
    .hljs-deletion { background-color: var(--vscode-diffEditor-removedTextBackground); }
    .hljs-addition { background-color: var(--vscode-diffEditor-insertedTextBackground); }
  }
`;
```

#### MarkdownBlock.tsx Implementation:
```typescript
// Parses markdown into blocks using marked.lexer()
// MemoizedMarkdownBlock for performance
// Custom remark plugins:
// 1. remarkUrlToLink - converts URLs to clickable links
// 2. remarkHighlightActMode - highlights "Act Mode" mentions
// 3. remarkPreventBoldFilenames - prevents __init__.py from being bold
// 4. remarkMarkPotentialFilePaths - marks potential file paths for async checking

// Features:
// - Copy button on code blocks (WithCopyButton wrapper)
// - File path detection with async validation
// - Mermaid diagram support
// - Act Mode highlighting with keyboard shortcut
// - Inline code with file link icons

const MemoizedMarkdownBlock = memo(
  ({ content }: { content: string }) => {
    return (
      <ReactMarkdown
        components={{
          pre: ({ children, ...preProps }) => (
            <PreWithCopyButton {...preProps}>{children}</PreWithCopyButton>
          ),
          code: (props) => {
            // Mermaid detection
            if (className.includes("language-mermaid")) {
              return <MermaidBlock code={codeText} />
            }
            // File path checking
            return <InlineCodeWithFileCheck {...props} />
          },
          strong: (props) => {
            // Act Mode highlighting
            if (/^act mode\s*\(⌘⇧A\)$/i.test(childrenText)) {
              return <ActModeHighlight />
            }
            return <strong {...props} />
          }
        }}
        rehypePlugins={[[rehypeHighlight as any, {} as Options]]}
        remarkPlugins={[
          [remarkGfm, { singleTilde: false }],
          remarkPreventBoldFilenames,
          remarkUrlToLink,
          remarkHighlightActMode,
          remarkMarkPotentialFilePaths,
          // Language detection plugin
          () => {
            return (tree: any) => {
              visit(tree, "code", (node: any) => {
                if (!node.lang) {
                  node.lang = "javascript"
                } else if (node.lang.includes(".")) {
                  node.lang = node.lang.split(".").slice(-1)[0]
                }
              })
            }
          },
        ]}
      >
        {content}
      </ReactMarkdown>
    )
  },
  (prevProps, nextProps) => prevProps.content !== nextProps.content ? false : true
)
```

#### Copy Button Implementation:
```typescript
const PreWithCopyButton = ({ children, ...preProps }) => {
  const preRef = useRef<HTMLPreElement>(null)
  
  const handleCopy = () => {
    if (preRef.current) {
      const codeElement = preRef.current.querySelector("code")
      const textToCopy = codeElement ? codeElement.textContent : preRef.current.textContent
      return textToCopy
    }
  }
  
  return (
    <WithCopyButton ariaLabel="Copy code" onCopy={handleCopy} position="top-right">
      <pre {...preProps} ref={preRef}>{children}</pre>
    </WithCopyButton>
  )
}
```

---

### 2. CONTINUE.DEV (continuedev/continue) - VS Code Extension
**Status**: Production
**Architecture**: VS Code Webview (React) + TypeScript

#### Key Files:
- `gui/src/components/StyledMarkdownPreview/index.tsx` - Main markdown renderer
- `gui/src/components/StyledMarkdownPreview/SyntaxHighlightedPre.tsx` - Code block
- `gui/src/components/StyledMarkdownPreview/MermaidBlock.tsx` - Diagram support

#### Dependencies (from gui/package.json):
```json
{
  "react-markdown": "^9.0.1",
  "rehype-highlight": "^7.0.0",
  "rehype-katex": "^7.0.1",
  "remark-math": "^6.0.0",
  "react-syntax-highlighter": "^16.1.1",
  "react-remark": "^2.1.0"
}
```

#### StyledMarkdownPreview.tsx Implementation:
```typescript
// Advanced features:
// - LaTeX math support (rehype-katex + remark-math)
// - Mermaid diagrams
// - Symbol linking (file symbols from context)
// - Toolbar for code blocks (apply, run in terminal, create file)
// - Diff highlighting
// - Nested markdown patching
// - Double dollar LaTeX newline fixing

const StyledMarkdown = styled.div<{
  fontSize?: number;
  whiteSpace: string;
  bgColor: string;
}>`
  pre {
    white-space: ${(props) => props.whiteSpace};
    background-color: ${vscEditorBackground};
    border-radius: ${defaultBorderRadius};
    max-width: calc(100vw - 24px);
    overflow-x: scroll;
    overflow-y: hidden;
    padding: 8px;
  }
  
  code {
    background-color: ${vscEditorBackground};
    font-size: ${getFontSize() - 2}px;
    font-family: var(--vscode-editor-font-family);
  }
`;

// Remark plugins:
const [reactContent, setMarkdownSource] = useRemark({
  remarkPlugins: [
    remarkTables,
    [remarkMath, { singleDollarTextMath: false }],
    () => (tree: any) => {
      // Mark last code block
      const lastNode = tree.children[tree.children.length - 1];
      const lastCodeNode = lastNode.type === "code" ? lastNode : null;
      
      visit(tree, "code", (node: any) => {
        if (!node.lang) node.lang = "";
        else if (node.lang.includes(".")) {
          node.lang = node.lang.split(".").slice(-1)[0];
        }
        
        node.data = node.data || {};
        node.data.hProperties = node.data.hProperties || {};
        node.data.hProperties["data-islastcodeblock"] = lastCodeNode === node;
        node.data.hProperties["data-codeblockcontent"] = node.value;
        
        if (node.meta) {
          let meta = node.meta.split(" ");
          node.data.hProperties["data-relativefilepath"] = meta[0];
          node.data.hProperties.range = meta[1];
        }
      });
    },
  ],
  rehypePlugins: [
    rehypeKatex as any,
    {},
    rehypeHighlightPlugin(),
    () => {
      let codeBlockIndex = 0;
      return (tree) => {
        visit(tree, { tagName: "pre" }, (node: any) => {
          node.properties = { "data-codeblockindex": codeBlockIndex };
          codeBlockIndex++;
        });
      };
    },
  ],
  rehypeReactOptions: {
    components: {
      pre: ({ ...preProps }) => {
        const codeBlockIndex = preProps["data-codeblockindex"];
        const preChildProps = preProps?.children?.[0]?.props ?? {};
        const { className, range } = preChildProps;
        const relativeFilePath = preChildProps["data-relativefilepath"];
        const codeBlockContent = preChildProps["data-codeblockcontent"];
        
        if (!props.isRenderingInStepContainer) {
          return <SyntaxHighlightedPre {...preProps} />;
        }
        
        const language = getLanguageFromClassName(className);
        const isLastCodeblock = preChildProps["data-islastcodeblock"];
        
        return (
          <StepContainerPreToolbar
            codeBlockContent={codeBlockContent}
            language={language}
            relativeFilepath={relativeFilePath}
            isLastCodeblock={isLastCodeblock}
            range={range}
          >
            <SyntaxHighlightedPre {...preProps} />
          </StepContainerPreToolbar>
        );
      },
      code: ({ ...codeProps }) => {
        const content = getCodeChildrenContent(codeProps.children);
        
        if (content) {
          const { symbols, rifs } = pastFileInfoRef.current;
          const matchedSymbolOrFile = matchCodeToSymbolOrFile(content, symbols, rifs);
          
          if (matchedSymbolOrFile) {
            if (isSymbolNotRif(matchedSymbolOrFile)) {
              return <SymbolLink content={content} symbol={matchedSymbolOrFile} />;
            } else {
              return <FilenameLink rif={matchedSymbolOrFile} />;
            }
          }
        }
        
        if (codeProps.className?.includes("language-mermaid")) {
          const codeText = String(codeProps.children || "");
          return <MermaidBlock code={codeText} />;
        }
        
        return <code {...codeProps}>{codeProps.children}</code>;
      },
      img: ({ ...imgProps }) => (
        <SecureImageComponent
          src={imgProps.src}
          alt={imgProps.alt}
          title={imgProps.title}
        />
      ),
    },
  },
});
```

---

### 3. CHATBOX (Bin-Huang/chatbox) - Electron Desktop App
**Status**: Production, 0.0.1+
**Architecture**: Electron + React + TypeScript

#### Dependencies (from package.json):
```json
{
  "react-markdown": "^9.0.0",
  "react-syntax-highlighter": "^15.5.0",
  "rehype-katex": "^7.0.0",
  "remark-breaks": "^4.0.0",
  "remark-gfm": "^4.0.0",
  "remark-math": "^6.0.0",
  "highlight.js": "^11.7.0",
  "mermaid": "^11.4.0"
}
```

#### Key Features:
- Electron + Vite for fast builds
- Mantine UI + Tailwind CSS
- React Router for navigation
- Zustand for state management
- Support for multiple AI providers (OpenAI, Anthropic, Gemini, etc.)
- MCP (Model Context Protocol) support
- Mobile support (iOS/Android via Capacitor)

---

### 4. REMARK-GITHUB-MARKDOWN-ALERTS (neg4n/remark-github-markdown-alerts)
**Status**: Production, v1.2.2
**Purpose**: Transform GitHub-style alert blockquotes into UI components

#### Implementation:
```typescript
// Detects GitHub alert syntax: [!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION]
// Supports both HTML and component rendering modes
// Auto-detects render mode based on file context

export const remarkGitHubAlerts: Plugin<[RemarkGitHubAlertsOptions?], Root> = (options = {}) => {
  const { alerts = {}, defaultConfig, mode = 'auto' } = options
  const baseConfig = mergeConfig(DEFAULT_CONFIG, defaultConfig)
  
  return (tree, file) => {
    const renderMode = mode === 'auto' ? detectRenderMode(file) : mode
    
    visit(tree, 'blockquote', (node: Blockquote, index, parent) => {
      processBlockquote(node, index, parent, baseConfig, alerts, renderMode)
    })
    
    return tree
  }
}

// Configuration:
type AlertConfig = {
  iconElementHtml: string
  tags: {
    container: HtmlElement
    icon: HtmlElement
    title: HtmlElement
    content: HtmlElement
  }
  classNames: {
    container: string
    icon: string
    title: string
    content: string
  }
}

// Usage:
const processor = unified()
  .use(remarkParse)
  .use(remarkGitHubAlerts, {
    alerts: {
      note: {
        classNames: {
          container: 'markdown-alert markdown-alert-note',
          icon: 'markdown-alert-icon',
          title: 'markdown-alert-title',
          content: 'markdown-alert-content'
        }
      }
    }
  })
  .use(remarkRehype)
  .use(rehypeStringify)
```

#### Dependencies:
```json
{
  "hast-util-from-html": "^2.0.3",
  "hast-util-to-html": "^9.0.5",
  "hastscript": "^9.0.1",
  "mdast-util-to-string": "^4.0.0",
  "unist-builder": "^4.0.0",
  "unist-util-visit": "^5.0.0"
}
```

---

## DESIGN PATTERNS EXTRACTED

### Pattern 1: Streaming Markdown Rendering
**Used by**: Cline, Continue, Chatbox
**Approach**: 
- Parse markdown into blocks using `marked.lexer()`
- Render each block separately for incremental updates
- Use `MemoizedMarkdownBlock` to prevent re-renders

```typescript
const parseMarkdownIntoBlocks = (markdown: string): string[] => {
  try {
    const tokens = marked.lexer(markdown)
    return tokens?.map((token) => token.raw)
  } catch {
    return [markdown]
  }
}

const MemoizedMarkdown = memo(({ content, id }: { content: string; id: string }) => {
  const blocks = useMemo(() => parseMarkdownIntoBlocks(content), [content])
  return blocks?.map((block, index) => 
    <MemoizedMarkdownBlock content={block} key={`${id}-block_${index}`} />
  )
})
```

### Pattern 2: VSCode Theme Integration
**Used by**: Cline, Continue
**Approach**:
- Use CSS variables from VSCode theme
- Fallback to default colors if variables not available
- Support both light and dark modes

```typescript
const CODE_BLOCK_BG_COLOR = "var(--vscode-editor-background, --vscode-sideBar-background, rgb(30 30 30))"
const CHAT_ROW_EXPANDED_BG_COLOR = "var(--vscode-editor-background)"
const CHAT_ROW_COLLAPSED_BG_COLOR = "var(--vscode-sideBar-background)"
```

### Pattern 3: Custom Remark Plugins for AI-Specific Features
**Used by**: Cline
**Examples**:
1. **URL to Link**: Convert plain URLs to clickable links
2. **File Path Detection**: Mark potential file paths for async validation
3. **Act Mode Highlighting**: Highlight specific UI elements
4. **Filename Protection**: Prevent `__init__.py` from being parsed as bold

```typescript
const remarkUrlToLink = () => {
  return (tree: Node) => {
    visit(tree, "text", (node: any, index, parent) => {
      const urlRegex = /https?:\/\/[^\s<>)"]+/g
      const matches = node.value.match(urlRegex)
      if (!matches) return
      
      const parts = node.value.split(urlRegex)
      const children: any[] = []
      
      parts.forEach((part: string, i: number) => {
        if (part) children.push({ type: "text", value: part })
        if (matches[i]) {
          children.push({
            type: "link",
            url: matches[i],
            children: [{ type: "text", value: matches[i] }],
          })
        }
      })
      
      if (parent) {
        parent.children.splice(index, 1, ...children)
      }
    })
  }
}
```

### Pattern 4: Diff Highlighting
**Used by**: Cline, Continue
**Approach**:
- Use highlight.js classes: `.hljs-addition`, `.hljs-deletion`
- Apply VSCode diff colors: `--vscode-diffEditor-insertedTextBackground`, `--vscode-diffEditor-removedTextBackground`

```typescript
pre > code {
  .hljs-deletion {
    background-color: var(--vscode-diffEditor-removedTextBackground);
    display: inline-block;
    width: 100%;
  }
  .hljs-addition {
    background-color: var(--vscode-diffEditor-insertedTextBackground);
    display: inline-block;
    width: 100%;
  }
}
```

### Pattern 5: Copy Button on Code Blocks
**Used by**: Cline, Continue
**Approach**:
- Wrap `<pre>` with copy button component
- Extract text from code element on copy
- Position button at top-right

```typescript
const PreWithCopyButton = ({ children, ...preProps }) => {
  const preRef = useRef<HTMLPreElement>(null)
  
  const handleCopy = () => {
    if (preRef.current) {
      const codeElement = preRef.current.querySelector("code")
      const textToCopy = codeElement?.textContent || preRef.current.textContent
      return textToCopy
    }
  }
  
  return (
    <WithCopyButton ariaLabel="Copy code" onCopy={handleCopy} position="top-right">
      <pre {...preProps} ref={preRef}>{children}</pre>
    </WithCopyButton>
  )
}
```

### Pattern 6: Language Detection from Filename
**Used by**: Cline, Continue
**Approach**:
- Extract language from code block metadata
- If metadata contains filename, extract extension
- Default to JavaScript if no language specified

```typescript
() => {
  return (tree: any) => {
    visit(tree, "code", (node: any) => {
      if (!node.lang) {
        node.lang = "javascript"
      } else if (node.lang.includes(".")) {
        // if the language is a file, get the extension
        node.lang = node.lang.split(".").slice(-1)[0]
      }
    })
  }
}
```

---

## RECOMMENDED STACK FOR CORTEX

### Core Dependencies:
```json
{
  "react-markdown": "^9.0.1",
  "rehype-highlight": "^7.0.0",
  "remark-gfm": "^4.0.0",
  "remark-github-markdown-alerts": "^1.2.2",
  "react-syntax-highlighter": "^16.1.1",
  "styled-components": "^5.3.6",
  "unist-util-visit": "^5.0.0"
}
```

### Optional (for advanced features):
```json
{
  "rehype-katex": "^7.0.1",
  "remark-math": "^6.0.0",
  "mermaid": "^11.4.0",
  "rehype-wrap-all": "^1.1.0"
}
```

### Architecture Recommendation:
1. **Main Markdown Component**: `<MarkdownRenderer />`
   - Parses markdown into blocks
   - Memoizes blocks for performance
   
2. **Code Block Component**: `<CodeBlock />`
   - Syntax highlighting with rehype-highlight
   - Copy button
   - Language detection
   - Diff highlighting support
   
3. **Custom Remark Plugins**:
   - URL to link conversion
   - File path detection
   - Custom UI element highlighting
   - Filename protection
   
4. **Theme Integration**:
   - CSS variables for light/dark mode
   - VSCode theme variable fallbacks
   - Styled-components for dynamic theming

5. **Streaming Support**:
   - Block-based rendering for incremental updates
   - Memoization to prevent re-renders
   - Ref-based copy functionality

---

## GITHUB PERMALINKS TO REAL CODE

### Cline CodeBlock:
https://github.com/clinebot/cline/blob/main/webview-ui/src/components/common/CodeBlock.tsx

### Cline MarkdownBlock:
https://github.com/clinebot/cline/blob/main/webview-ui/src/components/common/MarkdownBlock.tsx

### Continue StyledMarkdownPreview:
https://github.com/continuedev/continue/blob/main/gui/src/components/StyledMarkdownPreview/index.tsx

### remark-github-markdown-alerts:
https://github.com/neg4n/remark-github-markdown-alerts/blob/main/src/index.ts

### Chatbox package.json (dependencies):
https://github.com/Bin-Huang/chatbox/blob/main/package.json

