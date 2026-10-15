import { Clock, CornerDownRight } from 'lucide-react';
import { QUESTION_TYPE_LABEL, difficultyName, type Bucket, type PublicQuestion } from '@psc/shared';
import { Markdown } from '@/components/Markdown';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ArtifactBlock } from './ArtifactBlock';

export const BUCKET_LABEL: Record<Bucket, string> = {
  weak: 'Weak area',
  review: 'Review',
  new: 'New',
  reinforce: 'Reinforce',
  cross: 'Cross-domain',
  challenge: 'Challenge',
  prereq: 'Prerequisite',
};

const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function QuestionCard({ q, index }: { q: PublicQuestion; index?: number }) {
  return (
    <Card className="min-w-0" data-testid="question-card">
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-faint">
            {index !== undefined && <span>Question {index}</span>}
            {index !== undefined && <span aria-hidden>·</span>}
            <span className="truncate">{q.domainName}</span>
          </div>
          <h3 className="mt-0.5 text-base font-semibold">{q.conceptName}</h3>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          {q.isFollowUp && (
            <Badge tone="accent">
              <CornerDownRight className="size-3" /> Follow-up
            </Badge>
          )}
          {q.bucket && <Badge tone="accent">{BUCKET_LABEL[q.bucket]}</Badge>}
          <Badge>{QUESTION_TYPE_LABEL[q.type] ?? q.type}</Badge>
          <Badge>{cap(difficultyName(q.difficulty))}</Badge>
          <Badge>
            <Clock className="size-3" /> ~{q.estMinutes} min
          </Badge>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <Markdown className="text-[15px]">{q.prompt}</Markdown>
        {q.artifact && <ArtifactBlock artifact={q.artifact} />}
      </div>
    </Card>
  );
}
