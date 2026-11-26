'use client';

import { SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDateVi } from '@/lib/dates';
import { progressFromCounts, updatedText } from '@/lib/progress';
import type { AreaDetails } from '@/server/queries/area-details';
import type { AreaSummary } from '@/server/queries/snapshot';
import { Countdown } from './area-row';
import { ProgressBar } from './progress-bar';

const count = <K extends string>(keys: readonly K[], values: K[]) =>
  Object.fromEntries(keys.map((k) => [k, values.filter((v) => v === k).length])) as Record<K, number>;

/**
 * The area's progress at the top of its workspace: bar with its count, the nearest date and the last update.
 * Without topics (or milestones) there is no bar: the strip invites the AI to read the area's documents and
 * propose them (`Tạo từ tài liệu`); with records the same action stays available as `Cập nhật từ tài liệu`.
 */
export function AreaProgressStrip({
  details,
  summary,
  documentCount,
  canPropose,
  onFromDocuments,
}: {
  details: AreaDetails;
  /** Null for an archived area: no dates then. */
  summary: AreaSummary | null;
  documentCount: number;
  /** False when the AI cannot propose changes (action mode off). */
  canPropose: boolean;
  onFromDocuments: () => void;
}) {
  const { area } = details;
  const project = area.kind === 'project';
  const progress = progressFromCounts(area.kind, {
    topics: project ? null : count(['not_started', 'familiar', 'practiced', 'confident'], details.topics.map((t) => t.status)),
    milestones: project ? count(['not_started', 'in_progress', 'done'], details.milestones.map((m) => m.status)) : null,
  });
  const empty = progress.total === 0;
  const unit = project ? 'milestone' : 'topic';
  // The AI reads only what it may read, and needs something to read.
  const offer = canPropose && !area.aiExcluded && documentCount > 0;
  const invitation = !offer
    ? area.aiExcluded
      ? `Chưa có ${unit} nào. Mục này không gửi cho AI nên cần nhập tay.`
      : documentCount === 0
        ? `Chưa có ${unit} nào. Thêm tài liệu (đề cương, lịch, tiến độ) để AI đề xuất, hoặc nhập tay ở tab bên dưới.`
        : `Chưa có ${unit} nào.`
    : project
      ? 'Chưa có milestone nào. Để AI đọc tài liệu của dự án này và đề xuất milestone và việc tiếp theo.'
      : 'Chưa có topic nào. Để AI đọc tài liệu của môn này và đề xuất topic, mốc đánh giá và việc tiếp theo.';
  const nearest = summary?.nearestDate ?? null;

  return (
    <section aria-label="Tiến độ" data-testid="area-progress" className="shrink-0 space-y-2 border-b px-3 py-2 md:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-56 space-y-1">
          {empty ? (
            <p data-testid="from-documents-invite" className="text-sm text-muted-foreground">{invitation}</p>
          ) : (
            <ProgressBar progress={progress} />
          )}
          {(nearest || summary) && (
            <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {nearest && (
                <span className="min-w-0 wrap-anywhere">
                  <Countdown nearest={nearest} /> · {formatDateVi(nearest.date)}
                </span>
              )}
              {summary && <span>{updatedText(summary.daysSinceUpdate)}</span>}
            </p>
          )}
        </div>
        {offer && (
          <Button
            type="button"
            variant={empty ? 'default' : 'outline'}
            className="min-h-11 gap-1.5 px-3"
            onClick={onFromDocuments}
          >
            <SparklesIcon aria-hidden />
            {empty ? 'Tạo từ tài liệu' : 'Cập nhật từ tài liệu'}
          </Button>
        )}
      </div>
    </section>
  );
}
