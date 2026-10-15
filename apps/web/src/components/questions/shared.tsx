import type { ReactNode, SelectHTMLAttributes } from 'react';
import { DOMAINS, type QuestionSource } from '@psc/shared';
import { Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Native <option> popups ignore the page theme unless we paint them ourselves. */
export const selectThemed = '[&_option]:bg-surface [&_option]:text-text [&_optgroup]:bg-surface [&_optgroup]:text-muted';

export const SOURCE_LABEL: Record<QuestionSource, string> = {
  imported: 'Imported',
  custom: 'Custom',
  generated: 'AI generated',
  followup: 'Follow-up',
};

export const SOURCE_TONE: Record<QuestionSource, 'accent' | 'neutral'> = {
  imported: 'accent',
  custom: 'accent',
  generated: 'neutral',
  followup: 'neutral',
};

/** Concept picker grouped by domain. */
export function ConceptSelect({
  placeholder,
  className,
  exclude,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { placeholder?: string; exclude?: string[] }) {
  return (
    <Select className={cn(selectThemed, className)} {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {DOMAINS.map((d) => (
        <optgroup key={d.id} label={d.name}>
          {d.concepts
            .filter((c) => !exclude?.includes(c.id))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </optgroup>
      ))}
    </Select>
  );
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="mt-1 text-xs text-danger">{children}</p>;
}

/** First non-empty line of a Markdown prompt, with the most common syntax stripped. */
export function promptPreview(md: string) {
  const line =
    md
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('```')) ?? '';
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+>]\s+/, '')
    .replace(/[*_`]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}
