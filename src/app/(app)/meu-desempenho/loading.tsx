import { SkeletonRelatorios } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div role="status" aria-label="Carregando desempenho">
      <SkeletonRelatorios />
    </div>
  );
}
