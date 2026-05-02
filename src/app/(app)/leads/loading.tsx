import { SkeletonLeadList } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Carregando leads">
      <div className="space-y-1.5">
        <div className="h-7 w-24 rounded-md bg-muted animate-pulse" />
        <div className="h-4 w-72 rounded-md bg-muted/60 animate-pulse" />
      </div>
      <SkeletonLeadList />
    </div>
  );
}
