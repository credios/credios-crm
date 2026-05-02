import { SkeletonKanban } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Carregando kanban">
      <div className="space-y-1.5">
        <div className="h-7 w-48 rounded-md bg-muted animate-pulse" />
        <div className="h-4 w-96 rounded-md bg-muted/60 animate-pulse" />
      </div>
      <SkeletonKanban />
    </div>
  );
}
