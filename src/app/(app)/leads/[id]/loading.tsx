import { SkeletonLeadDetail } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div role="status" aria-label="Carregando lead">
      <SkeletonLeadDetail />
    </div>
  );
}
