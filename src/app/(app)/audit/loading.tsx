import { SkeletonBlock } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div role="status" aria-label="Carregando auditoria" className="space-y-4">
      <SkeletonBlock className="h-10 w-1/3" />
      <SkeletonBlock className="h-[400px] w-full" />
    </div>
  );
}
