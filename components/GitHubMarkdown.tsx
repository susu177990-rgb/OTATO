import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const mdComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-[1.25rem] font-semibold text-gray-100 border-b border-[#30363d] pb-2 mb-4 mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-[1.05rem] font-semibold text-gray-100 border-b border-[#21262d] pb-2 mb-3 mt-6 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[0.95rem] font-semibold text-gray-200 mb-2 mt-4 first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => <h4 className="text-[0.9rem] font-semibold text-gray-300 mb-2 mt-3">{children}</h4>,
  h5: ({ children }) => <h5 className="text-[0.85rem] font-semibold text-gray-300 mb-1 mt-2">{children}</h5>,
  h6: ({ children }) => <h6 className="text-[0.8rem] font-semibold text-gray-400 mb-1 mt-2">{children}</h6>,
  p: ({ children }) => <p className="text-[13px] leading-relaxed text-[#e6edf3] mb-3 last:mb-0">{children}</p>,
  a: ({ children, href }) => (
    <a href={href} className="text-[#58a6ff] hover:underline underline-offset-2" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-gray-50">{children}</strong>,
  em: ({ children }) => <em className="italic text-gray-200">{children}</em>,
  del: ({ children }) => <del className="text-gray-500">{children}</del>,
  hr: () => <hr className="my-4 border-0 border-t border-[#30363d]" />,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-[3px] border-[#3d444d] pl-4 text-[13px] text-[#8d96a0] [&_p]:mb-2 [&_p:last-child]:mb-0">
      {children}
    </blockquote>
  ),
  ul: ({ children }) => <ul className="my-3 ml-4 list-disc text-[13px] text-[#e6edf3] space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 ml-4 list-decimal text-[13px] text-[#e6edf3] space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed [&>p]:mb-1">{children}</li>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-md border border-[#30363d]">
      <table className="min-w-full border-collapse text-[12px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[#161b22]">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-t border-[#30363d]">{children}</tr>,
  th: ({ children }) => (
    <th className="border border-[#30363d] px-3 py-1.5 text-left font-semibold text-gray-200">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-[#30363d] px-3 py-1.5 text-[#e6edf3]">{children}</td>
  ),
  img: ({ src, alt }) => (
    <span className="my-2 block">
      <img src={src} alt={alt ?? ''} className="max-w-full rounded-md border border-[#30363d]" />
    </span>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-md border border-[#30363d] bg-[#161b22] p-3 text-[12px] leading-snug [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-gray-200">
      {children}
    </pre>
  ),
  code(props) {
    const { className, children, ...rest } = props;
    const inline = !/\blanguage-[\w-]+\b/.test(className ?? '');
    if (inline) {
      return (
        <code
          className="rounded px-1 py-px text-[12px] font-mono bg-[#6e768166] text-[#ff7b72]"
          {...rest}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={`font-mono text-[12px] ${className ?? ''}`} {...rest}>
        {children}
      </code>
    );
  },
  input: ({ type, checked, disabled }) => {
    if (type === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          readOnly
          className="mr-2 align-middle rounded border-gray-600 accent-[#238636]"
        />
      );
    }
    return null;
  },
};

interface GitHubMarkdownProps {
  markdown: string;
}

/** GitHub README 风格 GFM 渲染（用于助手气泡等）。 */
export function GitHubMarkdown({ markdown }: GitHubMarkdownProps) {
  const trimmed = markdown.trim();
  if (!trimmed) return null;

  return (
    <div className="github-md-root text-[13px] font-sans [&_*:first-child]:mt-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
