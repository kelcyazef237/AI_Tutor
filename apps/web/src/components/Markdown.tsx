import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

/** Renders AI/user markdown. Raw HTML is not rendered (react-markdown default). */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        'min-w-0 space-y-3 text-sm leading-relaxed break-words text-text',
        '[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2',
        '[&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:break-all',
        '[&_pre]:-mx-1 [&_pre]:overflow-x-auto [&_pre]:overscroll-x-contain [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-surface-2 [&_pre]:p-3 sm:[&_pre]:mx-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:break-normal',
        '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1',
        '[&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-muted',
        '[&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:overscroll-x-contain [&_th]:border-b [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:whitespace-nowrap [&_td]:border-b [&_td]:border-border [&_td]:px-2 [&_td]:py-1',
        '[&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
